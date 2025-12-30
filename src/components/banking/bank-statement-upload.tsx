'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Loader2 } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'
import { uploadDocumentViaApi } from '@/lib/uploads/upload-document-client'
import { CloudImportDialog } from '@/components/documents/cloud-import-dialog'

interface Props {
  accountId: string
  onUploadComplete: () => void
}

export function BankStatementUpload({ accountId, onUploadComplete }: Props) {
  const lt = useLiterals()
  const [uploading, setUploading] = useState(false)
  const { currentTenant } = useTenant()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentTenant) return

    try {
      setUploading(true)

      const uploaded = await uploadDocumentViaApi({
        tenantId: currentTenant.id,
        file,
        documentType: 'bank_statement',
        bankAccountId: accountId,
      })

      const documentId = uploaded.documentId
      if (!documentId) throw new Error(lt('Upload failed'))

      // 3. Trigger AI Processing (via API or Edge Function)
      // For now, we'll call the process endpoint if it exists, or rely on the background trigger
      // Since we don't have a background trigger yet, we'll call the process API
      
      await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
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
      // bank_statement row is created by /api/documents/upload

      onUploadComplete()
      toast.success(lt('Statement uploaded successfully'))

    } catch (error: any) {
      console.error('Upload error:', error)
      const msg = String(error?.message || '')
      if (msg === 'No company selected') {
        toast.error(lt('No company selected'))
      } else {
        toast.error(lt('Upload failed'))
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
              {lt('Processing...')}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {lt('Upload Statement')}
            </>
          )}
        </Button>
      </div>

      <div className="relative">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <Button disabled={uploading} variant="outline" className="w-full sm:w-auto">
          {lt('Camera')}
        </Button>
      </div>

      {currentTenant ? (
        <CloudImportDialog
          tenantId={currentTenant.id}
          documentType="bank_statement"
          bankAccountId={accountId}
          triggerLabel={lt('Cloud Storage')}
          onImported={onUploadComplete}
        />
      ) : null}
    </div>
  )
}
