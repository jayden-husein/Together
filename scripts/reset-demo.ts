// Deletes and reloads only the demo data: the rows flagged `demo` and the demo Accounts.
// Usage: npm run reset-demo -- staging|production
import { confirmedStops } from '../supabase/functions/_shared/itinerary.ts'
import { accounts, serverClient, password, signIn, url, publishableKey } from './demo.ts'

const db = serverClient()
const check = <T>({ data, error }: { data: T; error: unknown }) => {
  if (error) throw error
  return data
}

// Check that confirmation is deployed before clearing the previous demo.
const probe = await fetch(url + '/functions/v1/confirm-itinerary', { headers: { apikey: publishableKey } })
if (probe.status !== 405) throw new Error('Deploy confirm-itinerary to the target project before resetting the demo.')
check(await db.rpc('delete_demo_data'))

const names = ['Maya', 'Alex', 'Jordan', 'Quinn', 'Avery', 'Riley', 'Sam', 'Taylor', 'Morgan', 'Sage',
  'Reese', 'Blair', 'Jules', 'River', 'Noor', 'Ellis', 'Indy', 'Ari', 'Remy', 'Casey']
const travelers = names.map((name, i) => ({ name, email: `traveler-${i + 1}@demo.together.example.com` }))
const demoEmails = new Set([...Object.values(accounts), ...travelers.map(t => t.email)])
// ponytail: one page of 1000 users; paginate if the project ever has more real Accounts.
const { users } = check(await db.auth.admin.listUsers({ perPage: 1000 }))
for (const user of users.filter((u) => demoEmails.has(u.email!))) check(await db.auth.admin.deleteUser(user.id))

async function createAccount(email: string) {
  const { user } = check(await db.auth.admin.createUser({ email, password, email_confirm: true }))
  return user!.id
}

const ids = {} as Record<keyof typeof accounts, string>
for (const [role, email] of Object.entries(accounts) as [keyof typeof accounts, string][]) {
  ids[role] = await createAccount(email)
}

const demo = true
const [maya] = check(await db.from('persons').insert({ account_id: ids.maya, name: 'Maya', demo }).select())
check(await db.from('emergency_contacts').insert({ person_id: maya.id, account_id: ids.emergencyContact, demo }))
check(await db.from('coordinators').insert({ account_id: ids.coordinator, demo }))

// Hand-made flash flood along Bright Angel Creek at Phantom Ranch and the Black Bridge (GeoJSON is [lng, lat]).
const [incident] = check(
  await db
    .from('incidents')
    .insert({
      name: 'Flash flood at Phantom Ranch',
      area: {
        type: 'Polygon',
        coordinates: [[[-112.1, 36.095], [-112.085, 36.095], [-112.085, 36.112], [-112.1, 36.112], [-112.1, 36.095]]],
      },
      starts_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      demo,
    })
    .select(),
)
// Use the same authenticated confirmation as manual entry so the seed exercises Match.
const hour = 60 * 60_000
const now = Date.now()
async function confirm(email: string, place: string, start: number) {
  const stops = [{ place, start: new Date(start).toISOString(), end: new Date(start + hour).toISOString() }]
  if (start < Date.now()) {
    // Historical fixtures exercise non-overlap without allowing travelers to backdate plans.
    const client = await signIn(email)
    const { data: { user } } = await client.auth.getUser()
    const { data: person } = await db.from('persons').select('id').eq('account_id', user!.id).single().throwOnError()
    check(await db.rpc('confirm_itinerary', { p_report: crypto.randomUUID(), p_account: user!.id,
      p_person: person.id, p_stops: confirmedStops(stops, start), p_matches: [] }))
    return
  }
  const client = await signIn(email)
  check(await client.functions.invoke('confirm-itinerary', { body: { id: crypto.randomUUID(), stops } }))
}
await confirm(accounts.maya, 'Phantom Ranch', now + hour)
for (const [i, { name, email }] of travelers.entries()) {
  const accountId = await createAccount(email)
  check(await db.from('persons').insert({ account_id: accountId, name, demo }))
  // One group overlaps, one stays on the rim, one visited before the flood.
  await confirm(email, i % 3 === 1 ? 'Mather Point' : 'Phantom Ranch', i % 3 === 2 ? now - 24 * hour : now + hour)
}
console.log(`Reset 21 traveler Itineraries for Incident ${incident.id}.`)
