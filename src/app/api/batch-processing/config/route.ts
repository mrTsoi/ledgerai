import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type SystemBatchConfig = {
  default_batch_size: number
  max_batch_size: number
}

type TenantBatchConfig = {
  batch_size: number
}

const DEFAULT_SYSTEM_CONFIG: SystemBatchConfig = { default_batch_size: 10, max_batch_size: 50 }

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  // Fetch system config
  const { data: systemData, error: systemError } = await (supabase.from('system_settings') as any)
    .select('setting_value')
    .eq('setting_key', 'batch_processing_config')
    .maybeSingle()

  if (systemError && systemError.code !== 'PGRST116') {
    return NextResponse.json({ error: systemError.message, code: systemError.code }, { status: 400 })
  }

  const systemConfig: SystemBatchConfig =
    (systemData?.setting_value as SystemBatchConfig) || DEFAULT_SYSTEM_CONFIG

  // Fetch tenant override
  const { data: tenantData, error: tenantError } = await (supabase.from('tenant_settings') as any)
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'batch_processing_config')
    .maybeSingle()

  if (tenantError && tenantError.code !== 'PGRST116') {
    return NextResponse.json({ error: tenantError.message, code: tenantError.code }, { status: 400 })
  }

  const tenantConfig = (tenantData?.setting_value as TenantBatchConfig | undefined) || null

  return NextResponse.json({ system_config: systemConfig, tenant_config: tenantConfig })
}
