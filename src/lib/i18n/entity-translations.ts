import type { SupabaseClient } from '@supabase/supabase-js'

export type EntityTranslation = {
  entity_id: string
  field: string
  value: string
}

export async function fetchEntityTranslationMap(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    entityType: string
    entityIds: string[]
    locale: string
    fields: string[]
  }
): Promise<Record<string, Record<string, string>>> {
  const { tenantId, entityType, entityIds, locale, fields } = args

  if (!tenantId) return {}
  if (!locale || locale === 'en') return {}
  if (!entityIds?.length) return {}
  if (!fields?.length) return {}

  const { data, error } = await (supabase
    .from('entity_translations' as any)
    .select('entity_id, field, value')
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('locale', locale)
    .in('entity_id', entityIds)
    .in('field', fields) as any)

  if (error || !data) return {}

  const map: Record<string, Record<string, string>> = {}
  for (const row of data as EntityTranslation[]) {
    if (!row?.entity_id || !row?.field) continue
    map[row.entity_id] ||= {}
    map[row.entity_id][row.field] = row.value
  }

  return map
}

export function overlayEntityTranslations<TRow extends { id: string }>(
  rows: TRow[],
  translationMap: Record<string, Record<string, string>>,
  fields: string[]
): TRow[] {
  if (!rows?.length) return rows
  if (!translationMap || Object.keys(translationMap).length === 0) return rows
  if (!fields?.length) return rows

  return rows.map((row) => {
    const overrides = translationMap[row.id]
    if (!overrides) return row

    let changed = false
    const next: any = { ...row }

    for (const field of fields) {
      const translated = overrides[field]
      if (typeof translated === 'string' && translated.length > 0) {
        next[field] = translated
        changed = true
      }
    }

    return changed ? (next as TRow) : row
  })
}
