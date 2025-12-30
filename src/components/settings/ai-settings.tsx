'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Save, Bot, AlertCircle, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { Database } from '@/types/database.types'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

type AIProvider = Database['public']['Tables']['ai_providers']['Row']

export function AISettings() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const { subscription, loading: subLoading } = useSubscription()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [config, setConfig] = useState({
    providerId: '',
    apiKey: '',
    modelName: '',
    customConfig: '{}'
  })

  const [isFetchingModels, setIsFetchingModels] = useState(false)

  const hasFeature = subscription?.features?.custom_ai_provider === true

  const fetchProviders = useCallback(async () => {
    if (!currentTenant) return
    const res = await fetch(`/api/ai/config?tenant_id=${encodeURIComponent(currentTenant.id)}`)
    const json = await res.json()
    if (res.ok) {
      setProviders(json?.providers || [])
    }
  }, [currentTenant])

  const fetchCurrentConfig = useCallback(async () => {
    if (!currentTenant) return

    const res = await fetch(`/api/ai/config?tenant_id=${encodeURIComponent(currentTenant.id)}`)
    const json = await res.json()
    if (!res.ok) return

    const data = json?.tenant_config
    if (data) {
      setConfig({
        providerId: data.ai_provider_id || '',
        apiKey: data.api_key_encrypted || '', // In real app, don't return full key
        modelName: data.model_name || '',
        customConfig: JSON.stringify(data.custom_config || {}, null, 2),
      })
    }
  }, [currentTenant])

  const fetchOpenRouterModels = useCallback(async () => {
    try {
      setIsFetchingModels(true)
      const response = await fetch('https://openrouter.ai/api/v1/models')
      if (!response.ok) throw new Error('Failed to fetch models')

      const data = await response.json()
      const models = data.data
        .filter((m: any) => {
          const id = m.id.toLowerCase()
          const arch = m.architecture || {}
          const modality = arch.modality || ''

          return id.includes('vision') ||
            id.includes('vl') ||
            id.includes('gemini') ||
            id.includes('claude-3') ||
            id.includes('gpt-4-turbo') ||
            id.includes('gpt-4o') ||
            modality.includes('image->text') ||
            modality.includes('text+image->text')
        })
        .map((m: any) => m.id)
        .sort()

      setAvailableModels(models)

      if (config.modelName && !models.includes(config.modelName)) {
        setIsCustomModel(true)
      } else {
        setIsCustomModel(false)
      }
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error)
      const provider = providers.find(p => p.id === config.providerId)
      const providerConfig = provider?.config as any
      if (providerConfig?.models) {
        setAvailableModels(providerConfig.models)
      }
    } finally {
      setIsFetchingModels(false)
    }
  }, [config.modelName, config.providerId, providers])

  useEffect(() => {
    if (currentTenant) {
      fetchProviders()
      fetchCurrentConfig()
    }
  }, [currentTenant, fetchProviders, fetchCurrentConfig])

  useEffect(() => {
    if (config.providerId && providers.length > 0) {
      const provider = providers.find(p => p.id === config.providerId)
      if (provider) {
        const providerConfig = provider.config as any

        if (provider.name === 'openrouter') {
          fetchOpenRouterModels()
        } else if (providerConfig?.models && Array.isArray(providerConfig.models)) {
          setAvailableModels(providerConfig.models)
          if (config.modelName && !providerConfig.models.includes(config.modelName)) {
            setIsCustomModel(true)
          } else {
            setIsCustomModel(false)
          }
        } else {
          setAvailableModels([])
          setIsCustomModel(true)
        }
      }
    }
  }, [config.providerId, config.modelName, providers, fetchOpenRouterModels])

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) {
      setConfig({ ...config, providerId })
      return
    }

    let defaultModel = ''
    let defaultCustomConfig = '{}'

    // Extract models from provider config if available
    const providerConfig = provider.config as any
    if (providerConfig?.models && Array.isArray(providerConfig.models) && providerConfig.models.length > 0) {
      defaultModel = providerConfig.models[0]
    }

    // Set default custom config based on provider name
    switch (provider.name) {
      case 'google-document-ai':
        defaultCustomConfig = JSON.stringify({
          projectId: "",
          location: "us",
          processorId: "",
          clientEmail: ""
        }, null, 2)
        break
      case 'qwen-vision':
        defaultCustomConfig = JSON.stringify({
          baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        }, null, 2)
        break
      case 'deepseek-ocr':
        defaultCustomConfig = JSON.stringify({
          baseUrl: "https://api.deepseek.com"
        }, null, 2)
        break
      case 'openai-vision':
        defaultCustomConfig = JSON.stringify({
          organization: ""
        }, null, 2)
        break
      case 'openrouter':
        defaultCustomConfig = JSON.stringify({
          baseUrl: "https://openrouter.ai/api/v1",
          siteUrl: "https://ledgerai.com", // Optional: Your site URL for OpenRouter rankings
          siteName: "LedgerAI" // Optional: Your site name
        }, null, 2)
        break
      default:
        defaultCustomConfig = '{}'
    }

    setConfig({
      ...config,
      providerId,
      modelName: defaultModel,
      customConfig: defaultCustomConfig
    })
    setTestStatus('idle')
    setTestMessage('')
  }

  const isVisionSupported = () => {
    const provider = providers.find(p => p.id === config.providerId)
    if (!provider) return false

    const providerConfig = provider.config as any
    return provider.name.includes('vision') || 
           provider.name.includes('document-ai') ||
           (providerConfig?.supported_types?.includes('general') && !provider.name.includes('deepseek'))
  }

  const getVisionSupportStatus = () => {
    if (isVisionSupported()) {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md border border-green-100">
          <Zap className="w-4 h-4" />
          <span>{lt('Supports Vision / Image Processing')}</span>
        </div>
      )
    } else {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-100">
          <AlertCircle className="w-4 h-4" />
          <span>{lt('Text Only (No Vision Support)')}</span>
        </div>
      )
    }
  }

  const handleTestConnection = async () => {
    if (!currentTenant) return
    if (!config.providerId || !config.apiKey) {
      toast.error(lt('Please select a provider and enter an API key'))
      return
    }

    try {
      setTesting(true)
      setTestStatus('idle')
      setTestMessage('')

      const provider = providers.find(p => p.id === config.providerId)
      const checkVision = isVisionSupported()
      
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          providerName: provider?.name,
          apiKey: config.apiKey,
          modelName: config.modelName,
          customConfig: config.customConfig,
          checkVision
        })
      })

      const result = await response.json()

      if (result.success) {
        setTestStatus('success')
        setTestMessage(result.message)
      } else {
        setTestStatus('error')
        setTestMessage(result.message)
      }
    } catch (error: any) {
      setTestStatus('error')
      setTestMessage(error.message || lt('An unexpected error occurred during testing'))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentTenant) return

    try {
      setLoading(true)
      
      let parsedConfig = {}
      try {
        parsedConfig = JSON.parse(config.customConfig)
      } catch (e) {
        toast.error(lt('Invalid JSON in Custom Config'))
        return
      }

      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          ai_provider_id: config.providerId,
          api_key_encrypted: config.apiKey,
          model_name: config.modelName,
          custom_config: parsedConfig,
          is_active: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to save AI configuration'))
      
      toast.success(lt('AI Configuration saved successfully'))
    } catch (error: any) {
      console.error('Error saving AI config:', error)
      toast.error(lt('Failed to save AI config: {message}', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }

  if (subLoading || !hasFeature) return null
  if (!currentTenant) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          {lt('AI Configuration')}
        </CardTitle>
        <CardDescription>{lt('Configure the AI provider for document processing.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="provider">{lt('AI Provider')}</Label>
            <select
              id="provider"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={config.providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
              required
            >
              <option value="">{lt('Select a provider...')}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">{lt('API Key / Credentials')}</Label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={lt('sk-...')}
            />
            <p className="text-xs text-muted-foreground">
              {lt('For Google Cloud, paste your Private Key here.')}
            </p>
          </div>

          <div className="grid gap-2 relative">
            <Label htmlFor="modelName">
              {lt('Model Name')}
              {isFetchingModels && <Loader2 className="w-3 h-3 inline ml-2 animate-spin" />}
            </Label>
            {availableModels.length > 0 && !isCustomModel ? (
              <div className="relative">
                <Input
                  id="modelName"
                  value={config.modelName}
                  onChange={(e) => {
                    setConfig({ ...config, modelName: e.target.value })
                    setShowModelDropdown(true)
                  }}
                  onFocus={() => setShowModelDropdown(true)}
                  onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
                  placeholder={lt('Select or type a model...')}
                  autoComplete="off"
                />
                {showModelDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-auto">
                    {availableModels
                      .filter(m => m.toLowerCase().includes(config.modelName.toLowerCase()))
                      .map((model) => (
                        <div
                          key={model}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            setConfig({ ...config, modelName: model })
                            setShowModelDropdown(false)
                          }}
                        >
                          {model}
                        </div>
                      ))}
                    {availableModels.filter(m => m.toLowerCase().includes(config.modelName.toLowerCase())).length === 0 && (
                       <div className="px-3 py-2 text-sm text-muted-foreground">
                         {lt('No matching models found. Custom model will be used.')}
                       </div>
                    )}
                    <div 
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground border-t text-blue-600"
                      onClick={() => {
                        setIsCustomModel(true)
                        setShowModelDropdown(false)
                      }}
                    >
                      {lt('Switch to Custom Input Mode...')}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="modelName"
                  value={config.modelName}
                  onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                  placeholder={lt('e.g. gpt-4-vision-preview, qwen-vl-max')}
                />
                {availableModels.length > 0 && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsCustomModel(false)
                      setConfig({ ...config, modelName: availableModels[0] || '' })
                    }}
                  >
                    {lt('Select from List')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="customConfig">{lt('Custom Configuration (JSON)')}</Label>
            <textarea
              id="customConfig"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              value={config.customConfig}
              onChange={(e) => setConfig({ ...config, customConfig: e.target.value })}
              placeholder='{ "projectId": "...", "location": "..." }'
            />
            <p className="text-xs text-muted-foreground">
              {lt('Additional settings required by the provider (e.g. Google Cloud Project ID).')}
            </p>
          </div>

          {config.providerId && (
            <div className="space-y-4 pt-2">
              {getVisionSupportStatus()}
              
              {testStatus !== 'idle' && (
                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md border ${
                  testStatus === 'success' 
                    ? 'text-green-600 bg-green-50 border-green-100' 
                    : 'text-red-600 bg-red-50 border-red-100'
                }`}>
                  {testStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span>{testMessage}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {lt('Save Configuration')}
            </Button>
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={testing || !config.providerId}
            >
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              {lt('Test Connection')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
