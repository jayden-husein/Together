// What every Edge Function called from the app shares: CORS and the signed-in Account.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

export const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }

export const reply = (status: number, body: object) => Response.json(body, { status, headers })

// The Account whose session token the request carries, or null.
export async function signedInUser(db: SupabaseClient, request: Request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return null
  const { data: { user }, error } = await db.auth.getUser(token)
  return error ? null : user
}
