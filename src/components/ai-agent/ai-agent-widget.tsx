'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Bot,
  Send,
  Mic,
  X,
  Minimize2,
  Maximize2,
  Sparkles,
  Trash2,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
  Reply,
  MoveDiagonal2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { useLiterals } from '@/hooks/use-literals'
import { useLocale } from 'next-intl'

function stripMarkdownForSpeech(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitTextForSpeech(text: string, maxLen = 220): string[] {
  const cleaned = stripMarkdownForSpeech(text)
  if (!cleaned) return []
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
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
  actions?: Array<{ type: 'NAVIGATE'; path: string; label?: string }>
  suggestedPrompts?: string[]
}

interface AiAgentWidgetProps {
  tenantId?: string
  userId?: string
}

export function AiAgentWidget({ tenantId, userId }: AiAgentWidgetProps) {
  const lt = useLiterals()
  const locale = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: lt(
        "Hi! I'm your LedgerAI Assistant. I can help you navigate, create records, or analyze your data. Try saying 'Show me the P&L report' or 'Create a new invoice'."
      ),
      timestamp: new Date(),
      suggestedPrompts: [
        lt('Show me the P&L report'),
        lt('Create a new invoice'),
        lt('Take me to Banking'),
        lt('How do I import documents?'),
      ],
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const storageKey = `ledgerai_chat_${tenantId || 'default'}_${userId || 'guest'}`
  const supabase = useMemo(() => createClient(), [])
  const [config, setConfig] = useState<any>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const lastSpokenMessageIdRef = useRef<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const speechQueueRef = useRef<string[]>([])
  const speakingForMessageIdRef = useRef<string | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const sizeStorageKey = `ledgerai_chat_size_${tenantId || 'default'}_${userId || 'guest'}`
  const muteStorageKey = `ledgerai_chat_mute_${tenantId || 'default'}_${userId || 'guest'}`
  const [desktopSize, setDesktopSize] = useState<{ width: number; height: number } | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isResizableViewport, setIsResizableViewport] = useState(false)
  const [isVoiceMuted, setIsVoiceMuted] = useState(false)
  const [replyTo, setReplyTo] = useState<Pick<Message, 'id' | 'role' | 'content'> | null>(null)
  const resizeStateRef = useRef<{
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    lastWidth: number
    lastHeight: number
  } | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const resizePendingRef = useRef<{ width: number; height: number } | null>(null)

  const speechLang = useMemo(() => {
    const raw = typeof locale === 'string' ? locale.trim() : ''
    if (!raw) return 'en-US'
    if (raw === 'en') return 'en-US'
    return raw
  }, [locale])

  // On small screens we always want the full-screen chat UI.
  // If the user previously minimized on desktop, reset minimization on mobile.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handle = () => {
      setIsDesktop(window.innerWidth >= 768)
      setIsResizableViewport(window.innerWidth >= 640)
      if (window.innerWidth < 640) setIsMinimized(false)
    }

    handle()
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  // Load platform config
  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await (supabase
        .from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'platform_appearance')
        .single()
      
      if (data) {
        setConfig(data.setting_value)
      }
    }
    loadConfig()
  }, [supabase])

  // Restore desktop/tablet size from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(sizeStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const width = typeof parsed?.width === 'number' ? parsed.width : NaN
      const height = typeof parsed?.height === 'number' ? parsed.height : NaN
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      if (width < 320 || height < 360) return
      setDesktopSize({ width, height })
    } catch {
      // ignore
    }
  }, [sizeStorageKey])

  const restoreDefaultSize = useCallback(() => {
    if (!isResizableViewport) return
    if (typeof window === 'undefined') return
    setDesktopSize({ width: 380, height: 600 })
    try {
      localStorage.removeItem(sizeStorageKey)
    } catch {
      // ignore
    }
  }, [isResizableViewport, sizeStorageKey])

  const persistSize = useCallback(
    (width: number, height: number) => {
      if (!isResizableViewport) return
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      if (width < 320 || height < 360) return
      try {
        localStorage.setItem(sizeStorageKey, JSON.stringify({ width, height }))
      } catch {
        // ignore
      }
    },
    [isResizableViewport, sizeStorageKey]
  )

  const beginResize = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizableViewport) return
      if (isMinimized) return
      const el = cardRef.current
      if (!el) return

      // Only pointer/mouse on desktop/tablet
      if (typeof window !== 'undefined' && window.innerWidth < 640) return

      const rect = el.getBoundingClientRect()
      const startWidth = rect.width
      const startHeight = rect.height

      // Improve perceived smoothness during drag
      el.style.willChange = 'width, height'

      resizeStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startWidth,
        startHeight,
        lastWidth: startWidth,
        lastHeight: startHeight,
      }

      const target = e.currentTarget as HTMLElement
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      const onMove = (ev: PointerEvent) => {
        const st = resizeStateRef.current
        if (!st) return
        const dx = ev.clientX - st.startX
        const dy = ev.clientY - st.startY

        // Dragging handle from top-left:
        // moving right/down makes the box smaller, left/up makes it larger.
        let nextWidth = st.startWidth - dx
        let nextHeight = st.startHeight - dy

        const minW = 320
        const minH = 360
        const maxW = Math.max(minW, (typeof window !== 'undefined' ? window.innerWidth : st.startWidth) - 48)
        const maxH = Math.max(minH, (typeof window !== 'undefined' ? window.innerHeight : st.startHeight) - 48)

        nextWidth = Math.max(minW, Math.min(maxW, nextWidth))
        nextHeight = Math.max(minH, Math.min(maxH, nextHeight))

        st.lastWidth = nextWidth
        st.lastHeight = nextHeight

        // Throttle DOM updates via rAF for smoother resizing
        resizePendingRef.current = { width: nextWidth, height: nextHeight }
        if (resizeRafRef.current == null) {
          resizeRafRef.current = window.requestAnimationFrame(() => {
            resizeRafRef.current = null
            const pending = resizePendingRef.current
            if (!pending) return
            const node = cardRef.current
            if (!node) return
            node.style.width = `${Math.round(pending.width)}px`
            node.style.height = `${Math.round(pending.height)}px`
          })
        }
      }

      const onUp = (ev: PointerEvent) => {
        const st = resizeStateRef.current
        resizeStateRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)

        if (resizeRafRef.current != null) {
          window.cancelAnimationFrame(resizeRafRef.current)
          resizeRafRef.current = null
        }
        resizePendingRef.current = null

        const node = cardRef.current
        if (node) node.style.willChange = ''

        if (st) {
          const finalW = Math.round(st.lastWidth)
          const finalH = Math.round(st.lastHeight)
          setDesktopSize({ width: finalW, height: finalH })
          persistSize(finalW, finalH)
        }

        try {
          ;(target as any).releasePointerCapture?.(e.pointerId)
        } catch {
          // ignore
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [isMinimized, isResizableViewport, persistSize]
  )

  // Load available TTS voices (browser-provided)
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

  // Load chat history from local storage
  useEffect(() => {
    const savedMessages = localStorage.getItem(storageKey)
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages)
        // Revive dates
        const revived = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        setMessages(revived)
      } catch (e) {
        console.error('Failed to parse chat history', e)
      }
    } else if (config?.chatbot?.welcome_message) {
      // If no history, set welcome message from config
      setMessages([{
        id: '1',
        role: 'assistant',
        content: lt(config.chatbot.welcome_message),
        timestamp: new Date(),
        suggestedPrompts: [
          lt('Show me the P&L report'),
          lt('Create a new invoice'),
          lt('Take me to Banking'),
          lt('How do I import documents?'),
        ],
      }])
    }
  }, [storageKey, config, lt])

  // Save chat history to local storage
  useEffect(() => {
    if (messages.length > 1) { // Don't save if only initial message
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

  // Load user voice mute preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(muteStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      setIsVoiceMuted(!!parsed?.muted)
    } catch {
      // ignore
    }
  }, [muteStorageKey])

  // Auto-scroll to bottom
  useEffect(() => {
    console.log('AiAgentWidget mounted')
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, isOpen])

  const voiceOutput = config?.chatbot?.voice_output || {}
  const voiceEnabled = !!voiceOutput.enabled
  const voiceAutoSpeak = typeof voiceOutput.auto_speak === 'boolean' ? voiceOutput.auto_speak : true
  const voiceUri = typeof voiceOutput.voice_uri === 'string' ? voiceOutput.voice_uri : ''
  const voiceRate = typeof voiceOutput.rate === 'number' && Number.isFinite(voiceOutput.rate) ? voiceOutput.rate : 1
  const voicePitch = typeof voiceOutput.pitch === 'number' && Number.isFinite(voiceOutput.pitch) ? voiceOutput.pitch : 1
  const voiceVolume = typeof voiceOutput.volume === 'number' && Number.isFinite(voiceOutput.volume) ? voiceOutput.volume : 1

  const resolveVoice = useMemo(() => {
    const available = voices
    if (!available || available.length === 0) return null
    if (voiceUri) {
      const exact = available.find((v) => v.voiceURI === voiceUri)
      if (exact) return exact
    }

    const targetLower = String(speechLang || '').toLowerCase()
    const base = targetLower.split('-')[0]
    const exactMatches = available.filter((v) => typeof v.lang === 'string' && v.lang.toLowerCase().startsWith(targetLower))
    const baseMatches = available.filter((v) => typeof v.lang === 'string' && v.lang.toLowerCase().startsWith(base))
    const candidates = (exactMatches.length > 0 ? exactMatches : baseMatches).length > 0
      ? (exactMatches.length > 0 ? exactMatches : baseMatches)
      : available

    const scoreVoice = (v: SpeechSynthesisVoice) => {
      let score = 0
      const name = String(v.name || '')
      const uri = String(v.voiceURI || '')
      const lang = String(v.lang || '').toLowerCase()

      if ((v as any).default) score += 20
      if ((v as any).localService === false) score += 8
      if (targetLower && lang.startsWith(targetLower)) score += 12
      if (base && lang.startsWith(base)) score += 6

      // Prefer higher-quality voices on common engines
      if (/neural|natural|online/i.test(name + ' ' + uri)) score += 18
      if (/microsoft|google|siri|apple/i.test(name + ' ' + uri)) score += 10

      // Penalize known low-quality voices
      if (/espeak|robot|compact/i.test(name + ' ' + uri)) score -= 20
      return score
    }

    const sorted = [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a))
    return sorted[0] || null
  }, [voices, voiceUri, speechLang])

  const canUseTts = useMemo(() => {
    if (!voiceEnabled) return false
    if (typeof window === 'undefined') return false
    return 'speechSynthesis' in window
  }, [voiceEnabled])

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return
    speechQueueRef.current = []
    speakingForMessageIdRef.current = null
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    setIsSpeaking(false)
    setSpeakingMessageId(null)
  }, [])

  const toggleVoiceMute = useCallback(() => {
    setIsVoiceMuted((prev) => {
      const next = !prev
      try {
        localStorage.setItem(muteStorageKey, JSON.stringify({ muted: next }))
      } catch {
        // ignore
      }
      if (next) stopSpeaking()
      return next
    })
  }, [muteStorageKey, stopSpeaking])

  const speak = useCallback(
    (text: string, messageId?: string) => {
      if (typeof window === 'undefined') return
      if (!('speechSynthesis' in window)) return
      if (!voiceEnabled) return
      if (isVoiceMuted) return
      const chunks = splitTextForSpeech(text, 220)
      if (chunks.length === 0) return

      try {
        try {
          window.speechSynthesis.resume()
        } catch {
          // ignore
        }

        try {
          window.speechSynthesis.cancel()
        } catch {
          // ignore
        }

        speakingForMessageIdRef.current = messageId || null
        speechQueueRef.current = [...chunks]

        const speakNext = () => {
          if (typeof window === 'undefined') return
          if (!('speechSynthesis' in window)) return
          if (!voiceEnabled) return
          if (isVoiceMuted) return

          const next = speechQueueRef.current.shift()
          if (!next) {
            setIsSpeaking(false)
            setSpeakingMessageId(null)
            speakingForMessageIdRef.current = null
            return
          }

          const utter = new SpeechSynthesisUtterance(next)
          if (resolveVoice) {
            utter.voice = resolveVoice
            utter.lang = resolveVoice.lang
          } else {
            utter.lang = speechLang
          }
          utter.rate = voiceRate
          utter.pitch = voicePitch
          utter.volume = voiceVolume

          utter.onstart = () => {
            setIsSpeaking(true)
            setSpeakingMessageId(speakingForMessageIdRef.current)
          }
          utter.onend = () => {
            speakNext()
          }
          utter.onerror = () => {
            stopSpeaking()
          }

          window.speechSynthesis.speak(utter)
        }

        speakNext()
      } catch {
        // ignore
      }
    },
    [isVoiceMuted, resolveVoice, speechLang, stopSpeaking, voiceEnabled, voicePitch, voiceRate, voiceVolume]
  )

  // Auto-speak new assistant messages when enabled
  useEffect(() => {
    if (!isOpen) return
    if (!voiceEnabled || !voiceAutoSpeak) return
    if (isVoiceMuted) return
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return

    if (lastSpokenMessageIdRef.current === lastAssistant.id) return
    lastSpokenMessageIdRef.current = lastAssistant.id
    speak(lastAssistant.content, lastAssistant.id)
  }, [isOpen, isVoiceMuted, messages, speak, voiceAutoSpeak, voiceEnabled])

  // Stop speaking when closing
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return
    if (isOpen) return
    stopSpeaking()
  }, [isOpen, stopSpeaking])

  const buildReplyContextPrefix = useCallback(
    (target: Pick<Message, 'id' | 'role' | 'content'> | null) => {
      if (!target) return ''
      const raw = String(target.content || '')
      const excerpt = stripMarkdownForSpeech(raw).slice(0, 180)
      const who = target.role === 'assistant' ? lt('Assistant') : lt('You')
      return `${lt('Replying to')} ${who}: "${excerpt}"\n\n`
    },
    [lt]
  )

  const handleSendMessage = async (retryContent?: string, retryId?: string) => {
    const rawContentToSend = retryContent || inputValue
    const contentToSend = retryId ? rawContentToSend : `${buildReplyContextPrefix(replyTo)}${rawContentToSend}`
    if (!contentToSend.trim()) return

    let messageId = retryId
    
    if (!retryId) {
      messageId = Date.now().toString()
      const userMessage: Message = {
        id: messageId,
        role: 'user',
        content: rawContentToSend,
        timestamp: new Date(),
        status: 'sending'
      }
      setMessages(prev => [...prev, userMessage])
      setInputValue('')
    } else {
      // Update existing message status to sending
      setMessages(prev => prev.map(msg => 
        msg.id === retryId ? { ...msg, status: 'sending' } : msg
      ))
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: contentToSend,
          history: messages.filter(m => m.role !== 'user' || m.status === 'sent').slice(-5), // Only send successful messages for context
          tenantId,
          locale,
          currentPath: pathname,
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('AI Agent API Error:', response.status, errorText)
        throw new Error(`Failed to get response: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      
      // Update user message status to sent
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'sent' } : msg
      ))
      
      const actions: Array<{ type: 'NAVIGATE'; path: string; label?: string }> = []
      if (data?.action && typeof data.action === 'object') actions.push(data.action)
      if (Array.isArray(data?.actions)) {
        for (const a of data.actions) {
          if (a && typeof a === 'object') actions.push(a)
        }
      }

      const suggestedPrompts: string[] = Array.isArray(data?.suggested_prompts)
        ? data.suggested_prompts.map((s: any) => String(s)).filter((s: string) => !!s.trim()).slice(0, 6)
        : []

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || lt("I've processed your request."),
        timestamp: new Date(),
        actions: actions.length > 0 ? actions : undefined,
        suggestedPrompts: suggestedPrompts.length > 0 ? suggestedPrompts : undefined,
      }

      setMessages(prev => [...prev, botMessage])
      if (!retryId) setReplyTo(null)
    } catch (error) {
      console.error('Agent error:', error)
      toast.error(lt("Sorry, I'm having trouble connecting right now."))
      
      // Update message status to error
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'error' } : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const renderMessageControls = (msg: Message) => {
    if (!msg.content) return null

    return (
      <div
        className={cn(
          'absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 z-10',
          'rounded-md bg-white/95 backdrop-blur-sm',
          'shadow-sm ring-1 ring-black/5',
          'px-1 py-0.5'
        )}
      >
        {canUseTts && msg.role === 'assistant' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100',
              isVoiceMuted && 'opacity-50'
            )}
            onClick={() => {
              if (isVoiceMuted) return
              speak(msg.content, msg.id)
            }}
            title={lt('Replay')}
            disabled={isVoiceMuted}
          >
            <Volume2 className="h-3 w-3" />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
          onClick={() => setReplyTo({ id: msg.id, role: msg.role, content: msg.content })}
          title={lt('Reply')}
        >
          <Reply className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  const handleClientAction = (action: any) => {
    // Execute navigation or other client-side logic
    if (action.type === 'NAVIGATE') {
      const rawPath = typeof action.path === 'string' ? action.path : ''
      if (!rawPath.startsWith('/')) {
        toast.error(lt('Unsupported action'))
        return
      }
      if (!(rawPath.startsWith('/dashboard') || rawPath.startsWith('/admin'))) {
        toast.error(lt('Unsupported action'))
        return
      }
      const localePrefix = `/${locale}`
      const nextPath =
        typeof action.path === 'string' && action.path.startsWith('/')
          ? (action.path.startsWith(localePrefix) ? action.path : `${localePrefix}${action.path}`)
          : action.path
      router.push(nextPath)
      toast.info(
        lt('Navigating to {destination}', {
          destination: action.label || action.path,
        })
      )
    }
  }

  const renderMessageExtras = (msg: Message) => {
    const actions = Array.isArray(msg.actions) ? msg.actions : []
    const suggested = Array.isArray(msg.suggestedPrompts) ? msg.suggestedPrompts : []

    if (actions.length === 0 && suggested.length === 0) return null

    return (
      <div className="mt-2 space-y-2">
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.slice(0, 4).map((a, idx) => (
              <Button
                key={`${msg.id}-action-${idx}`}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleClientAction(a)}
              >
                {lt(a.label || 'Open')}
              </Button>
            ))}
          </div>
        ) : null}

        {suggested.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggested.slice(0, 6).map((p, idx) => (
              <Button
                key={`${msg.id}-prompt-${idx}`}
                type="button"
                variant="secondary"
                size="sm"
                className="h-8"
                onClick={() => handleSendMessage(p)}
                disabled={isLoading}
              >
                {p}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const toggleListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error(lt('Voice input is not supported in this browser.'))
      return
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      setIsListening(false)
      return
    }

    try {
      const recognition = new (window as any).webkitSpeechRecognition()
      recognitionRef.current = recognition
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = speechLang

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setInputValue(transcript)
        // Optional: Auto-send could go here
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error)
        setIsListening(false)
        recognitionRef.current = null
        if (event.error === 'not-allowed') {
          toast.error(lt('Microphone access denied.'))
        }
      }

      recognition.onend = () => {
        setIsListening(false)
        recognitionRef.current = null
      }

      recognition.start()
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
      setIsListening(false)
      recognitionRef.current = null
    }
  }

  const handleClearChat = () => {
    const initialMessage: Message = {
      id: '1',
      role: 'assistant',
      content: lt(
        config?.chatbot?.welcome_message ||
          "Hi! I'm your LedgerAI Assistant. I can help you navigate, create records, or analyze your data. Try saying 'Show me the P&L report' or 'Create a new invoice'."
      ),
      timestamp: new Date()
    }
    setMessages([initialMessage])
    localStorage.removeItem(storageKey)
    toast.success(lt('Chat history cleared'))
  }

  const positionClass = config?.chatbot?.position === 'bottom-left' ? 'left-6' : 'right-6'
  const positionClassDesktop = config?.chatbot?.position === 'bottom-left' ? 'sm:left-6' : 'sm:right-6'

  // Helper to get color classes dynamically (Tailwind needs full class names to purge correctly, so we map them)
  const getBgColor = (shade = 600) => {
    const color = config?.chatbot?.primary_color || 'blue'
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
    const color = config?.chatbot?.primary_color || 'blue'
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
    const animation = config?.chatbot?.mic_animation || 'pulse'
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
    const speed = config?.chatbot?.mic_speed || 'slow'
    const map: any = {
      slow: '3s',
      normal: '1s',
      fast: '0.5s',
    }
    return map[speed] || '3s'
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 h-14 w-14 rounded-full shadow-xl bg-gradient-to-r hover:opacity-90 transition-all duration-300 z-40",
          positionClass,
          getGradient()
        )}
      >
        <Bot className="h-8 w-8 text-white" />
      </Button>
    )
  }

  return (
    <Card
      ref={cardRef}
      style={
        isResizableViewport && !isMinimized && desktopSize
          ? { width: `${desktopSize.width}px`, height: `${desktopSize.height}px` }
          : undefined
      }
      className={cn(
      "fixed shadow-2xl z-40 transition-all duration-300 flex flex-col border-blue-100",
      // Mobile: full screen with dynamic viewport height (keyboard-safe on modern browsers)
      "inset-0 w-full h-[100dvh] rounded-none",
      // Desktop/tablet: classic widget sizing and placement
      "sm:inset-auto sm:bottom-6 sm:rounded-xl",
      isMinimized ? "sm:w-72 sm:h-14" : "sm:w-[380px] sm:h-[600px]",
      // Allow custom resizing on larger screens when not minimized
      !isMinimized ? "sm:overflow-hidden sm:min-w-[320px] sm:min-h-[360px]" : null,
      positionClassDesktop
    )}
    >
      <CardHeader className={cn(
        "relative p-3 border-b flex flex-row items-center justify-between space-y-0 bg-gradient-to-r",
        "sm:rounded-t-xl",
        getGradient()
      )}>
        {/* Custom resize handle (top-left) for desktop/tablet */}
        {!isMinimized ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'absolute left-2 top-2 hidden sm:inline-flex',
              'h-7 w-7 rounded-md',
              'bg-white/15 hover:bg-white/25',
              'text-white/90 hover:text-white',
              'cursor-nwse-resize touch-none select-none'
            )}
            aria-label={lt('Resize')}
            title={lt('Resize')}
            onPointerDown={beginResize}
          >
            <MoveDiagonal2 className="h-4 w-4" />
          </Button>
        ) : null}

        <div className={cn('flex items-center gap-2', !isMinimized ? 'sm:pl-9' : null)}>
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Bot className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Centered title */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <CardTitle className="text-sm font-bold text-white text-center px-24 truncate">
            {lt(config?.chatbot?.title || 'LedgerAI Copilot')}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1 text-white">
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/20 hover:text-white" onClick={handleClearChat} title={lt('Clear Chat')}>
            <Trash2 className="h-3 w-3" />
          </Button>
          {canUseTts ? (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6 hover:bg-white/20 hover:text-white',
                isSpeaking && !isVoiceMuted ? 'animate-pulse' : null
              )}
              onClick={toggleVoiceMute}
              title={isVoiceMuted ? lt('Unmute voice') : (isSpeaking ? lt('Mute (speaking)') : lt('Mute voice'))}
            >
              {isVoiceMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20 hover:text-white hidden sm:inline-flex"
            onClick={restoreDefaultSize}
            title={lt('Restore Size')}
            disabled={isMinimized}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-white/20 hover:text-white hidden sm:inline-flex"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-500 hover:text-white" onClick={() => setIsOpen(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <>
          <CardContent className="flex-1 min-h-0 p-0 overflow-hidden bg-white/50">
            <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex w-full",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm relative group",
                        msg.role === 'user'
                          ? cn("text-white rounded-br-none", getBgColor(600))
                          : "bg-white border border-gray-100 text-gray-800 rounded-bl-none",
                        msg.status === 'error' && "opacity-70 border-red-300"
                      )}
                    >
                      {renderMessageControls(msg)}
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown 
                          components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                            li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                            strong: ({node, ...props}) => <span className="font-bold text-gray-900" {...props} />,
                            a: ({node, ...props}) => <a className="text-blue-600 hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                            code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props} />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                      {msg.status === 'error' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -left-8 top-1/2 -translate-y-1/2 h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full"
                          onClick={() => handleSendMessage(msg.content, msg.id)}
                          title={lt('Retry sending')}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}

                      {msg.role === 'assistant' ? renderMessageExtras(msg) : null}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" style={{ animationDuration: '3s' }} />
                      <span className="text-xs text-gray-500">{lt('Thinking...')}</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter
            className="p-3 border-t bg-white"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <form 
              className="flex w-full flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
            >
              {replyTo ? (
                <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                  <div className="truncate">
                    {lt('Replying to')}{' '}
                    <span className="font-medium">{replyTo.role === 'assistant' ? lt('Assistant') : lt('You')}</span>
                    :{' '}
                    <span className="text-gray-600">{stripMarkdownForSpeech(replyTo.content).slice(0, 80)}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-500 hover:text-gray-800"
                    onClick={() => setReplyTo(null)}
                    title={lt('Cancel reply')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : null}

              <div className="flex w-full items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 shrink-0 transition-all duration-200 rounded-full", 
                    isListening 
                      ? cn("bg-red-500 text-white hover:bg-red-600 shadow-lg ring-4 ring-red-200 scale-110", getMicAnimationClass())
                      : "hover:bg-gray-100 text-gray-500"
                  )}
                  style={isListening ? { animationDuration: getAnimationDuration() } : {}}
                  onClick={toggleListening}
                  title={isListening ? lt('Stop Listening') : lt('Voice Input')}
                >
                  <Mic className={cn("h-4 w-4", isListening && "scale-110")} />
                </Button>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={lt('Ask me anything...')}
                  className="flex-1 h-9 bg-gray-50 border-gray-200 focus-visible:ring-blue-500"
                  disabled={isLoading}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className={cn("h-9 w-9 shrink-0 hover:opacity-90", getBgColor(600))}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
