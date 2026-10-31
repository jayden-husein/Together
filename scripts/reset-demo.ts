// Deletes and reloads only the demo data: the rows flagged `demo` and the demo Accounts.
// Usage: npm run reset-demo -- staging|production
import { accounts, serverClient, password } from './demo.ts'

const db = serverClient()
const check = <T>({ data, error }: { data: T; error: unknown }) => {
  if (error) throw error
  return data
}

check(await db.rpc('delete_demo_data'))

const demoEmails = new Set(Object.values(accounts))
// ponytail: one page of 1000 users; paginate if the project ever has more real Accounts.
const { users } = check(await db.auth.admin.listUsers({ perPage: 1000 }))
for (const user of users.filter((u) => demoEmails.has(u.email!))) check(await db.auth.admin.deleteUser(user.id))

const ids = {} as Record<keyof typeof accounts, string>
for (const [role, email] of Object.entries(accounts) as [keyof typeof accounts, string][]) {
  const { user } = check(await db.auth.admin.createUser({ email, password, email_confirm: true }))
  ids[role] = user!.id
}

const demo = true
const [maya] = check(await db.from('persons').insert({ account_id: ids.maya, name: 'Maya', demo }).select())
check(await db.from('emergency_contacts').insert({ person_id: maya.id, account_id: ids.emergencyContact, demo }))
check(await db.from('coordinators').insert({ account_id: ids.coordinator, demo }))

// Hand-made flash flood around the Navajo Bridge overlook, Marble Canyon (GeoJSON is [lng, lat]).
const [incident] = check(
  await db
    .from('incidents')
    .insert({
      name: 'Flash flood at the bridge overlook',
      area: {
        type: 'Polygon',
        coordinates: [[[-111.638, 36.812], [-111.625, 36.812], [-111.625, 36.822], [-111.638, 36.822], [-111.638, 36.812]]],
      },
      starts_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      demo,
    })
    .select(),
)
const [mayaCase] = check(await db.from('cases').insert({ incident_id: incident.id, person_id: maya.id, demo }).select())
check(await db.from('case_events').insert({ case_id: mayaCase.id, action: 'opened', actor: null, demo }))

console.log(`Demo data reset: Maya's Case ${mayaCase.id} in Incident ${incident.id} is Unconfirmed.`)
