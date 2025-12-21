import { describe, it, expect } from 'vitest'

describe('AI agent response normalization', () => {
  it('extracts code-fenced JSON and normalizes single action to actions[]', async () => {
    const mod = await import('../../src/lib/ai/agent-response')

    const content = [
      '```json',
      '{',
      '  "reply": "Opening reports.",',
      '  "action": { "type": "NAVIGATE", "path": "/dashboard/reports", "label": "Reports" }',
      '}',
      '```',
    ].join('\n')

    const out = mod.normalizeAgentResponse(content)

    expect(out).toEqual({
      reply: 'Opening reports.',
      actions: [{ type: 'NAVIGATE', path: '/dashboard/reports', label: 'Reports' }],
    })
  })
})
