import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { confirmedStops } from '../_shared/itinerary.ts'
import { match } from '../_shared/match.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }
const reply = (status: number, message: string) => Response.json({ message }, { status, headers })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST') return reply(405, 'Use POST.')
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return reply(401, 'Sign in to confirm.')
    const { data: { user }, error } = await db.auth.getUser(token)
    if (error || !user) return reply(401, 'Sign in to confirm.')
    const body = await request.json().catch(() => null)
    if (typeof body?.id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.id)) return reply(400, 'Invalid confirmation id.')
    let stops
    try { stops = confirmedStops(body.stops) }
    catch (e) { return reply(400, e instanceof Error ? e.message : 'Invalid stops.') }
    const { data: person } = await db.from('persons').select('id').eq('account_id', user.id).maybeSingle().throwOnError()
    if (!person) return reply(403, 'A traveler account is required.')
    const now = new Date().toISOString()
    const matches = []
    for (let offset = 0; ; offset += 100) {
      const { data } = await db.from('incidents').select('id,area,starts_at,ends_at,cases(person_id)')
        .eq('cases.person_id', person.id)
        .lte('starts_at', now).or('ends_at.is.null,ends_at.gte.' + now)
        .order('id').range(offset, offset + 99).throwOnError()
      const existing = data.flatMap(incident => incident.cases.map(c => ({ personId: c.person_id, incidentId: incident.id })))
      matches.push(...match(person.id, stops, data, existing))
      if (data.length < 100) break
    }
    await db.rpc('confirm_itinerary', { p_report: body.id, p_account: user.id, p_person: person.id, p_stops: stops, p_matches: matches }).throwOnError()
    return reply(200, 'Itinerary confirmed.')
  } catch (error) {
    console.error('Confirm itinerary failed', error instanceof Error ? error.message : 'database error')
    return reply(500, 'Could not confirm your Itinerary.')
  }
})
