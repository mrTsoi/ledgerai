import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

function isProbablyHumanString(s) {
  const v = String(s ?? '').trim()
  if (v.length < 3) return false
  if (v.length > 400) return false
  if (!/[A-Za-z]/.test(v)) return false
  if (/^(bg-|text-|px-|py-|mt-|mb-|mx-|my-|grid|flex|items-|justify-)/.test(v)) return false
  if (/^https?:\/\//.test(v)) return false
  if (/^[A-Z0-9_]+$/.test(v)) return false
  if (/\.(tsx?|css|json|png|jpg|svg)$/.test(v)) return false
  // Allow placeholder-style braces like {count}. Reject template literals / code-y strings.
  if (v.includes('`') || v.includes('${')) return false
  return true
}

async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git', 'dist', 'build', 'test-results', 'tmp', 'supabase', 'tests'].includes(e.name)) {
        continue
      }
      await walk(full, out)
    } else {
      if (!/\.(ts|tsx)$/.test(e.name)) continue
      out.push(full)
    }
  }
}

function parseArgs(argv) {
  const args = { limit: 5000, dryRun: false, namespace: 'literals' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    if (a === '--limit') args.limit = Math.max(50, Math.min(20000, Number(argv[i + 1] ?? 5000)))
    if (a === '--namespace') args.namespace = String(argv[i + 1] ?? 'literals')
  }
  return args
}

async function scanCodebase({ limit, namespace }) {
  const root = path.join(process.cwd(), 'src')
  const files = []
  await walk(root, files)

  const found = []
  const seen = new Set()

  for (const filePath of files) {
    if (found.length >= limit) break

    let raw = ''
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
    const lines = raw.split(/\r?\n/)

    const push = (text, kind, lineOverride) => {
      const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
      if (!isProbablyHumanString(normalized)) return
      const key = literalKeyFromText(normalized)
      const sig = `${key}::${normalized}`
      if (seen.has(sig)) return
      seen.add(sig)
      const line = typeof lineOverride === 'number' && Number.isFinite(lineOverride) ? lineOverride : 1
      found.push({ text: normalized, key, namespace, file: rel, line, kind })
    }

    // Multiline-safe scans for lt('...') and ltVars('...', ...)
    const ltMultilineRe = /\blt\(\s*(['"`])([\s\S]{2,400}?)\1\s*(?:,|\))/g
    let mm
    while ((mm = ltMultilineRe.exec(raw))) {
      const line = raw.slice(0, mm.index).split(/\r?\n/).length
      push(mm[2], 'lt-call', line)
      if (found.length >= limit) break
    }
    if (found.length >= limit) break

    const ltVarsMultilineRe = /\bltVars\(\s*(['"`])([\s\S]{2,400}?)\1\s*,/g
    mm = undefined
    while ((mm = ltVarsMultilineRe.exec(raw))) {
      const line = raw.slice(0, mm.index).split(/\r?\n/).length
      push(mm[2], 'ltvars-call', line)
      if (found.length >= limit) break
    }
    if (found.length >= limit) break

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip obvious next-intl translation usage lines.
      // Important: don't do a naive `includes("t('")` because it would also match `lt('...')`.
      if (line.includes('useTranslations(') || /\bt\(\s*['"`]/.test(line)) continue

      // lt('...') calls (preferred path once components are converted)
      const ltRe = /\blt\(\s*(['"`])([^'"`]{2,400})\1\s*\)/g
      let m
      while ((m = ltRe.exec(line))) {
        push(m[2], 'lt-call', i + 1)
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // ltVars('...') calls
      const ltVarsRe = /\bltVars\(\s*(['"`])([^'"`]{2,400})\1\s*,/g
      m = undefined
      while ((m = ltVarsRe.exec(line))) {
        push(m[2], 'ltvars-call', i + 1)
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // JSXText-like: >Something<
      const jsxRe = />\s*([^<>{}][^<>{}]{1,400}?)\s*</g
      m = undefined
      while ((m = jsxRe.exec(line))) {
        push(m[1], 'jsx-text', i + 1)
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // Attribute strings
      const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,400})\2/g
      while ((m = attrRe.exec(line))) {
        push(m[3], 'attr', i + 1)
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // toast strings
      const toastRe = /toast\.(success|error|message|warning|info)\(\s*(['"`])([^'"`]{2,400})\2/g
      while ((m = toastRe.exec(line))) {
        push(m[3], 'toast', i + 1)
        if (found.length >= limit) break
      }
    }
  }

  return { filesScanned: files.length, found }
}

async function upsertEnglishBase(supabase, found) {
  const rows = found.map((i) => ({
    locale: 'en',
    namespace: i.namespace,
    key: i.key,
    value: i.text,
  }))

  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('app_translations').upsert(batch, { onConflict: 'locale,namespace,key' })
    if (error) throw error
  }
}

async function main() {
  const { limit, dryRun, namespace } = parseArgs(process.argv.slice(2))

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  const { filesScanned, found } = await scanCodebase({ limit, namespace })
  console.log(`Scanned ${filesScanned} files; found ${found.length} candidate strings.`)

  if (dryRun) {
    console.log('Dry run enabled; not writing to DB.')
    process.exit(0)
  }

  if (found.length === 0) {
    console.log('Nothing to import.')
    process.exit(0)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  await upsertEnglishBase(supabase, found)
  console.log(`Upserted ${found.length} English base strings into app_translations (namespace=${namespace}).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
