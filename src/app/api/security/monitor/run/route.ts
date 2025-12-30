import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// Default monitor config (overridden by system_settings.security_monitoring_config)
const DEFAULT_MONITOR = {
  threshold: 5,
  window_minutes: 10,
  enabled: true
}

export async function POST(req: Request) {
  // Allow monitor run only via internal secret or SUPER_ADMIN interactive call
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
    // Try to read platform config
    let monitorCfg = DEFAULT_MONITOR
    try {
      const { data: cfg } = await svc.from('system_settings').select('setting_value').eq('setting_key', 'security_monitoring_config').single()
      if (cfg?.setting_value) {
        const v = cfg.setting_value as any
        monitorCfg = {
          threshold: Number(v.monitor_threshold ?? v.threshold ?? DEFAULT_MONITOR.threshold),
          window_minutes: Number(v.monitor_window_minutes ?? v.window_minutes ?? DEFAULT_MONITOR.window_minutes),
          enabled: v.monitor_enabled ?? v.enabled ?? DEFAULT_MONITOR.enabled
        }
      }
    } catch (e) {
      // ignore and use defaults
    }

    if (!monitorCfg.enabled) return NextResponse.json({ ok: true, offenders: [] })

    const since = new Date(Date.now() - monitorCfg.window_minutes * 60000).toISOString()
    // event: cross_tenant_block or cross_tenant_attempt
    const { data: events } = await svc
      .from('audit_logs')
      .select('id, user_id, user_email, ip_address, action, new_data, created_at')
      .gte('created_at', since)
      .in('action', ['cross_tenant_block', 'cross_tenant_attempt'])

    const countsByUser: Record<string, number> = {}
    ;(events || []).forEach((e: any) => {
      const uid = e.user_id || (e.new_data && e.new_data.user_id) || 'unknown'
      countsByUser[uid] = (countsByUser[uid] || 0) + 1
    })

    const offenders = Object.entries(countsByUser)
      .filter(([uid, c]) => uid !== 'unknown' && c >= (monitorCfg.threshold || DEFAULT_MONITOR.threshold))
      .map(([uid]) => uid)

    const results: any[] = []
    for (const userId of offenders) {
      // Auto-suspend: mark memberships inactive for the offending user
      const { error } = await svc.from('memberships').update({ is_active: false }).eq('user_id', userId)
      if (error) {
        results.push({ userId, ok: false, error: error.message })
        continue
      }
      await svc.from('audit_logs').insert({ action: 'auto_suspend_by_monitor', resource_type: 'user', resource_id: userId, new_data: { reason: 'rate_limit_security_monitor' } })
      results.push({ userId, ok: true })
    }

    return NextResponse.json({ ok: true, offenders: results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Monitor failed' }, { status: 500 })
  }
}
