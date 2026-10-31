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
const coordinator = await signIn(accounts.coordinator)
const { data: pending } = await coordinator.from('potential_incidents').select('id, starts_at')
  .eq('demo', true).is('incident_id', null).is('dismissed_at', null).maybeSingle().throwOnError()
if (pending) {
  if (process.argv[2] !== 'staging' || !process.argv.includes('--verify')) {
    throw new Error('Verify the pending demo Incident in the Coordinator view first, or use staging --verify.')
  }
  const server = serverClient()
  const { data: before } = await server.from('cases').select('id').eq('incident_id', pending.id).throwOnError()
  expect(before.length === 0, 'pending Potential incident has no Cases')
  const { data: notices } = await coordinator.from('notifications').select('id').eq('kind', 'potential_incident')
    .eq('refers_to', pending.id).throwOnError()
  expect(notices.length === 1, 'Coordinator received the Potential incident Notification')
  const { data: dismissed } = await coordinator.from('potential_incidents').select('id')
    .eq('demo', true).not('dismissed_at', 'is', null).limit(1).single().throwOnError()
  const dismissedBody = { action: 'verify', id: dismissed.id, start: pending.starts_at, end: null }
  expect((await coordinator.functions.invoke('potential-incident', { body: dismissedBody })).error !== null, 'a dismissed Potential incident cannot be verified')
  const body = { action: 'verify', id: pending.id, start: pending.starts_at, end: null }
  const traveler = await signIn(accounts.maya)
  expect((await traveler.functions.invoke('potential-incident', { body })).error !== null, 'Traveler cannot verify')
  for (const result of await Promise.all([1, 2].map(() => coordinator.functions.invoke('potential-incident', { body })))) {
    if (result.error) throw result.error
  }
  const { data: verified } = await server.from('incidents').select('id').eq('id', pending.id).throwOnError()
  expect(verified.length === 1, 'verification creates exactly one Incident')
  const { data: opened } = await server.from('cases').select('id, persons!inner(account_id), case_events!inner(source_report_id, action)')
    .eq('incident_id', pending.id).eq('case_events.action', 'opened')
    .returns<{ id: string; persons: { account_id: string }; case_events: { source_report_id: string }[] }[]>().throwOnError()
  const { data: requests } = await server.from('notifications').select('account_id, refers_to')
    .eq('kind', 'check_in_request').in('refers_to', opened.map(c => c.id)).throwOnError()
  const { data: { users } } = await server.auth.admin.listUsers({ perPage: 1000 })
  const expected = new Set(users.filter(u => u.email === accounts.maya ||
    /^traveler-(1|4|7|10|13|16|19)@demo\.together\.example\.com$/.test(u.email ?? '')).map(u => u.id))
  expect(opened.length === 8 && opened.every(c => expected.delete(c.persons.account_id)) && !expected.size,
    'two verifications open Cases for exactly the eight overlapping demo travelers')
  expect(requests.length === opened.length && opened.every(c => requests.some(n => n.refers_to === c.id && n.account_id === c.persons.account_id)),
    'each matched traveler receives one Check-in Request')
}
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
expect((await rows(coordinator, 'cases')).length > 0, 'Coordinator: reads Cases')

// Even the server key can't rewrite history or duplicate a Case.
const server = serverClient()
const [mayaCase] = await rows(maya, 'cases')
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
// A Can't-reach report comes only from an Emergency Contact the traveler named (ADR-0002).
for (const [who, client] of [['unrelated Account', unrelated], ['Maya', maya], ['Coordinator', coordinator]] as const)
  expect((await client.rpc('file_cant_reach', { p_case_id: mayaCase.id })).error !== null, `${who}: cannot file a Can't-reach report on Maya's Case`)

process.exit(failures ? 1 : 0)
