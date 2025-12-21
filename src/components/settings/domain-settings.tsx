'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useLiterals } from '@/hooks/use-literals'

type TenantDomainRow = {
  id: string
  domain: string
  is_primary: boolean | null
  verified_at: string | null
  verification_token: string
  created_at: string | null
}

function normalizeDomain(input: string): string {
  const trimmed = (input || '').trim().toLowerCase()
  if (!trimmed) return ''

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).hostname.toLowerCase()
    } catch {
      return ''
    }
  }

  const withoutPath = trimmed.split('/')[0]
  const withoutPort = withoutPath.split(':')[0]
  return withoutPort
}

export function DomainSettings() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const userRole = useUserRole()
  const { subscription, loading: subLoading } = useSubscription()
  const tenantId = currentTenant?.id

  const [domains, setDomains] = useState<TenantDomainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)

  const hasFeature = subscription?.features?.custom_domain === true
  const canRender = !subLoading && hasFeature

  const canManage = userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const fetchDomains = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      setSchemaMissing(false)
      const res = await fetch(`/api/domains?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err: any = new Error(json?.error || 'Failed to load domains')
        ;(err as any).code = json?.code
        throw err
      }

      setDomains((json?.domains || []) as TenantDomainRow[])
    } catch (e: any) {
      console.error('Error fetching domains:', e)
      const code = e?.code as string | undefined
      const message = String(e?.message || '')
      if (code === 'PGRST205' || message.includes("Could not find the table 'public.tenant_domains'")) {
        setSchemaMissing(true)
        toast.error(lt('Domains table is missing. Apply migrations (supabase db push) and refresh.'))
      } else {
        toast.error(lt('Failed to load domains'))
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId, lt])

  useEffect(() => {
    if (!canRender) return
    fetchDomains()
  }, [fetchDomains, canRender])

  if (!canRender) return null

  const handleAdd = async () => {
    if (!tenantId) return
    if (!canManage) return

    const domain = normalizeDomain(domainInput)
    if (!domain) {
      toast.error(lt('Please enter a valid domain (e.g. example.com)'))
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, domain }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err: any = new Error(json?.error || 'Failed to add domain')
        ;(err as any).code = json?.code
        throw err
      }

      setDomainInput('')
      await fetchDomains()
      toast.success(lt('Domain added. Add the DNS TXT record to verify.'))
    } catch (e: any) {
      console.error('Error adding domain:', e)
      const code = e?.code as string | undefined
      if (code === 'PGRST205') {
        setSchemaMissing(true)
        toast.error(lt('Domains table is missing. Apply migrations (supabase db push) and refresh.'))
      } else {
        toast.error(e.message || lt('Failed to add domain'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async (domain: string) => {
    try {
      setSaving(true)
      const res = await fetch('/api/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Verification failed'))

      if (json?.verified) {
        toast.success(json.message || lt('Domain verified'))
        await fetchDomains()
      } else {
        toast.info(json.message || lt('DNS record not found yet'))
      }
    } catch (e: any) {
      console.error('Error verifying domain:', e)
      toast.error(e.message || lt('Failed to verify domain'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (!canManage) return
    if (!confirm(lt('Remove this domain?'))) return

    try {
      setSaving(true)
      const res = await fetch(`/api/domains?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || lt('Failed to remove domain'))
      await fetchDomains()
      toast.success(lt('Domain removed'))
    } catch (e: any) {
      console.error('Error removing domain:', e)
      toast.error(e.message || lt('Failed to remove domain'))
    } finally {
      setSaving(false)
    }
  }

  const primary = domains.find((d) => d.is_primary) || domains[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Custom Domain')}</CardTitle>
        <CardDescription>
          {lt('Add a domain to access your tenant using a custom hostname.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canManage ? (
          <div className="text-sm text-muted-foreground">
            {lt('Only Company Admins can manage custom domains.')}
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="domain">{lt('Domain')}</Label>
            <div className="flex gap-2">
              <Input
                id="domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder={lt('example.com')}
              />
              <Button onClick={handleAdd} disabled={saving || !domainInput.trim()}>
                {lt('Add')}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">{lt('Loading domains…')}</div>
        ) : schemaMissing ? (
          <div className="text-sm text-muted-foreground">
            {lt('Custom domains are not available because the database is missing the required table. Apply migrations to your Supabase project and refresh.')}
          </div>
        ) : domains.length === 0 ? (
          <div className="text-sm text-muted-foreground">{lt('No custom domains added.')}</div>
        ) : (
          <div className="space-y-3">
            {domains.map((d) => {
              const txtName = `_ledgerai.${d.domain}`
              const txtValue = `ledgerai-verify=${d.verification_token}`

              return (
                <div key={d.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{d.domain}</div>
                      <div className="text-sm text-muted-foreground">
                        {d.verified_at ? lt('Verified') : lt('Not verified')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!d.verified_at && (
                        <Button
                          variant="outline"
                          onClick={() => handleVerify(d.domain)}
                          disabled={saving}
                        >
                          {lt('Verify')}
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="destructive"
                          onClick={() => handleRemove(d.id)}
                          disabled={saving}
                        >
                          {lt('Remove')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {!d.verified_at && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>{lt('Add this DNS TXT record:')}</div>
                      <div>
                        <span className="font-mono">{txtName}</span>
                      </div>
                      <div>
                        <span className="font-mono">{txtValue}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {primary?.verified_at && (
              <div className="text-sm text-muted-foreground">
                {lt('After DNS propagation, you can use')} <span className="font-mono">https://{primary.domain}</span>{lt('.')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
