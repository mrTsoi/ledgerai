import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { tenantIds } = await req.json()
    if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
      return NextResponse.json({ error: 'tenantIds required' }, { status: 400 })
    }

    const supabase = await createClient()

    const result: Record<string, any> = {}
    for (const id of tenantIds) {
      const [docsRes, txRes, bankRes, usersRes] = await Promise.all([
        supabase.from('documents').select('id', { count: 'exact' }).eq('tenant_id', id),
        supabase.from('transactions').select('id', { count: 'exact' }).eq('tenant_id', id),
        supabase.from('bank_accounts').select('id', { count: 'exact' }).eq('tenant_id', id),
        supabase.from('memberships').select('id', { count: 'exact' }).eq('tenant_id', id),
      ])

      result[id] = {
        documents: (docsRes.count as number) || 0,
        transactions: (txRes.count as number) || 0,
        bank_accounts: (bankRes.count as number) || 0,
        users: (usersRes.count as number) || 0,
      }
    }

    return NextResponse.json({ stats: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch stats' }, { status: 500 })
  }
}
