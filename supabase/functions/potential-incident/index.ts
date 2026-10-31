import OpenAI from 'openai'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { draftFlood, fixturePacket, type Reading } from '../_shared/flood.ts'
import { match } from '../_shared/match.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }
const reply = (status: number, message: string) => Response.json({ message }, { headers, status })

async function summarize(readings: Reading[]) {
  // GPT-6 Luna through Dartmouth Chat's OpenAI-compatible API; draftFlood checks every quote it returns.
  const dartmouth = new OpenAI({ apiKey: Deno.env.get('DARTMOUTH_CHAT_API_KEY'), baseURL: 'https://chat.dartmouth.edu/api', timeout: 15_000, maxRetries: 0 })
  const completion = await dartmouth.chat.completions.create({
    model: 'openai.gpt-6-luna',
    max_completion_tokens: 600,
    response_format: { type: 'json_schema', json_schema: { name: 'potential_incident', strict: true, schema: {
      type: 'object', additionalProperties: false, required: ['summary', 'quotes'],
      properties: { summary: { type: 'string' }, quotes: { type: 'array', items: { type: 'string' } } },
    } } },
    messages: [
      { role: 'system', content: 'Summarize these synthetic flood readings for a Coordinator. Return only JSON with a short summary string and quotes, an array of one exact nonempty excerpt per reading in the supplied order.' },
      { role: 'user', content: JSON.stringify(readings.map(({ name, text }) => ({ name, text }))) },
    ],
  })
  const choice = completion.choices[0]
  if (choice?.finish_reason !== 'stop' || !choice.message.content) throw new Error(`finish reason ${choice?.finish_reason}`)
  return JSON.parse(choice.message.content)
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
    if (error.code === 'P0409') return reply(409, 'This Potential incident was dismissed.')
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
      const packet = fixturePacket(body.readings)
      if (!packet) return reply(400, 'Unknown source packet.')
      // ponytail: reads every earlier Potential incident; filter by source name if the feed becomes real.
      const { data: earlier } = await db.from('potential_incidents').select('id,sources,dismissed_at,incident_id').throwOnError()
      const draft = await draftFlood(packet, earlier, () => summarize(packet.readings))
      if (!draft) return Response.json({ id: null }, { headers })
      // A simultaneous duplicate delivery meets readings_key and raises nothing.
      const { data } = await db.from('potential_incidents').upsert({ ...draft, name: 'Flash flood at Phantom Ranch', demo: true },
        { onConflict: 'readings_key', ignoreDuplicates: true }).select('id').maybeSingle().throwOnError()
      return Response.json({ id: data?.id ?? null }, { headers })
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
