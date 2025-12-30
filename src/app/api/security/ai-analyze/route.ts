import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Body = {
  since_minutes?: number
  actions?: string[]
}

export async function POST(req: Request) {
  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    // ignore
  }

  // Default and runtime-configurable via system_settings.security_monitoring_config
  let sinceMinutes = Number(body?.since_minutes || 60)
  try {
    const svc = createServiceClient()
    const { data: cfg } = await svc.from('system_settings').select('setting_value').eq('setting_key', 'security_monitoring_config').single()
    if (cfg?.setting_value) {
      const v = cfg.setting_value as any
      if (typeof v.ai_since_minutes !== 'undefined') sinceMinutes = Number(v.ai_since_minutes)
    }
  } catch (e) {
    // ignore and use provided/default
  }

  const since = new Date(Date.now() - sinceMinutes * 60000).toISOString()

  // Allow AI analysis only via internal secret or SUPER_ADMIN
  const internalProvided = req.headers.get('x-internal-security-secret') === process.env.INTERNAL_SECURITY_SECRET
  if (!internalProvided) {
    const supabase = await import('@/lib/supabase/server').then(m => m.createClient())
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: isSuperRaw } = await (supabase as any).rpc('is_super_admin')
    if (isSuperRaw !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let svc: ReturnType<typeof createServiceClient>
  try {
    svc = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 500 })
  }

  try {
    let q = svc.from('audit_logs').select('id, user_id, user_email, ip_address, action, new_data, created_at').gte('created_at', since)
    if (Array.isArray(body.actions) && body.actions.length > 0) q = q.in('action', body.actions)
    const { data: events } = await q.limit(1000)

    // Heuristic analysis by user: count events, unique IPs, suspicious action types
    const byUser: Record<string, { count: number; ips: Set<string>; actions: Record<string, number>; latest?: string }> = {}
    ;(events || []).forEach((e: any) => {
      const uid = e.user_id || (e.user_email ? `email:${e.user_email}` : 'unknown')
      if (!byUser[uid]) byUser[uid] = { count: 0, ips: new Set(), actions: {}, latest: e.created_at }
      byUser[uid].count += 1
      if (e.ip_address) byUser[uid].ips.add(e.ip_address)
      byUser[uid].actions[e.action] = (byUser[uid].actions[e.action] || 0) + 1
      if (!byUser[uid].latest || new Date(e.created_at) > new Date(byUser[uid].latest)) byUser[uid].latest = e.created_at
    })

    const alerts: any[] = []
    // Allow score cutoff to be configured
    let scoreCutoff = 0.4
    try {
      const svc2 = createServiceClient()
      const { data: cfg2 } = await svc2.from('system_settings').select('setting_value').eq('setting_key', 'security_monitoring_config').single()
      if (cfg2?.setting_value) {
        const v2 = cfg2.setting_value as any
        if (typeof v2.ai_score_cutoff !== 'undefined') scoreCutoff = Number(v2.ai_score_cutoff)
      }
    } catch (e) {
      // ignore
    }

    for (const [uid, stats] of Object.entries(byUser)) {
      // Score: base on counts and IP diversity
      let score = 0
      score += Math.min(1, stats.count / 10) * 0.6
      score += Math.min(1, stats.ips.size / 3) * 0.3
      // suspicious actions
      const suspicious = ['cross_tenant_attempt', 'cross_tenant_block', 'failed_login', 'rate_limit']
      const suspCount = suspicious.reduce((s, a) => s + (stats.actions[a] || 0), 0)
      score += Math.min(1, suspCount / 5) * 0.4
      score = Math.min(score, 1)

      if (score >= (scoreCutoff || 0.4)) {
        alerts.push({
          user_id: uid,
          score: Number(score.toFixed(2)),
          count: stats.count,
          unique_ips: stats.ips.size,
          actions: stats.actions,
          latest: stats.latest,
        })
      }
    }

    // Persist an audit entry with assessment summary
    await svc.from('audit_logs').insert({ action: 'ai_risk_assessment', resource_type: 'security', new_data: { since_minutes: sinceMinutes, alerts_count: alerts.length, alerts }, created_at: new Date().toISOString() })

    return NextResponse.json({ ok: true, alerts })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'analysis failed' }, { status: 500 })
  }
}
