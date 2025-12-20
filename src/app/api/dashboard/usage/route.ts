import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function okEmpty(tenantId: string, startIso: string, endIso: string, warning?: string) {
  return NextResponse.json({
    tenant_id: tenantId,
    start: startIso,
    end: endIso,
    ...(warning ? { warning } : {}),
    usage: {
      total_calls: 0,
      success_calls: 0,
      error_calls: 0,
      tokens_input: 0,
      tokens_output: 0,
    },
  })
}

function isValidDate(d: Date) {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')

  if (!tenantId) return badRequest('tenant_id is required')

  const now = new Date()
  const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = end ? new Date(end) : new Date(now.getFullYear(), now.getMonth() + 1, 1)

  if (!isValidDate(startDate)) return badRequest('Invalid start date')
  if (!isValidDate(endDate)) return badRequest('Invalid end date')

  const startIso = startDate.toISOString()
  const endIso = endDate.toISOString()

  let data: any
  try {
    const res = await (supabase as any).rpc('get_tenant_ai_usage_summary', {
      p_tenant_id: tenantId,
      p_start: startIso,
      p_end: endIso,
    })

    if (res.error) {
      const code = String(res.error.code || '')
      if (code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Don't break the dashboard if usage infrastructure isn't present or errors in local/dev.
      // Keep auth/forbidden as errors, but otherwise degrade gracefully.
      const warning = [
        'Usage not available',
        code ? `code=${code}` : null,
        res.error.message ? `message=${res.error.message}` : null,
      ]
        .filter(Boolean)
        .join(' ')

      return okEmpty(tenantId, startIso, endIso, warning)
    }

    data = Array.isArray(res.data) ? res.data[0] : res.data
  } catch (e: any) {
    const warning = ['Usage not available', e?.message ? `message=${e.message}` : null]
      .filter(Boolean)
      .join(' ')
    return okEmpty(tenantId, startIso, endIso, warning)
  }

  return NextResponse.json({
    tenant_id: tenantId,
    start: startIso,
    end: endIso,
    usage: {
      total_calls: Number(data?.total_calls ?? 0),
      success_calls: Number(data?.success_calls ?? 0),
      error_calls: Number(data?.error_calls ?? 0),
      tokens_input: Number(data?.tokens_input ?? 0),
      tokens_output: Number(data?.tokens_output ?? 0),
    },
  })
}
