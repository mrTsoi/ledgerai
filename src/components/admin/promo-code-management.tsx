'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Edit, Trash2, Save, X, RefreshCw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

type PromoCode = Database['public']['Tables']['promo_codes']['Row']

export function PromoCodeManagement() {
  const lt = useLiterals()
  const ltVars = (english: string, vars?: Record<string, string | number>) => lt(english, vars)
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchCodes = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCodes(data || [])
    } catch (error) {
      console.error('Error fetching promo codes:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleSync = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/sync-promo', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      toast.success(
        ltVars('Sync complete! Created: {created}, Exists: {exists}', {
          created: result.results.filter((r: any) => r.status === 'created').length,
          exists: result.results.filter((r: any) => r.status === 'exists').length,
        })
      )
    } catch (error: any) {
      console.error('Sync error:', error)
      toast.error(ltVars('Sync failed: {message}', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (code: Partial<PromoCode>) => {
    try {
      if (editingCode) {
        const { error } = await (supabase
          .from('promo_codes') as any)
          .update(code)
          .eq('id', editingCode.id)
        if (error) throw error
      } else {
        const { error } = await (supabase
          .from('promo_codes') as any)
          .insert(code as any)
        if (error) throw error
      }
      
      setEditingCode(null)
      setIsCreating(false)
      fetchCodes()
      toast.success(lt('Promo code saved successfully'))
    } catch (error: any) {
      console.error('Error saving promo code:', error)
      toast.error(ltVars('Failed to save promo code: {message}', { message: error.message }))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(lt('Are you sure you want to delete this promo code?'))) return
    try {
      const { error } = await (supabase
        .from('promo_codes') as any)
        .delete()
        .eq('id', id)
      if (error) throw error
      fetchCodes()
      toast.success(lt('Promo code deleted successfully'))
    } catch (error: any) {
      console.error('Error deleting promo code:', error)
      toast.error(ltVars('Failed to delete promo code: {message}', { message: error.message }))
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{lt('Promotional Codes')}</CardTitle>
            <CardDescription>{lt('Manage discount codes for subscriptions')}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync}>
              <RefreshCw className="w-4 h-4 mr-2" /> {lt('Sync to Stripe')}
            </Button>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="w-4 h-4 mr-2" /> {lt('New Code')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isCreating && (
            <PromoCodeEditor 
              onSave={handleSave} 
              onCancel={() => setIsCreating(false)} 
            />
          )}
          
          {codes.map(code => (
            <div key={code.id} className="border rounded-lg p-4">
              {editingCode?.id === code.id ? (
                <PromoCodeEditor 
                  initialData={code} 
                  onSave={handleSave} 
                  onCancel={() => setEditingCode(null)} 
                />
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg font-mono bg-gray-100 px-2 rounded">{code.code}</h3>
                      {!code.is_active && (
                        <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">{lt('Inactive')}</span>
                      )}
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {code.discount_type === 'PERCENTAGE'
                          ? ltVars('{value}% OFF', { value: code.discount_value })
                          : ltVars('${value} OFF', { value: code.discount_value })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 my-1">{code.description}</p>
                    <div className="text-xs text-gray-500 flex gap-4">
                      <span>
                        {ltVars('Uses: {current} / {max}', {
                          current: code.current_uses ?? 0,
                          max: code.max_uses || '∞',
                        })}
                      </span>
                      <span>
                        {ltVars('Expires: {date}', {
                          date: code.valid_until ? new Date(code.valid_until).toLocaleDateString() : lt('Never'),
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingCode(code)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(code.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {codes.length === 0 && !isCreating && (
            <div className="text-center py-8 text-gray-500">{lt('No promo codes found. Create one to get started.')}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PromoCodeEditor({ initialData, onSave, onCancel }: { 
  initialData?: PromoCode, 
  onSave: (data: any) => void, 
  onCancel: () => void 
}) {
  const lt = useLiterals()
  const [formData, setFormData] = useState(initialData || {
    code: '',
    description: '',
    discount_type: 'PERCENTAGE',
    discount_value: 0,
    max_uses: null as number | null,
    valid_until: null as string | null,
    is_active: true
  })

  return (
    <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-blue-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{lt('Code')}</Label>
          <Input 
            value={formData.code} 
            onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} 
            placeholder={lt('e.g. SUMMER2024')}
            className="font-mono uppercase"
          />
        </div>
        <div>
          <Label>{lt('Description')}</Label>
          <Input 
            value={formData.description || ''} 
            onChange={e => setFormData({...formData, description: e.target.value})} 
            placeholder={lt('Internal note')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{lt('Discount Type')}</Label>
          <Select 
            value={formData.discount_type} 
            onValueChange={(val: 'PERCENTAGE' | 'FIXED_AMOUNT') => setFormData({...formData, discount_type: val})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">{lt('Percentage (%)')}</SelectItem>
              <SelectItem value="FIXED_AMOUNT">{lt('Fixed Amount ($)')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{lt('Value')}</Label>
          <Input 
            type="number" 
            value={formData.discount_value} 
            onChange={e => setFormData({...formData, discount_value: parseFloat(e.target.value)})} 
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{lt('Max Uses (Empty for unlimited)')}</Label>
          <Input 
            type="number" 
            value={formData.max_uses || ''} 
            onChange={e => setFormData({...formData, max_uses: e.target.value ? parseInt(e.target.value) : null})} 
            placeholder={lt('Unlimited')}
          />
        </div>
        <div>
          <Label>{lt('Valid Until (Empty for never)')}</Label>
          <Input 
            type="date" 
            value={formData.valid_until ? new Date(formData.valid_until).toISOString().split('T')[0] : ''} 
            onChange={e => setFormData({...formData, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null})} 
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input 
          type="checkbox" 
          id="is_active" 
          checked={formData.is_active} 
          onChange={e => setFormData({...formData, is_active: e.target.checked})}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <Label htmlFor="is_active">{lt('Active')}</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{lt('Cancel')}</Button>
        <Button onClick={() => onSave(formData)}>{lt('Save Code')}</Button>
      </div>
    </div>
  )
}
