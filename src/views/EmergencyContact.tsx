import { Avatar, Button, Callout, Dialog, toast } from '../components'
import { formatTime } from '../ui'
import { cancelCantReach } from '../lib/checkIns'
import { useEffect, type ReactNode, useRef, useState } from 'react'
import { type ContactCase, fileCantReach, type IndividualUpdate, markIndividualUpdatesRead, useContactCases, useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge, UrgencyTag, statusClass } from '../ui'
import GeneralUpdateNotices from './GeneralUpdateNotices'

const key = ({ caseId, update }: IndividualUpdate) => `${caseId} ${update.at} ${'status' in update ? update.status : update.urgency}`

export default function EmergencyContact() {
  const { data, error } = useIndividualUpdates()
  const cases = useContactCases()
  return (
    <div className="column">
      <header className="view-header">
        <h1>People who named you</h1>
        <p className="lede">You get an Individual Update when their Case changes.</p>
      </header>
      <a href="#/traveler">You also have a Traveler page. Go to Traveler</a>
      <section className="panel">
        <h2>Their Cases</h2>
        {cases.error && <p role="alert">{cases.error}</p>}
        {!cases.data ? (
          !cases.error && <p className="empty">Loading…</p>
        ) : cases.data.length === 0 ? (
          <p className="empty">None of your travelers is in a Case.</p>
        ) : (
          <ul className="rows" aria-label="Cases">
            {cases.data.map(c => <CaseRow key={c.caseId} c={c} onFiled={cases.reload} />)}
          </ul>
        )}
        {/* Together holds only people who consented (ADR-0002), so there is no form for anyone else. */}
        <p>Worried about someone who didn't name you? Together can't take reports about them: contact 911 or local law enforcement.</p>
      </section>
      <GeneralUpdateNotices />
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : data.length === 0 ? (
        <p className="empty">No Individual Updates yet.</p>
      ) : (
        // Status or Urgency, and time only (Case rules: Individual Update view), newest first.
        <ul className="rows" aria-label="Individual Updates">
          {data.slice(0,100).map(entry => (
            <ReadUpdate entry={entry} key={key(entry)}><div className={'status' in entry.update ? `row ${statusClass(entry.update.status)}` : 'row'} key={key(entry)}>
              <div className="row-main">
                <span className="row-name">{entry.traveler}</span>
                {entry.unreadNotificationId && <span className="new">New</span>}
                {'status' in entry.update
                  ? <StatusBadge status={entry.update.status} outcome={entry.update.outcome} />
                  : <span>Urgency: <UrgencyTag urgency={entry.update.urgency} /></span>}
              </div>
              {entry.cause && <p>{entry.cause}</p>}<SourceLine source="Individual Update" at={entry.update.at} />
            </div></ReadUpdate>
          ))}
        </ul>
      )}
      <Callout>In a real emergency, call 911 or local law enforcement. Together is a simulation.</Callout>
    </div>
  )
}

function CaseRow({ c, onFiled }: { c: ContactCase; onFiled: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [report, setReport] = useState<{id:string; at:number} | undefined>(() => c.openReport ? {id:c.openReport.id,at:Date.parse(c.openReport.at)} : undefined)
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
      setReport({id, at:Date.now()}); setConfirming(false); toast('Report sent')
      setMessage({ text: "Can't-reach report sent. Coordinators will see it on the Case." })
      onFiled()
    } catch (e) {
      setMessage({ text: 'Could not send your report. Please retry.', failed: true })
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
      <p>{c.incident}</p>
      {/* Nothing to add once the Case is resolved or already says Can't reach. */}
      {c.status !== 'resolved' && !c.openReport && !report && (
        <button type="button" className="button danger-outline" disabled={sending} onClick={() => setConfirming(true)}>I can't reach {c.traveler}</button>
      )}
      {confirming && <Dialog title={`Report that you can't reach ${c.traveler}?`} onClose={() => setConfirming(false)}>
        <p>{c.status === 'safe' && c.safeAt && Date.now()-Date.parse(c.safeAt)<3600000 ? `${c.traveler} checked in Safe at ${formatTime(c.safeAt)}. Are you sure you can't reach them?` : 'This report goes to Coordinators. Please confirm you cannot reach your traveler.'}</p>
        <div className="actions"><Button variant="danger" busy={sending} onClick={file}>Yes, report it</Button><Button onClick={() => setConfirming(false)}>Cancel</Button></div>
      </Dialog>}
      {report && now-report.at<300000 && <p role="status">Report sent {formatTime(new Date(report.at).toISOString())}. <button className="link-button" disabled={sending} onClick={async () => { setSending(true); try { await cancelCantReach(report.id); setReport(undefined); setMessage({text:'Report cancelled.'}); toast('Report cancelled'); onFiled() } catch { setMessage({text:'Could not cancel the report. Retry.', failed:true}) } finally { setSending(false) } }}>Cancel report</button></p>}
      {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
    </li>
  )
}

function ReadUpdate({entry, children}:{entry:IndividualUpdate; children:ReactNode}) {
  const ref = useRef<HTMLLIElement>(null)
  const [read,setRead]=useState(false)
  useEffect(() => {
    if (!entry.unreadNotificationId || !ref.current || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([e]) => { clearTimeout(timer); if (e.isIntersecting) timer=setTimeout(() => { void markIndividualUpdatesRead([entry.unreadNotificationId!]).then(()=>setRead(true)); observer.disconnect() },2000) },{threshold:.6})
    observer.observe(ref.current)
    return () => { clearTimeout(timer); observer.disconnect() }
  },[entry.unreadNotificationId])
  return <li className={read?'read-update':undefined} ref={ref} onClick={() => { if(entry.unreadNotificationId) void markIndividualUpdatesRead([entry.unreadNotificationId]).then(()=>setRead(true)) }}>{children}</li>
}
