import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { literalKeyFromText } from '@/lib/i18n/literal-key'

type MissingItem = {
  namespace: string
  key: string
  sourceValue: string
  currentValue?: string
}

type CodeScanCache = {
  at: number
  limit: number
  literals: Map<string, string>
}

let codeScanCache: CodeScanCache | null = null

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

async function getCodebaseLiteralSources(limit: number): Promise<Map<string, string>> {
  const ttlMs = 5 * 60 * 1000
  const now = Date.now()
  if (codeScanCache && now - codeScanCache.at < ttlMs && codeScanCache.limit >= limit) {
    return codeScanCache.literals
  }

  // Scan more than we return so we don't miss literals that appear later in the file walk order.
  // The repo can contain far more than the typical per-page limit.
  const scanLimit = Math.min(Math.max(20000, limit), 50000)

  const root = path.join(process.cwd(), 'src')
  const files: string[] = []
  await walk(root, files)

  const literals = new Map<string, string>()
  for (const filePath of files) {
    if (literals.size >= scanLimit) break
    let raw = ''
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const lines = raw.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip obvious next-intl translation usage lines.
      // Important: don't do a naive `includes("t('")` because it would also match `lt('...')`.
      if (line.includes("useTranslations(") || /\bt\(\s*['"`]/.test(line)) continue

      // lt('...')
      const ltRe = /\blt\(\s*(["'`])([^"'`]{2,200})\1\s*\)/g
      let m: RegExpExecArray | null
      while ((m = ltRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        if (!literals.has(key)) literals.set(key, text)
        if (literals.size >= scanLimit) break
      }
      if (literals.size >= scanLimit) break

      // ltVars('...')
      const ltVarsRe = /\bltVars\(\s*(["'`])([^"'`]{2,200})\1\s*,/g
      while ((m = ltVarsRe.exec(line))) {
        const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        if (!literals.has(key)) literals.set(key, text)
        if (literals.size >= scanLimit) break
      }
      if (literals.size >= scanLimit) break

      // JSX text >Something<
      const jsxRe = />\s*([^<>{}][^<>{}]{1,200}?)\s*</g
      while ((m = jsxRe.exec(line))) {
        const text = String(m[1] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        if (!literals.has(key)) literals.set(key, text)
        if (literals.size >= scanLimit) break
      }
      if (literals.size >= scanLimit) break

      // Attributes
      const attrRe = /(placeholder|title|aria-label|label|alt)=(['"`])([^'"`]{2,200})\2/g
      while ((m = attrRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        if (!literals.has(key)) literals.set(key, text)
        if (literals.size >= scanLimit) break
      }
      if (literals.size >= scanLimit) break

      // toast strings
      const toastRe = /toast\.(success|error|message|warning|info)\(\s*(['"`])([^'"`]{2,200})\2/g
      while ((m = toastRe.exec(line))) {
        const text = String(m[3] ?? '').replace(/\s+/g, ' ').trim()
        if (!isProbablyHumanString(text)) continue
        const key = literalKeyFromText(text)
        if (!literals.has(key)) literals.set(key, text)
        if (literals.size >= scanLimit) break
      }
      if (literals.size >= scanLimit) break
    }
  }

  codeScanCache = { at: now, limit: scanLimit, literals }
  return literals
}

function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj || typeof obj !== 'object') return out

  for (const [k, v] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : String(k)
    if (typeof v === 'string') {
      out[nextKey] = v
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v, nextKey))
    }
  }

  return out
}

async function loadLocaleMessages(locale: string): Promise<any> {
  // Try repo JSON file first. If not present, treat as empty (DB overrides can still exist).
  const filePath = path.join(process.cwd(), 'src', 'i18n', `${locale}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function loadDbTranslationsByNamespace(supabase: any, locale: string, namespace?: string) {
  const q = supabase
    .from('app_translations')
    .select('namespace,key,value')
    .eq('locale', locale)
  const { data, error } = namespace ? await q.eq('namespace', namespace) : await q
  if (error) throw new Error(error.message)

  const out = new Map<string, Map<string, string>>()
  for (const row of data ?? []) {
    const ns = String((row as any).namespace ?? '')
    const k = String((row as any).key ?? '')
    if (!ns || !k) continue
    const v = String((row as any).value ?? '')
    if (!out.has(ns)) out.set(ns, new Map())
    out.get(ns)!.set(k, v)
  }
  return out
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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const localeParam = url.searchParams.get('locale') ?? 'en'
  const sourceLocaleParam = url.searchParams.get('sourceLocale') ?? 'en'
  const namespaceParam = url.searchParams.get('namespace') ?? 'common'
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0))
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 200)))
  const scanAll = namespaceParam === 'all' || namespaceParam === '*'
  const includeCodeScan = (url.searchParams.get('includeCodeScan') ?? '1') !== '0'

  const supabase = await createClient()
  const authz = await requireSuperAdmin(supabase)
  if (!authz.ok) return authz.response

  const [sourceMessages, targetMessages] = await Promise.all([
    loadLocaleMessages(sourceLocaleParam),
    loadLocaleMessages(localeParam),
  ])

  // Include DB "base" English strings as part of the source-of-truth.
  // This supports importing hardcoded UI strings into DB (namespace=literals, locale=en).
  let sourceDbByNs: Map<string, Map<string, string>> = new Map()
  try {
    sourceDbByNs = await loadDbTranslationsByNamespace(
      supabase,
      sourceLocaleParam,
      scanAll ? undefined : namespaceParam
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load source DB translations' }, { status: 500 })
  }

  // Determine namespaces to scan based on source locale (canonical)
  const sourceNamespaces = Object.keys(sourceMessages ?? {}).filter(
    (ns) => Boolean(ns) && typeof (sourceMessages as any)[ns] === 'object'
  )
  const namespacesToScan = scanAll
    ? Array.from(new Set([...sourceNamespaces, ...Array.from(sourceDbByNs.keys())]))
    : [namespaceParam]

  // Auto-include codebase literals as source-of-truth keys so missing scans cover hardcoded strings.
  // Only applies when sourceLocale is English (these literal strings are English UI text).
  let codeScanLiterals: Map<string, string> | null = null
  if (
    includeCodeScan &&
    sourceLocaleParam === 'en' &&
    (scanAll || namespaceParam === 'literals')
  ) {
    try {
      codeScanLiterals = await getCodebaseLiteralSources(2000)
      if (codeScanLiterals.size > 0 && !namespacesToScan.includes('literals')) {
        namespacesToScan.push('literals')
      }
    } catch {
      // Best-effort only; missing scan should still work without code scan.
      codeScanLiterals = null
    }
  }

  // Load DB overrides for target locale
  const dbQuery = supabase
    .from('app_translations')
    .select('namespace,key,value')
    .eq('locale', localeParam)

  const { data: dbRows, error: dbError } = scanAll
    ? await dbQuery
    : await dbQuery.eq('namespace', namespaceParam)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  const dbIndex = new Map<string, string>()
  for (const row of dbRows ?? []) {
    const ns = String((row as any).namespace ?? '')
    const k = String((row as any).key ?? '')
    if (!ns || !k) continue
    dbIndex.set(`${ns}::${k}`, String((row as any).value ?? ''))
  }

  const missing: MissingItem[] = []
  let sourceKeysCount = 0
  for (const namespace of namespacesToScan) {
    const sourceNs = sourceMessages?.[namespace] ?? {}
    const targetNs = targetMessages?.[namespace] ?? {}

    const sourceFlat = flattenObject(sourceNs)
    const sourceDbFlat: Record<string, string> = {}
    for (const [k, v] of sourceDbByNs.get(namespace)?.entries() ?? []) {
      if (!k) continue
      sourceDbFlat[k] = v
    }

    const sourceScanFlat: Record<string, string> = {}
    if (namespace === 'literals' && codeScanLiterals) {
      for (const [k, v] of codeScanLiterals.entries()) {
        sourceScanFlat[k] = v
      }
    }

    // Union: JSON source wins unless missing.
    const sourceUnion: Record<string, string> = { ...sourceDbFlat, ...sourceScanFlat, ...sourceFlat }
    const targetFlatFromFile = flattenObject(targetNs)
    sourceKeysCount += Object.keys(sourceUnion).length

    for (const [k, v] of Object.entries(sourceUnion)) {
      const fromDb = dbIndex.get(`${namespace}::${k}`)
      const current = fromDb ?? targetFlatFromFile[k]

      // Missing if absent/blank OR if still identical to English source.
      if (!current || String(current).trim() === '' || String(current).trim() === String(v).trim()) {
        missing.push({ namespace, key: k, sourceValue: v, currentValue: current })
      }
    }
  }

  missing.sort((a, b) => {
    const ns = a.namespace.localeCompare(b.namespace)
    if (ns !== 0) return ns
    return a.key.localeCompare(b.key)
  })

  const paged = missing.slice(offset, offset + limit)

  return NextResponse.json({
    locale: localeParam,
    sourceLocale: sourceLocaleParam,
    namespace: scanAll ? 'all' : namespaceParam,
    totals: {
      sourceKeys: sourceKeysCount,
      missing: missing.length,
    },
    page: {
      offset,
      limit,
      returned: paged.length,
    },
    missing: paged,
  })
}
