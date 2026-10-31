import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const url=process.env.STAGING_SUPABASE_URL,key=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY
const clients={}
for(const role of ['maya','sam','coordinator']){const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});assert.ifError((await c.auth.signInWithPassword({email:`${role}@demo.together.example.com`,password:process.env.DEMO_PASSWORD})).error);clients[role]=c}
const {data:cases}=await clients.maya.from('cases').select('id');const id=cases[0].id
const forbiddenActions=[['record_case_event',{p_case_id:id,p_action:'claimed'}],['send_check_in_request',{p_case_id:id}],['restore_potential_incident',{p_id:id}],['dismiss_potential_incident',{p_id:id,p_reason:'QA'}],['resolve_incident',{p_incident:id,p_reason:'QA',p_outcome:'reached'}],['edit_general_update',{p_id:id,p_retract:true}],['manage_incident',{p_name:'QA',p_area:{},p_start:new Date().toISOString()}],['bulk_case_action',{p_cases:[id],p_action:'claimed'}]]
for(const role of ['maya','sam']){
 for(const [name,args]of forbiddenActions){const {error}=await clients[role].rpc(name,args);assert.equal(error?.code,'42501',`${role} forbidden ${name}`)}
 const result=await clients[role].functions.invoke('draft-general-update',{body:{incidentId:id}});assert.equal(result.error?.context?.status,403)
 const {data}=await clients[role].from('case_events').select('note');assert.equal(data?.length,0)
 console.log(`PASS ${role}: every coordinator RPC forbidden, AI forbidden, private notes unavailable`)
}
for(const [name,args]of [['submit_check_in',{p_case_id:id,p_status:'safe'}],['file_cant_reach',{p_case_id:id,p_confirmed:true}],['save_traveler_profile',{p_name:'QA'}],['manage_emergency_contact',{p_email:'maya@demo.together.example.com'}]]){const{error}=await clients.coordinator.rpc(name,args);assert.equal(error?.code,'42501',`Coordinator forbidden ${name}`)}
const edge=await clients.coordinator.functions.invoke('confirm-itinerary',{body:{}});assert.equal(edge.error?.context?.status,403)
const forbiddenContact=await clients.maya.rpc('manage_emergency_contact',{p_email:'coordinator@demo.together.example.com'});assert.equal(forbiddenContact.error?.code,'22023')
console.log('PASS coordinator: traveler/report/contact operations forbidden, cannot be named as a contact')
const count=async()=>{const {count}=await clients.maya.from('reports').select('*',{count:'exact',head:true}).eq('case_id',id).eq('kind','check_in');return count}
assert.ifError((await clients.maya.rpc('submit_check_in',{p_case_id:id,p_status:'safe'})).error);const before=await count();assert.ifError((await clients.maya.rpc('submit_check_in',{p_case_id:id,p_status:'safe'})).error);assert.equal(await count(),before)
const {data:health}=await createClient(url,key).rpc('health');assert.equal(health.status,'ok')
console.log('PASS duplicate check-in prevention and anonymous health check')
await Promise.all(Object.values(clients).map(c=>c.auth.signOut()))
