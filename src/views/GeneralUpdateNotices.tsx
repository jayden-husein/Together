import { useEffect, useRef, useState } from 'react'
import { type GeneralUpdateNotice, markNotificationsRead, useGeneralUpdateNotices } from '../lib/checkIns'
import { SourceLine } from '../ui'
import { Icon, Skeleton } from '../components'
export default function GeneralUpdateNotices() {
  const { data }=useGeneralUpdateNotices()
  const [shown,setShown]=useState<GeneralUpdateNotice[]>([])
  const [read,setRead]=useState<Set<string>>(new Set())
  useEffect(()=>{setShown(prev=>[...(data??[]),...prev.filter(s=>!data?.some(n=>n.notificationId===s.notificationId))])},[data])
  async function mark(id:string) {try{await markNotificationsRead([id]);setRead(prev=>new Set([...prev,id]))}catch{/* Retry on next visibility change. */}}
  return <section className="panel notices" aria-labelledby="notices-heading"><h2 id="notices-heading"><Icon name="megaphone"/> General Updates</h2>
    {!data&&!shown.length?<Skeleton/>:!shown.length?<p className="empty">No General Updates yet.</p>:<ul className="rows" aria-label="New General Updates">{shown.map(n=><Notice key={n.notificationId} n={n} unread={!read.has(n.notificationId)} mark={()=>void mark(n.notificationId)}/>)}</ul>}
    <a href="#/">See every General Update on the public incident page</a>
  </section>
}
function Notice({n,unread,mark}:{n:GeneralUpdateNotice;unread:boolean;mark:()=>void}) {
  const ref=useRef<HTMLLIElement>(null)
  const action=useRef(mark);action.current=mark
  useEffect(()=>{if(!unread||!ref.current||typeof IntersectionObserver==='undefined')return;let timer:ReturnType<typeof setTimeout>|undefined;const observer=new IntersectionObserver(([e])=>{clearTimeout(timer);if(e.isIntersecting)timer=setTimeout(()=>action.current(),2000)},{threshold:.6});observer.observe(ref.current);return()=>{clearTimeout(timer);observer.disconnect()}},[unread])
  return <li ref={ref} className="row" onClick={mark}><div className="row-main"><span className="row-name">{n.incident}</span>{unread&&<span className="new">New</span>}</div><p>{n.body}</p><SourceLine source="General Update" at={n.at}/></li>
}
