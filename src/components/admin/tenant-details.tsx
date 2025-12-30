'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CurrencySelect } from '@/components/ui/currency-select'
import { LocaleSelect } from '@/components/ui/locale-select'
import { toast } from 'sonner'
import { useLiterals } from '@/hooks/use-literals'

export default function TenantDetails({ tenantId, onClose, onSaved }: { tenantId: string; onClose: () => void; onSaved?: () => void }) {
  const lt = useLiterals()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any | null>(null)
  const [aliases, setAliases] = useState<string[]>([])
  const [newAlias, setNewAlias] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/tenants?tenant_id=${encodeURIComponent(tenantId)}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('status.load_failed'))
        const tenant = json.tenant || json
        if (mounted) {
          setForm(tenant)
          // load aliases if provided by API
          if (Array.isArray(json?.aliases)) setAliases(json.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
          else if (Array.isArray(tenant?.aliases)) setAliases(tenant.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
          else setAliases([])
        }
      } catch (e: any) {
        console.error(e)
        toast.error(e?.message || lt('status.load_failed'))
        onClose()
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [tenantId, lt, onClose])

  if (loading || !form) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="bg-white p-6 rounded shadow">{lt('Loading...')}</div>
      </div>
    )
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        tenant_id: form.id || form.tenant_id || tenantId,
        name: form.name,
        locale: form.locale,
        currency: form.currency,
        company_address: form.company_address,
        company_type: form.company_type,
        company_telephone: form.company_telephone,
        company_email: form.company_email,
        shareholders: Array.isArray(form.shareholders) ? form.shareholders : (typeof form.shareholders === 'string' ? form.shareholders.split(',').map((s:string)=>s.trim()).filter(Boolean) : []),
        directors: Array.isArray(form.directors) ? form.directors : (typeof form.directors === 'string' ? form.directors.split(',').map((s:string)=>s.trim()).filter(Boolean) : []),
        year_end_date: form.year_end_date,
        first_year_of_engagement: form.first_year_of_engagement ? Number(form.first_year_of_engagement) : undefined,
        business_registration_number: form.business_registration_number,
        certificate_of_incorporation_number: form.certificate_of_incorporation_number,
        billing_method: form.billing_method,
        first_contact_person: form.first_contact_person,
        first_contact_name: form.first_contact_name,
        first_contact_telephone: form.first_contact_telephone,
        first_contact_mobile: form.first_contact_mobile,
        first_contact_email: form.first_contact_email,
        second_contact_person: form.second_contact_person,
        second_contact_name: form.second_contact_name,
        second_contact_telephone: form.second_contact_telephone,
        second_contact_mobile: form.second_contact_mobile,
        second_contact_email: form.second_contact_email,
        aliases: Array.isArray(aliases) ? aliases : (Array.isArray(form.aliases) ? form.aliases : []),
      }

      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('status.save_failed'))
      // handle alias responses similar to tenant edit modal
      try {
        if (Array.isArray(json?.insertedAliases) && json.insertedAliases.length > 0) {
          setAliases((prev) => {
            const merged = Array.from(new Set([...(prev || []), ...json.insertedAliases.map((a: any) => String(a || '').trim())]))
            return merged
          })
          toast.success(lt('Alias saved to database'))
        } else if (Array.isArray(json?.deletedAliasIds) && json.deletedAliasIds.length > 0) {
          if (Array.isArray(json?.aliases)) setAliases(json.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
          toast.success(lt('Aliases updated'))
        } else {
          toast.success(lt('status.saved'))
        }
      } catch (e) {
        toast.success(lt('status.saved'))
      }

      if (onSaved) onSaved()
      onClose()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || lt('status.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="bg-white w-full max-w-4xl rounded-lg shadow-lg overflow-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold">{form.name}</h3>
            <div className="text-sm text-gray-500">{form.slug}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{lt('Close')}</Button>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <Card>
              <CardHeader>
                <CardTitle>{lt('Company Profile')}</CardTitle>
              </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                <section aria-labelledby="company-info">
                  <h4 id="company-info" className="text-sm font-medium text-gray-700">{lt('Company Info')}</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <Label>{lt('Company Name')}</Label>
                      <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Company Type')}</Label>
                      <select className="w-full px-3 py-2 border rounded-md" value={form.company_type || ''} onChange={e => set('company_type', e.target.value)}>
                        <option value="">--</option>
                        <option value="Limited Company">Limited Company</option>
                        <option value="Sole proprietor">Sole proprietor</option>
                        <option value="Partnership">Partnership</option>
                      </select>
                    </div>
                    <div>
                      <Label>{lt('Locale / Region')}</Label>
                      <LocaleSelect value={form.locale || 'en-US'} onChange={(v) => set('locale', v)} />
                    </div>
                    <div>
                      <Label>{lt('Base Currency')}</Label>
                      <CurrencySelect value={form.currency || 'USD'} onChange={(v) => set('currency', v)} />
                    </div>
                    <div className="col-span-2">
                      <Label>{lt('Company Address')}</Label>
                      <Textarea value={form.company_address || ''} onChange={e => set('company_address', e.target.value)} rows={3} />
                    </div>
                    <div>
                      <Label>{lt('Company Telephone')}</Label>
                      <Input value={form.company_telephone || ''} onChange={e => set('company_telephone', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Company Email')}</Label>
                      <Input value={form.company_email || ''} onChange={e => set('company_email', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label>{lt('Alternate Company Names')}</Label>
                      <p className="text-xs text-gray-500 mb-2">{lt('Add alternate or localized company names to help AI matching.')}</p>
                      <div className="flex gap-2">
                        <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder={lt('Add alternate name')} />
                        <Button type="button" onClick={() => {
                          const v = String(newAlias || '').trim()
                          if (!v) return
                          if (!aliases.includes(v)) setAliases(prev => [...prev, v])
                          setNewAlias('')
                        }}>{lt('Add')}</Button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {aliases.map((a, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="text-sm truncate">{a}</div>
                            <Button size="sm" variant="ghost" onClick={() => setAliases(prev => prev.filter(x => x !== a))}>{lt('Remove')}</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="registry-financial">
                  <h4 id="registry-financial" className="text-sm font-medium text-gray-700">{lt('Registry & Financial')}</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <Label>{lt('Business Registration (BR) Number')}</Label>
                      <Input value={form.business_registration_number || ''} onChange={e => set('business_registration_number', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Certificate of Incorporation (CI) Number')}</Label>
                      <Input value={form.certificate_of_incorporation_number || ''} onChange={e => set('certificate_of_incorporation_number', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Year End Date')}</Label>
                      <Input type="date" value={form.year_end_date || ''} onChange={e => set('year_end_date', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('First Year of Engagement')}</Label>
                      <Input type="number" value={form.first_year_of_engagement || ''} onChange={e => set('first_year_of_engagement', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label>{lt('Billing Method')}</Label>
                      <Input value={form.billing_method || ''} onChange={e => set('billing_method', e.target.value)} />
                    </div>
                  </div>
                </section>

                <section aria-labelledby="people">
                  <h4 id="people" className="text-sm font-medium text-gray-700">{lt('People')}</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>{lt('Shareholders (comma separated)')}</Label>
                      <Input value={(form.shareholders || []).join ? (form.shareholders || []).join(', ') : (form.shareholders || '')} onChange={e => set('shareholders', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label>{lt('Directors (comma separated)')}</Label>
                      <Input value={(form.directors || []).join ? (form.directors || []).join(', ') : (form.directors || '')} onChange={e => set('directors', e.target.value)} />
                    </div>
                  </div>
                </section>

                <section aria-labelledby="contacts">
                  <h4 id="contacts" className="text-sm font-medium text-gray-700">{lt('Primary Contacts')}</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <Label>{lt('First Contact Name')}</Label>
                      <Input value={form.first_contact_name || ''} onChange={e => set('first_contact_name', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('First Contact Telephone')}</Label>
                      <Input value={form.first_contact_telephone || ''} onChange={e => set('first_contact_telephone', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('First Contact Mobile')}</Label>
                      <Input value={form.first_contact_mobile || ''} onChange={e => set('first_contact_mobile', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('First Contact Email')}</Label>
                      <Input value={form.first_contact_email || ''} onChange={e => set('first_contact_email', e.target.value)} />
                    </div>

                    <div>
                      <Label>{lt('Second Contact Name')}</Label>
                      <Input value={form.second_contact_name || ''} onChange={e => set('second_contact_name', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Second Contact Telephone')}</Label>
                      <Input value={form.second_contact_telephone || ''} onChange={e => set('second_contact_telephone', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Second Contact Mobile')}</Label>
                      <Input value={form.second_contact_mobile || ''} onChange={e => set('second_contact_mobile', e.target.value)} />
                    </div>
                    <div>
                      <Label>{lt('Second Contact Email')}</Label>
                      <Input value={form.second_contact_email || ''} onChange={e => set('second_contact_email', e.target.value)} />
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} type="button">{lt('Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving} type="button">
              {saving ? lt('Saving...') : lt('Save Changes')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
