'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Save, Bot, Sparkles, MessageSquare, Mic, Send, X, Minimize2, Maximize2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlatformConfig {
  chatbot: {
    welcome_message: string
    primary_color: string
    position: 'bottom-right' | 'bottom-left'
    icon: string
    title: string
    mic_animation: 'pulse' | 'bounce' | 'spin' | 'ping' | 'none'
    mic_speed: 'slow' | 'normal' | 'fast'
  }
  landing_page: {
    hero_title: string
    hero_subtitle: string
    show_features: boolean
  }
}

const DEFAULT_CONFIG: PlatformConfig = {
  chatbot: {
    welcome_message: "Hi! I'm your LedgerAI Assistant. How can I help you today?",
    primary_color: "blue",
    position: "bottom-right",
    icon: "bot",
    title: "LedgerAI Copilot",
    mic_animation: "pulse",
    mic_speed: "slow"
  },
  landing_page: {
    hero_title: "AI-Powered Accounting for Modern Business",
    hero_subtitle: "Automate your bookkeeping, invoices, and financial reporting with the power of AI.",
    show_features: true
  }
}

function ChatbotPreview({ config }: { config: PlatformConfig }) {
  const getBgColor = (shade = 600) => {
    const color = config.chatbot.primary_color || 'blue'
    const map: any = {
      blue: `bg-blue-${shade}`,
      indigo: `bg-indigo-${shade}`,
      violet: `bg-violet-${shade}`,
      green: `bg-green-${shade}`,
      slate: `bg-slate-${shade}`,
    }
    return map[color] || `bg-blue-${shade}`
  }

  const getGradient = () => {
    const color = config.chatbot.primary_color || 'blue'
    const map: any = {
      blue: 'from-blue-600 to-indigo-600',
      indigo: 'from-indigo-600 to-purple-600',
      violet: 'from-violet-600 to-fuchsia-600',
      green: 'from-green-600 to-emerald-600',
      slate: 'from-slate-600 to-gray-600',
    }
    return map[color] || 'from-blue-600 to-indigo-600'
  }

  const getMicAnimationClass = () => {
    const animation = config.chatbot.mic_animation || 'pulse'
    const map: any = {
      pulse: 'animate-pulse',
      bounce: 'animate-bounce',
      spin: 'animate-spin',
      ping: 'animate-ping',
      none: '',
    }
    return map[animation] || 'animate-pulse'
  }

  const getAnimationDuration = () => {
    const speed = config.chatbot.mic_speed || 'slow'
    const map: any = {
      slow: '3s',
      normal: '1s',
      fast: '0.5s',
    }
    return map[speed] || '3s'
  }

  const Icon = config.chatbot.icon === 'sparkles' ? Sparkles : config.chatbot.icon === 'message' ? MessageSquare : Bot

  return (
    <div className="relative h-[600px] w-full bg-gray-100 rounded-xl border border-gray-200 overflow-hidden flex items-end justify-end p-6">
      <div className="absolute inset-0 flex items-center justify-center text-gray-300 font-bold text-4xl select-none pointer-events-none">
        PREVIEW
      </div>
      
      {/* Mock Widget */}
      <div className={cn(
        "relative shadow-2xl z-10 flex flex-col border-blue-100 bg-white rounded-xl overflow-hidden transition-all duration-300",
        "w-[340px] h-[500px]",
        config.chatbot.position === 'bottom-left' ? 'mr-auto' : 'ml-auto'
      )}>
        {/* Header */}
        <div className={cn("p-3 border-b flex flex-row items-center justify-between space-y-0 bg-gradient-to-r", getGradient())}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-sm font-bold text-white">{config.chatbot.title}</div>
          </div>
          <div className="flex items-center gap-1 text-white">
            <div className="h-6 w-6 flex items-center justify-center"><Trash2 className="h-3 w-3" /></div>
            <div className="h-6 w-6 flex items-center justify-center"><Minimize2 className="h-3 w-3" /></div>
            <div className="h-6 w-6 flex items-center justify-center"><X className="h-3 w-3" /></div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 bg-gray-50 overflow-y-auto space-y-4">
          <div className="flex w-full justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm bg-white border border-gray-100 text-gray-800 rounded-bl-none">
              {config.chatbot.welcome_message}
            </div>
          </div>
          <div className="flex w-full justify-end">
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm text-white rounded-br-none", getBgColor(600))}>
              Show me the P&L report
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-white">
          <div className="flex w-full items-center gap-2">
            <div className={cn(
              "h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-red-500 text-white shadow-lg ring-4 ring-red-200 scale-110",
              getMicAnimationClass()
            )} style={{ animationDuration: getAnimationDuration() }}>
              <Mic className="h-4 w-4" />
            </div>
            <div className="flex-1 h-9 bg-gray-50 border border-gray-200 rounded-md px-3 flex items-center text-sm text-gray-400">
              Ask me anything...
            </div>
            <div className={cn("h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-white", getBgColor(600))}>
              <Send className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LandingPagePreview({ config }: { config: PlatformConfig }) {
  return (
    <div className="relative h-[400px] w-full bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      <div className="w-full h-14 border-b flex items-center px-8 justify-between">
        <div className="font-bold text-xl">LedgerAI</div>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>Features</span>
          <span>Pricing</span>
          <span>About</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 bg-gradient-to-b from-white to-gray-50">
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {config.landing_page.hero_title}
          </h1>
          <p className="text-lg text-gray-600">
            {config.landing_page.hero_subtitle}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="h-10 px-6 rounded-md bg-black text-white flex items-center font-medium">Get Started</div>
          <div className="h-10 px-6 rounded-md border border-gray-200 bg-white flex items-center font-medium">Learn More</div>
        </div>
      </div>

      {config.landing_page.show_features && (
        <div className="h-24 border-t bg-gray-50 flex items-center justify-center gap-12 text-gray-400">
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
      )}
    </div>
  )
}

export function PlatformCustomizer() {
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'platform_appearance')
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        const raw = (data as unknown as { setting_value: unknown }).setting_value
        const loadedConfig = typeof raw === 'string' ? (() => {
          try { return JSON.parse(raw) as PlatformConfig } catch { return undefined }
        })() : (raw as PlatformConfig | undefined)
        // Deep merge with default config to ensure new fields are present
        setConfig({
          ...DEFAULT_CONFIG,
          ...(loadedConfig || {}),
          chatbot: {
            ...DEFAULT_CONFIG.chatbot,
            ...((loadedConfig && loadedConfig.chatbot) || {})
          },
          landing_page: {
            ...DEFAULT_CONFIG.landing_page,
            ...((loadedConfig && loadedConfig.landing_page) || {})
          }
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load platform settings')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    try {
      setSaving(true)
      const { error } = await (supabase
        .from('system_settings') as any)
        .upsert({
          setting_key: 'platform_appearance',
          setting_value: config as any,
          description: 'Configuration for platform appearance including chatbot and landing page',
          is_public: true
        }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Platform Customization</h2>
          <p className="text-muted-foreground">Manage the appearance of the landing page and AI chatbot.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="chatbot" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chatbot">Chatbot</TabsTrigger>
          <TabsTrigger value="landing">Landing Page</TabsTrigger>
        </TabsList>

        <TabsContent value="chatbot">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Chatbot Appearance</CardTitle>
                <CardDescription>Customize how the AI Agent appears to your users.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Widget Title</Label>
                    <Input 
                      value={config.chatbot.title} 
                      onChange={(e) => setConfig({...config, chatbot: {...config.chatbot, title: e.target.value}})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Primary Color</Label>
                    <Select 
                      value={config.chatbot.primary_color} 
                      onValueChange={(val) => setConfig({...config, chatbot: {...config.chatbot, primary_color: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blue">Blue</SelectItem>
                        <SelectItem value="indigo">Indigo</SelectItem>
                        <SelectItem value="violet">Violet</SelectItem>
                        <SelectItem value="green">Green</SelectItem>
                        <SelectItem value="slate">Slate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Welcome Message</Label>
                  <Textarea 
                    value={config.chatbot.welcome_message} 
                    onChange={(e) => setConfig({...config, chatbot: {...config.chatbot, welcome_message: e.target.value}})}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Select 
                      value={config.chatbot.position} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, position: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Icon Style</Label>
                    <Select 
                      value={config.chatbot.icon} 
                      onValueChange={(val) => setConfig({...config, chatbot: {...config.chatbot, icon: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bot">Robot</SelectItem>
                        <SelectItem value="sparkles">Sparkles</SelectItem>
                        <SelectItem value="message">Message Bubble</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mic Animation</Label>
                    <Select 
                      value={config.chatbot.mic_animation || 'pulse'} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, mic_animation: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pulse">Pulse</SelectItem>
                        <SelectItem value="bounce">Bounce</SelectItem>
                        <SelectItem value="spin">Spin</SelectItem>
                        <SelectItem value="ping">Ping</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Animation Speed</Label>
                    <Select 
                      value={config.chatbot.mic_speed || 'slow'} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, mic_speed: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Slow</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">Live Preview</div>
              <ChatbotPreview config={config} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="landing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Landing Page Content</CardTitle>
                <CardDescription>Update the main text on your public homepage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Hero Title</Label>
                  <Input 
                    value={config.landing_page.hero_title} 
                    onChange={(e) => setConfig({...config, landing_page: {...config.landing_page, hero_title: e.target.value}})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Hero Subtitle</Label>
                  <Textarea 
                    value={config.landing_page.hero_subtitle} 
                    onChange={(e) => setConfig({...config, landing_page: {...config.landing_page, hero_subtitle: e.target.value}})}
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <Switch 
                    id="show-features"
                    checked={config.landing_page.show_features}
                    onCheckedChange={(checked) => setConfig({...config, landing_page: {...config.landing_page, show_features: checked}})}
                  />
                  <Label htmlFor="show-features">Show Features Section</Label>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">Live Preview</div>
              <LandingPagePreview config={config} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
