import type { SupabaseClient } from '@supabase/supabase-js'

export type AiPurpose =
  | 'TRANSLATION'
  | 'CHATBOT'
  | 'MARKETING'
  | 'DOCUMENT_PROCESSING'
  | 'TRANSACTION_CATEGORIZATION'
  | 'BANK_RECONCILIATION'

const DEFAULT_PROVIDER_SETTING_KEY = 'ai_default_provider'

async function resolveSystemSettingDefaultAiProviderId(supabase: any): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', DEFAULT_PROVIDER_SETTING_KEY)
      .maybeSingle()

    if (error) return null
    const id = (data as any)?.setting_value?.ai_provider_id
    return typeof id === 'string' && id.trim() ? id : null
  } catch {
    return null
  }
}

async function resolvePlatformDefaultAiProvider(supabase: any) {
  // 1) Explicit platform default provider (preferred)
  const configuredId = await resolveSystemSettingDefaultAiProviderId(supabase)
  if (configuredId) {
    const { data: configuredById, error: byIdErr } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('id', configuredId)
      .eq('is_active', true)
      .maybeSingle()

    if (!byIdErr && configuredById) return configuredById
  }

  // 2) Backward-compatible fallback: provider marked default in config
  const { data: configuredDefaultProvider, error: defaultErr } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .eq('config->>is_default', 'true')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (defaultErr) throw defaultErr
  if (configuredDefaultProvider) return configuredDefaultProvider

  // 3) Last resort: first active provider
  const { data: firstActiveProvider, error: firstErr } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstErr) throw firstErr
  return firstActiveProvider
}

export async function resolveAiProviderForPurpose(
  supabase: SupabaseClient,
  purpose: AiPurpose
): Promise<any | null> {
  // Try explicit assignment first
  const { data: assignment, error: assignmentErr } = await (supabase as any)
    .from('ai_provider_assignments')
    .select('ai_provider_id, ai_providers(*)')
    .eq('purpose', purpose)
    .maybeSingle()

  // If table isn't deployed yet, or RLS blocks for some reason, fall back.
  if (!assignmentErr) {
    const provider = (assignment as any)?.ai_providers
    if (provider && provider.is_active) return provider
  }

  // Fallback to platform default
  return await resolvePlatformDefaultAiProvider(supabase as any)
}
