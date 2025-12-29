'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateTenantModal } from '@/components/tenant/create-tenant-modal'
import { Upload, Building2, ArrowRight, FileText, Loader2 } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'
import { useTenant } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/types/database.types'
import { Label } from '@/components/ui/label'
import { AvailablePlans, type ContactConfig } from '@/components/subscription/available-plans'
import { uploadDocumentViaApi } from '@/lib/uploads/upload-document-client'

export function OnboardingView() {
  const lt = useLiterals()
  const { refreshTenants, switchTenant } = useTenant()
  const { subscription, loading: subLoading, refreshSubscription } = useSubscription()
  const [isDragging, setIsDragging] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [plans, setPlans] = useState<Array<Database['public']['Tables']['subscription_plans']['Row']>>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [upgradingPlanId, setUpgradingPlanId] = useState<string | null>(null)
  const [contactConfig, setContactConfig] = useState<ContactConfig>({ whatsapp: '', email: '' })

  const supabase = useMemo(() => createClient(), [])

  const subscribedCycle = useMemo<'month' | 'year' | null>(() => {
    if (!subscription) return null
    // If next billing interval is explicitly present, prefer it.
    if (subscription.next_billing_interval === 'month' || subscription.next_billing_interval === 'year') {
      return subscription.next_billing_interval
    }

    // Infer interval from the current period duration (approx > 40 days = yearly).
    if (subscription.current_period_start && subscription.current_period_end) {
      const dur = new Date(subscription.current_period_end).getTime() - new Date(subscription.current_period_start).getTime()
      return dur > 40 * 24 * 60 * 60 * 1000 ? 'year' : 'month'
    }

    return 'month'
  }, [subscription])

  const handleSelectPlan = async (plan: Database['public']['Tables']['subscription_plans']['Row'], interval: 'month' | 'year') => {
    try {
      setUpgradingPlanId(plan.id)

      const monthly = plan.price_monthly ?? 0
      if (monthly === 0) {
        const res = await fetch('/api/subscription/ensure-free', { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to select Free plan')
        await refreshSubscription()
        toast.success(lt('Subscription plan updated'))
        return
      }

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          interval,
          returnUrl: window.location.origin + window.location.pathname,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const { url } = await response.json()
      if (!url) throw new Error(lt('No checkout URL returned'))
      window.location.href = url
    } catch (error: any) {
      console.error('Plan selection error:', error)
      toast.error(lt('Failed to start upgrade: {message}', { message: error?.message || '' }))
    } finally {
      setUpgradingPlanId(null)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price_monthly', { ascending: true })
        if (mounted) setPlans(data || [])
      } catch {
        // Ignore: onboarding can still render without plan list.
      } finally {
        if (mounted) setPlansLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await (supabase
          .from('system_settings') as any)
          .select('setting_value')
          .eq('setting_key', 'contact_sales_config')
          .single()

        if (!mounted) return
        if (data?.setting_value) {
          setContactConfig(data.setting_value as ContactConfig)
        }
      } catch {
        // Non-fatal
      }
    })()
    return () => {
      mounted = false
    }
  }, [supabase])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      setUploadFile(file)
      // Suggest a company name based on file or default
      setCompanyName(lt('My Company'))
      setShowNameDialog(true)
    }
  }
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
          const file = files[0]
          setUploadFile(file)
          setCompanyName(lt('My Company'))
          setShowNameDialog(true)
      }
  }

  const handleCreateAndUpload = async () => {
    if (!uploadFile || !companyName) return

    setCreating(true)
    try {
      // 1. Create Tenant
      const slug = companyName.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
      
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          slug: slug,
          locale: 'en', // Default to en for now
        }),
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to create company'))

      const tenantId = String(json?.tenant?.id || '')
      if (!tenantId) throw new Error(lt('Failed to create company'))

      const uploaded = await uploadDocumentViaApi({ tenantId, file: uploadFile })
      const documentId = uploaded.documentId

      // 3. Trigger processing
      await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      toast.success(lt('Company created and document uploaded!'))
      setShowNameDialog(false)
      setUploadFile(null)
      
      // Switch to the newly created tenant immediately so UI updates
      if (tenantId) {
        try {
          switchTenant(tenantId)
        } catch (e) {
          // ignore
        }
      }
      await refreshSubscription()
      await refreshTenants()
      
    } catch (error: any) {
      console.error('Error:', error)
      const msg = String(error?.message || '')
      if (msg === 'No company selected') {
        toast.error(lt('No company selected'))
      } else {
        toast.error(msg || lt('Something went wrong'))
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      {creating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <span className="text-lg font-medium text-primary">{lt('Processing...')}</span>
        </div>
      )}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-4">{lt('Welcome to LedgerAI')}</h1>
        <p className="text-xl text-muted-foreground">
          {lt('Get started by creating your first organization or uploading a document.')}
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <Badge variant="secondary">
            {lt('Subscription Plan')}: {subscription?.plan_name || (subLoading ? lt('Loading…') : lt('Free'))}
          </Badge>
          {subscription && subscribedCycle && (
            <Badge variant="outline">
              {lt('Billing cycle')}: {subscribedCycle === 'year' ? lt('Yearly') : lt('Monthly')}
            </Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings?tab=billing">{lt('Billing & Plans')}</Link>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="relative overflow-hidden border-2 hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>{lt('Create Organization')}</CardTitle>
            <CardDescription>
              {lt('Set up a new company workspace to manage your finances.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-4">
                <CreateTenantModal />
            </div>
          </CardContent>
        </Card>

        <Card 
            className={`relative overflow-hidden border-2 border-dashed transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('onboarding-upload')?.click()}
        >
          <input 
            type="file" 
            id="onboarding-upload" 
            className="hidden" 
            onChange={handleFileSelect}
          />
          <CardHeader>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-blue-500" />
            </div>
            <CardTitle>{lt('Upload Document')}</CardTitle>
            <CardDescription>
              {lt('Upload an invoice or bank statement to automatically create a company.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex items-center text-sm text-muted-foreground">
              <FileText className="w-4 h-4 mr-2" />
              {lt('Supports PDF, JPG, PNG, Excel')}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10">
        <AvailablePlans
          plans={plans}
          loading={plansLoading}
          subscription={subscription}
          upgradingPlanId={upgradingPlanId}
          onSelectPlan={handleSelectPlan}
          contactConfig={contactConfig}
        />
      </div>

      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{lt('Name your Company')}</DialogTitle>
                <DialogDescription>
                    {lt('We will create a new company for this document.')}
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label>{lt('Company Name')}</Label>
                <Input 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)} 
                    placeholder={lt('My Company')}
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowNameDialog(false)}>{lt('Cancel')}</Button>
                <Button onClick={handleCreateAndUpload} disabled={creating}>
                    {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {lt('Create & Upload')}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
