import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'

const url = 'http://localhost'
const key = 'anon'

const client = createClient<Database>(url, key)

// Query the `transactions` table (should be a valid table in Database.public.Tables)
const q = client.from('transactions').select('*')

type QType = typeof q

console.log('repro created', q)
