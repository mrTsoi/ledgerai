import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// Mock tenant hook
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ currentTenant: { id: 'tenant-1' } }) }))

// Mock literals hook
vi.mock('@/hooks/use-literals', () => ({ useLiterals: () => ((s: string) => s) }))

// Mock next/navigation app router
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))

// Mock batch config to avoid network fetch in hook
vi.mock('@/hooks/use-batch-config', () => ({ useBatchConfig: () => ({ batchSize: 100 }), chunkArray: (arr: any) => arr }))

// Mock supabase client minimal surface used by the component
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ data: [] }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {}
  })
}))

// Mock CloudImportDialog to expose a button that calls onImported
vi.mock('@/components/documents/cloud-import-dialog', () => ({
  CloudImportDialog: ({ onImported, triggerLabel }: any) => (
    React.createElement('button', {
      onClick: () => onImported && onImported(),
      children: triggerLabel || 'Cloud Storage'
    })
  )
}))

import { DocumentUpload } from '../../src/components/documents/document-upload'

describe('Cloud import integration', () => {
  it('calls onUploadComplete when cloud import triggers', async () => {
    const onUploadComplete = vi.fn()
    render(React.createElement(DocumentUpload, { onUploadComplete }))

    const cloudBtn = await screen.findByRole('button', { name: /Cloud Storage/i })
    await userEvent.click(cloudBtn)

    expect(onUploadComplete).toHaveBeenCalled()
  })
})
