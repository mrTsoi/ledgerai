'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bot, Send, Mic, X, Minimize2, Maximize2, Loader2, Sparkles, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  status?: 'sending' | 'sent' | 'error'
}

interface AiAgentWidgetProps {
  tenantId?: string
  userId?: string
}

export function AiAgentWidget({ tenantId, userId }: AiAgentWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your LedgerAI Assistant. I can help you navigate, create records, or analyze your data. Try saying 'Show me the P&L report' or 'Create a new invoice'.",
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const storageKey = `ledgerai_chat_${tenantId || 'default'}_${userId || 'guest'}`
  const supabase = useMemo(() => createClient(), [])
  const [config, setConfig] = useState<any>(null)

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
        content: config.chatbot.welcome_message,
        timestamp: new Date()
      }])
    }
  }, [storageKey, config])

  // Save chat history to local storage
  useEffect(() => {
    if (messages.length > 1) { // Don't save if only initial message
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

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

  const handleSendMessage = async (retryContent?: string, retryId?: string) => {
    const contentToSend = retryContent || inputValue
    if (!contentToSend.trim()) return

    let messageId = retryId
    
    if (!retryId) {
      messageId = Date.now().toString()
      const userMessage: Message = {
        id: messageId,
        role: 'user',
        content: contentToSend,
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
          tenantId
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
      
      // Handle client-side actions if the agent requests them
      if (data.action) {
        handleClientAction(data.action)
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || "I've processed your request.",
        timestamp: new Date()
      }

      setMessages(prev => [...prev, botMessage])
    } catch (error) {
      console.error('Agent error:', error)
      toast.error("Sorry, I'm having trouble connecting right now.")
      
      // Update message status to error
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'error' } : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClientAction = (action: any) => {
    // Execute navigation or other client-side logic
    if (action.type === 'NAVIGATE') {
      router.push(action.path)
      toast.info(`Navigating to ${action.label || action.path}`)
    }
  }

  const toggleListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Voice input is not supported in this browser.')
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
      recognition.lang = 'en-US'

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
          toast.error('Microphone access denied.')
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
      content: config?.chatbot?.welcome_message || "Hi! I'm your LedgerAI Assistant. I can help you navigate, create records, or analyze your data. Try saying 'Show me the P&L report' or 'Create a new invoice'.",
      timestamp: new Date()
    }
    setMessages([initialMessage])
    localStorage.removeItem(storageKey)
    toast.success('Chat history cleared')
  }

  const positionClass = config?.chatbot?.position === 'bottom-left' ? 'left-6' : 'right-6'

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
          "fixed bottom-6 h-14 w-14 rounded-full shadow-xl bg-gradient-to-r hover:opacity-90 transition-all duration-300 z-50",
          positionClass,
          getGradient()
        )}
      >
        <Bot className="h-8 w-8 text-white" />
      </Button>
    )
  }

  return (
    <Card className={cn(
      "fixed bottom-6 shadow-2xl z-50 transition-all duration-300 flex flex-col border-blue-100",
      isMinimized ? "w-72 h-14" : "w-[380px] h-[600px]",
      positionClass
    )}>
      <CardHeader className={cn("p-3 border-b rounded-t-xl flex flex-row items-center justify-between space-y-0 bg-gradient-to-r", getGradient())}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <CardTitle className="text-sm font-bold text-white">{config?.chatbot?.title || 'LedgerAI Copilot'}</CardTitle>
        </div>
        <div className="flex items-center gap-1 text-white">
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/20 hover:text-white" onClick={handleClearChat} title="Clear Chat">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/20 hover:text-white" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-500 hover:text-white" onClick={() => setIsOpen(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <>
          <CardContent className="flex-1 p-0 overflow-hidden bg-white/50">
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
                          title="Retry sending"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500 animate-pulse" style={{ animationDuration: '3s' }} />
                      <span className="text-xs text-gray-500">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-3 border-t bg-white">
            <form 
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
            >
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
                title={isListening ? "Stop Listening" : "Voice Input"}
              >
                <Mic className={cn("h-4 w-4", isListening && "scale-110")} />
              </Button>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything..."
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
            </form>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
