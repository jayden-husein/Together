import { useDraft } from '../lib/drafts'
import { csv, download, useActivity, usePresence } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { type PublicIncident, useIncidents } from '../lib/checkIns'
import { sendCheckInRequest, restorePotentialIncident } from '../lib/checkIns'
import { Avatar, Button, Callout, Dialog, Drawer, EmptyState, Icon, Skeleton, Switch, Tabs, toast } from '../components'
import PostGeneralUpdate from './PostGeneralUpdate'
import PotentialIncidentReview, { DismissalLine } from './PotentialIncidentReview'
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Urgency } from '../lib/caseRules'
import { type CaseHistoryItem, type CoordinatorAction, type QueueCase, recordCaseEvent, useDismissedIncidents, usePendingIncidents, useCaseHistory, useQueue } from '../lib/checkIns'
import { type CaseStatus, OUTCOME_LABEL, type Outcome, SourceLine, StatusBadge, Stops, URGENCY_LABEL, UrgencyTag, formatTime, statusClass } from '../ui'

// Queue order, so the summary reads the same way as the list below it.
const STATUSES: CaseStatus[] = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved']

// What set each status, for the row's source line.
const SOURCE: Record<CaseStatus, string> = {
  needs_assistance: 'Check-in', safe: 'Check-in', cant_reach: "Can't-reach report", unconfirmed: 'Case opened', resolved: 'Resolved',
}

export default function Coordinator() {
  const initial = new URLSearchParams(window.location.hash.split('?')[1])
  const [includeResolved, setIncludeResolved] = useState(initial.get('resolved') === '1')
  const [search,setSearch] = useState(initial.get('q') ?? '')
  const [ownership,setOwnership] = useState(initial.get('owner') ?? 'all')
  const [status,setStatus] = useState(initial.get('status') ?? 'all')
  const [sort,setSort] = useState(initial.get('sort') ?? 'priority')
  const [incidentId,setIncidentId] = useState(initial.get('incident') ?? '')
  const [limit,setLimit] = useState(25)
  const [composer,setComposer] = useState(false)
  const [bulk,setBulk] = useState<Set<string>>(new Set())
  const [bulkDialog,setBulkDialog] = useState(false)
  const [bulkReached,setBulkReached] = useState(false)
  const [bulkNote,setBulkNote] = useState('')
  const [busy,setBusy] = useState(false)
  const [includeNotes,setIncludeNotes] = useState(false)
  const [activity,setActivity] = useState(false)
  const [manage,setManage] = useState(false)
  const { data, error, reload } = useQueue(includeResolved)
  const incidents = useIncidents()
  const incident = incidents.data?.find(i=>i.id===incidentId) ?? incidents.data?.find(i=>!i.resolved_at) ?? incidents.data?.[0]
  const events = useActivity(incident?.id)
  const pending = usePendingIncidents()
  const dismissed = useDismissedIncidents()
  const hash = useSyncExternalStore(callback=>{window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)},()=>window.location.hash)
  const selected = hash.split('?')[0].split('/case/')[1]
  function select(id?:string){window.location.hash=`#/coordinator${id?`/case/${id}`:''}${window.location.hash.includes('?')?'?'+window.location.hash.split('?')[1]:''}`}
  function filter(key:string,value:string){const p=new URLSearchParams(window.location.hash.split('?')[1]);if(value)p.set(key,value);else p.delete(key);window.location.hash=window.location.hash.split('?')[0]+(p.size?'?'+p:'');setLimit(25)}
  useEffect(()=>{const sync=()=>{const p=new URLSearchParams(window.location.hash.split('?')[1]);setSearch(p.get('q')??'');setOwnership(p.get('owner')??'all');setStatus(p.get('status')??'all');setSort(p.get('sort')??'priority');setIncludeResolved(p.get('resolved')==='1');setIncidentId(p.get('incident')??'')};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[])
  const cases = (data ?? []).filter(c=>(!incident || c.incidentId === incident.id || !c.incidentId) && (includeResolved || c.status!=='resolved'))
  const matching = cases.filter(c=>(status==='all'||c.status===status) && (ownership==='all'||ownership==='mine'&&c.ownedByMe||ownership==='unclaimed'&&!c.owner) && `${c.traveler} ${c.incident}`.toLowerCase().includes(search.toLowerCase()))
  const visible = [...matching].sort((a,b)=>sort==='name'?a.traveler.localeCompare(b.traveler):sort==='oldest'?Date.parse(a.at)-Date.parse(b.at):sort==='newest'?Date.parse(b.at)-Date.parse(a.at):0)
  const open = (data??[]).find(c=>c.caseId===selected)
  async function bulkAction(action:'claimed'|'contact_attempt'){
    if(busy)return;setBusy(true)
    try{await supabase.rpc('bulk_case_action',{p_cases:[...bulk],p_action:action,p_reached:action==='contact_attempt'?bulkReached:null,p_note:action==='contact_attempt'?bulkNote:null}).throwOnError();setBulk(new Set());setBulkDialog(false);reload();toast('Bulk action recorded')}catch{toast('Could not apply the bulk action. A case may already be claimed. Retry.')}finally{setBusy(false)}
  }
  async function exportCases(){
    try{const ids=cases.map(c=>c.caseId);const {data:attempts}=await supabase.from('case_events').select('case_id,reached,created_at,note,action').in('case_id',ids).in('action',includeNotes?['contact_attempt','note']:['contact_attempt']).order('created_at',{ascending:false}).throwOnError();download('together-cases.csv',csv([['Name','Status','Owner','Last update','Last contact attempt',...(includeNotes?['Notes']:[])],...cases.map(c=>[c.traveler,c.status,c.owner??'Unclaimed',c.at,attempts.find(a=>a.case_id===c.caseId&&a.action==='contact_attempt')?.created_at??'',...(includeNotes?[attempts.filter(a=>a.case_id===c.caseId).map(a=>a.note).filter(Boolean).join(' | ')]:[])])]),'text/csv')}catch{toast('Could not export cases. Retry.')}
  }
  return <div className="coordinator">
    <header className="view-header queue-heading"><div><h1>Cases</h1><label className="sr-only" htmlFor="queue-incident">Incident</label><select id="queue-incident" value={incident?.id??''} onChange={e=>{setIncidentId(e.target.value);filter('incident',e.target.value)}}>{incidents.data?.map(i=><option key={i.id} value={i.id}>{i.name} · {i.resolved_at?'Resolved':'Ongoing'}</option>)}</select></div><div className="actions"><a className="button" href="#/">View public page</a><Button variant="primary" onClick={()=>setComposer(true)}>Post update</Button></div></header>
    <ul className="summary stats" aria-label="Cases by status">{STATUSES.map(s=><li key={s}><button type="button" className={`stat-card ${statusClass(s)}`} aria-pressed={status===s} onClick={()=>{setStatus(status===s?'all':s);filter('status',status===s?'':s)}}><span className="summary-count">{cases.filter(c=>c.status===s).length}</span><StatusBadge status={s}/><progress value={cases.filter(c=>c.status===s).length} max={cases.length||1}/></button></li>)}</ul>
    <section className="queue-toolbar" aria-label="Case filters"><label className="search-field"><Icon name="search"/><span className="sr-only">Search cases</span><input type="search" placeholder="Search cases" value={search} onChange={e=>{setSearch(e.target.value);filter('q',e.target.value)}}/></label><div className="segmented" aria-label="Ownership">{['all','mine','unclaimed'].map(x=><Button key={x} aria-pressed={ownership===x} onClick={()=>{setOwnership(x);filter('owner',x)}}>{x==='all'?'All':x==='mine'?'Mine':'Unclaimed'}</Button>)}</div><label>Sort<select value={sort} onChange={e=>{setSort(e.target.value);filter('sort',e.target.value)}}><option value="priority">Priority</option><option value="name">Name</option><option value="oldest">Oldest</option><option value="newest">Newest</option></select></label><Switch label="Include resolved" checked={includeResolved} onChange={v=>{setIncludeResolved(v);filter('resolved',v?'1':'')}}/></section>
    <div className="queue-secondary actions"><Button onClick={()=>setActivity(!activity)}>{activity?'Case queue':'Activity'}</Button><Button onClick={()=>setManage(true)}>Create / manage incidents</Button><Button onClick={exportCases}>Export cases (CSV)</Button><label><input type="checkbox" checked={includeNotes} onChange={e=>setIncludeNotes(e.target.checked)}/> Include notes</label>{bulk.size>0&&<Button onClick={()=>setBulkDialog(true)}>Act on {bulk.size} selected cases</Button>}</div>
    {activity?<section className="panel activity-feed"><h2>Incident activity</h2><ul className="timeline">{events.data?.map(e=><li key={e.id}><strong>{e.action.replaceAll('_',' ')}</strong><SourceLine source={e.actor?'Coordinator':'Together'} at={e.created_at}/></li>)}</ul></section>:<>
    <section className="queue-list" aria-label="Case queue"><h2 className="sr-only">Case queue</h2>{error?<Callout tone="danger">{error}<Button onClick={reload}>Retry</Button></Callout>:!data?<Skeleton/>:!visible.length?<EmptyState title="No matching cases">Try another filter or search.</EmptyState>:<ul className="rows" aria-label="Case queue">{visible.slice(0,limit).map((c,index)=><li key={c.caseId}><div className={`queue-row ${statusClass(c.status)} ${selected===c.caseId?'selected':''}`}><label className="bulk-check"><span className="sr-only">Select {c.traveler} for bulk action</span><input type="checkbox" checked={bulk.has(c.caseId)} onChange={e=>setBulk(prev=>{const next=new Set(prev);if(e.target.checked)next.add(c.caseId);else next.delete(c.caseId);return next})}/></label><button type="button" className="case-select" aria-pressed={c.caseId===selected} onClick={()=>select(c.caseId===selected?undefined:c.caseId)}><Avatar name={c.traveler}/><span className="case-meta"><strong>{c.traveler}</strong><span>{c.incident}</span><span>{c.owner?(c.ownedByMe?'You':`Claimed by ${c.owner}`):'Unclaimed'} · <time dateTime={c.at}>{formatTime(c.at)}</time></span></span><StatusBadge status={c.status}/></button></div>{['needs_assistance','cant_reach'].includes(c.status)&&<p className={`escalation ${Date.now()-Date.parse(c.at)>900000?'overdue':''}`}>{Math.max(0,Math.floor((Date.now()-Date.parse(c.at))/60000))} min since update · escalation after 15 min</p>}</li>)}</ul>}<p className="lede">Showing {Math.min(limit,visible.length)} of {visible.length}</p>{visible.length>limit&&<Button onClick={()=>setLimit(n=>n+25)}>Load more</Button>}</section>
    <div className={`detail-container ${open?'has-detail':''}`}>{open?<><a className="mobile-case-back button" href={`#/coordinator${window.location.hash.includes('?')?'?'+window.location.hash.split('?')[1]:''}`}>Back to cases</a><CaseDetail key={open.caseId} c={open} onChange={reload}/></>:<section className="panel case-detail"><EmptyState title="Select a case" icon="users">Choose a traveler to review their timeline and record your next action.</EmptyState></section>}</div></>}
    {pending.data?.map(draft=><PotentialIncidentReview key={draft.id} draft={draft} onDecided={()=>{pending.reload();dismissed.reload();reload()}}/>)}
    {!!dismissed.data?.length&&<details className="panel dismissed"><summary>{dismissed.data.length} dismissed potential incident{dismissed.data.length!==1?'s':''}</summary><ul className="rows">{dismissed.data.map(d=><li className="row" key={d.id}><strong>{d.name}</strong><DismissalLine dismissal={d}/><Button onClick={async()=>{try{await restorePotentialIncident(d.id);dismissed.reload();pending.reload();toast('Potential incident restored')}catch{toast('Could not restore. Retry.')}}}>Restore</Button></li>)}</ul></details>}
    {composer&&<Drawer title="General Update" onClose={()=>setComposer(false)}><PostGeneralUpdate/></Drawer>}
    {manage&&<Drawer title="Manage incidents" onClose={()=>setManage(false)}><IncidentEditor incident={incident} onSaved={()=>{incidents.reload();setManage(false)}}/></Drawer>}
    {bulkDialog&&<Dialog title={`Confirm action for ${bulk.size} cases`} onClose={()=>setBulkDialog(false)}><p>Review your selection. All changes will appear in the audit trail.</p><Button variant="primary" busy={busy} onClick={()=>void bulkAction('claimed')}>Claim selected</Button><h3>Or record the same contact attempt</h3><label><input type="checkbox" checked={bulkReached} onChange={e=>setBulkReached(e.target.checked)}/>Reached</label><label>Coordinator note<textarea value={bulkNote} onChange={e=>setBulkNote(e.target.value)}/></label><Button busy={busy} disabled={!bulkNote.trim()} onClick={()=>void bulkAction('contact_attempt')}>Record contact attempts</Button></Dialog>}
  </div>
}

const ENTRY: Record<CaseHistoryItem['entry'], string> = {
  check_in: 'Check-in', cant_reach: "Can't-reach report", opened: 'Case opened', check_in_request_sent: 'Check-in Request sent',
  urgency_proposed: 'Urgency proposed', urgency_changed: 'Urgency changed', claimed: 'Claimed', released: 'Claim released', contact_attempt: 'Contact Attempt',
  note: 'Note', resolved: 'Resolved',
}

const OUTCOMES = Object.entries(OUTCOME_LABEL) as [Outcome, string][]
const URGENCIES = (['immediate', 'urgent', 'can_wait'] as const).map(u => [u, URGENCY_LABEL[u]] as [Urgency, string])

// Where a Needs assistance Case's Urgency came from: the AI's quote from the traveler, and whether a Coordinator changed it.
function Triage({ c }: { c: QueueCase }) {
  if (!c.urgency) return null
  return (
    <>
      {c.urgencyChanged ? <p>Urgency set by a Coordinator.</p> : c.urgency === 'untriaged' ? <p>Untriaged: no Urgency from the AI. Set one.</p> : <p>Urgency proposed by the AI.</p>}
      {c.urgencyQuote && <>
        <p>{c.urgencyChanged ? "The AI's own proposal quoted:" : 'From the traveler\'s words:'}</p>
        <blockquote aria-label="The traveler's words behind the AI's proposed Urgency">{c.urgencyQuote}</blockquote>
      </>}
    </>
  )
}

function CaseDetail({ c, onChange }: { c: QueueCase; onChange: () => void }) {
  const [tab,setTab] = useState('Timeline')
  const [coordinators,setCoordinators] = useState<{account_id:string;name:string}[]>([])
  const others = usePresence(c.caseId)
  useEffect(()=>{void supabase.from('coordinators').select('account_id,name').then(({data})=>setCoordinators(data??[]))},[])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const { data, error, reload } = useCaseHistory(c.caseId)
  // Only Reports can be followed up, not other Case events.
  const reports = data?.filter(item => item.entry === 'check_in' || item.entry === 'cant_reach') ?? []
  async function record(event: CoordinatorAction) {
    if (event.action === 'released' && !window.confirm('Unclaim this case?')) return
    if (event.action === 'resolved' && !window.confirm('Resolve this case with the selected outcome?')) return
    if (event.action === 'claimed' && c.owner && !c.ownedByMe) { const reason = window.prompt(`Already claimed by ${c.owner}. Give a reason to take over:`); if(!reason?.trim()) return; await supabase.rpc('record_case_event',{p_case_id:c.caseId,p_action:'claimed',p_takeover_reason:reason}).throwOnError() } else await recordCaseEvent(c.caseId, event)
    toast(event.action === 'contact_attempt' ? 'Contact attempt recorded' : event.action === 'note' ? 'Note added' : event.action === 'claimed' ? 'Case claimed' : event.action === 'released' ? 'Case unclaimed' : 'Case updated')
    reload()
    onChange()
  }
  return (
    <section className="panel case-detail" aria-label={`Case: ${c.traveler}`}>
      <header className="view-header"><h2 tabIndex={-1} ref={heading}>{c.traveler}</h2>
        <p>{c.incident}</p><div><StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} /></div>
      </header>
      {others.map(name=><Callout key={name}>{name} is viewing this case</Callout>)}
      <p className="lede">Notes stay with Coordinators. Emergency Contacts see only the outcome.</p>
      {c.conflict && <Callout tone="warn">{c.traveler} checked in Safe at {formatTime(c.conflict.safeAt)}; contact reported can't reach at {formatTime(c.conflict.reportAt)}.</Callout>}
      {c.status === 'unconfirmed' && <Button onClick={async () => { try { await sendCheckInRequest(c.caseId); toast('Check-in request sent') } catch { toast('Could not send. Retry.') } }}>Send check-in request</Button>}
      <Triage c={c} />
      {c.explanation && <p>Matched stop: {c.explanation}</p>}
      {c.itineraryText && <blockquote aria-label="What the traveler pasted for their Itinerary">{c.itineraryText}</blockquote>}
      {/* The Case stays open: the Coordinator decides whether the traveler is still at risk. */}
      {c.correction && <section aria-label={c.correction.withdrawn ? 'Itinerary withdrawn' : 'Itinerary corrected'}>
        <h3>{c.correction.withdrawn ? 'The traveler withdrew this Itinerary' : 'The traveler corrected this Itinerary'}</h3>
        <p>Opened on:</p><Stops stops={c.correction.old} label="Stops the Case was opened on" />
        <p>Now:</p><Stops stops={c.correction.new} label="Stops now" />
      </section>}
      {/* Another Coordinator can take a Case over; claiming your own again would only repeat the entry. */}
      <EventForm legend="Owner" submitLabel={c.ownedByMe ? 'Unclaim' : c.owner ? 'Take over case' : 'Claim'} note="none" onSubmit={() => record({ action: c.ownedByMe ? 'released' : 'claimed' })}>
        <p>{c.owner ? `Claimed by ${c.owner}${c.ownedByMe ? ' (you)' : ''}` : 'Unclaimed'}</p>
      </EventForm>
      {c.ownedByMe && <label>Reassign<select defaultValue="" onChange={async e=>{if(!e.target.value)return;const id=e.target.value;if(!window.confirm('Reassign this case to the selected Coordinator?'))return;try{await supabase.rpc('record_case_event',{p_case_id:c.caseId,p_action:'claimed',p_assignee:id}).throwOnError();onChange();toast('Case reassigned')}catch{toast('Could not reassign. Retry.')}}}><option value="">Choose a coordinator</option>{coordinators.map(x=><option value={x.account_id} key={x.account_id}>{x.name}</option>)}</select></label>}
      <Tabs tabs={['Timeline','Contact attempt','Notes','Resolve']} selected={tab} onChange={setTab}/>
      {c.status === 'needs_assistance' && (
        <details className="case-tools"><summary>Change Urgency</summary>
        <EventForm legend="Urgency" submitLabel="Change Urgency" note="optional" choices={URGENCIES}
          onSubmit={(urgency, { note }) => record({ action: 'urgency_changed', urgency: urgency as Urgency, note })} />
        </details>
      )}
      {tab === 'Contact attempt' && <div className="case-tools" role="tabpanel">
      <EventForm legend="Contact Attempt" submitLabel="Record" note="required" reports={reports}
        choices={[['reached', 'Reached'], ['not_reached', 'Not reached']]}
        onSubmit={(choice, { note, ...extra }) => record({ action: 'contact_attempt', reached: choice === 'reached', note: note!, ...extra })} />
      </div>}
      {tab === 'Notes' && <div className="case-tools" role="tabpanel">
      <EventForm legend="Note" submitLabel="Add note" note="required" reports={reports}
        onSubmit={(_, { note, ...extra }) => record({ action: 'note', note: note!, ...extra })} />
      </div>}
      {tab === 'Resolve' && <div className="case-tools" role="tabpanel">
      <EventForm legend="Resolve" submitLabel="Resolve" note="optional" reports={reports} choices={OUTCOMES}
        onSubmit={(outcome, extra) => record({ action: 'resolved', outcome: outcome as Outcome, ...extra })} />
      </div>}
      {tab === 'Timeline' && <div className="case-tools timeline" role="tabpanel">
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : (
        // Read-only: a correction is a new entry above, never an edit.
        <ul className="rows" aria-label="Case history">
          {data.map(item => <HistoryEntry key={item.id} item={item} from={data.find(r => r.id === item.fromReport)} />)}
        </ul>
      )}
      </div>}
    </section>
  )
}

function HistoryEntry({ item, from }: { item: CaseHistoryItem; from?: CaseHistoryItem }) {
  const badge = item.entry === 'cant_reach' || item.entry === 'resolved' ? item.entry : item.status
  return (
    <li className="row">
      <div className="row-main">
        <span className="row-name">
          {item.entry === 'contact_attempt' ? `Contact Attempt: ${item.reached ? 'Reached' : 'Not reached'}` : ENTRY[item.entry]}
          {(item.urgency || item.entry === 'urgency_proposed') && <>: <UrgencyTag urgency={item.urgency ?? 'untriaged'} /></>}
        </span>
        {badge && <StatusBadge status={badge} outcome={item.outcome ?? undefined} />}
      </div>
      {item.text && <p>{item.text}</p>}
      {from && <SourceLine source={`From the ${ENTRY[from.entry]}`} at={from.at} />}
      <SourceLine source={item.by} at={item.at} />
    </li>
  )
}

// One Coordinator action: at most one choice from `choices`, a note, the Report it follows up, and a submit button.
// `onSubmit` gets the note and Report only when given.
function EventForm({ legend, submitLabel, choices = [], note, reports = [], disabled = false, onSubmit, children }: {
  legend: string
  submitLabel: string
  choices?: [string, string][]
  note: 'none' | 'optional' | 'required'
  reports?: CaseHistoryItem[]
  disabled?: boolean
  onSubmit: (choice: string, extra: { note?: string; fromReport?: string }) => Promise<void>
  children?: ReactNode
}) {
  const id = useId()
  const [choice, setChoice] = useState<string>()
  const [text, setText] = useDraft(`case:${window.location.hash.split('?')[0]}:${legend}`)
  const [fromReport, setFromReport] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const ready = !disabled && (!choices.length || choice !== undefined) && (note !== 'required' || text.trim() !== '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending || !ready) return // A double tap would add two entries.
    setSending(true)
    setFailure(undefined)
    try {
      await onSubmit(choice ?? '', { ...(text.trim() && { note: text.trim() }), ...(fromReport && { fromReport }) })
      setChoice(undefined)
      setText('')
      setFromReport('')
    } catch (err) {
      // Keep what they entered so they can try again.
      setFailure('Could not save. Your text is here. Retry when connected.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="case-action" onSubmit={submit}>
      <fieldset disabled={sending}>
        <legend>{legend}</legend>
        {children}
        {choices.length > 0 && (
          <div className="choices">
            {choices.map(([value, label]) => (
              <label key={value}>
                <input type="radio" name={id} value={value} checked={choice === value} onChange={() => setChoice(value)} />
                {label}
              </label>
            ))}
            {choice && <button type="button" className="link-button" onClick={() => setChoice(undefined)}>Clear selection</button>}
          </div>
        )}
        {note !== 'none' && (
          <>
            <label htmlFor={`${id}-note`}>Note</label>
            <textarea id={`${id}-note`} rows={2} required={note === 'required'} value={text} onChange={e => setText(e.target.value)} />
          </>
        )}
        {reports.length > 0 && (
          <>
            <label htmlFor={`${id}-report`}>From Report</label>
            <select id={`${id}-report`} value={fromReport} onChange={e => setFromReport(e.target.value)}>
              <option value="">None</option>
              {reports.map(r => <option key={r.id} value={r.id}>{ENTRY[r.entry]} from {r.by}, {formatTime(r.at)}</option>)}
            </select>
          </>
        )}
        <button type="submit" className="button" disabled={sending || !ready}>{submitLabel}</button>
        {failure && <p role="alert">{failure}</p>}
      </fieldset>
    </form>
  )
}

function IncidentEditor({incident,onSaved}:{incident?:PublicIncident;onSaved:()=>void}){
 const [editing,setEditing]=useState(false)
 const [name,setName]=useState('')
 const [area,setArea]=useState(JSON.stringify(incident?.area ?? {type:'Polygon',coordinates:[[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.11],[-112.1,36.1]]]}))
 const [start,setStart]=useState(new Date().toISOString().slice(0,16));const [end,setEnd]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
 return <form className="panel" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{await supabase.rpc('manage_incident',{p_id:editing?incident?.id:null,p_name:name,p_area:JSON.parse(area),p_start:new Date(start).toISOString(),p_end:end?new Date(end).toISOString():null}).throwOnError();toast('Incident saved');onSaved()}catch{setError('Check the title, polygon, and time window, then retry.')}finally{setBusy(false)}}}><label><input type="checkbox" checked={editing} onChange={e=>{setEditing(e.target.checked);setName(e.target.checked?incident?.name??'':'');setStart(e.target.checked&&incident?new Date(Date.parse(incident.starts_at)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));setEnd('')}}/>Edit selected incident</label><label>Title<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>Area (GeoJSON Polygon)<textarea required value={area} onChange={e=>setArea(e.target.value)}/></label><p>Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><label>Start<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>End (optional; set to end the incident)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><Button type="submit" variant="primary" busy={busy}>Save incident</Button>{error&&<p role="alert">{error}</p>}</form>
}
