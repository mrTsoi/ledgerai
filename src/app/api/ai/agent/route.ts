import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { userHasFeature } from '@/lib/subscription/server'
import { resolveAiProviderForPurpose } from '@/lib/ai/provider-resolver'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeAgentResponse, type AgentAction } from '@/lib/ai/agent-response'

// Helper to get AI config
async function getTenantAIConfig(supabase: any, tenantId: string) {
  // 1. Try tenant-specific configuration first
  const { data: tenantConfig } = await supabase
    .from('tenant_ai_configurations')
    .select(`*, ai_providers (*)`)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (tenantConfig) return { ...(tenantConfig as any), __resolvedFrom: 'tenant' }

  // 2. Fallback to platform routing for CHATBOT, then platform default.
  const defaultProvider = await resolveAiProviderForPurpose(supabase as any, 'CHATBOT')

  if (!defaultProvider) return null

  return {
    tenant_id: tenantId,
    ai_provider_id: defaultProvider.id,
    api_key_encrypted: null,
    model_name: null,
    custom_config: defaultProvider.config || {},
    is_active: true,
    ai_providers: defaultProvider,
    __resolvedFrom: 'platform',
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { message, history, tenantId, locale, currentPath } = await request.json()

    const preferredLocale = typeof locale === 'string' && locale.trim() ? locale.trim() : 'en'
    const preferredLanguage =
      preferredLocale === 'zh-CN'
        ? 'Simplified Chinese'
        : preferredLocale === 'zh-HK'
          ? 'Traditional Chinese (Hong Kong)'
          : preferredLocale === 'zh-TW'
            ? 'Traditional Chinese (Taiwan)'
            : 'English'

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAiEnabled = await userHasFeature(supabase as any, user.id, 'ai_agent')

    if (!isAiEnabled) {
      return NextResponse.json({ 
        reply: "I'm sorry, but the AI Agent feature is not included in your current plan. Please upgrade to access this feature." 
      })
    }

    // AI Provider Integration
    if (!tenantId) {
      return NextResponse.json({ reply: "Please select a company/tenant to use the AI Agent." })
    }

    // NOTE: Provider routing + platform defaults are typically locked down by RLS for normal users.
    // Use the service role client for resolving provider configuration, but keep auth/subscription
    // checks on the user-scoped client.
    let configSupabase: any = supabase
    try {
      configSupabase = createServiceClient()
    } catch (e) {
      console.warn('[AI Agent] Service client not available; falling back to user-scoped config reads')
    }

    const aiConfig = await getTenantAIConfig(configSupabase, tenantId)
    
    if (!aiConfig) {
      return NextResponse.json({ reply: "AI Service is not configured. Please contact support." })
    }

    const providerName = aiConfig.ai_providers?.name?.toLowerCase()
    const providerConfig = (aiConfig.ai_providers?.config || {}) as any
    
    // Determine API Key based on hierarchy:
    // 1. Tenant-specific key (encrypted)
    // 2. System-wide key in DB config (if any)
    // 3. Environment Variable matching the provider
    
    let apiKey = aiConfig.api_key_encrypted

    if (!apiKey) {
      // Check if key is in the provider config (Admin might have saved it there)
      apiKey = aiConfig.ai_providers?.config?.platform_api_key || aiConfig.ai_providers?.config?.api_key

      // Fallback to Environment Variables based on provider name
      if (!apiKey) {
        if (providerName === 'openai') {
          apiKey = process.env.OPENAI_API_KEY
        } else if (providerName === 'openrouter') {
          apiKey = process.env.OPENROUTER_API_KEY
        } else if (providerName === 'anthropic') {
          apiKey = process.env.ANTHROPIC_API_KEY
        } else if (typeof providerName === 'string' && providerName.includes('deepseek')) {
          apiKey = process.env.DEEPSEEK_API_KEY
        } else {
          // Generic fallback
          apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY
        }
      }
    }

    const configuredBaseUrl = typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl.trim() : ''
    let baseURL = configuredBaseUrl || 'https://api.openai.com/v1'
    let model = 'gpt-3.5-turbo'

    // Determine Base URL defaults for known OpenAI-compatible providers.
    if (!configuredBaseUrl) {
      if (providerName === 'openrouter') {
        baseURL = 'https://openrouter.ai/api/v1'
      } else if (typeof providerName === 'string' && providerName.includes('deepseek')) {
        baseURL = 'https://api.deepseek.com'
      }
    }

    // 2. Determine Model
    // Priority 1: Tenant-specific model override
    if (aiConfig.model_name) {
      model = aiConfig.model_name
    } 
    // Priority 2: Provider default model from Platform Admin config
    else if (Array.isArray(providerConfig?.models) && providerConfig.models.length > 0) {
      model = providerConfig.models[0]
    } else if (typeof providerConfig?.defaultModel === 'string' && providerConfig.defaultModel.trim()) {
      model = providerConfig.defaultModel.trim()
    }

    // Sensible fallback for DeepSeek when no model is configured.
    if (typeof providerName === 'string' && providerName.includes('deepseek') && (!model || model === 'gpt-3.5-turbo')) {
      model = 'deepseek-chat'
    }

    // Debug Logging
    console.log(`[AI Agent] Tenant: ${tenantId}`)
    console.log(`[AI Agent] Provider: ${providerName}`)
    console.log(`[AI Agent] Provider Source: ${(aiConfig as any)?.__resolvedFrom || 'unknown'}`)
    console.log(`[AI Agent] Key Source: ${apiKey ? 'Found' : 'Missing'}`)
    console.log(`[AI Agent] Model: ${model}`)
    console.log(`[AI Agent] BaseURL: ${baseURL}`)

    // If no API key is found, return a helpful message (or mock for demo)
    if (!apiKey) {
      console.warn("No API Key found. Using mock response.")
      // For demo purposes, we'll fall back to the rule-based system if no key is present
      // This ensures the app doesn't crash for users without keys
      
      const lowerMsg = message.toLowerCase()
      let reply = "I'm not sure how to help with that yet."
      let action: AgentAction | null = null

      const isChinese = preferredLocale.startsWith('zh')

      if (lowerMsg.includes('invoice') || lowerMsg.includes('create invoice')) {
        reply = isChinese
          ? '我可以幫你建立發票。現在帶你前往建立發票的頁面。'
          : 'I can help you create an invoice. Navigating you to the invoice creation page.'
        action = { type: 'NAVIGATE', path: '/dashboard/documents/new', label: 'New Invoice' }
      } else if (lowerMsg.includes('report') || lowerMsg.includes('p&l')) {
        reply = isChinese
          ? '這是你的損益表（P&L）報表。'
          : 'Here is your Profit & Loss report.'
        action = { type: 'NAVIGATE', path: '/dashboard/reports', label: 'Reports' }
      } else if (lowerMsg.includes('dashboard')) {
        reply = isChinese
          ? '帶你前往控制面板。'
          : 'Taking you to the dashboard.'
        action = { type: 'NAVIGATE', path: '/dashboard', label: 'Dashboard' }
      } else {
        reply = isChinese
          ? `[示範模式 - 未設定 API Key] 我收到："${message}"。如要啟用完整 AI，請先設定 API Key。`
          : `[Demo Mode - No API Key] I received: "${message}". To enable full AI, please configure an API Key.`
      }
      return NextResponse.json({
        reply,
        ...(action ? { actions: [action] } : null),
      })
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      defaultHeaders: {
        "HTTP-Referer": "https://ledgerai.com",
        "X-Title": "LedgerAI"
      }
    })

    const safeCurrentPath = typeof currentPath === 'string' && currentPath.trim() ? currentPath.trim() : 'unknown'

    const systemPrompt = `You are LedgerAI, an expert AI accounting assistant for a multi-tenant SaaS platform.
    
    CONTEXT:
    - Current Tenant ID: ${tenantId}
    - Platform: LedgerAI (Next.js + Supabase)
    - User Role: Authenticated Member
    - User Locale: ${preferredLocale}
    - Preferred Response Language: ${preferredLanguage}
    - Current Page Path: ${safeCurrentPath}

    PRODUCT KNOWLEDGE (What LedgerAI does in this app):
    - Dashboard: overview and quick access.
    - Documents: upload invoices/receipts and manage document workflows.
    - Transactions: journal/transactions list and categorization.
    - Banking: bank connections and cashflow-related workflows.
    - Reports: Profit & Loss, Balance Sheet, and reporting views.
    - Team: invite/manage teammates.
    - Settings: company preferences and configuration.
    
    UX GUIDANCE:
    - Prefer giving step-by-step guidance that matches the actual navigation map.
    - Be explicit about where to click and what page to open.
    - Do NOT invent features or pages not listed in the navigation map.
    
    YOUR CAPABILITIES:
    1. Navigation: You can navigate the user to specific pages.
    2. Accounting Advice: You can explain accounting concepts (GAAP/IFRS), tax rules, and financial metrics.
    3. Data Analysis: You can help interpret financial data (though you currently don't have direct DB access, you can explain what reports mean).
    
    NAVIGATION MAP (Use these paths):
    - Dashboard: /dashboard
    - Documents (Invoices/Receipts): /dashboard/documents
    - Create Invoice: /dashboard/documents/new
    - Transactions/Journal: /dashboard/transactions
    - Banking/Cash Flow: /dashboard/banking
    - Financial Reports (P&L, Balance Sheet): /dashboard/reports
    - Team Management: /dashboard/team
    - Settings: /dashboard/settings
    
    ACTIONABLE RESPONSE FORMAT:
    - When the user asks to go somewhere, open a feature, or you want to offer a direct next step,
      return ONLY JSON (no markdown) with this schema:
      {
        "reply": "Concise helpful message.",
        "actions": [
          { "type": "NAVIGATE", "path": "/dashboard/...", "label": "Open Reports" }
        ],
        "suggested_prompts": ["Show me the P&L report", "Create a new invoice"]
      }
    - Rules:
      - "actions" is optional; include up to 2 actions.
      - Only use NAVIGATE actions and only paths from the navigation map.
      - "suggested_prompts" is optional; include up to 4 short prompts.
    - For general questions, you may return plain text.
    - Keep responses concise, professional, and helpful.
    - If asked about data from other tenants, politely refuse and explain that data is strictly isolated for security.
    - Always respond in ${preferredLanguage} unless the user explicitly asks you to use another language.
    `

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: message }
        ]
      })
    } catch (e: any) {
      // Region restrictions (e.g. OpenAI "Country, region, or territory not supported").
      // Return a user-facing reply instead of failing the whole API call.
      if (
        e?.status === 403 &&
        typeof e?.message === 'string' &&
        /Country, region, or territory not supported/i.test(e.message)
      ) {
        const isZhCN = preferredLocale === 'zh-CN'
        const isZh = preferredLocale.startsWith('zh')
        const reply = isZhCN
          ? '⚠️ 当前 AI 供应商在你所在的地区不可用（区域限制）。请联系管理员切换到受支持的 AI 供应商（例如 OpenRouter）后再试。'
          : isZh
            ? '⚠️ 目前 AI 供應商在你所在的地區不可用（區域限制）。請聯絡管理員切換到受支援的 AI 供應商（例如 OpenRouter）後再試。'
            : '⚠️ The current AI provider is not available in your region. Ask an admin to switch to a supported provider (e.g. OpenRouter) and try again.'

        return NextResponse.json({
          reply,
          diagnostics: {
            provider: providerName || 'unknown',
            model,
            baseURL,
          },
        })
      }

      // Retry logic for OpenRouter Rate Limits
      if ((e.status === 429 || e.message?.includes('429')) && providerName === 'openrouter') {
        const configModels = aiConfig.ai_providers.config?.models
        if (configModels && configModels.length > 1) {
          console.log(`Rate limit on ${model}, trying backup model ${configModels[1]}...`)
          model = configModels[1]
          completion = await openai.chat.completions.create({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
              { role: 'user', content: message }
            ]
          })
        } else {
          throw e
        }
      } else {
        throw e
      }
    }

    const content = completion.choices[0].message.content

    return NextResponse.json(normalizeAgentResponse(content || ''))

  } catch (error: any) {
    console.error('AI Agent Error:', error)

    // Handle Rate Limits gracefully by returning a chat message
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
       return NextResponse.json({ 
         reply: "⚠️ I'm currently experiencing high traffic (Rate Limit Exceeded). Please try again in a moment." 
       })
    }

    // Handle Authentication Errors
    if (error.status === 401) {
      return NextResponse.json({ 
        reply: "⚠️ Authentication failed with the AI Provider. Please check the API Key configuration." 
      })
    }

    // Handle Model Not Found Errors
    if (error.status === 404) {
      return NextResponse.json({ 
        reply: '⚠️ The configured AI model was not found or is not available.' 
      })
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 })
  }
}
