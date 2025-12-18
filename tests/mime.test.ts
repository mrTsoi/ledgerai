import { describe, it, expect } from 'vitest'
import { guessMimeType } from '../src/lib/external-sources/mime'

describe('guessMimeType', () => {
  it('recognizes common extensions', () => {
    expect(guessMimeType('invoice.pdf')).toBe('application/pdf')
    expect(guessMimeType('photo.JPG')).toBe('image/jpeg')
    expect(guessMimeType('sheet.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('falls back to octet-stream for unknown extensions', () => {
    expect(guessMimeType('file.unknownext')).toBe('application/octet-stream')
  })
})