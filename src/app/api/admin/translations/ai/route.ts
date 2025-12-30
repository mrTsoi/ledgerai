import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveAiProviderForPurpose } from '@/lib/ai/provider-resolver'


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
  const filePath = path.join(process.cwd(), 'src', 'i18n', `${locale}.json`)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function getSourceFromDb(supabase: any, locale: string, namespace: string, key: string) {
  const { data, error } = await supabase
    .from('app_translations')
    .select('value')
    .eq('locale', locale)
    .eq('namespace', namespace)
    .eq('key', key)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  const v = (data as any)?.value
  return typeof v === 'string' ? v : null
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


function buildPrompt(args: { sourceLocale: string; targetLocale: string; namespace: string; key: string; source: string }) {
  return [
    'You are a professional software localization translator.',
    `Translate from ${args.sourceLocale} to ${args.targetLocale}.`,
    'Rules:',
    '- Preserve placeholders exactly (e.g. {name}, {count}, {{name}}, %s).',
    '- Preserve punctuation meaning.',
    '- Return only the translated string, no quotes, no JSON.',
    '',
    `NAMESPACE: ${args.namespace}`,
    `KEY: ${args.key}`,
    `SOURCE: ${args.source}`,
  ].join('\n')
}

function coerceStatusCode(err: any): number {
  const status = Number(err?.status ?? err?.response?.status)
  if (Number.isFinite(status) && status >= 100 && status <= 599) return status
  return 500
}

function extractRetryAfterSeconds(err: any): number | null {
  const raw =
    err?.headers?.['retry-after'] ??
    err?.headers?.get?.('retry-after') ??
    err?.response?.headers?.get?.('retry-after')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        sourceLocale?: string
        targetLocale?: string
        namespace?: string
        key?: string
      }
    | null

  const sourceLocaleParam = body?.sourceLocale ?? 'en'
  const targetLocaleParam = body?.targetLocale ?? 'zh-CN'
  const namespace = body?.namespace ?? 'common'
  const key = body?.key ?? ''

  if (!key.trim()) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const authz = await requireSuperAdmin(supabase)
  if (!authz.ok) return authz.response

  const sourceMessages = await loadLocaleMessages(sourceLocaleParam)
  const sourceNs = sourceMessages?.[namespace] ?? {}
  const sourceFlat = flattenObject(sourceNs)

  let sourceValue: string = sourceFlat[key]
  if (!sourceValue) {
    // Fallback: English base strings may have been imported into DB (e.g. namespace=literals)
    try {
      const fromDb = await getSourceFromDb(supabase, sourceLocaleParam, namespace, key)
      if (fromDb) sourceValue = fromDb
    } catch {
      // handled below
    }
  }

  if (!sourceValue) {
    return NextResponse.json({ error: `Source key not found: ${namespace}.${key}` }, { status: 404 })
  }

  const provider = await resolveAiProviderForPurpose(supabase as any, 'TRANSLATION')
  if (!provider) {
    return NextResponse.json({ error: 'No active AI provider configured' }, { status: 400 })
  }

  const cfg = ((provider as any).config ?? {}) as any
  const providerName = String((provider as any).name ?? '').toLowerCase()

  const apiKey =
    (typeof cfg.platform_api_key === 'string' && cfg.platform_api_key.trim() ? cfg.platform_api_key.trim() : null) ||
    (providerName === 'openai'
      ? process.env.OPENAI_API_KEY
      : providerName === 'openrouter'
        ? process.env.OPENROUTER_API_KEY
        : providerName === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY
          : process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY)

  if (!apiKey) {
    return NextResponse.json({ error: 'No platform API key configured for AI provider' }, { status: 400 })
  }

  const baseURL =
    (typeof cfg.baseUrl === 'string' && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : null) ||
    (typeof (provider as any).api_endpoint === 'string' && (provider as any).api_endpoint.trim()
      ? (provider as any).api_endpoint.trim()
      : null) ||
    (providerName === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined)

  const configuredModels: string[] = Array.isArray(cfg.models)
    ? cfg.models.map((m: any) => String(m)).filter((m: string) => m.trim())
    : []

  let model =
    (typeof cfg.defaultModel === 'string' && cfg.defaultModel.trim() ? cfg.defaultModel.trim() : null) ||
    (configuredModels.length > 0 ? configuredModels[0] : null) ||
    (providerName === 'openrouter' ? 'google/gemini-2.0-flash-exp:free' : 'gpt-3.5-turbo')

  const openai = new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
    defaultHeaders:
      providerName === 'openrouter'
        ? {
            'HTTP-Referer': cfg.siteUrl || 'https://ledgerai.com',
            'X-Title': cfg.siteName || 'LedgerAI',
          }
        : undefined,
  })

  const prompt = buildPrompt({
    sourceLocale: sourceLocaleParam,
    targetLocale: targetLocaleParam,
    namespace,
    key,
    source: sourceValue,
  })

  try {
    let completion: any
    try {
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Return only the translated string.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      })
    } catch (e: any) {
      // Best-effort fallback on OpenRouter rate limits when multiple models are configured
      const status = coerceStatusCode(e)
      if ((status === 429 || String(e?.message || '').includes('429')) && providerName === 'openrouter') {
        const nextModel = configuredModels.length > 1 ? configuredModels[1] : null
        if (nextModel && nextModel !== model) {
          model = nextModel
          completion = await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: 'Return only the translated string.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
          })
        } else {
          throw e
        }
      } else {
        throw e
      }
    }

    const translated = String(completion.choices?.[0]?.message?.content ?? '').trim()

    if (!translated) {
      return NextResponse.json({ error: 'AI returned empty translation' }, { status: 502 })
    }

    return NextResponse.json({
      namespace,
      key,
      sourceLocale: sourceLocaleParam,
      targetLocale: targetLocaleParam,
      sourceValue,
      translated,
      model,
      provider: providerName || null,
    })
  } catch (e: any) {
    const status = coerceStatusCode(e)
    const retryAfterSeconds = extractRetryAfterSeconds(e)
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined

    // Surface provider errors accurately so the client can back off/retry.
    return NextResponse.json(
      {
        error: e?.message || 'AI translation failed',
        status,
        retryAfterSeconds,
        provider: providerName || null,
        model,
      },
      { status, headers }
    )
  }
}
