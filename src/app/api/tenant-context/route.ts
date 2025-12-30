import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function isLocalHostname(hostname: string) {
  const h = (hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')
}

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membershipData, error: membershipError } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', user.id)

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  const activeMemberships = (membershipData || []).filter((m: any) => m?.is_active !== false)

  const { data: isSuperAdminRaw } = await (supabase as any).rpc('is_super_admin')
  const isSuperAdmin = isSuperAdminRaw === true

  let tenants: any[] = []
  if (isSuperAdmin) {
    const { data, error } = await supabase.from('tenants').select('*').order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    tenants = data || []
  } else {
    const tenantIds = (activeMemberships || [])
      .map((m: any) => m?.tenant_id)
      .filter((id: any) => typeof id === 'string' && id.length > 0)

    if (tenantIds.length > 0) {
      const { data, error } = await supabase.from('tenants').select('*').in('id', tenantIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      tenants = data || []
    }
  }

  // Optional: resolve verified custom-domain mapping.
  const url = new URL(req.url)
  const hostname = url.searchParams.get('hostname')
  let mapped_tenant_id: string | null = null

  if (hostname && !isLocalHostname(hostname)) {
    const { data: domainRow, error: domainError } = await supabase
      .from('tenant_domains')
      .select('tenant_id, verified_at')
      .eq('domain', hostname)
      .maybeSingle()

    if (!domainError) {
      const verifiedAt = (domainRow as { verified_at?: string } | null)?.verified_at as string | null | undefined
      const tenantId = (domainRow as { tenant_id?: string } | null)?.tenant_id as string | undefined

      if (verifiedAt && tenantId) {
        const allowed = isSuperAdmin || tenants.some((t: any) => t?.id === tenantId)
        if (allowed) mapped_tenant_id = tenantId
      }
    }
  }

  return NextResponse.json({
    tenants,
    memberships: activeMemberships,
    isSuperAdmin,
    mapped_tenant_id,
  })
}
