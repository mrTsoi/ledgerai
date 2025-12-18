import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Temporarily use untyped service client to avoid widespread
// `never`-typed PostgREST overloads while incremental DB typings
// are in-progress.

// WARNING: This client bypasses Row Level Security (RLS)
// Only use in secure server-side contexts (API routes, server actions)
// Never expose to the client
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.VITEST ? 'test-service-role' : undefined)

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createSupabaseClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
