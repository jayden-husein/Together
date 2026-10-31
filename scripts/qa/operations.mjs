import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const url=process.env.STAGING_SUPABASE_URL,key=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY
const options={auth:{persistSession:false,autoRefreshToken:false}}
const db=createClient(url,process.env.STAGING_SUPABASE_SECRET_KEY,options)
const dana=createClient(url,key,options);assert.ifError((await dana.auth.signInWithPassword({email:'coordinator@demo.together.example.com',password:process.env.DEMO_PASSWORD})).error)
const {data:{users}}=await db.auth.admin.listUsers({perPage:1000})
let alex=users.find(u=>u.email==='qa-coordinator@qa.together.example.com')
if(!alex){const {data,error}=await db.auth.admin.createUser({email:'qa-coordinator@qa.together.example.com',password:process.env.DEMO_PASSWORD,email_confirm:true});assert.ifError(error);alex=data.user;assert.ifError((await db.from('coordinators').insert({account_id:alex.id,name:'QA Coordinator',demo:true})).error)}
const other=createClient(url,key,options);assert.ifError((await other.auth.signInWithPassword({email:alex.email,password:process.env.DEMO_PASSWORD})).error)
const area={type:'Polygon',coordinates:[[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.11],[-112.1,36.1]]]}
const {data:incident,error}=await dana.rpc('manage_incident',{p_name:'QA operations incident',p_area:area,p_start:new Date().toISOString()});assert.ifError(error)
const {data:cases}=await dana.from('cases').select('id,person_id').eq('incident_id',incident);assert(cases.length,'Creating an incident must match existing confirmed itineraries')
const id=cases[0].id
const race=await Promise.all([dana,other].map(c=>c.rpc('record_case_event',{p_case_id:id,p_action:'claimed'})))
assert.equal(race.filter(r=>!r.error).length,1);assert.equal(race.find(r=>r.error)?.error.code,'PT409')
console.log('PASS incident creation matches existing itineraries; competing claims serialize')
const loser=race[0].error?dana:other
assert.ifError((await loser.rpc('record_case_event',{p_case_id:id,p_action:'claimed',p_takeover_reason:'Staging QA handoff'})).error)
const {data:{user:owner}}=await loser.auth.getUser()
assert.ifError((await loser.rpc('record_case_event',{p_case_id:id,p_action:'released'})).error)
assert.ifError((await dana.rpc('bulk_case_action',{p_cases:cases.slice(0,2).map(c=>c.id),p_action:'claimed'})).error)
assert.ifError((await dana.rpc('record_case_event',{p_case_id:id,p_action:'claimed',p_assignee:alex.id})).error)
console.log('PASS takeover with reason, owner release, bulk claim, reassignment')
assert.ifError((await dana.rpc('resolve_incident',{p_incident:incident,p_reason:'QA checks complete',p_outcome:'not_in_area'})).error)
const {data:events}=await dana.from('case_events').select('case_id').eq('action','resolved').in('case_id',cases.map(c=>c.id));assert.equal(events.length,cases.length)
console.log('PASS reasoned incident resolution closes outstanding cases with explicit outcome')
await Promise.all([dana,other].map(c=>c.auth.signOut()))
