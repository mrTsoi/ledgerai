'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Mail, Phone } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

type ContactConfig = {
  whatsapp?: string
  email?: string
}

function normalizeWhatsAppNumber(raw: string): string {
  const v = String(raw || '').trim()
  if (!v) return ''

  // wa.me expects digits only (no +, no spaces)
  const digits = v.replace(/[^0-9]/g, '')
  return digits
}

function buildEnquiryText(params: {
  name: string
  email: string
  company: string
  subject: string
  message: string
  url?: string
}) {
  const lines: string[] = []

  if (params.subject.trim()) lines.push(`Subject: ${params.subject.trim()}`)
  if (params.name.trim()) lines.push(`Name: ${params.name.trim()}`)
  if (params.email.trim()) lines.push(`Email: ${params.email.trim()}`)
  if (params.company.trim()) lines.push(`Company: ${params.company.trim()}`)
  if (params.url?.trim()) lines.push(`Page: ${params.url.trim()}`)

  lines.push('')
  lines.push(params.message.trim() || '')

  return lines.join('\n')
}

export function ContactUs() {
  const lt = useLiterals()

  const [loading, setLoading] = useState(true)
  const [contact, setContact] = useState<ContactConfig>({})

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const pageUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return window.location?.href
  }, [])

  const fetchContactConfig = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/public/pricing')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to load contact config')
      setContact((json?.contact_config || {}) as ContactConfig)
    } catch (e) {
      console.error(e)
      setContact({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContactConfig()
  }, [fetchContactConfig])

  const enquiryText = useMemo(() => {
    return buildEnquiryText({ name, email, company, subject, message, url: pageUrl })
  }, [name, email, company, subject, message, pageUrl])

  const salesEmail = String(contact.email || '').trim()
  const waNumber = normalizeWhatsAppNumber(String(contact.whatsapp || ''))

  const canSend = message.trim().length > 0

  const openEmail = useCallback(() => {
    if (!salesEmail) {
      toast.error(lt('Sales email is not configured by the platform admin.'))
      return
    }
    if (!canSend) {
      toast.error(lt('Please enter your message.'))
      return
    }

    const subj = subject.trim() ? subject.trim() : 'Sales enquiry'
    const mailto = `mailto:${encodeURIComponent(salesEmail)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(enquiryText)}`
    window.location.href = mailto
  }, [salesEmail, canSend, subject, enquiryText, lt])

  const openWhatsApp = useCallback(() => {
    if (!waNumber) {
      toast.error(lt('Sales WhatsApp is not configured by the platform admin.'))
      return
    }
    if (!canSend) {
      toast.error(lt('Please enter your message.'))
      return
    }

    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(enquiryText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [waNumber, canSend, enquiryText, lt])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Contact Sales')}</CardTitle>
        <CardDescription>
          {lt('Send an enquiry to the sales team using the contact methods configured by the platform admin.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">{lt('Your name')}</Label>
              <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={lt('Enter your full name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">{lt('Your email')}</Label>
              <Input id="contact-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={lt('you@example.com')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-company">{lt('Company (optional)')}</Label>
              <Input id="contact-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={lt('e.g., Acme Corp')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-subject">{lt('Subject (optional)')}</Label>
              <Input id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={lt('e.g., Pricing and onboarding')} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-message">{lt('Message')}</Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={lt('Tell us what you’re trying to achieve and any key requirements.')}
                className="min-h-[220px]"
              />
            </div>

            <div className="rounded-lg border p-4 bg-white">
              <div className="text-sm font-semibold text-gray-900">{lt('Sales contact')}</div>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <div>
                  {lt('Email')}: {loading ? lt('Loading…') : salesEmail || lt('Not configured')}
                </div>
                <div>
                  {lt('WhatsApp')}: {loading ? lt('Loading…') : (waNumber ? `+${waNumber}` : lt('Not configured'))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={openEmail} disabled={loading || !salesEmail} className="sm:w-auto">
            <Mail className="mr-2 h-4 w-4" />
            {lt('Send via Email')}
          </Button>
          <Button onClick={openWhatsApp} disabled={loading || !waNumber} variant="outline" className="sm:w-auto">
            <Phone className="mr-2 h-4 w-4" />
            {lt('Send via WhatsApp')}
          </Button>
          {!canSend ? <div className="text-sm text-muted-foreground sm:self-center">{lt('Add a message to enable sending.')}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}
