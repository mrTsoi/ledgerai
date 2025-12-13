'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
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
  name: string | null
}

export function BankFeedIntegration() {
  const { currentTenant } = useTenant()
  const userRole = useUserRole()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

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
    return msg.includes('relation') && msg.includes('does not exist')
  }

  const isPlaidNotConfigured = (e: any) => {
    const msg = String(e?.message || '').toLowerCase()
    return msg.includes('plaid_client_id') || msg.includes('plaid_secret')
  }

  const fetchConnection = useCallback(async () => {
    if (!tenantId) return

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
        setPlaidUiMessage('Bank feed tables are not installed yet.')
        return
      }

      setConnection(null)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId])

  const fetchWebhookKey = useCallback(async () => {
    if (!tenantId || !canManage) return

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
  }, [supabase, tenantId, canManage])

  const fetchLinkToken = useCallback(async () => {
    if (!tenantId) return

    try {
      const res = await fetch('/api/bank-feeds/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to create link token')

      setLinkToken(json.link_token)
      setPlaidConfigured(true)
      setPlaidUiMessage(null)
    } catch (e: any) {
      if (isPlaidNotConfigured(e)) {
        setPlaidConfigured(false)
        setPlaidUiMessage('Plaid is not configured for this environment.')
        return
      }

      setPlaidConfigured(null)
      setPlaidUiMessage(e?.message || 'Failed to start Plaid connection')
    }
  }, [tenantId])

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

    try {
      const { data, error } = await (supabase.from('bank_accounts') as any)
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (error) throw error
      setTestAccount((data?.[0] as any) || null)
    } catch (e: any) {
      console.error('Error fetching bank accounts for webhook test:', e)
      setTestAccount(null)
    }
  }, [supabase, tenantId, canManage])

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
        if (!res.ok) throw new Error(json?.error || 'Failed to connect')

        toast.success('Bank feed connected')
        await fetchConnection()
      } catch (e: any) {
        toast.error(e.message || 'Failed to connect bank feed')
      } finally {
        setWorking(false)
      }
    },
    [tenantId, fetchConnection]
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  })

  const startPlaidConnect = async () => {
    if (!tenantId || !canManage) return

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

    try {
      setWorking(true)
      const res = await fetch('/api/bank-feeds/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, connection_id: connection?.id }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Sync failed')

      toast.success(`Synced. Inserted ${json.inserted ?? 0} transactions.`)
      await fetchConnection()
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync transactions')
    } finally {
      setWorking(false)
    }
  }

  const rotateWebhookKey = async () => {
    if (!tenantId) return

    try {
      setWorking(true)
      setGeneratedWebhookKey(null)

      const res = await fetch('/api/bank-feeds/api-key/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to rotate key')

      setGeneratedWebhookKey(json.api_key)
      toast.success('Webhook API key rotated')
      await fetchWebhookKey()
    } catch (e: any) {
      toast.error(e.message || 'Failed to rotate webhook key')
    } finally {
      setWorking(false)
    }
  }

  const copyGeneratedKey = async () => {
    if (!generatedWebhookKey) return

    try {
      await navigator.clipboard.writeText(generatedWebhookKey)
      toast.success('Copied API key')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const sendTestWebhook = async () => {
    if (!tenantId) return
    if (!testApiKey.trim()) {
      toast.error('Enter an API key to test')
      return
    }
    if (!testAccount?.id) {
      toast.error('Create a bank account first')
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
      if (!res.ok) throw new Error(json?.error || 'Webhook test failed')

      toast.success(`Webhook OK. Inserted ${json.inserted ?? 0} transaction(s).`)
    } catch (e: any) {
      toast.error(e.message || 'Webhook test failed')
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bank Feed Integration</CardTitle>
          <CardDescription>Connect Plaid to automatically fetch bank transactions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <div className="text-sm text-muted-foreground">
              Only Company Admins can connect bank feeds.
            </div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : connection ? (
            <div className="space-y-3">
              <div className="text-sm">
                <div>Status: {connection.status}</div>
                {connection.last_synced_at && (
                  <div>Last synced: {new Date(connection.last_synced_at).toLocaleString()}</div>
                )}
                {connection.error_message && (
                  <div className="text-destructive">Error: {connection.error_message}</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={syncNow} disabled={working}>
                  Sync Now
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">No Plaid connection yet.</div>
              {plaidUiMessage ? (
                <div className="text-sm text-muted-foreground">{plaidUiMessage}</div>
              ) : null}
              <Button
                onClick={startPlaidConnect}
                disabled={working || (plaidConfigured === false)}
              >
                Connect Plaid
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Ingestion (Global)</CardTitle>
          <CardDescription>
            Use this when your bank-data provider can push transactions via webhook (works in regions where OAuth connectors don’t).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <div className="text-sm text-muted-foreground">
              Only Company Admins can manage webhook API keys.
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div>
                  Endpoint: <span className="font-mono">/api/banking/webhook</span>
                </div>
                <div>
                  Header: <span className="font-mono">x-ledgerai-tenant-api-key</span>
                </div>
                {webhookKeyRow ? (
                  <div className="text-muted-foreground">
                    Active key prefix: <span className="font-mono">{webhookKeyRow.key_prefix}</span>
                    {webhookKeyRow.last_used_at ? (
                      <> • last used {new Date(webhookKeyRow.last_used_at).toLocaleString()}</>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No webhook key yet.</div>
                )}
                {testAccount?.id ? (
                  <div className="text-muted-foreground">
                    Test bank account: <span className="font-mono">{testAccount.name || testAccount.id}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    Test requires at least one bank account.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={rotateWebhookKey} disabled={working}>
                  {webhookKeyRow ? 'Rotate API Key' : 'Generate API Key'}
                </Button>
                {generatedWebhookKey ? (
                  <Button onClick={copyGeneratedKey} disabled={working}>
                    Copy Key
                  </Button>
                ) : null}
              </div>

              {generatedWebhookKey ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">New API key (shown once)</div>
                  <div className="font-mono break-all">{generatedWebhookKey}</div>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="bank-feed-test-key">API key for test</Label>
                <Input
                  id="bank-feed-test-key"
                  value={testApiKey}
                  onChange={(e) => setTestApiKey(e.target.value)}
                  placeholder="bfk_..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={sendTestWebhook} disabled={working || !canManage}>
                    Send Test Webhook
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">curl example</div>
                <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {curlSnippet}
                </pre>
              </div>

              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Payload must include <span className="font-mono">tenant_id</span>, <span className="font-mono">bank_account_id</span>, <span className="font-mono">provider</span>, and <span className="font-mono">transactions</span>.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
