import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { headers, reply, signedInUser } from '../_shared/http.ts'
import { confirmedStops, maxTextLength } from '../_shared/itinerary.ts'
import { match } from '../_shared/match.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST') return reply(405, { message: 'Use POST.' })
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const user = await signedInUser(db, request)
    if (!user) return reply(401, { message: 'Sign in to confirm.' })
    const body = await request.json().catch(() => null)
    if (typeof body?.id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(body.id)) return reply(400, { message: 'Invalid confirmation id.' })
    const originalText = body.originalText ?? null
    if (originalText !== null && (typeof originalText !== 'string' || originalText.length > maxTextLength)) return reply(400, { message: 'Invalid pasted text.' })
    let stops
    try { stops = confirmedStops(body.stops) }
    catch (e) { return reply(400, { message: e instanceof Error ? e.message : 'Invalid stops.' }) }
    const { data: person } = await db.from('persons').select('id').eq('account_id', user.id).maybeSingle().throwOnError()
    if (!person) return reply(403, { message: 'A traveler account is required.' })
    const now = new Date().toISOString()
    for (let attempt = 0; attempt < 3; attempt++) {
      const { count } = await db.from('incidents').select('id', { head: true, count: 'exact' }).throwOnError()
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
      const { error } = await db.rpc('confirm_matched_itinerary', { p_report: body.id, p_account: user.id,
        p_person: person.id, p_stops: stops, p_matches: matches, p_incident_count: count, p_original_text: originalText })
      if (!error) return reply(200, { message: 'Itinerary confirmed.' })
      if (error.code !== '40001') throw error
    }
    return reply(409, { message: 'Incidents changed. Try confirming again.' })
  } catch (error) {
    console.error('Confirm itinerary failed', error instanceof Error ? error.message : 'database error')
    return reply(500, { message: 'Could not confirm your Itinerary.' })
  }
})
