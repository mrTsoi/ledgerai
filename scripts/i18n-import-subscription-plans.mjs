import 'dotenv/config'

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

function parseArgs(argv) {
  const args = { dryRun: false, includeInactive: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    if (a === '--only-active') args.includeInactive = false
  }
  return args
}

async function upsertEnglishBase(supabase, texts) {
  const rows = Array.from(new Set(texts))
    .map((t) => String(t ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({
      locale: 'en',
      namespace: 'literals',
      key: literalKeyFromText(text),
      value: text,
    }))

  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('app_translations').upsert(batch, { onConflict: 'locale,namespace,key' })
    if (error) throw error
  }

  return rows.length
}

async function main() {
  const { dryRun, includeInactive } = parseArgs(process.argv.slice(2))

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in environment.')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let query = supabase.from('subscription_plans').select('name,description,is_active')
  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error

  const texts = []
  for (const row of data || []) {
    if (row?.name) texts.push(row.name)
    if (row?.description) texts.push(row.description)
  }

  const unique = Array.from(new Set(texts.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)))
  console.log(`Found ${unique.length} unique plan strings (name/description).`)

  if (dryRun) {
    console.log('Dry run enabled; not writing to DB.')
    process.exit(0)
  }

  if (unique.length === 0) {
    console.log('Nothing to import.')
    process.exit(0)
  }

  const inserted = await upsertEnglishBase(supabase, unique)
  console.log(`Upserted ${inserted} English base strings into app_translations (namespace=literals).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
