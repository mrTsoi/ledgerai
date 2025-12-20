import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { resolveAiProviderForPurpose } from '@/lib/ai/provider-resolver'

type BatchItem = {
  namespace: string
  key: string
  sourceValue?: string
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


function tryParseJsonObject(content: string): any | null {
  const raw = String(content || '').trim()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    // Try to extract a JSON object from the response
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function parseLoosePairs(content: string): Record<string, string> | null {
  const raw = String(content || '').trim()
  if (!raw) return null

  // Try to recover key/value pairs even when the model forgets braces.
  // Examples handled:
  //   "ns::key": "value",
  //   ns::key: value
  const out: Record<string, string> = {}

  // 1) quoted pairs
  const quotedPairRe = /"([^"]{3,300})"\s*:\s*"([\s\S]*?)"\s*(?:,|$)/g
  let m: RegExpExecArray | null
  while ((m = quotedPairRe.exec(raw))) {
    const k = String(m[1] ?? '').trim()
    const v = String(m[2] ?? '').trim()
    if (k && v) out[k] = v
  }

  if (Object.keys(out).length > 0) return out

  // 2) line-based unquoted
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const k = line.slice(0, idx).trim().replace(/^[-*]\s*/, '')
    const v = line.slice(idx + 1).trim().replace(/^"|"$/g, '')
    if (k && v) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

function buildBatchPrompt(args: {
  sourceLocale: string
  targetLocale: string
  items: Array<{ id: string; namespace: string; key: string; source: string }>
}) {
  const skeleton = `{
${args.items.map((it) => `  "${it.id}": ""`).join(',\n')}
}`

  return [
    'You are a professional software localization translator.',
    `Translate from ${args.sourceLocale} to ${args.targetLocale}.`,
    'Rules:',
    '- Preserve placeholders exactly (e.g. {name}, {count}, {{name}}, %s).',
    '- Preserve punctuation meaning.',
    '- Output must be VALID JSON.',
    '- Return ONLY a single JSON object (no markdown, no prose, no code fences).',
    '- JSON keys MUST exactly match the provided IDs (do not invent new keys).',
    '- JSON values MUST be the translated strings only.',
    '- Do not include any additional fields.',
    '',
    'Return JSON in this exact shape (fill the values):',
    skeleton,
    '',
    'ITEMS:',
    ...args.items.map((it) => `- ID: ${it.id}\n  NAMESPACE: ${it.namespace}\n  KEY: ${it.key}\n  SOURCE: ${it.source}`),
  ].join('\n')
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        sourceLocale?: string
        targetLocale?: string
        items?: BatchItem[]
      }
    | null

  const sourceLocale = body?.sourceLocale ?? 'en'
  const targetLocale = body?.targetLocale ?? 'zh-CN'
  const items = Array.isArray(body?.items) ? body!.items : []

  if (!items.length) {
    return NextResponse.json({ error: 'items is required' }, { status: 400 })
  }

  if (items.length > 50) {
    return NextResponse.json({ error: 'Too many items (max 50 per batch)' }, { status: 400 })
  }

  const normalized: Array<{ namespace: string; key: string; sourceValue: string }> = []
  for (const it of items) {
    const ns = String(it?.namespace ?? '').trim()
    const k = String(it?.key ?? '').trim()
    const src = String(it?.sourceValue ?? '').trim()
    if (!ns || !k || !src) continue
    normalized.push({ namespace: ns, key: k, sourceValue: src })
  }

  if (!normalized.length) {
    return NextResponse.json({ error: 'No valid items (namespace, key, sourceValue required)' }, { status: 400 })
  }

  const supabase = await createClient()
  const authz = await requireSuperAdmin(supabase)
  if (!authz.ok) return authz.response

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

  const promptItems = normalized.map((it) => ({
    id: `${it.namespace}::${it.key}`,
    namespace: it.namespace,
    key: it.key,
    source: it.sourceValue,
  }))

  const prompt = buildBatchPrompt({ sourceLocale, targetLocale, items: promptItems })

  try {
    let completion: any
    try {
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Return only a JSON object mapping IDs to translations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      })
    } catch (e: any) {
      const status = coerceStatusCode(e)
      if ((status === 429 || String(e?.message || '').includes('429')) && providerName === 'openrouter') {
        const nextModel = configuredModels.length > 1 ? configuredModels[1] : null
        if (nextModel && nextModel !== model) {
          model = nextModel
          completion = await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: 'Return only a JSON object mapping IDs to translations.' },
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

    const content = String(completion?.choices?.[0]?.message?.content ?? '').trim()
    const parsed = tryParseJsonObject(content) ?? parseLoosePairs(content)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'AI did not return a valid JSON object' }, { status: 502 })
    }

    const results: Record<string, string> = {}
    for (const it of promptItems) {
      const alt1 = `${it.namespace}.${it.key}`
      const raw = (parsed as any)[it.id] ?? (parsed as any)[alt1] ?? (parsed as any)[it.key]
      const translated = typeof raw === 'string' ? raw.trim() : ''
      if (translated) results[it.id] = translated
    }

    const missingIds = promptItems.map((it) => it.id).filter((id) => !results[id])
    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: 'AI did not return translations for all items',
          missingIds,
          provider: providerName || null,
          model,
          // debugging aid (truncated)
          raw: content.slice(0, 1200),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      sourceLocale,
      targetLocale,
      provider: providerName || null,
      model,
      results,
    })
  } catch (e: any) {
    const status = coerceStatusCode(e)
    const retryAfterSeconds = extractRetryAfterSeconds(e)
    const headers = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined

    return NextResponse.json(
      {
        error: e?.message || 'AI batch translation failed',
        status,
        retryAfterSeconds,
        provider: providerName || null,
        model,
      },
      { status, headers }
    )
  }
}
