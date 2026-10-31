import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { draftFlood, floodReadings } from '../_shared/flood.ts'
import { match } from '../_shared/match.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }
const reply = (status: number, message: string) => Response.json({ message }, { headers, status })

async function summarize(readings: ReturnType<typeof floodReadings>) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('Claude is not configured')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5', max_tokens: 600,
      system: 'Summarize these synthetic flood readings for a Coordinator. Return only JSON with a short summary string and quotes, an array of one exact nonempty excerpt per reading in the supplied order.',
      messages: [{ role: 'user', content: JSON.stringify([readings.gauge, readings.warning, readings.news].map(({ name, text }) => ({ name, text }))) }],
    }),
  })
  if (!response.ok) throw new Error('Claude unavailable')
  const result = await response.json()
  return JSON.parse(result.content.filter((block: { type: string }) => block.type === 'text').map((block: { text: string }) => block.text).join(''))
}

async function verify(db: SupabaseClient, account: string, id: string, start: string, end: string | null) {
  const { data: draft } = await db.from('potential_incidents').select('area,incident_id').eq('id', id).single().throwOnError()
  if (draft.incident_id) return reply(200, 'Incident already verified.')
  const incident = { id, area: draft.area, starts_at: start, ends_at: end }
  for (let attempt = 0; attempt < 3; attempt++) {
    const matches = []
    let count = 0
    for (let offset = 0; ; offset += 100) {
      const page = await db.from('reports').select('id,person_id,body', { count: offset === 0 ? 'exact' : undefined })
        .eq('kind', 'itinerary').order('id').range(offset, offset + 99).throwOnError()
      if (offset === 0) count = page.count!
      for (const report of page.data) {
        for (const decision of match(report.person_id, report.body.stops, [incident])) {
          matches.push({ ...decision, reportId: report.id })
        }
      }
      if (page.data.length < 100) break
    }
    const { error } = await db.rpc('verify_potential_incident', { p_id: id, p_account: account,
      p_start: start, p_end: end, p_matches: matches, p_report_count: count })
    if (!error) return reply(200, 'Incident verified.')
    if (error.code !== '40001') throw error
  }
  return reply(409, 'Itineraries changed. Try verifying again.')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST') return reply(405, 'Use POST.')
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return reply(401, 'Sign in as a Coordinator.')
    const { data: { user } } = await db.auth.getUser(token)
    if (!user) return reply(401, 'Sign in as a Coordinator.')
    const { data: coordinator } = await db.from('coordinators').select('demo').eq('account_id', user.id).maybeSingle().throwOnError()
    if (!coordinator) return reply(403, 'A Coordinator account is required.')
    const body = await request.json().catch(() => null)
    if (body?.action === 'ingest' && coordinator.demo) {
      // This feed accepts only the three synthetic fixture readings.
      const readings = floodReadings()
      const packet = body.readings
      if (!packet || !(['gauge', 'warning', 'news'] as const).every(key =>
        packet[key]?.name === readings[key].name && packet[key].text === readings[key].text) ||
        packet.warning.area?.type !== 'Polygon' ||
        JSON.stringify(packet.warning.area.coordinates) !== JSON.stringify(readings.warning.area.coordinates)) {
        return reply(400, 'Unknown source packet.')
      }
      const draft = await draftFlood(packet, () => summarize(packet))
      const { data } = await db.from('potential_incidents').insert({ ...draft, name: 'Flash flood at Phantom Ranch',
        starts_at: new Date(Date.now() - 30 * 60000).toISOString(), demo: true }).select('id').single().throwOnError()
      return Response.json(data, { headers })
    }
    if (body?.action !== 'verify' || typeof body.id !== 'string') return reply(400, 'Invalid review.')
    const { start, end } = body
    if (typeof start !== 'string' || !Number.isFinite(Date.parse(start)) ||
      (end !== null && (typeof end !== 'string' || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)))) {
      return reply(400, 'Choose a valid Incident time window.')
    }
    return await verify(db, user.id, body.id, start, end)
  } catch {
    return reply(500, 'Could not save the Potential incident. Try again.')
  }
})
