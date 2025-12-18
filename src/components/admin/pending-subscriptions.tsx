'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Database } from '@/types/database.types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Pending = Database['public']['Tables']['pending_subscriptions']['Row']

export function PendingSubscriptionsAdmin() {
  const t = useTranslations('admin')
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(true)
  const [expiring, setExpiring] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pending_subscriptions')
      .select('*')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
    if (!error) setPending(data || [])
    setLoading(false)
  }, [supabase])

  const checkAuthAndFetch = useCallback(async () => {
    // Check current user and membership role
    try {
      const { data: userData } = await supabase.auth.getUser()
      const user = (userData as { user?: { id?: string } } | null)?.user
      if (!user) {
        setIsAuthorized(false)
        setLoading(false)
        return
      }

      const { data: memberships } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id as string)
        .eq('is_active', true)

      const isSuper = (memberships || []).some((m: { role?: string }) => m.role === 'SUPER_ADMIN')
      setIsAuthorized(isSuper)
      if (isSuper) await fetchPending()
      else setLoading(false)
    } catch (e) {
      console.error('Auth check failed', e)
      setIsAuthorized(false)
      setLoading(false)
    }
  }, [supabase, fetchPending])

  
  useEffect(() => {
    checkAuthAndFetch()
  }, [checkAuthAndFetch])

  async function expire(id: string) {
    setExpiring(id)
    const res = await fetch('/api/admin/pending-subscriptions/expire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    if (res.ok) {
      toast.success('Pending subscription expired')
      fetchPending()
    } else {
      toast.error('Failed to expire')
    }
    setExpiring(null)
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  if (isAuthorized === false) return <div className="p-6 text-gray-600">{t('unauthorized') || 'You are not authorized to view this page.'}</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tabs.pending') || 'Pending Subscriptions'}</CardTitle>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <div className="text-gray-500">No active pending subscriptions.</div>
        ) : (
          <div className="space-y-4">
            {pending.map(p => (
              <div key={p.id} className="border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-blue-900">{p.email}</div>
                  <div className="text-xs text-gray-500">Plan: {p.plan_id} | Interval: {p.interval}</div>
                  <div className="text-xs text-gray-400">Created: {new Date(p.created_at).toLocaleString()}</div>
                  <div className="text-xs text-gray-400">Expires: {new Date(p.expires_at).toLocaleString()}</div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => expire(p.id)} disabled={expiring===p.id}>
                  <Trash2 className="w-4 h-4" />
                  {expiring===p.id && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
