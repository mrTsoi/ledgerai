import { Page } from '@playwright/test'

export function registerAIMocks(page: Page) {
  page.route('https://api.openai.com/**', async (route) => {
    const body = {
      id: 'chatcmpl-e2e',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              document_type: 'invoice',
              vendor_name: 'Sample Vendor Inc.',
              document_date: new Date().toISOString().split('T')[0],
              total_amount: 1250,
              currency: 'USD',
              line_items: [{ description: 'Professional Services', amount: 1250, quantity: 1 }],
              transaction_type: 'expense',
              confidence_score: 0.9
            })
          }
        }
      ]
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  page.route('https://**/vision/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, extracted: { total_amount: 1250, vendor_name: 'Sample Vendor Inc.' } }) })
  })
}
