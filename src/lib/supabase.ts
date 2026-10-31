import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const accountAccessConfigured = Boolean(url && key)
let client: SupabaseClient | undefined

// The public Incident page also runs without an account backend.
export function getSupabase() {
  if (!accountAccessConfigured) throw new Error('Account access has not been configured.')
  return client ??= createClient(url, key)
}
