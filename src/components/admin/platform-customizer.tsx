'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2, Save, Bot, Sparkles, MessageSquare, Mic, Send, X, Minimize2, Maximize2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLiterals } from '@/hooks/use-literals'

interface PlatformConfig {
  chatbot: {
    welcome_message: string
    primary_color: string
    position: 'bottom-right' | 'bottom-left'
    icon: string
    title: string
    mic_animation: 'pulse' | 'bounce' | 'spin' | 'ping' | 'none'
    mic_speed: 'slow' | 'normal' | 'fast'
    voice_output?: {
      enabled?: boolean
      auto_speak?: boolean
      voice_uri?: string
      rate?: number
      pitch?: number
      volume?: number
    }
  }
  landing_page: {
    hero_badge?: string
    hero_title: string
    hero_title_highlight?: string
    hero_subtitle: string
    show_features: boolean
    hero_overlay_opacity?: number
    hero_rotation_seconds?: number
    hero_media?: Array<{ type: 'video' | 'image'; url: string; duration_seconds?: number }>
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
    mic_speed: "slow",
    voice_output: {
      enabled: false,
      auto_speak: true,
      voice_uri: '',
      rate: 1,
      pitch: 1,
      volume: 1,
    },
  },
  landing_page: {
    hero_badge: 'AI-powered multi-tenant accounting',
    hero_title: "AI-Powered Accounting for Modern Business",
    hero_title_highlight: 'AI',
    hero_subtitle: "Automate your bookkeeping, invoices, and financial reporting with the power of AI.",
    show_features: true,
    hero_overlay_opacity: 0.45,
    hero_rotation_seconds: 12,
    hero_media: []
  }
}

function ChatbotPreview({ config }: { config: PlatformConfig }) {
  const lt = useLiterals()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const speechQueueRef = useRef<string[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return

    const load = () => {
      try {
        const v = window.speechSynthesis.getVoices()
        setVoices(Array.isArray(v) ? v : [])
      } catch {
        setVoices([])
      }
    }

    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      if (window.speechSynthesis.onvoiceschanged === load) {
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }, [])

  const voiceCfg = config.chatbot.voice_output || {}
  const voiceEnabled = !!voiceCfg.enabled
  const voiceUri = typeof voiceCfg.voice_uri === 'string' ? voiceCfg.voice_uri : ''

  const resolveVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!('speechSynthesis' in window)) return null
    const available = voices
    if (!available || available.length === 0) return null
    if (voiceUri) {
      const exact = available.find((v) => v.voiceURI === voiceUri)
      if (exact) return exact
    }

    const targetLang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.toLowerCase() : ''
    const base = targetLang.split('-')[0]
    const candidates = targetLang
      ? (available.filter((v) => String(v.lang || '').toLowerCase().startsWith(targetLang))
          .concat(available.filter((v) => String(v.lang || '').toLowerCase().startsWith(base))))
      : available

    const uniq = Array.from(new Set(candidates.length ? candidates : available))
    const scoreVoice = (v: SpeechSynthesisVoice) => {
      let score = 0
      const name = String(v.name || '')
      const uri = String(v.voiceURI || '')
      const blob = (name + ' ' + uri)
      const lang = String(v.lang || '').toLowerCase()
      if ((v as any).default) score += 20
      if ((v as any).localService === false) score += 8
      if (targetLang && lang.startsWith(targetLang)) score += 12
      if (base && lang.startsWith(base)) score += 6
      if (/neural|natural|online/i.test(blob)) score += 18
      if (/microsoft|google|siri|apple/i.test(blob)) score += 10
      if (/espeak|robot|compact/i.test(blob)) score -= 20
      return score
    }

    return [...uniq].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null
  }, [voices, voiceUri])

  const stop = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return
    speechQueueRef.current = []
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  const splitTextForSpeech = useCallback((text: string, maxLen = 220) => {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
    if (!cleaned) return [] as string[]
    if (cleaned.length <= maxLen) return [cleaned]
    const parts: string[] = []
    let remaining = cleaned
    while (remaining.length > maxLen) {
      const slice = remaining.slice(0, maxLen + 1)
      const preferredBreak = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('; '),
        slice.lastIndexOf('；'),
        slice.lastIndexOf(': '),
        slice.lastIndexOf('：'),
        slice.lastIndexOf(', '),
        slice.lastIndexOf('，'),
        slice.lastIndexOf('、'),
        slice.lastIndexOf(' ')
      )
      const cut = preferredBreak > 40 ? preferredBreak + 1 : maxLen
      const chunk = remaining.slice(0, cut).trim()
      if (chunk) parts.push(chunk)
      remaining = remaining.slice(cut).trim()
    }
    if (remaining) parts.push(remaining)
    return parts
  }, [])

  const play = useCallback(() => {
    if (!voiceEnabled) return
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return

    const msg = lt(config.chatbot.welcome_message)
    if (!msg.trim()) return

    try {
      try {
        window.speechSynthesis.resume()
      } catch {
        // ignore
      }
      window.speechSynthesis.cancel()
      const v = resolveVoice()
      speechQueueRef.current = splitTextForSpeech(msg, 220)
      setIsSpeaking(true)

      const speakNext = () => {
        const next = speechQueueRef.current.shift()
        if (!next) {
          setIsSpeaking(false)
          return
        }

        const utter = new SpeechSynthesisUtterance(next)
        if (v) {
          utter.voice = v
          utter.lang = v.lang
        }
        utter.rate = typeof voiceCfg.rate === 'number' && Number.isFinite(voiceCfg.rate) ? voiceCfg.rate : 1
        utter.pitch = typeof voiceCfg.pitch === 'number' && Number.isFinite(voiceCfg.pitch) ? voiceCfg.pitch : 1
        utter.volume = typeof voiceCfg.volume === 'number' && Number.isFinite(voiceCfg.volume) ? voiceCfg.volume : 1
        utter.onend = () => speakNext()
        utter.onerror = () => setIsSpeaking(false)
        window.speechSynthesis.speak(utter)
      }

      speakNext()
    } catch {
      setIsSpeaking(false)
    }
  }, [splitTextForSpeech, voiceEnabled, config.chatbot.welcome_message, lt, resolveVoice, voiceCfg.pitch, voiceCfg.rate, voiceCfg.volume])

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
        {lt('Preview')}
      </div>

      {voiceEnabled ? (
        <div className="absolute top-4 right-4 z-20">
          <Button type="button" variant="outline" size="sm" onClick={isSpeaking ? stop : play}>
            {isSpeaking ? lt('Stop Voice') : lt('Play Voice')}
          </Button>
        </div>
      ) : null}
      
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
            <div className="text-sm font-bold text-white">{lt(config.chatbot.title)}</div>
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
              {lt(config.chatbot.welcome_message)}
            </div>
          </div>
          <div className="flex w-full justify-end">
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm text-white rounded-br-none", getBgColor(600))}>
              {lt('Show me the P&L report')}
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
              {lt('Ask me anything...')}
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
  const lt = useLiterals()

  return (
    <div className="relative h-[400px] w-full bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      <div className="w-full h-14 border-b flex items-center px-8 justify-between">
        <div className="font-bold text-xl">LedgerAI</div>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>{lt('Features')}</span>
          <span>{lt('Pricing')}</span>
          <span>{lt('About')}</span>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 bg-gradient-to-b from-white to-gray-50">
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {lt(config.landing_page.hero_title)}
          </h1>
          <p className="text-lg text-gray-600">
            {lt(config.landing_page.hero_subtitle)}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="h-10 px-6 rounded-md bg-black text-white flex items-center font-medium">{lt('Get Started')}</div>
          <div className="h-10 px-6 rounded-md border border-gray-200 bg-white flex items-center font-medium">{lt('Learn More')}</div>
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
  const lt = useLiterals()
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiBrief, setAiBrief] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [chatbotTranslating, setChatbotTranslating] = useState(false)
  const [heroUploadFile, setHeroUploadFile] = useState<File | null>(null)
  const [heroUploading, setHeroUploading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicePickerOpen, setVoicePickerOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return

    const load = () => {
      try {
        const v = window.speechSynthesis.getVoices()
        setAvailableVoices(Array.isArray(v) ? v : [])
      } catch {
        setAvailableVoices([])
      }
    }

    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      if (window.speechSynthesis.onvoiceschanged === load) {
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }, [])

  const currentVoiceValue = String(config.chatbot.voice_output?.voice_uri ? config.chatbot.voice_output.voice_uri : '__auto__')

  const currentVoiceLabel = useMemo(() => {
    if (currentVoiceValue === '__auto__') return lt('Auto (best available)')
    const match = availableVoices.find((v) => String(v.voiceURI) === currentVoiceValue)
    return match ? `${match.name} (${match.lang})` : lt('Selected voice')
  }, [availableVoices, currentVoiceValue, lt])

  const normalizeLanding = useCallback((lp: PlatformConfig['landing_page']) => {
    const overlay = typeof lp.hero_overlay_opacity === 'number' && Number.isFinite(lp.hero_overlay_opacity) ? lp.hero_overlay_opacity : 0.45
    const rotation = typeof lp.hero_rotation_seconds === 'number' && Number.isFinite(lp.hero_rotation_seconds) ? lp.hero_rotation_seconds : 12
    const hero_media = Array.isArray(lp.hero_media)
      ? lp.hero_media
          .map((m) => {
            const type: 'image' | 'video' = m?.type === 'image' ? 'image' : 'video'
            return {
              type,
              url: String((m as any)?.url ?? '').trim(),
              duration_seconds:
                typeof (m as any)?.duration_seconds === 'number' && Number.isFinite((m as any).duration_seconds)
                  ? (m as any).duration_seconds
                  : undefined,
            }
          })
          .filter((m) => m.url)
      : []

    return {
      ...lp,
      hero_overlay_opacity: Math.min(0.9, Math.max(0, overlay)),
      hero_rotation_seconds: Math.max(4, rotation),
      hero_media,
    }
  }, [])

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
            ...normalizeLanding({
              ...DEFAULT_CONFIG.landing_page,
              ...((loadedConfig && loadedConfig.landing_page) || {}),
            })
          }
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error(lt('Failed to load platform settings'))
    } finally {
      setLoading(false)
    }
  }, [supabase, lt, normalizeLanding])

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
          setting_value: {
            ...config,
            landing_page: normalizeLanding(config.landing_page),
          } as any,
          description: 'Configuration for platform appearance including chatbot and landing page',
          is_public: true
        }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success(lt('Settings saved successfully'))
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error(lt('Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadHeroMp4 = async () => {
    if (!heroUploadFile) {
      toast.error(lt('Please choose an MP4 file'))
      return
    }

    try {
      setHeroUploading(true)
      const form = new FormData()
      form.append('file', heroUploadFile)

      const res = await fetch('/api/admin/marketing/upload-hero-media', {
        method: 'POST',
        body: form,
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (json && typeof json.error === 'string' ? json.error : null) || lt('Upload failed')
        throw new Error(msg)
      }

      const url = String(json?.publicUrl ?? '').trim()
      if (!url) throw new Error(lt('Upload failed'))

      const next = [...(config.landing_page.hero_media || [])]
      next.push({ type: 'video', url })
      setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
      setHeroUploadFile(null)
      toast.success(lt('Uploaded and added to hero media'))
    } catch (e: any) {
      toast.error(String(e?.message || lt('Upload failed')))
    } finally {
      setHeroUploading(false)
    }
  }

  const handleTranslateChatbotCopy = async () => {
    const title = String(config.chatbot.title ?? '').trim()
    const welcome = String(config.chatbot.welcome_message ?? '').trim()

    const items = [
      ...(title ? [{ id: 'chatbot.title', text: title }] : []),
      ...(welcome ? [{ id: 'chatbot.welcome_message', text: welcome }] : []),
    ]

    if (items.length === 0) {
      toast.error(lt('Please enter a title or welcome message first.'))
      return
    }

    setChatbotTranslating(true)
    try {
      // Use active platform languages as the target set (excluding English).
      const { data: langRows } = await (supabase as any)
        .from('system_languages')
        .select('code')
        .eq('is_active', true)

      const targetLocales = Array.from(
        new Set(
          (Array.isArray(langRows) ? langRows : [])
            .map((r: any) => String(r?.code ?? '').trim())
            .filter((c: string) => !!c)
            .map((c: string) => (c === 'zh-TW' ? 'zh-HK' : c))
            .filter((c: string) => c !== 'en')
        )
      )

      const fallbackTargets = ['zh-CN', 'zh-HK']

      const res = await fetch('/api/admin/chatbot/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLocale: 'en',
          targetLocales: targetLocales.length > 0 ? targetLocales : fallbackTargets,
          items,
          persist: true,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (json && typeof json.error === 'string' ? json.error : null) || lt('AI translation failed')
        throw new Error(msg)
      }

      toast.success(lt('Chatbot translations generated and saved.'))
    } catch (e: any) {
      toast.error(String(e?.message || lt('AI translation failed')))
    } finally {
      setChatbotTranslating(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{lt('Platform Customization')}</h2>
          <p className="text-muted-foreground">{lt('Manage the appearance of the landing page and AI chatbot.')}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {lt('Save Changes')}
        </Button>
      </div>

      <Tabs defaultValue="chatbot" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chatbot">{lt('Chatbot')}</TabsTrigger>
          <TabsTrigger value="landing">{lt('Landing Page')}</TabsTrigger>
        </TabsList>

        <TabsContent value="chatbot">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{lt('Chatbot Appearance')}</CardTitle>
                <CardDescription>{lt('Customize how the AI Agent appears to your users.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Widget Title')}</Label>
                    <Input 
                      value={config.chatbot.title} 
                      onChange={(e) => setConfig({...config, chatbot: {...config.chatbot, title: e.target.value}})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Primary Color')}</Label>
                    <Select 
                      value={config.chatbot.primary_color} 
                      onValueChange={(val) => setConfig({...config, chatbot: {...config.chatbot, primary_color: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blue">{lt('Blue')}</SelectItem>
                        <SelectItem value="indigo">{lt('Indigo')}</SelectItem>
                        <SelectItem value="violet">{lt('Violet')}</SelectItem>
                        <SelectItem value="green">{lt('Green')}</SelectItem>
                        <SelectItem value="slate">{lt('Slate')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{lt('Welcome Message')}</Label>
                  <Textarea 
                    value={config.chatbot.welcome_message} 
                    onChange={(e) => setConfig({...config, chatbot: {...config.chatbot, welcome_message: e.target.value}})}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTranslateChatbotCopy}
                      disabled={chatbotTranslating}
                    >
                      {chatbotTranslating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {lt('Translate with AI')}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Position')}</Label>
                    <Select 
                      value={config.chatbot.position} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, position: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">{lt('Bottom Right')}</SelectItem>
                        <SelectItem value="bottom-left">{lt('Bottom Left')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Icon Style')}</Label>
                    <Select 
                      value={config.chatbot.icon} 
                      onValueChange={(val) => setConfig({...config, chatbot: {...config.chatbot, icon: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bot">{lt('Robot')}</SelectItem>
                        <SelectItem value="sparkles">{lt('Sparkles')}</SelectItem>
                        <SelectItem value="message">{lt('Message Bubble')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Mic Animation')}</Label>
                    <Select 
                      value={config.chatbot.mic_animation || 'pulse'} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, mic_animation: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pulse">{lt('Pulse')}</SelectItem>
                        <SelectItem value="bounce">{lt('Bounce')}</SelectItem>
                        <SelectItem value="spin">{lt('Spin')}</SelectItem>
                        <SelectItem value="ping">{lt('Ping')}</SelectItem>
                        <SelectItem value="none">{lt('None')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Animation Speed')}</Label>
                    <Select 
                      value={config.chatbot.mic_speed || 'slow'} 
                      onValueChange={(val: any) => setConfig({...config, chatbot: {...config.chatbot, mic_speed: val}})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">{lt('Slow')}</SelectItem>
                        <SelectItem value="normal">{lt('Normal')}</SelectItem>
                        <SelectItem value="fast">{lt('Fast')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-4">
                  <div className="text-sm font-medium text-muted-foreground">{lt('Voice Output')}</div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">{lt('Enable Voice Output')}</Label>
                        <div className="text-xs text-muted-foreground">{lt('Speak assistant replies using browser text-to-speech.')}</div>
                      </div>
                      <Switch
                        checked={!!config.chatbot.voice_output?.enabled}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            chatbot: {
                              ...config.chatbot,
                              voice_output: {
                                ...config.chatbot.voice_output,
                                enabled: checked,
                                auto_speak:
                                  typeof config.chatbot.voice_output?.auto_speak === 'boolean'
                                    ? config.chatbot.voice_output?.auto_speak
                                    : true,
                              },
                            },
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">{lt('Auto Speak')}</Label>
                        <div className="text-xs text-muted-foreground">{lt('Automatically read assistant messages aloud.')}</div>
                      </div>
                      <Switch
                        checked={!!config.chatbot.voice_output?.auto_speak}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            chatbot: {
                              ...config.chatbot,
                              voice_output: {
                                ...config.chatbot.voice_output,
                                auto_speak: checked,
                              },
                            },
                          })
                        }
                        disabled={!config.chatbot.voice_output?.enabled}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{lt('Voice')}</Label>
                        <Popover open={voicePickerOpen} onOpenChange={setVoicePickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={voicePickerOpen}
                              className="w-full justify-between"
                              title={currentVoiceLabel}
                              disabled={!config.chatbot.voice_output?.enabled}
                            >
                              <span className="truncate">{currentVoiceLabel}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                            <Command>
                              <CommandInput placeholder={lt('Search voice...')} />
                              <CommandList className="max-h-[320px]">
                                <CommandEmpty>{lt('No voice found.')}</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="__auto__"
                                    onSelect={() => {
                                      setConfig({
                                        ...config,
                                        chatbot: {
                                          ...config.chatbot,
                                          voice_output: {
                                            ...config.chatbot.voice_output,
                                            voice_uri: '',
                                          },
                                        },
                                      })
                                      setVoicePickerOpen(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        currentVoiceValue === '__auto__' ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    {lt('Auto (best available)')}
                                  </CommandItem>

                                  {availableVoices.map((v) => {
                                    const value = String(v.voiceURI)
                                    const label = `${v.name} (${v.lang})`
                                    return (
                                      <CommandItem
                                        key={value}
                                        value={`${label} ${value}`}
                                        title={label}
                                        onSelect={() => {
                                          setConfig({
                                            ...config,
                                            chatbot: {
                                              ...config.chatbot,
                                              voice_output: {
                                                ...config.chatbot.voice_output,
                                                voice_uri: value,
                                              },
                                            },
                                          })
                                          setVoicePickerOpen(false)
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            currentVoiceValue === value ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        <span className="truncate" title={label}>
                                          {label}
                                        </span>
                                      </CommandItem>
                                    )
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>{lt('Speech Rate')}</Label>
                      <Select
                        value={String(config.chatbot.voice_output?.rate ?? 1)}
                        onValueChange={(val) =>
                          setConfig({
                            ...config,
                            chatbot: {
                              ...config.chatbot,
                              voice_output: {
                                ...config.chatbot.voice_output,
                                rate: Number(val),
                              },
                            },
                          })
                        }
                        disabled={!config.chatbot.voice_output?.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.9">{lt('Slow')}</SelectItem>
                          <SelectItem value="1">{lt('Normal')}</SelectItem>
                          <SelectItem value="1.1">{lt('Fast')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{lt('Pitch')}</Label>
                      <Select
                        value={String(config.chatbot.voice_output?.pitch ?? 1)}
                        onValueChange={(val) =>
                          setConfig({
                            ...config,
                            chatbot: {
                              ...config.chatbot,
                              voice_output: {
                                ...config.chatbot.voice_output,
                                pitch: Number(val),
                              },
                            },
                          })
                        }
                        disabled={!config.chatbot.voice_output?.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.9">{lt('Low')}</SelectItem>
                          <SelectItem value="1">{lt('Normal')}</SelectItem>
                          <SelectItem value="1.1">{lt('High')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{lt('Volume')}</Label>
                      <Select
                        value={String(config.chatbot.voice_output?.volume ?? 1)}
                        onValueChange={(val) =>
                          setConfig({
                            ...config,
                            chatbot: {
                              ...config.chatbot,
                              voice_output: {
                                ...config.chatbot.voice_output,
                                volume: Number(val),
                              },
                            },
                          })
                        }
                        disabled={!config.chatbot.voice_output?.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0.7">{lt('Quiet')}</SelectItem>
                          <SelectItem value="1">{lt('Normal')}</SelectItem>
                          <SelectItem value="1">{lt('Loud')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">{lt('Live Preview')}</div>
              <ChatbotPreview config={config} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="landing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{lt('Landing Page Content')}</CardTitle>
                <CardDescription>{lt('Update the main text on your public homepage.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{lt('Hero Badge')}</Label>
                  <Input
                    value={config.landing_page.hero_badge || ''}
                    onChange={(e) => setConfig({ ...config, landing_page: { ...config.landing_page, hero_badge: e.target.value } })}
                    placeholder={lt('Short tagline above the hero title')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{lt('Hero Title')}</Label>
                  <Input 
                    value={config.landing_page.hero_title} 
                    onChange={(e) => setConfig({...config, landing_page: {...config.landing_page, hero_title: e.target.value}})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{lt('Title Highlight (optional)')}</Label>
                  <Input
                    value={config.landing_page.hero_title_highlight || ''}
                    onChange={(e) => setConfig({ ...config, landing_page: { ...config.landing_page, hero_title_highlight: e.target.value } })}
                    placeholder={lt('Substring to highlight, e.g. AI')}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{lt('Hero Subtitle')}</Label>
                  <Textarea 
                    value={config.landing_page.hero_subtitle} 
                    onChange={(e) => setConfig({...config, landing_page: {...config.landing_page, hero_subtitle: e.target.value}})}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Overlay Opacity (0 - 0.9)')}</Label>
                    <Input
                      type="number"
                      step="0.05"
                      value={String(config.landing_page.hero_overlay_opacity ?? 0.45)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          landing_page: {
                            ...config.landing_page,
                            hero_overlay_opacity: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Rotation Seconds')}</Label>
                    <Input
                      type="number"
                      step="1"
                      value={String(config.landing_page.hero_rotation_seconds ?? 12)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          landing_page: {
                            ...config.landing_page,
                            hero_rotation_seconds: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{lt('Background Media (looping)')}</Label>
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2 items-center rounded-md border p-3 bg-muted/20">
                      <Input
                        type="file"
                        accept="video/mp4"
                        onChange={(e) => setHeroUploadFile(e.target.files?.[0] || null)}
                      />
                      <Button
                        onClick={handleUploadHeroMp4}
                        disabled={heroUploading || !heroUploadFile}
                      >
                        {heroUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {lt('Upload MP4')}
                      </Button>
                    </div>

                    {(config.landing_page.hero_media || []).map((m, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-[140px_1fr_120px] gap-2 items-center">
                        <Select
                          value={m.type}
                          onValueChange={(val: any) => {
                            const next = [...(config.landing_page.hero_media || [])]
                            next[idx] = { ...next[idx], type: val }
                            setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="video">{lt('Video (mp4)')}</SelectItem>
                            <SelectItem value="image">{lt('Image')}</SelectItem>
                          </SelectContent>
                        </Select>

                        <Input
                          value={m.url}
                          onChange={(e) => {
                            const next = [...(config.landing_page.hero_media || [])]
                            next[idx] = { ...next[idx], url: e.target.value }
                            setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
                          }}
                          placeholder={lt('https://...')}
                        />

                        <Button
                          variant="outline"
                          onClick={() => {
                            const next = [...(config.landing_page.hero_media || [])]
                            next.splice(idx, 1)
                            setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
                          }}
                        >
                          {lt('Remove')}
                        </Button>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const next = [...(config.landing_page.hero_media || [])]
                          next.push({ type: 'video', url: '' })
                          setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
                        }}
                      >
                        {lt('Add Video')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const next = [...(config.landing_page.hero_media || [])]
                          next.push({ type: 'image', url: '' })
                          setConfig({ ...config, landing_page: { ...config.landing_page, hero_media: next } })
                        }}
                      >
                        {lt('Add Image')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lt('Tip: Provide publicly accessible URLs (CDN). Videos loop automatically; multiple items rotate in order.')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-medium">{lt('AI Assist')}</div>
                      <div className="text-sm text-muted-foreground">{lt('Generate a hero title/subtitle from a short brief.')}</div>
                    </div>
                    <Button
                      variant="outline"
                      disabled={aiGenerating}
                      onClick={async () => {
                        try {
                          setAiGenerating(true)
                          const res = await fetch('/api/admin/marketing/ai-suggest', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: aiBrief,
                              current: config.landing_page,
                            }),
                          })
                          const json = await res.json()
                          if (!res.ok) throw new Error(json?.error || 'AI request failed')
                          const s = json?.suggestion || {}
                          setConfig({
                            ...config,
                            landing_page: {
                              ...config.landing_page,
                              hero_badge: typeof s.hero_badge === 'string' ? s.hero_badge : config.landing_page.hero_badge,
                              hero_title: typeof s.hero_title === 'string' ? s.hero_title : config.landing_page.hero_title,
                              hero_title_highlight:
                                typeof s.hero_title_highlight === 'string'
                                  ? s.hero_title_highlight
                                  : config.landing_page.hero_title_highlight,
                              hero_subtitle:
                                typeof s.hero_subtitle === 'string' ? s.hero_subtitle : config.landing_page.hero_subtitle,
                            },
                          })
                          toast.success(lt('AI suggestion applied (review and save).'))
                        } catch (e: any) {
                          toast.error(lt(e?.message || 'Failed to generate copy'))
                        } finally {
                          setAiGenerating(false)
                        }
                      }}
                    >
                      {aiGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {lt('Generate')}
                    </Button>
                  </div>
                  <Textarea
                    value={aiBrief}
                    onChange={(e) => setAiBrief(e.target.value)}
                    rows={3}
                    placeholder={lt('Example: Target SMEs in Hong Kong. Emphasize multi-tenant, automation, compliance, and real-time reporting.')}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <Switch 
                    id="show-features"
                    checked={config.landing_page.show_features}
                    onCheckedChange={(checked) => setConfig({...config, landing_page: {...config.landing_page, show_features: checked}})}
                  />
                  <Label htmlFor="show-features">{lt('Show Features Section')}</Label>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">{lt('Live Preview')}</div>
              <LandingPagePreview config={config} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
