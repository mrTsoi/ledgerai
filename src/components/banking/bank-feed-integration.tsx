'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePlaidLink } from 'react-plaid-link'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { useLiterals } from '@/hooks/use-literals'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type ConnectionRow = {
  id: string
  status: 'ACTIVE' | 'ERROR' | 'DISABLED'
  last_synced_at: string | null
  error_message: string | null
}

type WebhookKeyRow = {
  id: string
  key_prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

type BankAccountLite = {
  id: string
  account_name: string | null
}

export function BankFeedIntegration() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const userRole = useUserRole()
  const { subscription, loading: subscriptionLoading } = useSubscription()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const hasBankFeature = Boolean(subscription?.features?.bank_integration === true)

  const [connection, setConnection] = useState<ConnectionRow | null>(null)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  const [plaidConfigured, setPlaidConfigured] = useState<boolean | null>(null)
  const [plaidUiMessage, setPlaidUiMessage] = useState<string | null>(null)
  const [pendingPlaidOpen, setPendingPlaidOpen] = useState(false)

  const [webhookKeyRow, setWebhookKeyRow] = useState<WebhookKeyRow | null>(null)
  const [generatedWebhookKey, setGeneratedWebhookKey] = useState<string | null>(null)

  const [testApiKey, setTestApiKey] = useState('')
  const [testAccount, setTestAccount] = useState<BankAccountLite | null>(null)

  const canManage = userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const isMissingRelation = (e: any) => {
    const msg = String(e?.message || '').toLowerCase()
    const code = String(e?.code || '').toLowerCase()
    const status = (e?.status ?? e?.statusCode ?? e?.cause?.status) as number | undefined

    if (status === 404) return true
    if (code === '42p01') return true
    if (msg.includes('relation') && msg.includes('does not exist')) return true
    // Supabase/PostgREST commonly returns this for missing tables/views
    if (msg.includes('schema cache') && msg.includes('could not find the table')) return true
    if (msg.includes('could not find the table')) return true
    return false
  }

  const isPlaidNotConfigured = (e: any) => {
    const msg = String(e?.message || '').toLowerCase()
    return msg.includes('plaid_client_id') || msg.includes('plaid_secret')
  }

  const fetchConnection = useCallback(async () => {
    if (!tenantId) return
    if (!hasBankFeature) return

    try {
      setLoading(true)
      const { data, error } = await (supabase.from('bank_feed_connections') as any)
        .select('id, status, last_synced_at, error_message')
        .eq('tenant_id', tenantId)
        .eq('provider', 'PLAID')
        .order('created_at', { ascending: false })
        .maybeSingle()

      if (error) throw error
      setConnection((data as any) || null)
    } catch (e: any) {
      if (isMissingRelation(e)) {
        setConnection(null)
        setPlaidUiMessage(lt('Bank feed tables are not installed yet.'))
        return
      }

      setConnection(null)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId, lt, hasBankFeature])
  

  const fetchWebhookKey = useCallback(async () => {
    if (!tenantId || !canManage) return
    if (!hasBankFeature) return

    try {
      const { data, error } = await (supabase.from('bank_feed_api_keys') as any)
        .select('id, key_prefix, last_used_at, revoked_at, created_at')
        .eq('tenant_id', tenantId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .maybeSingle()

      if (error) throw error
      setWebhookKeyRow((data as any) || null)
    } catch (e: any) {
      if (isMissingRelation(e)) {
        setWebhookKeyRow(null)
        return
      }

      setWebhookKeyRow(null)
    }
  }, [supabase, tenantId, canManage, hasBankFeature])

  const fetchLinkToken = useCallback(async () => {
    if (!tenantId) return
    if (!hasBankFeature) return

    try {
      const res = await fetch('/api/bank-feeds/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to create link token'))

      setLinkToken(json.link_token)
      setPlaidConfigured(true)
      setPlaidUiMessage(null)
    } catch (e: any) {
      if (isPlaidNotConfigured(e)) {
        setPlaidConfigured(false)
        setPlaidUiMessage(lt('Plaid is not configured for this environment.'))
        return
      }

      setPlaidConfigured(null)
      setPlaidUiMessage(e?.message || lt('Failed to start Plaid connection'))
    }
  }, [tenantId, lt, hasBankFeature])

  useEffect(() => {
    fetchConnection()
  }, [fetchConnection])

  useEffect(() => {
    fetchWebhookKey()
  }, [fetchWebhookKey])

  useEffect(() => {
    if (generatedWebhookKey) {
      setTestApiKey(generatedWebhookKey)
    }
  }, [generatedWebhookKey])

  const fetchTestAccount = useCallback(async () => {
    if (!tenantId || !canManage) return
    if (!hasBankFeature) return

    try {
      const { data, error } = await (supabase.from('bank_accounts') as any)
        .select('id, account_name')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (error) throw error
      setTestAccount((data?.[0] as any) || null)
    } catch (e: any) {
      console.error('Error fetching bank accounts for webhook test:', e)
      setTestAccount(null)
    }
  }, [supabase, tenantId, canManage, hasBankFeature])

  useEffect(() => {
    fetchTestAccount()
  }, [fetchTestAccount])

  const onSuccess = useCallback(
    async (public_token: string) => {
      if (!tenantId) return

      try {
        setWorking(true)
        const res = await fetch('/api/bank-feeds/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, public_token }),
        })

        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('Failed to connect'))

        toast.success(lt('Bank feed connected'))
        await fetchConnection()
      } catch (e: any) {
        toast.error(e?.message || lt('Failed to connect bank feed'))
      } finally {
        setWorking(false)
      }
    },
    [tenantId, fetchConnection, lt]
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  })

  const startPlaidConnect = async () => {
    if (!tenantId || !canManage) return
    if (!hasBankFeature) return

    setPendingPlaidOpen(true)

    if (!linkToken) {
      await fetchLinkToken()
    }
  }

  useEffect(() => {
    if (!pendingPlaidOpen) return
    if (!linkToken) return
    if (!ready) return

    try {
      open()
    } finally {
      setPendingPlaidOpen(false)
    }
  }, [pendingPlaidOpen, linkToken, ready, open])

  const syncNow = async () => {
    if (!tenantId) return
    if (!hasBankFeature) return

    try {
      setWorking(true)
      const res = await fetch('/api/bank-feeds/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, connection_id: connection?.id }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Sync failed'))

      toast.success(
        lt('Synced. Inserted {count} transactions.', {
          count: json.inserted ?? 0,
        })
      )
      await fetchConnection()
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to sync transactions'))
    } finally {
      setWorking(false)
    }
  }

  const rotateWebhookKey = async () => {
    if (!tenantId) return
    if (!hasBankFeature) return

    try {
      setWorking(true)
      setGeneratedWebhookKey(null)

      const res = await fetch('/api/bank-feeds/api-key/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to rotate key'))

      setGeneratedWebhookKey(json.api_key)
      toast.success(lt('Webhook API key rotated'))
      await fetchWebhookKey()
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to rotate webhook key'))
    } finally {
      setWorking(false)
    }
  }

  const copyGeneratedKey = async () => {
    if (!generatedWebhookKey) return

    try {
      await navigator.clipboard.writeText(generatedWebhookKey)
      toast.success(lt('Copied API key'))
    } catch {
      toast.error(lt('Failed to copy'))
    }
  }

  const sendTestWebhook = async () => {
    if (!tenantId) return
    if (!hasBankFeature) return
    if (!testApiKey.trim()) {
      toast.error(lt('Enter an API key to test'))
      return
    }
    if (!testAccount?.id) {
      toast.error(lt('Create a bank account first'))
      return
    }

    try {
      setWorking(true)

      const now = new Date()
      const yyyyMmDd = now.toISOString().slice(0, 10)
      const externalId = `test_${now.getTime()}`

      const res = await fetch('/api/banking/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ledgerai-tenant-api-key': testApiKey.trim(),
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          bank_account_id: testAccount.id,
          provider: 'WEBHOOK_TEST',
          transactions: [
            {
              external_id: externalId,
              date: yyyyMmDd,
              amount: 1.23,
              transaction_type: 'CREDIT',
              description: 'Webhook test transaction',
              metadata: { source: 'ui_test' },
              raw: { test: true },
            },
          ],
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Webhook test failed'))

      toast.success(
        lt('Webhook OK. Inserted {count} transaction(s).', {
          count: json.inserted ?? 0,
        })
      )
    } catch (e: any) {
      toast.error(e?.message || lt('Webhook test failed'))
    } finally {
      setWorking(false)
    }
  }

  const curlSnippet = useMemo(() => {
    const apiKeyValue = testApiKey.trim() ? testApiKey.trim() : '<YOUR_API_KEY>'
    const tenantValue = tenantId ?? '<TENANT_ID>'
    const accountValue = testAccount?.id ?? '<BANK_ACCOUNT_ID>'

    return [
      'curl -X POST "https://<your-domain>/api/banking/webhook" \\',
      '  -H "Content-Type: application/json" \\',
      `  -H "x-ledgerai-tenant-api-key: ${apiKeyValue}" \\`,
      '  -d \'{',
      `    "tenant_id": "${tenantValue}",`,
      `    "bank_account_id": "${accountValue}",`,
      '    "provider": "YOUR_PROVIDER",',
      '    "transactions": [',
      '      {',
      '        "external_id": "txn_123",',
      '        "date": "2025-12-13",',
      '        "amount": 12.34,',
      '        "transaction_type": "DEBIT",',
      '        "description": "Example transaction"',
      '      }',
      '    ]',
      '  }\'',
    ].join('\n')
  }, [testApiKey, tenantId, testAccount?.id])

  if (subscriptionLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-sm text-muted-foreground">{lt('Checking your subscription...')}</div>
        </CardContent>
      </Card>
    )
  }

  if (!hasBankFeature) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{lt('Bank Feed Integration')}</CardTitle>
          <CardDescription>{lt('Subscription Required')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {lt('Bank feeds are available only on paid plans that include this feature. Please upgrade your subscription or contact your tenant administrator.')}
          </div>
          <div className="mt-4">
            <Link href="/dashboard/settings?tab=billing" className="no-underline">
              <Button>{lt('Upgrade')}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{lt('Bank Feed Integration')}</CardTitle>
          <CardDescription>{lt('Connect Plaid to automatically fetch bank transactions.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <div className="text-sm text-muted-foreground">
              {lt('Only Company Admins can connect bank feeds.')}
            </div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground">{lt('Loading…')}</div>
          ) : connection ? (
            <div className="space-y-3">
              <div className="text-sm">
                <div>{lt('Status: {status}', { status: connection.status })}</div>
                {connection.last_synced_at && (
                  <div>
                    {lt('Last synced: {date}', {
                      date: new Date(connection.last_synced_at).toLocaleString(),
                    })}
                  </div>
                )}
                {connection.error_message && (
                  <div className="text-destructive">
                    {lt('Error: {message}', { message: connection.error_message })}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={syncNow} disabled={working}>
                  {lt('Sync Now')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{lt('No Plaid connection yet.')}</div>
              {plaidUiMessage ? (
                <div className="text-sm text-muted-foreground">{plaidUiMessage}</div>
              ) : null}
              <Button
                onClick={startPlaidConnect}
                disabled={working || (plaidConfigured === false)}
              >
                {lt('Connect Plaid')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Webhook Ingestion (Global)')}</CardTitle>
          <CardDescription>
            {lt(
              'Use this when your bank-data provider can push transactions via webhook (works in regions where OAuth connectors don’t).'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <div className="text-sm text-muted-foreground">
              {lt('Only Company Admins can manage webhook API keys.')}
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div>
                  {lt('Endpoint:')} <span className="font-mono">/api/banking/webhook</span>
                </div>
                <div>
                  {lt('Header:')} <span className="font-mono">x-ledgerai-tenant-api-key</span>
                </div>
                {webhookKeyRow ? (
                  <div className="text-muted-foreground">
                    {lt('Active key prefix:')} <span className="font-mono">{webhookKeyRow.key_prefix}</span>
                    {webhookKeyRow.last_used_at ? (
                      <>
                        {' '}
                        •{' '}
                        {lt('last used {date}', {
                          date: new Date(webhookKeyRow.last_used_at).toLocaleString(),
                        })}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">{lt('No webhook key yet.')}</div>
                )}
                {testAccount?.id ? (
                  <div className="text-muted-foreground">
                    {lt('Test bank account:')}{' '}
                    <span className="font-mono">{testAccount.account_name || testAccount.id}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    {lt('Test requires at least one bank account.')}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={rotateWebhookKey} disabled={working}>
                  {webhookKeyRow ? lt('Rotate API Key') : lt('Generate API Key')}
                </Button>
                {generatedWebhookKey ? (
                  <Button onClick={copyGeneratedKey} disabled={working}>
                    {lt('Copy Key')}
                  </Button>
                ) : null}
              </div>

              {generatedWebhookKey ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">{lt('New API key (shown once)')}</div>
                  <div className="font-mono break-all">{generatedWebhookKey}</div>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="bank-feed-test-key">{lt('API key for test')}</Label>
                <Input
                  id="bank-feed-test-key"
                  value={testApiKey}
                  onChange={(e) => setTestApiKey(e.target.value)}
                  placeholder="bfk_..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={sendTestWebhook} disabled={working || !canManage}>
                    {lt('Send Test Webhook')}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">{lt('curl example')}</div>
                <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {curlSnippet}
                </pre>
              </div>

              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {lt('Payload must include')}{' '}
                <span className="font-mono">tenant_id</span>, <span className="font-mono">bank_account_id</span>, <span className="font-mono">provider</span>, {lt('and')}{' '}
                <span className="font-mono">transactions</span>.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
