'use client'

import { useState } from 'react'
import { DocumentUpload } from '@/components/documents/document-upload'
import { DocumentsList } from '@/components/documents/documents-list'
import { DocumentVerificationModal } from '@/components/documents/document-verification-modal'

export default function DocumentsPage() {
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-4">
      <DocumentUpload 
        onVerify={(id) => setVerifyingDocId(id)} 
        onUploadComplete={() => setRefreshKey(prev => prev + 1)}
      />
      <DocumentsList 
        onVerify={(id) => setVerifyingDocId(id)} 
        refreshKey={refreshKey}
      />
      
      {verifyingDocId && (
        <DocumentVerificationModal
          documentId={verifyingDocId}
          onClose={() => setVerifyingDocId(null)}
          onSaved={() => {
            setVerifyingDocId(null)
            setRefreshKey(prev => prev + 1)
          }}
        />
      )}
    </div>
  )
}
