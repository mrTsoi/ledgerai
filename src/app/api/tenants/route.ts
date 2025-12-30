import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: Request) {
  // Create tenant
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    name?: string; slug?: string; locale?: string; currency?: string;
    company_address?: string; company_type?: string; company_telephone?: string; company_email?: string;
    shareholders?: string[]; directors?: string[]; year_end_date?: string; first_year_of_engagement?: number;
    business_registration_number?: string; certificate_of_incorporation_number?: string; billing_method?: string;
    first_contact_person?: string; first_contact_name?: string; first_contact_telephone?: string; first_contact_mobile?: string; first_contact_email?: string;
    second_contact_person?: string; second_contact_name?: string; second_contact_telephone?: string; second_contact_mobile?: string; second_contact_email?: string;
  }
  try {
    body = (await req.json()) as unknown as { name?: string; slug?: string; locale?: string; currency?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  const name = (body?.name || '').trim()
  const slug = (body?.slug || '').trim()
  const locale = (body?.locale || 'en').trim()
  const currencyRaw = (body?.currency || '').trim()
  const currency = currencyRaw ? currencyRaw.toUpperCase() : undefined

  if (!name) return badRequest('name is required')
  if (!slug) return badRequest('slug is required')
  if (currency && !/^[A-Z]{3}$/.test(currency)) return badRequest('currency must be a 3-letter ISO code')

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name,
      slug,
      locale,
      ...(currency ? { currency } : {}),
      owner_id: user.id,
      is_active: true,
      company_address: body.company_address,
      company_type: body.company_type,
      company_telephone: body.company_telephone,
      company_email: body.company_email,
      shareholders: body.shareholders,
      directors: body.directors,
      year_end_date: body.year_end_date,
      first_year_of_engagement: body.first_year_of_engagement,
      business_registration_number: body.business_registration_number,
      certificate_of_incorporation_number: body.certificate_of_incorporation_number,
      billing_method: body.billing_method,
      first_contact_person: body.first_contact_person,
      first_contact_name: body.first_contact_name,
      first_contact_telephone: body.first_contact_telephone,
      first_contact_mobile: body.first_contact_mobile,
      first_contact_email: body.first_contact_email,
      second_contact_person: body.second_contact_person,
      second_contact_name: body.second_contact_name,
      second_contact_telephone: body.second_contact_telephone,
      second_contact_mobile: body.second_contact_mobile,
      second_contact_email: body.second_contact_email,
    })
    .select()
    .single()

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 400 })

  // Some schemas rely on triggers to create memberships; but if not present, ensure membership exists.
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ tenant_id: tenant?.id, user_id: user.id, role: 'COMPANY_ADMIN', is_active: true })
    .select()
    .maybeSingle()

  // Ignore duplicate/trigger-created membership errors.
  if (membershipError && !String(membershipError.message || '').toLowerCase().includes('duplicate')) {
    // best-effort: do not fail tenant creation if membership insert fails
  }

  return NextResponse.json({ tenant })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle()
    const { data: aliases } = await supabase
      .from('tenant_identifiers')
      .select('identifier_value,identifier_type')
      .eq('tenant_id', tenantId)
      .in('identifier_type', ['NAME_ALIAS'])

    const aliasValues = Array.isArray(aliases) ? aliases.map((r: any) => String(r.identifier_value || '').trim()).filter(Boolean) : []
    return NextResponse.json({ tenant, aliases: aliasValues })
  } catch (e) {
    return NextResponse.json({ error: 'failed to load tenant' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  // Update tenant (name/locale/currency)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    tenant_id?: string; name?: string; locale?: string; currency?: string; aliases?: string[];
    company_address?: string; company_type?: string; company_telephone?: string; company_email?: string;
    shareholders?: string[]; directors?: string[]; year_end_date?: string; first_year_of_engagement?: number;
    business_registration_number?: string; certificate_of_incorporation_number?: string; billing_method?: string;
    first_contact_person?: string; first_contact_name?: string; first_contact_telephone?: string; first_contact_mobile?: string; first_contact_email?: string;
    second_contact_person?: string; second_contact_name?: string; second_contact_telephone?: string; second_contact_mobile?: string; second_contact_email?: string;
  }
  try {
    body = (await req.json()) as unknown as typeof body
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body?.tenant_id) return badRequest('tenant_id is required')

  const payload: Record<string, any> = {}
  if (typeof body?.name === 'string') payload.name = body.name
  if (typeof body?.locale === 'string') payload.locale = body.locale
  if (typeof body?.currency === 'string') payload.currency = body.currency
  if (typeof body?.company_address === 'string') payload.company_address = body.company_address
  if (typeof body?.company_type === 'string') payload.company_type = body.company_type
  if (typeof body?.company_telephone === 'string') payload.company_telephone = body.company_telephone
  if (typeof body?.company_email === 'string') payload.company_email = body.company_email
  if (Array.isArray(body?.shareholders)) payload.shareholders = body.shareholders
  if (Array.isArray(body?.directors)) payload.directors = body.directors
  if (typeof body?.year_end_date === 'string') payload.year_end_date = body.year_end_date
  if (typeof body?.first_year_of_engagement === 'number') payload.first_year_of_engagement = body.first_year_of_engagement
  if (typeof body?.business_registration_number === 'string') payload.business_registration_number = body.business_registration_number
  if (typeof body?.certificate_of_incorporation_number === 'string') payload.certificate_of_incorporation_number = body.certificate_of_incorporation_number
  if (typeof body?.billing_method === 'string') payload.billing_method = body.billing_method
  if (typeof body?.first_contact_person === 'string') payload.first_contact_person = body.first_contact_person
  if (typeof body?.first_contact_name === 'string') payload.first_contact_name = body.first_contact_name
  if (typeof body?.first_contact_telephone === 'string') payload.first_contact_telephone = body.first_contact_telephone
  if (typeof body?.first_contact_mobile === 'string') payload.first_contact_mobile = body.first_contact_mobile
  if (typeof body?.first_contact_email === 'string') payload.first_contact_email = body.first_contact_email
  if (typeof body?.second_contact_person === 'string') payload.second_contact_person = body.second_contact_person
  if (typeof body?.second_contact_name === 'string') payload.second_contact_name = body.second_contact_name
  if (typeof body?.second_contact_telephone === 'string') payload.second_contact_telephone = body.second_contact_telephone
  if (typeof body?.second_contact_mobile === 'string') payload.second_contact_mobile = body.second_contact_mobile
  if (typeof body?.second_contact_email === 'string') payload.second_contact_email = body.second_contact_email

  const { error } = await supabase.from('tenants').update(payload).eq('id', body.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Persist aliases if provided: upsert tenant_identifiers of type 'ALIAS'
  try {
    const incoming = Array.isArray(body.aliases) ? body.aliases.map(a => String(a || '').trim()).filter(Boolean) : []

    if (incoming.length > 0) {
      // Fetch existing identifiers for this tenant (NAME/ALIAS)
      const { data: existing } = await supabase
        .from('tenant_identifiers')
        .select('id, identifier_value, identifier_type')
        .eq('tenant_id', body.tenant_id)
        .in('identifier_type', ['NAME_ALIAS'])

      const existingRows = Array.isArray(existing) ? existing : []
      const existingValues = existingRows.map((r: any) => String(r.identifier_value || '').trim())

      // Insert any new aliases not already present
      const toInsert = incoming.filter(a => !existingValues.includes(a)).map(a => ({
        tenant_id: body.tenant_id,
        identifier_type: 'NAME_ALIAS',
        identifier_value: a,
      }))

      let insertedRows: any[] = []
      if (toInsert.length > 0) {
        const { data: inserted, error: insertErr } = await supabase.from('tenant_identifiers').insert(toInsert).select('id,identifier_value')
        if (insertErr) console.warn('Failed inserting aliases:', insertErr)
        insertedRows = Array.isArray(inserted) ? inserted : []
      }

      // Optionally remove aliases that were removed by the user: remove existing rows of type ALIAS not in incoming
      const existingAliasRows = existingRows.filter((r: any) => String(r.identifier_type || '').toUpperCase() === 'NAME_ALIAS')
      const toDelete = existingAliasRows.filter((r: any) => !incoming.includes(String(r.identifier_value || '').trim()))
      let deletedIds: any[] = []
      if (toDelete.length > 0) {
        const ids = toDelete.map((r: any) => r.id).filter(Boolean)
        if (ids.length > 0) {
          const { data: delData, error: delErr } = await supabase.from('tenant_identifiers').delete().in('id', ids).select('id')
          if (delErr) console.warn('Failed deleting aliases:', delErr)
          deletedIds = Array.isArray(delData) ? delData.map((d: any) => d.id) : []
        }
      }
      // Return details of what changed
      return NextResponse.json({ ok: true, insertedAliases: insertedRows.map(r => r.identifier_value), deletedAliasIds: deletedIds })
    } else {
      // If incoming is empty, remove existing ALIAS rows (user cleared aliases)
      const { data: existing2 } = await supabase
        .from('tenant_identifiers')
        .select('id')
        .eq('tenant_id', body.tenant_id)
        .eq('identifier_type', 'NAME_ALIAS')

      const rows2 = Array.isArray(existing2) ? existing2 : []
      const ids2 = rows2.map((r: any) => r.id).filter(Boolean)
      let deletedIds2: any[] = []
      if (ids2.length > 0) {
        const { data: del2, error: del2Err } = await supabase.from('tenant_identifiers').delete().in('id', ids2).select('id')
        if (del2Err) console.warn('Failed deleting aliases:', del2Err)
        deletedIds2 = Array.isArray(del2) ? del2.map((d: any) => d.id) : []
      }
      return NextResponse.json({ ok: true, deletedAliasIds: deletedIds2 })
    }
  } catch (e) {
    // Non-fatal: log and continue
    console.warn('Failed to persist tenant aliases:', e)
  }

  // Return updated tenant and alias list so clients can update UI without additional reads
  try {
    const { data: updatedTenant } = await supabase.from('tenants').select('*').eq('id', body.tenant_id).maybeSingle()
    const { data: finalAliases } = await supabase
      .from('tenant_identifiers')
      .select('identifier_value')
      .eq('tenant_id', body.tenant_id)
      .in('identifier_type', ['NAME_ALIAS'])

    const aliasValues = Array.isArray(finalAliases) ? finalAliases.map((r: any) => String(r.identifier_value || '').trim()).filter(Boolean) : []
    return NextResponse.json({ ok: true, tenant: updatedTenant, aliases: aliasValues })
  } catch (e) {
    return NextResponse.json({ ok: true })
  }
}
