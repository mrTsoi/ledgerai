import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { resolveAiProviderForPurpose } from '@/lib/ai/provider-resolver'

export const runtime = 'nodejs'

function tryParseJsonObject(content: string): any | null {
  const trimmed = String(content || '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return null
  } catch {
    return null
  }
}

function buildPrompt(args: { prompt: string; current?: any }) {
  const current = args.current && typeof args.current === 'object' ? JSON.stringify(args.current, null, 2) : ''
  return `You are a SaaS marketing copywriter.

Task: Suggest concise homepage hero copy for an AI-powered multi-tenant accounting platform.

Constraints:
- Return ONLY valid JSON.
- Keep hero_title <= 80 characters.
- Keep hero_subtitle <= 180 characters.
- Use confident, modern B2B tone.

Return JSON with keys:
{
  "hero_badge": string,
  "hero_title": string,
  "hero_title_highlight": string,
  "hero_subtitle": string
}

Admin brief:
${args.prompt}

Current config (may be empty):
${current}
`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
  if (error || isSuperAdmin !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const prompt = String(body?.prompt ?? '').trim()
  const current = body?.current ?? null

  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const provider = await resolveAiProviderForPurpose(supabase as any, 'MARKETING')
  if (!provider) return NextResponse.json({ error: 'No active AI provider configured' }, { status: 400 })

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

  if (!apiKey) return NextResponse.json({ error: 'No platform API key configured for AI provider' }, { status: 400 })

  const baseURL =
    (typeof cfg.baseUrl === 'string' && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : null) ||
    (typeof (provider as any).api_endpoint === 'string' && (provider as any).api_endpoint.trim()
      ? (provider as any).api_endpoint.trim()
      : null) ||
    (providerName === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined)

  const configuredModels: string[] = Array.isArray(cfg.models)
    ? cfg.models.map((m: any) => String(m)).filter((m: string) => m.trim())
    : []

  const model =
    (typeof cfg.defaultModel === 'string' && cfg.defaultModel.trim() ? cfg.defaultModel.trim() : null) ||
    (configuredModels.length > 0 ? configuredModels[0] : null) ||
    (providerName === 'openrouter' ? 'google/gemini-2.0-flash-exp:free' : 'gpt-4o-mini')

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

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'Return only JSON. No markdown.' },
      { role: 'user', content: buildPrompt({ prompt, current }) },
    ],
    temperature: 0.6,
  })

  const content = String(completion.choices?.[0]?.message?.content ?? '').trim()
  const parsed = tryParseJsonObject(content)

  if (!parsed) {
    return NextResponse.json({ error: 'AI did not return valid JSON', raw: content }, { status: 502 })
  }

  return NextResponse.json({ suggestion: parsed, model, provider: providerName || null })
}
