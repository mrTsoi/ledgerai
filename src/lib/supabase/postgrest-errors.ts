export function isPostgrestRelationMissing(error: any, relation?: string) {
  const message = String(error?.message || error || '').toLowerCase()

  // Common PostgREST/Supabase messages
  const isSchemaCache = message.includes('schema cache')
  const isRelationMissing = message.includes("could not find the table") || message.includes('relation')

  if (!(isSchemaCache || isRelationMissing)) return false

  if (!relation) return true
  return message.includes(relation.toLowerCase())
}

export function missingRelationHint(relation: string) {
  return {
    hint:
      `Database table "public.${relation}" is missing or not visible to PostgREST yet. ` +
      `Apply the migration that creates it and then refresh the API schema cache (PostgREST).`,
  }
}
