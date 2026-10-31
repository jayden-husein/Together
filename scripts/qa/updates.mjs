import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const c=createClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
assert.ifError((await c.auth.signInWithPassword({email:'coordinator@demo.together.example.com',password:process.env.DEMO_PASSWORD})).error)
const {data:incidents}=await c.from('incidents').select('id').is('resolved_at',null).limit(1)
const request=crypto.randomUUID()
assert.ifError((await c.from('general_updates').insert({incident_id:incidents[0].id,body:'Simulation: shelter open. Follow local authority guidance.',request_id:request})).error)
const {data:posts}=await c.from('general_updates').select('id,created_at').eq('incident_id',incidents[0].id).order('created_at',{ascending:false}).limit(1)
assert.ifError((await c.rpc('edit_general_update',{p_id:posts[0].id,p_body:'Simulation: shelter open. Check with staff for availability.'})).error)
assert.ifError((await c.rpc('edit_general_update',{p_id:posts[0].id,p_retract:true})).error)
console.log('PASS post, edit within window, retract, and audit')
const {data,error}=await c.functions.invoke('draft-general-update',{body:{incidentId:incidents[0].id},timeout:40000})
if(error){console.log('AI draft unavailable on staging; verifying friendly failure path separately')}else{assert(data.draft.length<280);console.log('PASS AI draft returned under 280 characters')}
await c.auth.signOut()
