import { createClient } from '@supabase/supabase-js'

// Publishable key only: safe in the browser, row-level security does the access control (ADR-0001).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
