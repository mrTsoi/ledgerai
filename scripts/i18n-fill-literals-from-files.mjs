import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

function setNested(target, pathStr, value) {
  const parts = String(pathStr || '').split('.').filter(Boolean)
  if (parts.length === 0) return

  let cur = target
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (i === parts.length - 1) {
      cur[p] = value
      return
    }
    if (!cur[p] || typeof cur[p] !== 'object') {
      cur[p] = {}
    }
    cur = cur[p]
  }
}

function getNested(obj, pathStr) {
  const parts = String(pathStr || '').split('.').filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function isProbablyHumanString(s) {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (v.length < 2) return false
  if (v.length > 260) return false
  // Include placeholders like {count}
  // Exclude obvious non-human tokens
  if (/^(bg-|text-|px-|py-|mt-|mb-|mx-|my-|grid|flex|items-|justify-)/.test(v)) return false
  if (/^https?:\/\//.test(v)) return false
  if (/^[A-Z0-9_]+$/.test(v)) return false
  if (/\.(tsx?|css|json|png|jpg|svg)$/.test(v)) return false
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
  const args = {
    locale: 'zh-HK',
    limit: 10000,
    overwrite: false,
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--locale') args.locale = String(argv[i + 1] ?? args.locale)
    if (a === '--limit') args.limit = Math.max(50, Math.min(50000, Number(argv[i + 1] ?? args.limit)))
    if (a === '--overwrite') args.overwrite = true
    if (a === '--dry-run') args.dryRun = true
  }

  return args
}

function buildEnglishToLocaleMap(enObj, localeObj) {
  const map = new Map()

  function visit(nodeEn, nodeLoc, prefix) {
    if (!nodeEn || typeof nodeEn !== 'object') return

    for (const key of Object.keys(nodeEn)) {
      const nextPath = prefix ? `${prefix}.${key}` : key
      const vEn = nodeEn[key]
      const vLoc = nodeLoc && typeof nodeLoc === 'object' ? nodeLoc[key] : undefined

      if (typeof vEn === 'string') {
        if (typeof vLoc === 'string' && vLoc.trim()) {
          const enNorm = vEn.replace(/\s+/g, ' ').trim()
          if (enNorm) map.set(enNorm, vLoc)
        }
      } else if (vEn && typeof vEn === 'object') {
        visit(vEn, vLoc, nextPath)
      }
    }
  }

  visit(enObj, localeObj, '')
  return map
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

    const lines = raw.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // lt('...') calls
      const ltRe = /\blt\(\s*(['"`])([^'"`]{2,260})\1\s*\)/g
      let m
      while ((m = ltRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const sig = text
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, file: filePath, line: i + 1, kind: 'lt' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // ltVars('...') calls
      const ltVarsRe = /\bltVars\(\s*(['"`])([^'"`]{2,260})\1\s*,/g
      m = undefined
      while ((m = ltVarsRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const sig = text
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, file: filePath, line: i + 1, kind: 'ltVars' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // JSXText-like: >Something<
      const jsxRe = />\s*([^<>{}][^<>{}]{1,260}?)\s*</g
      m = undefined
      while ((m = jsxRe.exec(line))) {
        const text = String(m[1] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const sig = text
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, file: filePath, line: i + 1, kind: 'jsx' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // Attribute strings
      const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,260})\2/g
      m = undefined
      while ((m = attrRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const sig = text
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, file: filePath, line: i + 1, kind: 'attr' })
        if (found.length >= limit) break
      }
      if (found.length >= limit) break

      // toast strings (rare after conversions, but include)
      const toastRe = /toast\.(success|error|message)\(\s*(['"`])([^'"`]{2,260})\2/g
      m = undefined
      while ((m = toastRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const sig = text
        if (seen.has(sig)) continue
        seen.add(sig)
        found.push({ text, file: filePath, line: i + 1, kind: 'toast' })
        if (found.length >= limit) break
      }
    }
  }

  return { filesScanned: files.length, found }
}

async function main() {
  const { locale, limit, overwrite, dryRun } = parseArgs(process.argv.slice(2))

  const enPath = path.join(process.cwd(), 'src', 'i18n', 'en.json')
  const locPath = path.join(process.cwd(), 'src', 'i18n', `${locale}.json`)

  const en = JSON.parse(await fs.readFile(enPath, 'utf8'))
  const loc = JSON.parse(await fs.readFile(locPath, 'utf8'))

  const map = buildEnglishToLocaleMap(en, loc)

  const { filesScanned, found } = await scanCodebase({ limit })

  const literalsRoot = loc.literals ?? {}
  if (!loc.literals) loc.literals = literalsRoot

  // Ensure nested shape
  if (!literalsRoot.literal || typeof literalsRoot.literal !== 'object') {
    literalsRoot.literal = {}
  }

  let filled = 0
  let already = 0
  let missing = 0

  for (const item of found) {
    const english = item.text
    const translation = map.get(english)
    if (!translation) {
      missing++
      continue
    }

    const key = literalKeyFromText(english)
    const hex = key.slice('literal.'.length)
    const existing = literalsRoot.literal[hex]

    if (existing && !overwrite) {
      already++
      continue
    }

    literalsRoot.literal[hex] = translation
    filled++
  }

  if (!dryRun) {
    await fs.writeFile(locPath, JSON.stringify(loc, null, 2) + '\n', 'utf8')
  }

  console.log(`Locale: ${locale}`)
  console.log(`Scanned ${filesScanned} files; found ${found.length} candidate strings.`)
  console.log(`Filled literals: ${filled}${dryRun ? ' (dry-run)' : ''}`)
  console.log(`Already existed: ${already}`)
  console.log(`Missing mapping (not in en.json): ${missing}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
