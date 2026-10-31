import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const clients = await Promise.all(['maya','sam','coordinator'].map(async name=> {
  const c=createClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const {error}=await c.auth.signInWithPassword({email:`${name}@demo.together.example.com`,password:process.env.DEMO_PASSWORD});assert.ifError(error);return c
}))
const [maya,sam,dana]=clients
const {data:cases,error}=await maya.from('cases').select('id');assert.ifError(error);assert(cases.length)
const id=cases[0].id
assert.ifError((await maya.rpc('submit_check_in',{p_case_id:id,p_status:'safe'})).error)
const {data:report,error:reportError}=await sam.rpc('file_cant_reach',{p_case_id:id,p_confirmed:true});assert.ifError(reportError)
const repeated=await sam.rpc('file_cant_reach',{p_case_id:id,p_confirmed:true});assert.equal(repeated.data,report)
const {data:open}=await sam.rpc('my_open_contact_reports');const reportAt=open.find(r=>r.id===report)?.created_at;assert(reportAt)
assert.ifError((await sam.rpc('cancel_cant_reach',{p_report_id:report})).error)
assert.ifError((await dana.rpc('record_case_event',{p_case_id:id,p_action:'contact_attempt',p_reached:false,p_note:'QA private note: must stay coordinator-only'})).error)
const {data:updates,error:projectionError}=await sam.rpc('contact_case_updates');assert.ifError(projectionError)
assert(updates.some(u=>u.entry_kind==='contact_attempt'&&u.source==='coordinator_not_reached'))
assert(!JSON.stringify(updates).includes('QA private note'))
assert(!updates.some(u=>u.entry_kind==='cant_reach'&&u.at===reportAt))
assert.ifError((await dana.rpc('send_check_in_request',{p_case_id:id})).error)
assert.equal((await sam.rpc('send_check_in_request',{p_case_id:id})).error?.code,'42501')
console.log('PASS safe check-in; one open report; cancellation; private-note isolation; attempt update; coordinator request; forbidden contact request')
await Promise.all(clients.map(c=>c.auth.signOut()))
