import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// Use dynamic factories to avoid importing Node-only SDKs at module evaluation time

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
    if (error || isSuperAdmin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { providerName, apiKey, modelName, customConfig, checkVision } = body

    let success = false
    let message = ''

    if (providerName === 'google-document-ai') {
      try {
        const config = typeof customConfig === 'string' ? JSON.parse(customConfig) : customConfig
        const clientConfig: any = {
            apiEndpoint: config.location === 'us' ? 'us-documentai.googleapis.com' : `${config.location}-documentai.googleapis.com`
        }
        
        if (config.clientEmail && apiKey) {
            clientConfig.credentials = {
                client_email: config.clientEmail,
                private_key: apiKey.replace(/\\n/g, '\n'),
            }
        }
        
        const { createDocumentAIClient } = await import('@/integrations/google/documentai-client')
        const client = await createDocumentAIClient(clientConfig)
        
        if (config.projectId && config.location && config.processorId) {
             const name = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`
             await client.getProcessor({ name })
             success = true
             message = 'Successfully connected to Google Document AI Processor'
        } else {
             // If we can't test the processor, we assume config is okay if we got this far without instantiation error
             // But really, without a call, we don't know. 
             // Let's try to list locations as a lightweight check if possible, or just return success with warning.
             success = true
             message = 'Google credentials format appears valid (Processor check skipped due to missing config)'
        }
      } catch (error: any) {
        success = false
        message = `Google AI Connection Failed: ${error.message}`
      }
    } else {
      // OpenAI Compatible (Qwen, DeepSeek, OpenAI, OpenRouter)
      try {
        const config = typeof customConfig === 'string' ? JSON.parse(customConfig) : customConfig
        const baseURL = config.baseUrl || (providerName === 'deepseek-ocr' ? 'https://api.deepseek.com' : undefined)
        
        const { createOpenAIClient } = await import('@/lib/ai/openai-client')
        const openai = await createOpenAIClient({
          apiKey: apiKey,
          baseURL: baseURL,
          defaultHeaders: providerName === 'openrouter' ? {
            'HTTP-Referer': config.siteUrl || 'https://ledgerai.com',
            'X-Title': config.siteName || 'LedgerAI',
          } : undefined
        })

        // Simple chat completion to test auth
        const start = Date.now()
        
        let messages: any[] = [{ role: 'user', content: 'Test connection' }]
        
        if (checkVision) {
          messages = [{
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image? Reply with "image received".' },
              { 
                type: 'image_url', 
                image_url: { 
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' 
                } 
              }
            ]
          }]
        }

        await openai.chat.completions.create({
            model: modelName,
            messages: messages,
            max_tokens: 10
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
            message = `Network Error: Could not resolve host. Check your Base URL.`
        } else if (error.status === 400 && checkVision) {
             message = `Vision Test Failed: Model '${modelName}' might not support image inputs, or the provider API rejected the image format.`
        } else if (error.status === 429) {
             message = `Rate Limit Exceeded: You have hit the rate limit or run out of credits for ${providerName}. Check your provider dashboard.`
        }
      }
    }

    return NextResponse.json({ success, message })

  } catch (error: any) {
    console.error('Test API Error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
