import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
const db=createClient(process.env.STAGING_SUPABASE_URL,process.env.STAGING_SUPABASE_SECRET_KEY,{auth:{persistSession:false}})
for(const table of ['incidents','potential_incidents','persons','cases','reports']) {
 const {count,error}=await db.from(table).select('*',{count:'exact',head:true});assert.ifError(error);console.log(table,count)
}
const {data:pending}=await db.from('potential_incidents').select('id, starts_at').is('incident_id',null).is('dismissed_at',null)
console.log('Pending fixtures:',pending)
