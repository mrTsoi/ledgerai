import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { literalKeyFromText } from '@/lib/i18n/literal-key'
import { literalsManifest } from '@/i18n/literals.manifest.generated'

type FoundString = {
  text: string
  key: string
  namespace: 'literals'
  file: string
  line: number
  kind: 'jsx-text' | 'attr' | 'toast' | 'lt-call' | 'ltvars-call'
}

async function requireSuperAdmin(supabase: any) {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth?.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: isSuperAdmin, error: saError } = await supabase.rpc('is_super_admin')
  if (saError) {
    return { ok: false as const, response: NextResponse.json({ error: saError.message }, { status: 500 }) }
  }
  if (isSuperAdmin !== true) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, userId: auth.user.id }
}

function keyFor(text: string) {
  return literalKeyFromText(text)
}

function isProbablyHumanString(s: string) {
  const v = s.trim()
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

async function walk(dir: string, out: string[]) {
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

async function walkWithOptions(
  dir: string,
  out: string[],
  opts: { extRe: RegExp; excludeDirs: string[] }
) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (opts.excludeDirs.includes(e.name)) continue
      await walkWithOptions(full, out, opts)
    } else {
      if (!opts.extRe.test(e.name)) continue
      out.push(full)
    }
  }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const authz = await requireSuperAdmin(supabase)
  if (!authz.ok) return authz.response

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 500), 50), 5000)
  // Scan more than we return so we don't miss strings that appear later in the file walk order.
  // This matters because the UI typically requests limit=5000, but the repo can contain more than 5k literals.
  const seed = (url.searchParams.get('seed') ?? '0') === '1'
  const scanLimitDefault = seed ? 50000 : 20000
  const scanLimit = Math.min(Math.max(Number(url.searchParams.get('scanLimit') ?? scanLimitDefault), limit), 50000)

  // In many production deployments, the full `src/` tree may not be present on the server filesystem.
  // To keep admin seeding reliable, also scan the compiled Next.js server output when available.
  const files: string[] = []
  const cwd = process.cwd()
  const srcRoot = path.join(cwd, 'src')
  try {
    await walkWithOptions(srcRoot, files, {
      extRe: /\.(ts|tsx)$/,
      excludeDirs: ['node_modules', '.next', '.git', 'dist', 'build', 'test-results', 'tmp', 'supabase', 'tests'],
    })
  } catch {
    // ignore
  }

  const nextAppRoot = path.join(cwd, '.next', 'server', 'app')
  if (seed) {
    try {
      await walkWithOptions(nextAppRoot, files, {
        extRe: /\.(js|mjs|cjs)$/,
        excludeDirs: ['node_modules', '.git', 'test-results', 'tmp'],
      })
    } catch {
      // ignore
    }
  }

  // Prefer the build-time manifest when present; it's reliable in production where `src/` may not exist.
  const found: FoundString[] = Array.isArray(literalsManifest) && literalsManifest.length
    ? (literalsManifest as any as FoundString[]).slice(0, scanLimit)
    : []
  const seen = new Set<string>()

  // Fall back to filesystem scan when manifest is empty (typical in dev before `prebuild` runs).
  if (found.length === 0) {
    for (const filePath of files) {
      if (found.length >= scanLimit) break
      let raw = ''
      try {
        raw = await fs.readFile(filePath, 'utf8')
      } catch {
        continue
      }

      const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
      const lines = raw.split(/\r?\n/)

      // JSX text heuristic (line-based)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip obvious next-intl translation usage lines.
        // Important: don't do a naive `includes("t('")` because it would also match `lt('...')`.
        if (line.includes("useTranslations(") || /\bt\(\s*['"`]/.test(line)) continue

        // lt('...') calls (preferred path once components are converted)
        const ltRe = /\blt\(\s*(["'`])([^"'`]{2,200})\1\s*\)/g
        let m: RegExpExecArray | null
        while ((m = ltRe.exec(line))) {
          const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
          if (!isProbablyHumanString(text)) continue
          const key = keyFor(text)
          const sig = `${key}::${text}`
          if (seen.has(sig)) continue
          seen.add(sig)
          found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'lt-call' })
          if (found.length >= scanLimit) break
        }
        if (found.length >= scanLimit) break

        // ltVars('...') calls
        const ltVarsRe = /\bltVars\(\s*(["'`])([^"'`]{2,200})\1\s*,/g
        m = null
        while ((m = ltVarsRe.exec(line))) {
          const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
          if (!isProbablyHumanString(text)) continue
          const key = keyFor(text)
          const sig = `${key}::${text}`
          if (seen.has(sig)) continue
          seen.add(sig)
          found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'ltvars-call' })
          if (found.length >= scanLimit) break
        }
        if (found.length >= scanLimit) break

        // JSXText-like: >Something<
        const jsxRe = />\s*([^<>{}][^<>{}]{1,200}?)\s*</g
        m = null
        while ((m = jsxRe.exec(line))) {
          const text = String(m[1] ?? '').replace(/\s+/g, ' ').trim()
          if (!isProbablyHumanString(text)) continue
          const key = keyFor(text)
          const sig = `${key}::${text}`
          if (seen.has(sig)) continue
          seen.add(sig)
          found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'jsx-text' })
          if (found.length >= scanLimit) break
        }
        if (found.length >= scanLimit) break

        // Attribute strings
        const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,200})\2/g
        while ((m = attrRe.exec(line))) {
          const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
          if (!isProbablyHumanString(text)) continue
          const key = keyFor(text)
          const sig = `${key}::${text}`
          if (seen.has(sig)) continue
          seen.add(sig)
          found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'attr' })
          if (found.length >= scanLimit) break
        }
        if (found.length >= scanLimit) break

        // toast strings
        const toastRe = /toast\.(success|error|message|warning|info)\(\s*(['"`])([^'"`]{2,200})\2/g
        while ((m = toastRe.exec(line))) {
          const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
          if (!isProbablyHumanString(text)) continue
          const key = keyFor(text)
          const sig = `${key}::${text}`
          if (seen.has(sig)) continue
          seen.add(sig)
          found.push({ text, key, namespace: 'literals', file: rel, line: i + 1, kind: 'toast' })
          if (found.length >= scanLimit) break
        }
      }
    }
  }

  const returned = found.slice(0, limit)

  // Optional: seed English base strings into DB so admin review/search can always find them.
  // This is intentionally server-side so it works reliably under RLS.
  let seeded = 0
  if (seed && found.length) {
    try {
      const uniq = new Map<string, string>()
      for (const it of found) {
        if (!it?.key || !it?.text) continue
        // Prefer the first encountered value; key is deterministic anyway.
        if (!uniq.has(it.key)) uniq.set(it.key, it.text)
      }

      const rows = Array.from(uniq.entries()).map(([key, text]) => ({
        locale: 'en',
        namespace: 'literals',
        key,
        value: text,
      }))

      const { error } = await (supabase.from('app_translations') as any).upsert(rows, {
        onConflict: 'locale,namespace,key',
      })
      if (error) throw error
      seeded = rows.length
    } catch (e) {
      console.warn('code-scan seed failed', e)
    }
  }

  return NextResponse.json({
    totals: {
      filesScanned: files.length,
      found: returned.length,
      foundTotal: found.length,
      scanLimit,
      source: Array.isArray(literalsManifest) && literalsManifest.length ? 'manifest' : 'fs',
    },
    found: returned,
    seeded,
    note:
      'Heuristic scan: captures many hardcoded UI strings but may include false positives or miss some cases (multiline JSX, computed strings).',
  })
}
