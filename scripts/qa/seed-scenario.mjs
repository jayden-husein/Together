import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const options={auth:{persistSession:false,autoRefreshToken:false}}
const db=createClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_SECRET_KEY,options)
const {data:existing}=await db.from('incidents').select('id').is('resolved_at',null).limit(1)
if(!existing.length){const {error}=await db.from('incidents').insert({name:'Flash flood at Phantom Ranch',area:{type:'Polygon',coordinates:[[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.11],[-112.1,36.1]]]},starts_at:new Date(Date.now()-3600000).toISOString(),demo:true});assert.ifError(error)}
const maya=createClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,options)
assert.ifError((await maya.auth.signInWithPassword({email:'maya@demo.together.example.com',password:process.env.DEMO_PASSWORD})).error)
const {error}=await maya.functions.invoke('confirm-itinerary',{body:{id:crypto.randomUUID(),stops:[{place:'Phantom Ranch',start:new Date(Date.now()+900000).toISOString(),end:new Date(Date.now()+7200000).toISOString()}],originalText:'Staging QA scenario'}})
assert.ifError(error)
console.log('PASS staging scenario: confirmed overlapping itinerary and case')
await maya.auth.signOut()
