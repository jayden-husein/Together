import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { usePoll } from './checkIns'
import { useAccount } from '../SignIn'
export type Connections={ contacts:{name:string;email:string}[]; travelers:{id:string;name:string}[] }
export function useConnections(){const {session,capabilities}=useAccount();return usePoll(useCallback(async()=>{if(!session||capabilities?.isCoordinator)return [];const {data}=await supabase.rpc('my_connections').throwOnError();return [data as Connections]},[session?.user.id,capabilities?.isCoordinator]))}
export async function contact(email:string,remove=false,person?:string){await supabase.rpc('manage_emergency_contact',{p_email:email||null,p_person:person??null,p_remove:remove}).throwOnError();window.dispatchEvent(new Event('together:data'))}
export function useActivity(incidentId?:string){return usePoll(useCallback(async()=>{let q=supabase.from('activity').select('id,action,created_at,actor,case_id,details').order('created_at',{ascending:false}).limit(100);if(incidentId)q=q.eq('incident_id',incidentId);const{data}=await q.throwOnError();const {data:names}=await supabase.from('coordinators').select('account_id,name').throwOnError();return data.map(event=>({...event,actorName:names.find(c=>c.account_id===event.actor)?.name ?? (event.actor?`Coordinator ${event.actor.slice(0,8)}`:'Together')}))},[incidentId]))}
export function usePresence(caseId:string){
 const {session}=useAccount();const [others,setOthers]=useState<string[]>([])
 useEffect(()=>{if(!session)return;let active=true;const update=async()=>{await supabase.from('case_presence').upsert({account_id:session.user.id,case_id:caseId,seen_at:new Date().toISOString()});const{data}=await supabase.from('case_presence').select('account_id,coordinators(name)').eq('case_id',caseId).neq('account_id',session.user.id).gt('seen_at',new Date(Date.now()-45000).toISOString());if(active)setOthers((data??[]).map(r=>{ const names=r.coordinators as unknown as {name:string}|null;return names?.name??'Another coordinator' }))};void update();const t=setInterval(update,15000);return()=>{active=false;clearInterval(t);void supabase.from('case_presence').delete().eq('account_id',session.user.id)}},[caseId,session?.user.id]);return others
}
export function download(name:string,content:string,type='text/plain'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function csv(rows:unknown[][]){return '\ufeff'+rows.map(row=>row.map(value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}).join(',')).join('\r\n')}
export function analytics(action:string){window.dispatchEvent(new CustomEvent('together:analytics',{detail:{action,at:new Date().toISOString()}}))}
