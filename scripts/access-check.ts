// Proves the access rules against a live project on the reset demo data. Exits non-zero on any leak.
// Usage: npm run access-check -- staging|production
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { accounts, serverClient, publishableKey, signIn, url } from './demo.ts'

const privateTables = ['persons', 'emergency_contacts', 'coordinators', 'cases', 'reports', 'case_events', 'notifications']
const individualUpdateFields = ['case_id', 'incident_id', 'person_name', 'at', 'entry_kind', 'source', 'status', 'urgency', 'outcome']
let failures = 0
function expect(ok: boolean, what: string) {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`)
  if (!ok) failures++
}
async function rows(client: SupabaseClient, table: string) {
  const { data, error } = await client.from(table).select()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

const anon = createClient(url, publishableKey, { auth: { persistSession: false } })
expect((await rows(anon, 'incidents')).length > 0, 'without logging in: reads Incidents')
for (const table of privateTables) expect((await rows(anon, table)).length === 0, `without logging in: reads no ${table}`)

const unrelated = await signIn(accounts.unrelated)
for (const table of privateTables) expect((await rows(unrelated, table)).length === 0, `unrelated Account: reads no ${table}`)
const { data: unrelatedUpdates } = await unrelated.rpc('contact_case_updates')
expect(unrelatedUpdates?.length === 0, 'unrelated Account: gets no Individual Updates')
expect((await unrelated.rpc('delete_demo_data')).error !== null, 'unrelated Account: cannot reset demo data')

const contact = await signIn(accounts.emergencyContact)
for (const table of ['persons', 'cases', 'reports', 'case_events'])
  expect((await rows(contact, table)).length === 0, `Emergency Contact: reads no raw ${table}`)
const { data: updates } = await contact.rpc('contact_case_updates')
expect(updates?.length > 0, "Emergency Contact: gets Maya's Case through contact_case_updates()")
expect(
  updates?.every((u: object) => Object.keys(u).sort().join() === [...individualUpdateFields].sort().join()),
  'Emergency Contact: Individual Updates carry only status, Urgency, outcome, time and source',
)

// Positive controls, so the empty reads above can't pass just because nothing exists.
const maya = await signIn(accounts.maya)
expect((await rows(maya, 'persons')).length === 1, 'Maya: reads her own Person')
expect((await rows(maya, 'cases')).length === 1, 'Maya: reads her own Case')
const coordinator = await signIn(accounts.coordinator)
expect((await rows(coordinator, 'cases')).length > 0, 'Coordinator: reads Cases')

// Even the server key can't rewrite history or duplicate a Case.
const server = serverClient()
const [mayaCase] = await rows(server, 'cases')
for (const table of ['reports', 'case_events']) {
  expect((await server.from(table).update({ demo: true }).eq('demo', true)).error !== null, `server key: cannot update ${table}`)
  expect((await server.from(table).delete().eq('demo', true)).error !== null, `server key: cannot delete ${table}`)
}
const duplicate = await server.from('cases').insert({ incident_id: mayaCase.incident_id, person_id: mayaCase.person_id, demo: true })
expect(duplicate.error?.code === '23505', 'a second Case for the same Incident and Person is refused')
expect((await coordinator.from('persons').insert({ name: 'Someone else', demo: true })).error !== null, 'Coordinator: cannot add a Person')
// Only a Coordinator writes to a Case, and only claims, Contact Attempts, notes and resolutions.
expect((await contact.rpc('record_case_event', { p_case_id: mayaCase.id, p_action: 'note', p_note: 'x' })).error !== null,
  'Emergency Contact: cannot add to a Case')
expect((await coordinator.rpc('record_case_event', { p_case_id: mayaCase.id, p_action: 'opened' })).error !== null,
  'Coordinator: cannot open a Case by hand')
expect((await coordinator.rpc('record_case_event', { p_case_id: mayaCase.id, p_action: 'resolved' })).error !== null,
  'Coordinator: cannot resolve without an outcome')
expect((await rows(coordinator, 'coordinators')).length > 0, 'Coordinator: reads Coordinator names')

process.exit(failures ? 1 : 0)
