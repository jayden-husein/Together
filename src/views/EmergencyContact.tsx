import { copy, messages } from '../copy'
import { useAccount } from '../SignIn'
import { supabase } from '../lib/supabase'
import { Avatar, Button, Callout, Dialog, Skeleton, toast } from '../components'
import { formatTime } from '../ui'
import { cancelCantReach } from '../lib/checkIns'
import { useEffect, type ReactNode, useRef, useState } from 'react'
import { type ContactCase, fileCantReach, type IndividualUpdate, markIndividualUpdatesRead, useContactCases, useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge, UrgencyTag, statusClass } from '../ui'
import GeneralUpdateNotices from './GeneralUpdateNotices'

const key = ({ caseId, update }: IndividualUpdate) => `${caseId} ${update.at} ${'status' in update ? update.status : update.urgency}`

export default function EmergencyContact() {
  const {session}=useAccount()
  const [readIds,setReadIds]=useState<Set<string>>(new Set())
  const [limit,setLimit]=useState(25)
  const [muted,setMuted]=useState<string[]>([])
  useEffect(()=>{if(!session)return;void supabase.from('account_profiles').select('preferences').eq('account_id',session.user.id).maybeSingle().then(({data})=>setMuted(data?.preferences?.mutedCases??[]))},[session?.user.id])
  async function mute(caseId:string){const next=muted.includes(caseId)?muted.filter(x=>x!==caseId):[...muted,caseId];setMuted(next);if(session){const {data}=await supabase.from('account_profiles').select('preferences').eq('account_id',session.user.id).maybeSingle();const {error}=await supabase.from('account_profiles').upsert({account_id:session.user.id,preferences:{...data?.preferences,mutedCases:next}});if(error){setMuted(muted);toast(copy.could_not_save_mute_setting_retry)}}}
  const { data, error } = useIndividualUpdates()
  const updates=data?.filter(e=>!muted.includes(e.caseId)||'status' in e.update&&e.update.status==='needs_assistance')
  const cases = useContactCases()
  return (
    <div className="column">
      <header className="view-header">
        <h1>{copy.people_who_named_you} <span className="tag">{new Set(cases.data?.map(c=>c.traveler)??[]).size}</span></h1>
        <p className="lede">{copy.you_get_an_individual_update_when_their}</p>
      </header>
      <a href="#/traveler">{copy.you_also_have_a_traveler_page_go}</a>
      <section className="panel">
        <h2>{copy.their_cases}</h2>
        {cases.error && <p role="alert">{cases.error}</p>}
        {!cases.data ? (
          !cases.error && <Skeleton/>
        ) : cases.data.length === 0 ? (
          <p className="empty">{copy.none_of_your_travelers_is_in_a}</p>
        ) : (
          <ul className="rows" aria-label={copy.cases}>
            {cases.data.map(c => <CaseRow key={c.caseId} c={c} onFiled={cases.reload} recent={data?.filter(e=>e.caseId===c.caseId).slice(0,3)} muted={muted.includes(c.caseId)} onMute={()=>void mute(c.caseId)} />)}
          </ul>
        )}
        {/* Together holds only people who consented (ADR-0002), so there is no form for anyone else. */}
        <p>{copy.worried_about_someone_who_didnt_name_you}</p>
      </section>
      <GeneralUpdateNotices />
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <Skeleton/>
      ) : data.length === 0 ? (
        <p className="empty">{copy.no_individual_updates_yet}</p>
      ) : (
        // Status or Urgency, and time only (Case rules: Individual Update view), newest first.
        <ul className="rows" aria-label={copy.individual_updates}>
          {updates?.slice(0,limit).map((entry,index) => (
            <ReadUpdate entry={entry} key={key(entry)} onRead={()=>setReadIds(prev=>new Set([...prev,entry.unreadNotificationId!]))}><div className={'status' in entry.update ? `row ${statusClass(entry.update.status)}` : 'row'} key={key(entry)}>
              <div className="row-main">
                {(index===0 || new Date(updates![index-1].update.at).toDateString()!==new Date(entry.update.at).toDateString()) && <h3 className="day-heading">{new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(entry.update.at))}</h3>}
                <span className="row-name">{entry.traveler}</span>
                {entry.unreadNotificationId && !readIds.has(entry.unreadNotificationId) && <span className="new">{copy.new}</span>}
                {'status' in entry.update
                  ? <StatusBadge status={entry.update.status} outcome={entry.update.outcome} />
                  : <span>{copy.urgency_2}<UrgencyTag urgency={entry.update.urgency} /></span>}
              </div>
              {entry.cause && <p>{entry.cause}</p>}<SourceLine source={copy.individual_update} at={entry.update.at} />
            </div></ReadUpdate>
          ))}
        </ul>
      )}
      {updates && <p className="lede">{copy.showing}{Math.min(limit,updates.length)}{copy.of}{updates.length}{copy.individual_updates_2}</p>}{updates && updates.length>limit && <Button onClick={()=>setLimit(n=>n+25)}>{copy.load_more}</Button>}
      <Callout>{copy.in_a_real_emergency_call_911_or}</Callout>
    </div>
  )
}

function CaseRow({ c, onFiled, recent, muted, onMute }: { c: ContactCase; onFiled: () => void; recent?:IndividualUpdate[]; muted:boolean; onMute:()=>void }) {
  const [confirming, setConfirming] = useState(false)
  const [report, setReport] = useState<{id:string; at:number} | undefined>(() => c.openReport ? {id:c.openReport.id,at:Date.parse(c.openReport.at)} : undefined)
  // Reconcile local cancellation controls when a newer check-in closes the report.
  useEffect(() => { setReport(c.openReport ? {id:c.openReport.id,at:Date.parse(c.openReport.at)} : undefined) }, [c.openReport?.id,c.openReport?.at])
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed?: boolean }>()
  async function file() {
    if (sending) return // A double tap would store two Reports.
    setSending(true)
    setMessage(undefined)
    try {
      const id = await fileCantReach(c.caseId)
      setReport({id, at:Date.now()}); setConfirming(false); toast(copy.report_sent)
      setMessage({ text: copy.cantreach_report_sent_coordinators_will_see_it })
      onFiled()
    } catch (e) {
      setMessage({ text: copy.could_not_send_your_report_please_retry, failed: true })
    } finally {
      setSending(false)
    }
  }
  return (
    <li className={`row ${statusClass(c.status)}`}>
      <div className="row-main">
        <Avatar name={c.traveler}/><span className="row-name">{c.traveler}</span>
        <StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} />
      </div>
      <p>{c.incident}</p>{c.at&&<p className="source-line">{copy.last_update}{formatTime(c.at)}</p>}<Button aria-pressed={muted} onClick={onMute}>{muted?copy.unmute_updates:copy.mute_updates}</Button>{muted&&<p className="lede">{copy.needs_assistance_updates_still_appear}</p>}
      <ol className="mini-timeline" aria-label={`Recent status history for ${c.traveler}`}>{recent?.map(e=><li key={key(e)}><span>{'status' in e.update?e.update.status.replaceAll('_',' '):'Urgency updated'}</span><time dateTime={e.update.at}>{formatTime(e.update.at)}</time></li>)}</ol>
      {/* Nothing to add once the Case is resolved or already says Can't reach. */}
      {c.status !== 'resolved' && !c.openReport && !report && (
        <button type="button" className="button danger-outline" disabled={sending} onClick={() => setConfirming(true)}>{copy.i_cant_reach}{c.traveler}</button>
      )}
      {confirming && <Dialog title={messages.report_that_you_cant_reach(c.traveler)} onClose={() => setConfirming(false)}>
        <p>{c.status === 'safe' && c.safeAt && Date.now()-Date.parse(c.safeAt)<3600000 ? messages.checked_in_safe_at_are_you_sure(c.traveler,formatTime(c.safeAt)) : copy.this_report_goes_to_coordinators_please_confirm}</p>
        <div className="actions"><Button variant="danger" busy={sending} onClick={file}>{copy.yes_report_it}</Button><Button onClick={() => setConfirming(false)}>{copy.cancel}</Button></div>
      </Dialog>}
      {report && now-report.at<300000 && <p role="status">{copy.report_sent_2}{formatTime(new Date(report.at).toISOString())}{copy.text_7}<button className="link-button" disabled={sending} onClick={async () => { setSending(true); try { await cancelCantReach(report.id); setReport(undefined); setMessage({text:copy.report_cancelled}); toast(copy.report_cancelled_2); onFiled() } catch { setMessage({text:copy.could_not_cancel_the_report_retry, failed:true}) } finally { setSending(false) } }}>{copy.cancel_report}</button></p>}
      {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
    </li>
  )
}

function ReadUpdate({entry, children,onRead}:{entry:IndividualUpdate; children:ReactNode;onRead:()=>void}) {
  const ref = useRef<HTMLLIElement>(null)
  const [read,setRead]=useState(false)
  useEffect(() => {
    if (!entry.unreadNotificationId || !ref.current || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([e]) => { clearTimeout(timer); if (e.isIntersecting) timer=setTimeout(() => { void markIndividualUpdatesRead([entry.unreadNotificationId!]).then(()=>{setRead(true);onRead()}); observer.disconnect() },2000) },{threshold:.6})
    observer.observe(ref.current)
    return () => { clearTimeout(timer); observer.disconnect() }
  },[entry.unreadNotificationId])
  return <li className={read?'read-update':undefined} ref={ref} onClick={() => { if(entry.unreadNotificationId) void markIndividualUpdatesRead([entry.unreadNotificationId]).then(()=>{setRead(true);onRead()}) }}>{children}</li>
}
