import { Page, Route } from '@playwright/test'

export function registerSupabaseMocks(page: Page) {
  let statusCalls = 0

  page.route('**/api/documents', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const id = 'doc_e2e_1'
      const body = {
        id,
        tenant_id: 'tenant_e2e_1',
        file_path: `documents/${id}/file.pdf`,
        file_name: 'invoice-e2e.pdf',
        file_type: 'application/pdf',
        status: 'UPLOADED',
        created_at: new Date().toISOString()
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  page.route('**/api/documents/*/process', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: true }) })
  })

  page.route('**/api/documents/*/status', async (route) => {
    statusCalls += 1
    if (statusCalls <= 2) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'doc_e2e_1', status: 'PROCESSING' }) })
      return
    }

    const documentData = {
      id: 'docdata_e2e_1',
      document_id: 'doc_e2e_1',
      confidence_score: 0.9,
      extracted_data: { vendor_name: 'Sample Vendor Inc.', total_amount: 1250 },
      vendor_name: 'Sample Vendor Inc.',
      document_date: new Date().toISOString().split('T')[0],
      total_amount: 1250,
      currency: 'USD'
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'doc_e2e_1', status: 'PROCESSED', document_data: documentData, linked_transaction_id: 'tx_e2e_1' })
    })
  })

  page.route('**/api/transactions**', async (route) => {
    const url = route.request().url()
    if (url.includes('document_id=doc_e2e_1')) {
      const tx = {
        id: 'tx_e2e_1',
        tenant_id: 'tenant_e2e_1',
        description: 'Sample Vendor Inc. - invoice-e2e.pdf',
        reference_number: 'INV-E2E-1',
        amount: 1250,
        transaction_date: new Date().toISOString().split('T')[0],
        status: 'DRAFT',
        created_at: new Date().toISOString()
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([tx]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  page.route('**/storage/v1/object/public/documents/**', async (route) => {
    const pdf = Buffer.from('%PDF-1.4\n%EOF').toString('base64')
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/pdf' }, body: Buffer.from(pdf, 'base64') })
  })
}
