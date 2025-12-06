import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AIReconciliationService } from '@/lib/ai/reconciliation-service'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { bankTransaction, candidates, tenantId } = body

    if (!bankTransaction || !candidates || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const matches = await AIReconciliationService.findMatches(bankTransaction, candidates, tenantId)

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Reconciliation API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
