import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

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
  if (v.includes('`') || v.includes('${')) return false
  return true
}

async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (
        ['node_modules', '.next', '.git', 'dist', 'build', 'test-results', 'tmp', 'supabase', 'tests'].includes(e.name)
      ) {
        continue
      }
      await walk(full, out)
    } else {
      if (!/\.(ts|tsx)$/.test(e.name)) continue
      out.push(full)
    }
  }
}

function emitTs(items) {
  const header = `// Generated file. Do not edit by hand.\n// This file is created by \`node scripts/generate-literals-manifest.mjs\`.\n\nexport type LiteralManifestItem = {\n  text: string\n  key: string\n  namespace: 'literals'\n  file: string\n  line: number\n  kind: 'lt-call' | 'ltvars-call' | 'jsx-text' | 'attr' | 'toast'\n}\n\n`

  const body = `export const literalsManifest: LiteralManifestItem[] = ${JSON.stringify(items, null, 2)}\n`
    // Minor TS formatting tweaks (keep output readable, but stable)
    .replace(/"namespace": "literals"/g, "namespace: 'literals'")
    .replace(/"kind": "(lt-call|ltvars-call|jsx-text|attr|toast)"/g, "kind: '$1'")

  return header + body
}

async function main() {
  const root = path.join(process.cwd(), 'src')
  const files = []
  await walk(root, files)

  const found = []
  const seen = new Set()

  for (const filePath of files) {
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

      const push = (text, kind) => {
        const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(normalized)) return
        const key = literalKeyFromText(normalized)
        const sig = `${key}::${normalized}`
        if (seen.has(sig)) return
        seen.add(sig)
        found.push({ text: normalized, key, namespace: 'literals', file: rel, line: i + 1, kind })
      }

      // lt('...')
      const ltRe = /\blt\(\s*(['"`])([^'"`]{2,200})\1\s*\)/g
      let m
      while ((m = ltRe.exec(line))) push(m[2], 'lt-call')

      // ltVars('...',
      const ltVarsRe = /\bltVars\(\s*(['"`])([^'"`]{2,200})\1\s*,/g
      m = undefined
      while ((m = ltVarsRe.exec(line))) push(m[2], 'ltvars-call')

      // JSX text >Something<
      const jsxRe = />\s*([^<>{}][^<>{}]{1,200}?)\s*</g
      m = undefined
      while ((m = jsxRe.exec(line))) push(m[1], 'jsx-text')

      // Attributes
      const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,200})\2/g
      m = undefined
      while ((m = attrRe.exec(line))) push(m[3], 'attr')

      // toast.
      const toastRe = /toast\.(success|error|message|warning|info)\(\s*(['"`])([^'"`]{2,200})\2/g
      m = undefined
      while ((m = toastRe.exec(line))) push(m[3], 'toast')
    }
  }

  found.sort((a, b) => (a.key === b.key ? a.text.localeCompare(b.text) : a.key.localeCompare(b.key)))

  const outPath = path.join(process.cwd(), 'src', 'i18n', 'literals.manifest.generated.ts')
  await fs.writeFile(outPath, emitTs(found), 'utf8')
  console.log(`Generated literals manifest: ${found.length} items -> ${path.relative(process.cwd(), outPath)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
