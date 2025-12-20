'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateTenantModal } from '@/components/tenant/create-tenant-modal'
import { Upload, Building2, ArrowRight, FileText, Loader2 } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'
import { useTenant } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export function OnboardingView() {
  const lt = useLiterals()
  const { refreshTenants } = useTenant()
  const { refreshSubscription } = useSubscription()
  const [isDragging, setIsDragging] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)

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
      
      const tenantId = json.id
      
      // 2. Upload File
      const supabase = createClient()
      const fileExt = uploadFile.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${tenantId}/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, uploadFile)
        
      if (uploadError) throw uploadError

      // 3. Create Document Record
      const { error: docError } = await supabase
        .from('documents')
        .insert({
            tenant_id: tenantId,
            name: uploadFile.name,
            file_path: filePath,
            size: uploadFile.size,
            mime_type: uploadFile.type,
            status: 'PENDING'
        })

      if (docError) throw docError

      toast.success(lt('Company created and document uploaded!'))
      setShowNameDialog(false)
      setUploadFile(null)
      
      await refreshSubscription()
      await refreshTenants()
      
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || lt('Something went wrong'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-4">{lt('Welcome to LedgerAI')}</h1>
        <p className="text-xl text-muted-foreground">
          {lt('Get started by creating your first organization or uploading a document.')}
        </p>
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
