import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { literalKeyFromText } from '@/lib/i18n/literal-key'
import { resolveAiProviderForPurpose } from '@/lib/ai/provider-resolver'

export const runtime = 'nodejs'

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

function buildTranslationPrompt(args: {
  sourceLocale: string
  targetLocale: string
  key: string
  source: string
}) {
  return [
    'You are a professional software localization translator.',
    `Translate from ${args.sourceLocale} to ${args.targetLocale}.`,
    'Rules:',
    '- Preserve placeholders exactly (e.g. {name}, {count}, {{name}}, %s).',
    '- Preserve apostrophes and punctuation meaning.',
    '- Keep the tone friendly, concise, and suitable for a SaaS accounting UI.',
    '- Return only the translated string, no quotes, no JSON.',
    '',
    `NAMESPACE: literals`,
    `KEY: ${args.key}`,
    `SOURCE: ${args.source}`,
  ].join('\n')
}

function normalizeLocale(locale: string): string {
  // Keep alignment with next-intl request config.
  if (locale === 'zh-TW') return 'zh-HK'
  return locale
}

function formatLocaleLabel(locale: string): string {
  if (locale === 'zh-CN') return 'Simplified Chinese'
  if (locale === 'zh-HK') return 'Traditional Chinese (Hong Kong)'
  if (locale === 'zh-TW') return 'Traditional Chinese (Taiwan)'
  if (locale === 'en') return 'English'
  return locale
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        sourceLocale?: string
        targetLocales?: string[]
        items?: Array<{ id?: string; text: string }>
        persist?: boolean
      }
    | null

  const sourceLocale = normalizeLocale(body?.sourceLocale ?? 'en')
  const targetLocalesRaw = Array.isArray(body?.targetLocales) ? body?.targetLocales : ['zh-CN', 'zh-HK']
  const targetLocales = Array.from(
    new Set(targetLocalesRaw.map((l) => normalizeLocale(String(l))).filter((l) => l && l !== sourceLocale))
  )

  const items = Array.isArray(body?.items) ? body?.items : []
  const persist = body?.persist !== false

  if (items.length === 0) {
    return NextResponse.json({ error: 'items is required' }, { status: 400 })
  }

  const cleanedItems = items
    .map((it) => ({ id: it.id, text: String(it.text ?? '').trim() }))
    .filter((it) => it.text.length > 0)

  if (cleanedItems.length === 0) {
    return NextResponse.json({ error: 'items must contain at least one non-empty text' }, { status: 400 })
  }

  if (targetLocales.length === 0) {
    return NextResponse.json({ error: 'targetLocales must contain at least one locale different from sourceLocale' }, { status: 400 })
  }

  const supabase = await createClient()
  const authz = await requireSuperAdmin(supabase)
  if (!authz.ok) return authz.response

  const provider = await resolveAiProviderForPurpose(supabase as any, 'TRANSLATION')
  if (!provider) {
    return NextResponse.json({ error: 'No active AI provider configured for TRANSLATION' }, { status: 400 })
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

  const results: Array<{
    id?: string
    source: string
    key: string
    translations: Record<string, string>
  }> = []

  try {
    for (const item of cleanedItems) {
      const key = literalKeyFromText(item.text)
      const translations: Record<string, string> = {}

      for (const targetLocale of targetLocales) {
        const prompt = buildTranslationPrompt({
          sourceLocale: formatLocaleLabel(sourceLocale),
          targetLocale: formatLocaleLabel(targetLocale),
          key,
          source: item.text,
        })

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
          return NextResponse.json({ error: 'AI returned empty translation', key, targetLocale }, { status: 502 })
        }

        translations[targetLocale] = translated

        if (persist) {
          const { error: upsertError } = await (supabase as any)
            .from('app_translations')
            .upsert(
              {
                locale: targetLocale,
                namespace: 'literals',
                key,
                value: translated,
              },
              { onConflict: 'locale,namespace,key' }
            )

          if (upsertError) {
            return NextResponse.json({ error: upsertError.message }, { status: 500 })
          }
        }
      }

      results.push({ id: item.id, source: item.text, key, translations })
    }

    return NextResponse.json({
      sourceLocale,
      targetLocales,
      persist,
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
        error: e?.message || 'AI translation failed',
        status,
        retryAfterSeconds,
        provider: providerName || null,
      },
      { status, headers }
    )
  }
}
