'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Edit, Trash2, Check, X, Wand2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PromoCodeManagement } from './promo-code-management'
import { UserSubscriptionList } from './user-subscription-list'
import { StripeSettings } from './stripe-settings'
import { ContactSettings } from './contact-settings'
import { toast } from "sonner"
import { FEATURE_DEFINITIONS, isFeatureEnabled } from '@/lib/subscription/features'
import { useLiterals } from '@/hooks/use-literals'
import { literalKeyFromText } from '@/lib/i18n/literal-key'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

export function SubscriptionManagement() {
  const lt = useLiterals()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [aiBusyPlanIds, setAiBusyPlanIds] = useState<Record<string, boolean>>({})
  const supabase = useMemo(() => createClient(), [])

  const normalizeText = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

  const aiTranslatePlan = useCallback(
    async (plan: SubscriptionPlan) => {
      const planId = String(plan?.id ?? '')
      if (!planId) return

      const rawName = normalizeText(plan?.name)
      const rawDesc = normalizeText(plan?.description)
      const texts = [rawName, rawDesc].filter(Boolean)
      if (texts.length === 0) {
        toast.error(lt('This plan has no name/description to translate.'))
        return
      }

      setAiBusyPlanIds((prev) => ({ ...prev, [planId]: true }))

      try {
        const items = texts.map((text) => ({
          namespace: 'literals',
          key: literalKeyFromText(text),
          sourceValue: text,
        }))

        const keys = Array.from(new Set(items.map((it) => it.key)))
        const targetLocales: Array<'zh-CN' | 'zh-HK'> = ['zh-CN', 'zh-HK']

        // Only translate missing rows (avoid clobbering manual translations)
        const { data: existing, error: existingError } = await (supabase
          .from('app_translations') as any)
          .select('locale,key,value')
          .eq('namespace', 'literals')
          .in('locale', targetLocales)
          .in('key', keys)

        if (existingError) throw existingError

        const existingMap = new Map<string, string>()
        for (const row of (existing || []) as Array<{ locale: string; key: string; value: string }>) {
          const k = `${row.locale}::${row.key}`
          existingMap.set(k, String(row.value ?? '').trim())
        }

        const missingByLocale: Record<string, typeof items> = {}
        for (const loc of targetLocales) {
          missingByLocale[loc] = items.filter((it) => {
            const v = existingMap.get(`${loc}::${it.key}`)
            return !v
          })
        }

        const totalMissing = targetLocales.reduce((acc, loc) => acc + (missingByLocale[loc]?.length || 0), 0)
        if (totalMissing === 0) {
          toast.message(lt('Plan already has translations for zh-CN and zh-HK.'))
          return
        }

        // Ensure English base rows exist (helps future lookups and AI fallback)
        const enRows = items.map((it) => ({
          locale: 'en',
          namespace: 'literals',
          key: it.key,
          value: it.sourceValue,
        }))
        await (supabase.from('app_translations') as any).upsert(enRows, { onConflict: 'locale,namespace,key' })

        let upserted = 0
        for (const targetLocale of targetLocales) {
          const missingItems = missingByLocale[targetLocale]
          if (!missingItems || missingItems.length === 0) continue

          const res = await fetch('/api/admin/translations/ai-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceLocale: 'en',
              targetLocale,
              items: missingItems.map((it) => ({ namespace: it.namespace, key: it.key, sourceValue: it.sourceValue })),
            }),
          })

          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json?.error || lt('AI translation failed'))

          const results = (json?.results || {}) as Record<string, string>
          const rows = missingItems
            .map((it) => {
              const id = `${it.namespace}::${it.key}`
              const translated = normalizeText(results[id])
              return translated
                ? {
                    locale: targetLocale,
                    namespace: 'literals',
                    key: it.key,
                    value: translated,
                  }
                : null
            })
            .filter(Boolean)

          if (rows.length > 0) {
            const { error: upsertError } = await (supabase.from('app_translations') as any).upsert(rows, {
              onConflict: 'locale,namespace,key',
            })
            if (upsertError) throw upsertError
            upserted += rows.length
          }
        }

        toast.success(lt('Saved {count} AI translations. Refresh to see updates.', { count: upserted }))
      } catch (e: any) {
        console.error('AI translate plan failed', e)
        toast.error(lt('Failed to AI translate plan: {message}', { message: e?.message || 'Unknown error' }))
      } finally {
        setAiBusyPlanIds((prev) => ({ ...prev, [planId]: false }))
      }
    },
    [supabase, lt]
  )

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true })

      if (error) throw error
      setPlans(data || [])
    } catch (error) {
      console.error('Error fetching plans:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const handleSave = async (plan: Partial<SubscriptionPlan>) => {
    try {
      // Calculate price_yearly automatically
      if (plan.price_monthly != null) {
        const discount = plan.yearly_discount_percent || 0
        plan.price_yearly = Math.round((plan.price_monthly * 12) * (1 - discount / 100))
      }

      if (editingPlan) {
        const { error } = await (supabase
          .from('subscription_plans') as any)
          .update(plan)
          .eq('id', editingPlan.id)
        if (error) throw error
      } else {
        const { error } = await (supabase
          .from('subscription_plans') as any)
          .insert(plan as any)
        if (error) throw error
      }
      
      setEditingPlan(null)
      setIsCreating(false)
      fetchPlans()
      toast.success(lt('Plan saved successfully'))
    } catch (error: any) {
      console.error('Error saving plan:', error)
      toast.error(lt('Failed to save plan: {message}', { message: error.message }))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(lt('Are you sure? This might affect users on this plan.'))) return
    try {
      const { error } = await (supabase
        .from('subscription_plans') as any)
        .delete()
        .eq('id', id)
      if (error) throw error
      fetchPlans()
      toast.success(lt('Plan deleted successfully'))
    } catch (error: any) {
      console.error('Error deleting plan:', error)
      toast.error(lt('Failed to delete plan: {message}', { message: error.message }))
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  }

  return (
    <Tabs defaultValue="plans" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="plans">{lt('Subscription Plans')}</TabsTrigger>
        <TabsTrigger value="users">{lt('User Subscriptions')}</TabsTrigger>
        <TabsTrigger value="promocodes">{lt('Promo Codes')}</TabsTrigger>
        <TabsTrigger value="stripe">{lt('Stripe Settings')}</TabsTrigger>
        <TabsTrigger value="contact">{lt('Contact Info')}</TabsTrigger>
      </TabsList>

      <TabsContent value="plans">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{lt('Subscription Plans')}</CardTitle>
                <CardDescription>{lt('Manage available subscription tiers and limits')}</CardDescription>
              </div>
              <Button onClick={() => setIsCreating(true)}><Plus className="w-4 h-4 mr-2" /> {lt('New Plan')}</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isCreating && (
                <PlanEditor 
                  onSave={handleSave} 
                  onCancel={() => setIsCreating(false)} 
                />
              )}
              
              {plans.map(plan => (
                <div key={plan.id} className="border rounded-lg p-4">
                  {editingPlan?.id === plan.id ? (
                    <PlanEditor 
                      initialData={plan} 
                      onSave={handleSave} 
                      onCancel={() => setEditingPlan(null)} 
                    />
                  ) : (
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">{plan.name ? lt(String(plan.name)) : ''}</h3>
                          {!plan.is_active && (
                            <span className="text-xs bg-gray-200 px-2 py-1 rounded">{lt('Inactive')}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-2">{plan.description ? lt(String(plan.description)) : ''}</p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                          <span>
                            {lt('Max Tenants:')}{' '}
                            <strong>{plan.max_tenants === -1 ? lt('Unlimited') : plan.max_tenants}</strong>
                          </span>
                          <span>
                            {lt('Max Docs:')}{' '}
                            <strong>{plan.max_documents === -1 ? lt('Unlimited') : plan.max_documents}</strong>
                          </span>
                          <span>
                            {lt('Storage:')}{' '}
                            <strong>
                              {plan.max_storage_bytes === -1
                                ? lt('Unlimited')
                                : (plan.max_storage_bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'}
                            </strong>
                          </span>
                          <span>
                            {lt('Price:')}{' '}
                            <strong>${plan.price_monthly}{lt('/mo')}</strong>
                          </span>
                          <span>
                            {lt('Yearly Discount:')}{' '}
                            <strong>{plan.yearly_discount_percent || 0}%</strong>
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2 text-xs text-gray-500 flex-wrap">
                          {FEATURE_DEFINITIONS.filter((def) => isFeatureEnabled(plan.features, def.key)).map((def) => (
                            <span
                              key={def.key}
                              className="bg-gray-50 text-gray-700 px-2 py-0.5 rounded border border-gray-100"
                            >
                              {lt(def.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => aiTranslatePlan(plan)}
                          disabled={Boolean(aiBusyPlanIds[String(plan.id)])}
                          title={lt('AI translate plan name/description (missing only)')}
                        >
                          {aiBusyPlanIds[String(plan.id)] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingPlan(plan)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(plan.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="users">
        <UserSubscriptionList />
      </TabsContent>

      <TabsContent value="promocodes">
        <PromoCodeManagement />
      </TabsContent>

      <TabsContent value="stripe">
        <StripeSettings />
      </TabsContent>

      <TabsContent value="contact">
        <ContactSettings />
      </TabsContent>
    </Tabs>
  )
}

function PlanEditor({ initialData, onSave, onCancel }: { 
  initialData?: SubscriptionPlan, 
  onSave: (data: any) => void, 
  onCancel: () => void 
}) {
  const lt = useLiterals()
  const [formData, setFormData] = useState(initialData || {
    name: '',
    description: '',
    max_tenants: 1,
    max_documents: 1000,
    max_storage_bytes: 5368709120,
    price_monthly: 0,
    yearly_discount_percent: 20,
    is_active: true,
    features: FEATURE_DEFINITIONS.reduce((acc, def) => {
      ;(acc as any)[def.key] = false
      return acc
    }, {} as Record<string, boolean>)
  })

  // Ensure features object exists
  if (!formData.features) {
    formData.features = FEATURE_DEFINITIONS.reduce((acc, def) => {
      ;(acc as any)[def.key] = false
      return acc
    }, {} as Record<string, boolean>)
  }

  const updateFeature = (key: string, value: boolean) => {
    setFormData({
      ...formData,
      features: {
        ...(formData.features as any),
        [key]: value
      }
    })
  }

  return (
    <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-blue-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{lt('Plan Name')}</Label>
          <Input 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})} 
            placeholder={lt('e.g. Pro Plan')}
          />
        </div>
        <div>
          <Label>{lt('Monthly Price ($)')}</Label>
          <Input 
            type="number" 
            value={formData.price_monthly || 0} 
            onChange={e => setFormData({...formData, price_monthly: parseFloat(e.target.value)})} 
          />
        </div>
      </div>
      
      <div>
        <Label>{lt('Description')}</Label>
        <Input 
          value={formData.description || ''} 
          onChange={e => setFormData({...formData, description: e.target.value})} 
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <Label>Max Tenants (-1 for unl.)</Label>
          <Input 
            type="number" 
            value={formData.max_tenants} 
            onChange={e => setFormData({...formData, max_tenants: parseInt(e.target.value)})} 
          />
        </div>
        <div>
          <Label>Max Documents</Label>
          <Input 
            type="number" 
            value={formData.max_documents} 
            onChange={e => setFormData({...formData, max_documents: parseInt(e.target.value)})} 
          />
        </div>
        <div>
          <Label>Storage (Bytes)</Label>
          <Input 
            type="number" 
            value={formData.max_storage_bytes} 
            onChange={e => setFormData({...formData, max_storage_bytes: parseInt(e.target.value)})} 
          />
          <p className="text-xs text-gray-500 mt-1">{(formData.max_storage_bytes / 1024 / 1024 / 1024).toFixed(2)} GB</p>
        </div>
        <div>
          <Label>Yearly Discount (%)</Label>
          <Input 
            type="number" 
            value={formData.yearly_discount_percent || 0} 
            onChange={e => setFormData({...formData, yearly_discount_percent: parseInt(e.target.value)})} 
          />
        </div>
      </div>

      <div className="border-t pt-4 mt-2">
        <Label className="mb-2 block font-semibold">{lt('Feature Flags')}</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_ai" 
              checked={(formData.features as any)?.ai_access} 
              onChange={e => updateFeature('ai_access', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_ai" className="font-normal">{lt('AI Document Processing')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_agent" 
              checked={(formData.features as any)?.ai_agent} 
              onChange={e => updateFeature('ai_agent', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_agent" className="font-normal">{lt('AI Agent (Voice/Text)')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="feat_custom_ai_provider"
              checked={(formData.features as any)?.custom_ai_provider}
              onChange={e => updateFeature('custom_ai_provider', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_custom_ai_provider" className="font-normal">{lt('Custom AI Provider')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_bank" 
              checked={(formData.features as any)?.bank_integration} 
              onChange={e => updateFeature('bank_integration', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_bank" className="font-normal">{lt('Bank Feed Integration')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_tax" 
              checked={(formData.features as any)?.tax_automation} 
              onChange={e => updateFeature('tax_automation', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_tax" className="font-normal">{lt('Tax Automation')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_domain" 
              checked={(formData.features as any)?.custom_domain} 
              onChange={e => updateFeature('custom_domain', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_domain" className="font-normal">{lt('Custom Domain')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_sso" 
              checked={(formData.features as any)?.sso} 
              onChange={e => updateFeature('sso', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_sso" className="font-normal">{lt('SSO / Enterprise Security')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_batch" 
              checked={(formData.features as any)?.concurrent_batch_processing} 
              onChange={e => updateFeature('concurrent_batch_processing', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_batch" className="font-normal flex items-center gap-2">
              {lt('Concurrent Batch Processing')}
              <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">{lt('New')}</span>
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="feat_custom_features" 
              checked={(formData.features as any)?.custom_features} 
              onChange={e => updateFeature('custom_features', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="feat_custom_features" className="font-normal">{lt('Custom features and more')}</Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{lt('Cancel')}</Button>
        <Button onClick={() => onSave(formData)}>{lt('Save Plan')}</Button>
      </div>
    </div>
  )
}
