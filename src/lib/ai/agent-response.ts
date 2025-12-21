export type AgentAction = { type: 'NAVIGATE'; path: string; label?: string }

const ALLOWED_NAV_PATHS = new Set([
  '/dashboard',
  '/dashboard/documents',
  '/dashboard/documents/new',
  '/dashboard/transactions',
  '/dashboard/banking',
  '/dashboard/reports',
  '/dashboard/team',
  '/dashboard/settings',
])

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function normalizeActions(raw: unknown): AgentAction[] {
  const collected: unknown[] = []
  if (raw && typeof raw === 'object') {
    const asAny = raw as any
    if (asAny.action && typeof asAny.action === 'object') collected.push(asAny.action)
    if (Array.isArray(asAny.actions)) collected.push(...asAny.actions)
  }

  const normalized: AgentAction[] = []
  for (const item of collected) {
    if (!item || typeof item !== 'object') continue
    const a: any = item
    if (a.type !== 'NAVIGATE') continue
    if (typeof a.path !== 'string') continue
    const path = a.path.trim()
    if (!ALLOWED_NAV_PATHS.has(path)) continue

    const label = typeof a.label === 'string' && a.label.trim() ? a.label.trim() : undefined
    normalized.push({ type: 'NAVIGATE', path, label })
    if (normalized.length >= 2) break
  }
  return normalized
}

function normalizeSuggestedPrompts(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const item of arr) {
    const s = coerceString(item)
    if (!s) continue
    const trimmed = s.trim()
    if (!trimmed) continue
    out.push(trimmed)
    if (out.length >= 4) break
  }
  return out
}

export function tryExtractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = withoutFences.indexOf('{')
  if (start < 0) return null

  let depth = 0
  for (let i = start; i < withoutFences.length; i++) {
    const ch = withoutFences[i]
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) {
      return withoutFences.slice(start, i + 1)
    }
  }
  return null
}

export function normalizeAgentResponse(
  content: string
): { reply: string; actions?: AgentAction[]; suggested_prompts?: string[] } {
  const jsonCandidate = tryExtractJsonObject(content)
  if (!jsonCandidate) return { reply: content }

  try {
    const parsed: any = JSON.parse(jsonCandidate)
    const reply = coerceString(parsed?.reply) ?? content
    const actions = normalizeActions(parsed)
    const suggested_prompts = normalizeSuggestedPrompts(parsed?.suggested_prompts)

    return {
      reply,
      ...(actions.length > 0 ? { actions } : null),
      ...(suggested_prompts.length > 0 ? { suggested_prompts } : null),
    }
  } catch {
    return { reply: content }
  }
}
