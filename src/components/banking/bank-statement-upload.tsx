'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, FileText } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { toast } from "sonner"

interface Props {
  accountId: string
  onUploadComplete: () => void
}

export function BankStatementUpload({ accountId, onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false)
  const { currentTenant } = useTenant()
  const supabase = createClient()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentTenant) return

    try {
      setUploading(true)

      // 1. Upload file to storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${currentTenant.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 2. Create document record
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          tenant_id: currentTenant.id,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          status: 'UPLOADED',
          document_type: 'bank_statement' // Explicitly set type
        })
        .select()
        .single()

      if (docError) throw docError

      // 3. Trigger AI Processing (via API or Edge Function)
      // For now, we'll call the process endpoint if it exists, or rely on the background trigger
      // Since we don't have a background trigger yet, we'll call the process API
      
      await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id })
      })

      // 4. Link document to bank account (This might need to happen after processing if we want to verify dates first, 
      // but for now we can't easily link it here because the bank_statement record is created by the AI processor.
      // Ideally, we should pass the accountId to the processor or update the statement after creation.
      // A better approach: Create the bank_statement record here with status 'UPLOADING' and link it?)
      
      // Actually, the AI processor creates the bank_statement record. 
      // We need a way to tell the AI processor which bank account this belongs to.
      // We can store it in metadata or update the bank_statement after the fact.
      
      // Let's try to update the bank_statement after processing. 
      // Since processing is async, we might just have to wait or let the user link it later.
      // OR, we can pass metadata to the document.
      
      // For this MVP, we'll assume the AI processor creates the statement, and we'll need to link it to the account manually or via a "Unlinked Statements" list.
      // BUT, since we are uploading FROM the account page, we want it linked.
      
      // Workaround: We can't easily pass accountId to the AI processor without modifying the processor signature or document schema.
      // Let's modify the document schema? No, let's use the metadata field in document_data if possible, but that's created later.
      
      // Alternative: Create a placeholder bank_statement record NOW.
      const { error: stmtError } = await supabase
        .from('bank_statements')
        .insert({
          tenant_id: currentTenant.id,
          bank_account_id: accountId,
          document_id: doc.id,
          status: 'IMPORTED' // Will be updated to PROCESSED by AI
        })

      if (stmtError) console.error('Error linking statement:', stmtError)

      onUploadComplete()
      toast.success('Statement uploaded successfully')

    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleFileChange}
        disabled={uploading}
      />
      <Button disabled={uploading} className="w-full sm:w-auto">
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Upload Statement
          </>
        )}
      </Button>
    </div>
  )
}
