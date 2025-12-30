import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock tenant hook
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ currentTenant: { id: 'tenant-1' } }) }))

// Mock next/router app router hooks used by component
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))

// Mock literals hook to return identity
vi.mock('@/hooks/use-literals', () => ({ useLiterals: () => ((s: string) => s) }))

// Mock batch config
vi.mock('@/hooks/use-batch-config', () => ({ useBatchConfig: () => ({ batchSize: 100 }), chunkArray: (arr: any) => [arr] }))

// Mock upload helper to return a documentId
vi.mock('@/lib/uploads/upload-document-client', () => ({ uploadDocumentViaApi: async () => ({ documentId: 'doc-1' }) }))

// Mock supabase client minimal surface used by the component
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ data: [] }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {}
  })
}))

import { DocumentUpload } from '../../src/components/documents/document-upload'

describe('Document upload → process integration', () => {
  beforeEach(() => {
    // mock fetch for /api/documents/process to indicate no records were created
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ validationStatus: 'COMPLETE', validationFlags: [], recordsCreated: false })
    })))
  })

  it('shows message when processing did not create records', async () => {
    const onVerify = vi.fn()
    render(React.createElement(DocumentUpload, { onVerify }))

    // locate hidden file input and upload a fake file
    const input = document.querySelector('input#file-upload') as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File(['hello'], 'receipt.pdf', { type: 'application/pdf' })
    // fire change
    fireEvent.change(input, { target: { files: [file] } })

    // click Upload All
    const uploadButton = await screen.findByRole('button', { name: /Upload All/i })
    await userEvent.click(uploadButton)

    // wait for the UI message indicating no transaction was created
    await waitFor(() => {
      expect(screen.getByText(/No transaction created — review required/i)).toBeTruthy()
    })
  })
})
