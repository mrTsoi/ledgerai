import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Temporarily return an untyped Supabase client (`any`) to
// avoid cascading `never` errors while DB typings are being
// incrementally completed.
export function createClient(): SupabaseClient<any> {
  return createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient<any>
}
