import 'dotenv/config'

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
  if (v.length > 200) return false
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
  const args = { limit: 5000, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    if (a === '--limit') args.limit = Math.max(50, Math.min(20000, Number(argv[i + 1] ?? 5000)))
  }
  return args
}

async function scanCodebase({ limit }) {
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip obvious next-intl translation usage lines.
      // Important: don't do a naive `includes("t('")` because it would also match `lt('...')`.
      if (line.includes('useTranslations(') || /\bt\(\s*['"`]/.test(line)) continue

      // lt('...') calls (preferred path once components are converted)
      const ltRe = /\blt\(\s*(['"`])([^'"`]{2,200})\1\s*\)/g
      let m
      while ((m = ltRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        const sig = `${key}::${text}`
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'lt-call' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // ltVars('...') calls
      const ltVarsRe = /\bltVars\(\s*(['"`])([^'"`]{2,200})\1\s*,/g
      m = undefined
      while ((m = ltVarsRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        const sig = `${key}::${text}`
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'ltvars-call' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // JSXText-like: >Something<
      const jsxRe = />\s*([^<>{}][^<>{}]{1,200}?)\s*</g
      m = undefined
      while ((m = jsxRe.exec(line))) {
        const text = String(m[1] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        const sig = `${key}::${text}`
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'jsx-text' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // Attribute strings
      const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,200})\2/g
      while ((m = attrRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        const sig = `${key}::${text}`
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'attr' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // toast strings
      const toastRe = /toast\.(success|error|message|warning|info)\(\s*(['"`])([^'"`]{2,200})\2/g
      while ((m = toastRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        const sig = `${key}::${text}`
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'toast' })
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
  const { limit, dryRun } = parseArgs(process.argv.slice(2))

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  const { filesScanned, found } = await scanCodebase({ limit })
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
  console.log(`Upserted ${found.length} English base strings into app_translations (namespace=literals).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
