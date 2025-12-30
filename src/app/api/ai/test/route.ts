import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/subscription/server'
// Use dynamic factories to avoid importing Node-only SDKs at module evaluation time

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  if (!tenantId || typeof tenantId !== 'string') return badRequest('tenant_id is required')

  // Must be a manager of the tenant (avoid letting regular members probe providers)
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  const role = (membership as any)?.role as string | undefined
  const canManage = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_ai_provider')
    if (!ok) {
      return NextResponse.json({ error: 'Custom AI provider configuration is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const { providerName, apiKey, modelName, customConfig, checkVision } = body

  let success = false
  let message = ''

  if (providerName === 'google-document-ai') {
    try {
      const cfg = typeof customConfig === 'string' ? JSON.parse(customConfig) : customConfig
      const clientConfig: any = {
        apiEndpoint: cfg?.location === 'us' ? 'us-documentai.googleapis.com' : `${cfg?.location || 'us'}-documentai.googleapis.com`,
      }

      if (cfg?.clientEmail && apiKey) {
        clientConfig.credentials = {
          client_email: cfg.clientEmail,
          private_key: String(apiKey).replace(/\\n/g, '\n'),
        }
      }

      const { createDocumentAIClient } = await import('@/integrations/google/documentai-client')
      const client = await createDocumentAIClient(clientConfig)

      if (cfg?.projectId && cfg?.location && cfg?.processorId) {
        const name = `projects/${cfg.projectId}/locations/${cfg.location}/processors/${cfg.processorId}`
        await client.getProcessor({ name })
        success = true
        message = 'Successfully connected to Google Document AI Processor'
      } else {
        success = true
        message = 'Google credentials format appears valid (Processor check skipped due to missing config)'
      }
    } catch (error: any) {
      success = false
      message = `Google AI Connection Failed: ${error.message}`
    }
  } else {
    try {
      const cfg = typeof customConfig === 'string' ? JSON.parse(customConfig) : customConfig
      const baseURL = cfg?.baseUrl || (providerName === 'deepseek-ocr' ? 'https://api.deepseek.com' : undefined)

      const { createOpenAIClient } = await import('@/lib/ai/openai-client')
      const openai = await createOpenAIClient({
        apiKey: apiKey,
        baseURL,
        defaultHeaders:
          providerName === 'openrouter'
            ? {
                'HTTP-Referer': cfg?.siteUrl || 'https://ledgerai.com',
                'X-Title': cfg?.siteName || 'LedgerAI',
              }
            : undefined,
      })

      const start = Date.now()

      let messages: any[] = [{ role: 'user', content: 'Test connection' }]

      if (checkVision) {
        messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image? Reply with "image received".' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                },
              },
            ],
          },
        ]
      }

      await openai.chat.completions.create({
        model: modelName,
        messages,
        max_tokens: 10,
      })

      const duration = Date.now() - start
      success = true
      message = `Successfully connected to ${providerName} (${duration}ms)${checkVision ? ' - Vision Verified' : ''}`
    } catch (error: any) {
      success = false
      message = `Connection Failed: ${error.message}`

      if (error.status === 401) {
        message = `Authentication Failed: Invalid API Key for ${providerName}`
      } else if (error.status === 404) {
        message = `Model Not Found: The model '${modelName}' does not exist or is not available.`
      } else if (error.code === 'ENOTFOUND') {
        message = 'Network Error: Could not resolve host. Check your Base URL.'
      } else if (error.status === 400 && checkVision) {
        message = `Vision Test Failed: Model '${modelName}' might not support image inputs, or the provider API rejected the image format.`
      } else if (error.status === 429) {
        message = `Rate Limit Exceeded: You have hit the rate limit or run out of credits for ${providerName}. Check your provider dashboard.`
      }
    }
  }

  return NextResponse.json({ success, message })
}
