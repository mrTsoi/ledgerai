'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

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
  const { currentTenant } = useTenant()
  const userRole = useUserRole()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const [domains, setDomains] = useState<TenantDomainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [domainInput, setDomainInput] = useState('')

  const canManage = userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const fetchDomains = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      const { data, error } = await (supabase.from('tenant_domains') as any)
        .select('id, domain, is_primary, verified_at, verification_token, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDomains((data || []) as TenantDomainRow[])
    } catch (e: any) {
      console.error('Error fetching domains:', e)
      toast.error('Failed to load domains')
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  const handleAdd = async () => {
    if (!tenantId) return
    if (!canManage) return

    const domain = normalizeDomain(domainInput)
    if (!domain) {
      toast.error('Please enter a valid domain (e.g. example.com)')
      return
    }

    try {
      setSaving(true)
      const { error } = await (supabase.from('tenant_domains') as any).insert({
        tenant_id: tenantId,
        domain,
        is_primary: domains.length === 0,
      })

      if (error) throw error

      setDomainInput('')
      await fetchDomains()
      toast.success('Domain added. Add the DNS TXT record to verify.')
    } catch (e: any) {
      console.error('Error adding domain:', e)
      toast.error(e.message || 'Failed to add domain')
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
      if (!res.ok) throw new Error(json?.error || 'Verification failed')

      if (json?.verified) {
        toast.success(json.message || 'Domain verified')
        await fetchDomains()
      } else {
        toast.info(json.message || 'DNS record not found yet')
      }
    } catch (e: any) {
      console.error('Error verifying domain:', e)
      toast.error(e.message || 'Failed to verify domain')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (!canManage) return
    if (!confirm('Remove this domain?')) return

    try {
      setSaving(true)
      const { error } = await (supabase.from('tenant_domains') as any).delete().eq('id', id)
      if (error) throw error
      await fetchDomains()
      toast.success('Domain removed')
    } catch (e: any) {
      console.error('Error removing domain:', e)
      toast.error(e.message || 'Failed to remove domain')
    } finally {
      setSaving(false)
    }
  }

  const primary = domains.find((d) => d.is_primary) || domains[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Domain</CardTitle>
        <CardDescription>
          Add a domain to access your tenant using a custom hostname.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canManage ? (
          <div className="text-sm text-muted-foreground">
            Only Company Admins can manage custom domains.
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="domain">Domain</Label>
            <div className="flex gap-2">
              <Input
                id="domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
              />
              <Button onClick={handleAdd} disabled={saving || !domainInput.trim()}>
                Add
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading domains…</div>
        ) : domains.length === 0 ? (
          <div className="text-sm text-muted-foreground">No custom domains added.</div>
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
                        {d.verified_at ? 'Verified' : 'Not verified'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!d.verified_at && (
                        <Button
                          variant="outline"
                          onClick={() => handleVerify(d.domain)}
                          disabled={saving}
                        >
                          Verify
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="destructive"
                          onClick={() => handleRemove(d.id)}
                          disabled={saving}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  {!d.verified_at && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Add this DNS TXT record:</div>
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
                After DNS propagation, you can use <span className="font-mono">https://{primary.domain}</span>.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
