import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Helper to get AI config
async function getTenantAIConfig(supabase: any, tenantId: string) {
  // 1. Try tenant-specific configuration first
  const { data: tenantConfig } = await supabase
    .from('tenant_ai_configurations')
    .select(`*, ai_providers (*)`)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (tenantConfig) return tenantConfig

  // 2. Fallback to default provider
  const { data: defaultProvider } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!defaultProvider) return null

  return {
    tenant_id: tenantId,
    ai_provider_id: defaultProvider.id,
    api_key_encrypted: null,
    model_name: null,
    custom_config: defaultProvider.config || {},
    is_active: true,
    ai_providers: defaultProvider,
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { message, history, tenantId } = await request.json()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription features
    // We need to get the plan_id from user_subscriptions and then check features in subscription_plans
    // Note: We use a two-step query to avoid potential foreign key relationship issues in PostgREST
    const { data: userSub, error: subError } = await (supabase
      .from('user_subscriptions') as any)
      .select('plan_id, status')
      .eq('user_id', user.id)
      .single()

    if (subError || !userSub) {
      console.error('Subscription Error:', subError)
      return NextResponse.json({ error: 'Subscription not found', details: subError }, { status: 403 })
    }

    const { data: plan, error: planError } = await (supabase
      .from('subscription_plans') as any)
      .select('features')
      .eq('id', (userSub as any).plan_id)
      .single()

    if (planError || !plan) {
      console.error('Plan Error:', planError)
      return NextResponse.json({ error: 'Plan not found', details: planError }, { status: 403 })
    }

    const features = plan.features as any
    console.log('AI Agent Request - Features:', features)
    const isAiEnabled = features?.ai_agent === true

    if (!isAiEnabled) {
      return NextResponse.json({ 
        reply: "I'm sorry, but the AI Agent feature is not included in your current plan. Please upgrade to access this feature." 
      })
    }

    // AI Provider Integration
    if (!tenantId) {
      return NextResponse.json({ reply: "Please select a company/tenant to use the AI Agent." })
    }

    const aiConfig = await getTenantAIConfig(supabase, tenantId)
    
    if (!aiConfig) {
      return NextResponse.json({ reply: "AI Service is not configured. Please contact support." })
    }

    const providerName = aiConfig.ai_providers?.name?.toLowerCase()
    
    // Determine API Key based on hierarchy:
    // 1. Tenant-specific key (encrypted)
    // 2. System-wide key in DB config (if any)
    // 3. Environment Variable matching the provider
    
    let apiKey = aiConfig.api_key_encrypted

    if (!apiKey) {
      // Check if key is in the provider config (Admin might have saved it there)
      apiKey = aiConfig.ai_providers?.config?.api_key

      // Fallback to Environment Variables based on provider name
      if (!apiKey) {
        if (providerName === 'openai') {
          apiKey = process.env.OPENAI_API_KEY
        } else if (providerName === 'openrouter') {
          apiKey = process.env.OPENROUTER_API_KEY
        } else if (providerName === 'anthropic') {
          apiKey = process.env.ANTHROPIC_API_KEY
        } else {
          // Generic fallback
          apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY
        }
      }
    }

    let baseURL = 'https://api.openai.com/v1'
    let model = 'gpt-3.5-turbo'

    // 1. Determine Base URL
    if (providerName === 'openrouter') {
      baseURL = 'https://openrouter.ai/api/v1'
    }

    // 2. Determine Model
    // Priority 1: Tenant-specific model override
    if (aiConfig.model_name) {
      model = aiConfig.model_name
    } 
    // Priority 2: Provider default model from Platform Admin config
    else if (aiConfig.ai_providers?.config?.models?.length > 0) {
      model = aiConfig.ai_providers.config.models[0]
    }

    // Debug Logging
    console.log(`[AI Agent] Tenant: ${tenantId}`)
    console.log(`[AI Agent] Provider: ${providerName}`)
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
      let action = null

      if (lowerMsg.includes('invoice') || lowerMsg.includes('create invoice')) {
        reply = "I can help you create an invoice. Navigating you to the invoice creation page."
        action = { type: 'NAVIGATE', path: '/dashboard/documents/new', label: 'New Invoice' }
      } else if (lowerMsg.includes('report') || lowerMsg.includes('p&l')) {
        reply = "Here is your Profit & Loss report."
        action = { type: 'NAVIGATE', path: '/dashboard/reports', label: 'Reports' }
      } else if (lowerMsg.includes('dashboard')) {
        reply = "Taking you to the dashboard."
        action = { type: 'NAVIGATE', path: '/dashboard', label: 'Dashboard' }
      } else {
        reply = `[Demo Mode - No API Key] I received: "${message}". To enable full AI, please configure an API Key.`
      }
      return NextResponse.json({ reply, action })
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      defaultHeaders: {
        "HTTP-Referer": "https://ledgerai.com",
        "X-Title": "LedgerAI"
      }
    })

    const systemPrompt = `You are LedgerAI, an expert AI accounting assistant for a multi-tenant SaaS platform.
    
    CONTEXT:
    - Current Tenant ID: ${tenantId}
    - Platform: LedgerAI (Next.js + Supabase)
    - User Role: Authenticated Member
    
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
    
    RESPONSE FORMAT:
    - If the user asks to GO somewhere or DO something that requires a UI change, return a JSON object:
      {
        "reply": "Sure, taking you there...",
        "action": { "type": "NAVIGATE", "path": "/dashboard/..." }
      }
    - For general questions, return plain text.
    - Keep responses concise, professional, and helpful.
    - If asked about data from other tenants, politely refuse and explain that data is strictly isolated for security.
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
    
    // Try to parse if it's JSON (for actions)
    try {
      if (content && content.trim().startsWith('{')) {
        const parsed = JSON.parse(content)
        return NextResponse.json(parsed)
      }
    } catch (e) {
      // Not JSON, just text
    }

    return NextResponse.json({ reply: content })

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
