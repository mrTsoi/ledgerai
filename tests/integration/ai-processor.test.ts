import { describe, it, expect, vi } from 'vitest'

// Mock the supabase server client used by AIProcessingService
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: 'not found' } })
        })
      })
    }),
    storage: { from: () => ({ download: async () => ({ data: new Blob(), error: null }) }) }
  })
}))

import { AIProcessingService } from '../../src/lib/ai/document-processor'

describe('AIProcessingService', () => {
  it('returns 404 when document is not found', async () => {
    const res = await AIProcessingService.processDocument('missing-doc-id')
    expect(res.success).toBe(false)
    expect(res.statusCode).toBe(404)
  })
})
