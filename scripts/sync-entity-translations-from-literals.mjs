import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Prefer Next.js-style local env file for scripts.
// Falls back to `.env` if `.env.local` is not present.
const envLocalPath = path.join(process.cwd(), '.env.local')
const envPath = path.join(process.cwd(), '.env')
dotenv.config({ path: fs.existsSync(envLocalPath) ? envLocalPath : envPath })

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

function parseArgs(argv) {
  const args = {
    tenantId: '',
    allTenants: false,
    table: 'chart_of_accounts',
    entityType: 'chart_of_accounts',
    fields: ['name', 'description'],
    locales: ['zh-CN', 'zh-HK'],
    dryRun: false,
    limit: 5000,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tenant-id') args.tenantId = String(argv[i + 1] ?? '')
    if (a === '--all-tenants' || a === '--all-tenents') args.allTenants = true
    if (a === '--table') args.table = String(argv[i + 1] ?? args.table)
    if (a === '--entity-type') args.entityType = String(argv[i + 1] ?? args.entityType)
    if (a === '--fields') args.fields = String(argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (a === '--locales') args.locales = String(argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (a === '--limit') args.limit = Math.max(1, Math.min(50000, Number(argv[i + 1] ?? args.limit)))
    if (a === '--dry-run') args.dryRun = true
  }

  return args
}

async function fetchAllTenantIds(supabase) {
  const ids = []
  const pageSize = 1000
  let offset = 0

  for (;;) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const rows = data || []
    for (const r of rows) {
      if (r?.id) ids.push(r.id)
    }

    if (rows.length < pageSize) break
    offset += pageSize
  }

  return ids
}

async function fetchEntities(supabase, { table, tenantId, fields, limit }) {
  const selectCols = ['id', 'tenant_id', ...fields].join(',')
  const { data, error } = await supabase
    .from(table)
    .select(selectCols)
    .eq('tenant_id', tenantId)
    .limit(limit)

  if (error) throw error
  return data || []
}

async function fetchTranslationsByLocale(supabase, { locale, keys }) {
  if (!keys.length) return new Map()

  const map = new Map()
  const batchSize = 1000

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    const { data, error } = await supabase
      .from('app_translations')
      .select('key,value')
      .eq('locale', locale)
      .eq('namespace', 'literals')
      .in('key', batch)

    if (error) throw error

    for (const row of data || []) {
      if (row?.key && typeof row.value === 'string') {
        map.set(row.key, row.value)
      }
    }
  }

  return map
}

async function upsertEntityTranslations(supabase, rows) {
  if (!rows.length) return 0

  const batchSize = 500
  let total = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('entity_translations')
      .upsert(batch, { onConflict: 'tenant_id,entity_type,entity_id,field,locale' })

    if (error) throw error
    total += batch.length
  }

  return total
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const tenantIds = args.allTenants ? await fetchAllTenantIds(supabase) : [args.tenantId].filter(Boolean)
  if (tenantIds.length === 0) {
    console.error('Missing required --tenant-id <uuid> (or pass --all-tenants)')
    process.exit(1)
  }

  let totalWritten = 0
  let totalCandidates = 0

  for (const tenantId of tenantIds) {
    const entities = await fetchEntities(supabase, {
      table: args.table,
      tenantId,
      fields: args.fields,
      limit: args.limit,
    })

    const keyByText = new Map()
    const neededKeys = new Set()

    for (const entity of entities) {
      for (const field of args.fields) {
        const text = String(entity?.[field] ?? '').replace(/\s+/g, ' ').trim()
        if (!text) continue
        const key2 = literalKeyFromText(text)
        keyByText.set(text, key2)
        neededKeys.add(key2)
      }
    }

    const keys = Array.from(neededKeys)

    const translationsByLocale = new Map()
    for (const locale of args.locales) {
      if (!locale || locale === 'en') continue
      const map = await fetchTranslationsByLocale(supabase, { locale, keys })
      translationsByLocale.set(locale, map)
    }

    const upserts = []
    const foundByLocale = {}
    for (const locale of args.locales) foundByLocale[locale] = 0

    for (const entity of entities) {
      for (const field of args.fields) {
        const sourceText = String(entity?.[field] ?? '').replace(/\s+/g, ' ').trim()
        if (!sourceText) continue
        const litKey = keyByText.get(sourceText)
        if (!litKey) continue

        for (const locale of args.locales) {
          if (!locale || locale === 'en') continue
          const map = translationsByLocale.get(locale)
          const translated = map?.get(litKey)
          if (!translated || !String(translated).trim()) continue

          foundByLocale[locale] = (foundByLocale[locale] || 0) + 1

          upserts.push({
            tenant_id: tenantId,
            entity_type: args.entityType,
            entity_id: entity.id,
            field,
            locale,
            value: translated,
          })
        }
      }
    }

    const uniqueKey = (r) => `${r.tenant_id}::${r.entity_type}::${r.entity_id}::${r.field}::${r.locale}`
    const deduped = Array.from(new Map(upserts.map((r) => [uniqueKey(r), r])).values())

    console.log('---')
    console.log(`Tenant: ${tenantId}`)
    console.log(`Entity: ${args.entityType} (table=${args.table})`)
    console.log(`Fields: ${args.fields.join(', ')}`)
    console.log(`Locales: ${args.locales.join(', ')}`)
    console.log(`Scanned entities: ${entities.length}`)
    console.log(`Candidate literal keys: ${keys.length}`)
    for (const locale of args.locales) {
      if (!locale || locale === 'en') continue
      console.log(`Found translations for ${locale}: ${foundByLocale[locale] || 0}`)
    }
    console.log(`Upsert rows (deduped): ${deduped.length}`)

    totalCandidates += deduped.length

    if (args.dryRun) {
      continue
    }

    const written = await upsertEntityTranslations(supabase, deduped)
    totalWritten += written
  }

  console.log('===')
  console.log(`Tenants processed: ${tenantIds.length}`)
  console.log(`Total candidate rows: ${totalCandidates}`)
  if (args.dryRun) {
    console.log('Dry run enabled; not writing to entity_translations.')
  } else {
    console.log(`Total upserted rows: ${totalWritten}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
