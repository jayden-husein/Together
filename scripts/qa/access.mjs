import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const options = { auth: { persistSession: false, autoRefreshToken: false } }
for (const name of ['maya','sam','coordinator']) {
  const client = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_PUBLISHABLE_KEY, options)
  const { error } = await client.auth.signInWithPassword({ email: `${name}@demo.together.example.com`, password: process.env.DEMO_PASSWORD })
  assert.ifError(error)
  const { data: c, error: failure } = await client.rpc('account_capabilities')
  assert.ifError(failure)
  assert.equal(c.isCoordinator, name === 'coordinator')
  if (!c.isCoordinator) {
    const { error } = await client.rpc('record_case_event', { p_case_id: '00000000-0000-0000-0000-000000000000', p_action: 'claimed' })
    assert.equal(error?.code, '42501')
  }
  console.log(`PASS ${name}: capabilities and forbidden coordinator action`)
  await client.auth.signOut()
}
