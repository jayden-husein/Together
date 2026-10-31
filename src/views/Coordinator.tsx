import { copy, messages } from '../copy'
import { useDraft } from '../lib/drafts'
import { csv, download, useActivity, usePresence } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { type PublicIncident, useIncidents } from '../lib/checkIns'
import { sendCheckInRequest, restorePotentialIncident } from '../lib/checkIns'
import { Avatar, Button, Callout, Dialog, Drawer, EmptyState, Icon, Skeleton, Switch, Tabs, toast } from '../components'
import PostGeneralUpdate from './PostGeneralUpdate'
import PotentialIncidentReview, { DismissalLine } from './PotentialIncidentReview'
import { Fragment, type FormEvent, type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Urgency } from '../lib/caseRules'
import { type CaseHistoryItem, type CoordinatorAction, type QueueCase, recordCaseEvent, useDismissedIncidents, usePendingIncidents, useCaseHistory, useQueue } from '../lib/checkIns'
import { type CaseStatus, OUTCOME_LABEL, type Outcome, SourceLine, StatusBadge, Stops, URGENCY_LABEL, UrgencyTag, formatTime, statusClass } from '../ui'

// Queue order, so the summary reads the same way as the list below it.
const STATUSES: CaseStatus[] = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved']

// What set each status, for the row's source line.
const SOURCE: Record<CaseStatus, string> = {
  needs_assistance: copy.checkin, safe: copy.checkin, cant_reach: copy.cantreach_report, unconfirmed: copy.case_opened, resolved: copy.resolved_2,
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
    try{await supabase.rpc('bulk_case_action',{p_cases:[...bulk],p_action:action,p_reached:action==='contact_attempt'?bulkReached:null,p_note:action==='contact_attempt'?bulkNote:null}).throwOnError();setBulk(new Set());setBulkDialog(false);reload();toast(copy.bulk_action_recorded)}catch{toast(copy.could_not_apply_the_bulk_action_a)}finally{setBusy(false)}
  }
  async function exportCases(){
    try{const ids=cases.map(c=>c.caseId);const {data:attempts}=await supabase.from('case_events').select('case_id,reached,created_at,note,action').in('case_id',ids).in('action',includeNotes?['contact_attempt','note']:['contact_attempt']).order('created_at',{ascending:false}).throwOnError();download('together-cases.csv',csv([['Name','Status','Owner','Last update','Last contact attempt',...(includeNotes?['Notes']:[])],...cases.map(c=>[c.traveler,c.status,c.owner??'Unclaimed',c.at,attempts.find(a=>a.case_id===c.caseId&&a.action==='contact_attempt')?.created_at??'',...(includeNotes?[attempts.filter(a=>a.case_id===c.caseId).map(a=>a.note).filter(Boolean).join(' | ')]:[])])]),'text/csv')}catch{toast(copy.could_not_export_cases_retry)}
  }
  return <div className={`coordinator ${pending.data?.length ? 'has-pending-verification' : ''}`}>
    <header className="view-header queue-heading"><div><h1>{copy.cases}</h1><label className="sr-only" htmlFor="queue-incident">{copy.incident}</label><select id="queue-incident" value={incident?.id??''} onChange={e=>{setIncidentId(e.target.value);filter('incident',e.target.value)}}>{incidents.data?.map(i=><option key={i.id} value={i.id}>{i.name}{copy.text_5}{i.resolved_at?copy.resolved_2:copy.ongoing}</option>)}</select></div><div className="actions"><a className="button" href="#/">{copy.view_public_page}</a><Button variant="primary" onClick={()=>setComposer(true)}>{copy.post_update}</Button></div></header>
    <ul className="summary stats" aria-label={copy.cases_by_status}>{STATUSES.map(s=><li key={s}><button type="button" className={`stat-card ${statusClass(s)}`} aria-pressed={status===s} onClick={()=>{setStatus(status===s?'all':s);filter('status',status===s?'':s)}}><span className="summary-count">{cases.filter(c=>c.status===s).length}</span><StatusBadge status={s}/><progress value={cases.filter(c=>c.status===s).length} max={cases.length||1}/></button></li>)}</ul>
    <section className="queue-toolbar" aria-label={copy.case_filters}><label className="search-field"><Icon name="search"/><span className="sr-only">{copy.search_cases}</span><input type="search" placeholder={copy.search_cases} value={search} onChange={e=>{setSearch(e.target.value);filter('q',e.target.value)}}/></label><div className="segmented" aria-label={copy.ownership}>{['all','mine','unclaimed'].map(x=><Button key={x} aria-pressed={ownership===x} onClick={()=>{setOwnership(x);filter('owner',x)}}>{x==='all'?copy.all:x==='mine'?copy.mine:copy.unclaimed}</Button>)}</div><label>{copy.sort}<select value={sort} onChange={e=>{setSort(e.target.value);filter('sort',e.target.value)}}><option value="priority">{copy.priority}</option><option value="name">{copy.name}</option><option value="oldest">{copy.oldest}</option><option value="newest">{copy.newest}</option></select></label><Switch label={copy.include_resolved} checked={includeResolved} onChange={v=>{setIncludeResolved(v);filter('resolved',v?'1':'')}}/></section>
    <div className="queue-secondary actions"><Button onClick={()=>setActivity(!activity)}>{activity?copy.case_queue:copy.activity}</Button><Button onClick={()=>setManage(true)}>{copy.create_manage_incidents}</Button><Button onClick={exportCases}>{copy.export_cases_csv}</Button><label><input type="checkbox" checked={includeNotes} onChange={e=>setIncludeNotes(e.target.checked)}/>{copy.include_notes}</label>{bulk.size>0&&<Button onClick={()=>setBulkDialog(true)}>{copy.act_on}{bulk.size}{copy.selected_cases}</Button>}</div>
    {activity?<section className="panel activity-feed"><h2>{copy.incident_activity}</h2><ul className="timeline">{events.data?.map(e=><li key={e.id}><strong>{e.action.replaceAll('_',' ')}</strong><SourceLine source={e.actorName} at={e.created_at}/></li>)}</ul></section>:<>
    <section className="queue-list" aria-label={copy.case_queue}><h2 className="sr-only">{copy.case_queue}</h2>{error?<Callout tone="danger">{error}<Button onClick={reload}>{copy.retry}</Button></Callout>:!data?<Skeleton/>:!visible.length?<EmptyState title={copy.no_matching_cases}>{copy.try_another_filter_or_search}</EmptyState>:<ul className="rows" aria-label={copy.case_queue}>{visible.slice(0,limit).map((c,index)=><Fragment key={c.caseId}>{sort==='priority'&&(index===0||visible[index-1].status!==c.status)&&<li aria-hidden="true" className="queue-group"><StatusBadge status={c.status}/><span>{matching.filter(x=>x.status===c.status).length}</span></li>}<li><div className={`queue-row ${statusClass(c.status)} ${selected===c.caseId?'selected':''}`}><label className="bulk-check"><span className="sr-only">{copy.select}{c.traveler}{copy.for_bulk_action}</span><input type="checkbox" checked={bulk.has(c.caseId)} onChange={e=>setBulk(prev=>{const next=new Set(prev);if(e.target.checked)next.add(c.caseId);else next.delete(c.caseId);return next})}/></label><button type="button" className="case-select" aria-pressed={c.caseId===selected} onClick={()=>select(c.caseId===selected?undefined:c.caseId)}><Avatar name={c.traveler}/><span className="case-meta"><strong>{c.traveler}</strong><span>{c.incident}</span><span>{c.owner?(c.ownedByMe?copy.you:messages.claimed_by(c.owner)):copy.unclaimed}{copy.text_5}<time dateTime={c.at}>{formatTime(c.at)}</time></span></span><StatusBadge status={c.status}/></button></div>{['needs_assistance','cant_reach'].includes(c.status)&&<p className={`escalation ${Date.now()-Date.parse(c.at)>900000?'overdue':''}`}>{Math.max(0,Math.floor((Date.now()-Date.parse(c.at))/60000))}{copy.min_since_update_escalation_after_15_min}</p>}</li></Fragment>)}</ul>}<p className="lede">{copy.showing}{Math.min(limit,visible.length)}{copy.of}{visible.length}</p>{visible.length>limit&&<Button onClick={()=>setLimit(n=>n+25)}>{copy.load_more}</Button>}</section>
    <div className={`detail-container ${open?'has-detail':''}`}>{open?<><a className="mobile-case-back button" href={`#/coordinator${window.location.hash.includes('?')?'?'+window.location.hash.split('?')[1]:''}`}>{copy.back_to_cases}</a><CaseDetail key={open.caseId} c={open} onChange={reload}/></>:<section className="panel case-detail"><EmptyState title={copy.select_a_case} icon="users">{copy.choose_a_traveler_to_review_their_timeline}</EmptyState></section>}</div></>}
    {pending.data?.map(draft=><PotentialIncidentReview key={draft.id} draft={draft} onDecided={()=>{pending.reload();dismissed.reload();reload()}}/>)}
    {!!dismissed.data?.length&&<details className="panel dismissed"><summary>{dismissed.data.length}{copy.dismissed_potential_incident}{dismissed.data.length!==1?copy.s:''}</summary><ul className="rows">{dismissed.data.map(d=><li className="row" key={d.id}><strong>{d.name}</strong><DismissalLine dismissal={d}/><Button onClick={async()=>{try{await restorePotentialIncident(d.id);dismissed.reload();pending.reload();toast(copy.potential_incident_restored)}catch{toast(copy.could_not_restore_retry)}}}>{copy.restore}</Button></li>)}</ul></details>}
    {composer&&<Drawer title={copy.general_update} onClose={()=>setComposer(false)}><PostGeneralUpdate/></Drawer>}
    {manage&&<Drawer title={copy.manage_incidents} onClose={()=>setManage(false)}><IncidentEditor incident={incident} onSaved={()=>{incidents.reload();setManage(false)}}/></Drawer>}
    {bulkDialog&&<Dialog title={messages.confirm_action_for_cases(bulk.size)} onClose={()=>setBulkDialog(false)}><p>{copy.review_your_selection_all_changes_will_appear}</p><Button variant="primary" busy={busy} onClick={()=>void bulkAction('claimed')}>{copy.claim_selected}</Button><h3>{copy.or_record_the_same_contact_attempt}</h3><label><input type="checkbox" checked={bulkReached} onChange={e=>setBulkReached(e.target.checked)}/>{copy.reached}</label><label>{copy.coordinator_note}<textarea value={bulkNote} onChange={e=>setBulkNote(e.target.value)}/></label><Button busy={busy} disabled={!bulkNote.trim()} onClick={()=>void bulkAction('contact_attempt')}>{copy.record_contact_attempts}</Button></Dialog>}
  </div>
}

const ENTRY: Record<CaseHistoryItem['entry'], string> = {
  check_in: copy.checkin, cant_reach: copy.cantreach_report, opened: copy.case_opened, check_in_request_sent: copy.checkin_request_sent_2,
  urgency_proposed: copy.urgency_proposed, urgency_changed: copy.urgency_changed, claimed: copy.claimed, released: copy.claim_released, contact_attempt: copy.contact_attempt,
  note: copy.note, resolved: copy.resolved_2,
}

const OUTCOMES = Object.entries(OUTCOME_LABEL) as [Outcome, string][]
const URGENCIES = (['immediate', 'urgent', 'can_wait'] as const).map(u => [u, URGENCY_LABEL[u]] as [Urgency, string])

// Where a Needs assistance Case's Urgency came from: the AI's quote from the traveler, and whether a Coordinator changed it.
function Triage({ c }: { c: QueueCase }) {
  if (!c.urgency) return null
  return (
    <>
      {c.urgencyChanged ? <p>{copy.urgency_set_by_a_coordinator}</p> : c.urgency === 'untriaged' ? <p>{copy.untriaged_no_urgency_from_the_ai_set}</p> : <p>{copy.urgency_proposed_by_the_ai}</p>}
      {c.urgencyQuote && <>
        <p>{c.urgencyChanged ? copy.the_ais_own_proposal_quoted : copy.from_the_travelers_words}</p>
        <blockquote aria-label={copy.the_travelers_words_behind_the_ais_proposed}>{c.urgencyQuote}</blockquote>
      </>}
    </>
  )
}

function CaseDetail({ c, onChange }: { c: QueueCase; onChange: () => void }) {
  const [historyLimit,setHistoryLimit]=useState(25)
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
    if (event.action === 'released' && !window.confirm(copy.unclaim_this_case)) throw new Error('cancelled')
    if (event.action === 'resolved' && !window.confirm(copy.resolve_this_case_with_the_selected_outcome)) throw new Error('cancelled')
    if (event.action === 'claimed' && c.owner && !c.ownedByMe) { const reason = window.prompt(`Already claimed by ${c.owner}. Give a reason to take over:`); if(!reason?.trim()) return; await supabase.rpc('record_case_event',{p_case_id:c.caseId,p_action:'claimed',p_takeover_reason:reason}).throwOnError() } else await recordCaseEvent(c.caseId, event)
    toast(event.action === 'contact_attempt' ? 'Contact attempt recorded' : event.action === 'note' ? 'Note added' : event.action === 'claimed' ? 'Case claimed' : event.action === 'released' ? 'Case unclaimed' : 'Case updated')
    reload()
    onChange()
  }
  return (
    <section className="panel case-detail" aria-label={messages.case(c.traveler)}>
      <header className="view-header"><h2 tabIndex={-1} ref={heading}>{c.traveler}</h2>
        <p>{c.incident}</p><div><StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} /></div>
      </header>
      {others.map(name=><Callout key={name}>{name}{copy.is_viewing_this_case}</Callout>)}
      <p className="lede">{copy.notes_stay_with_coordinators_emergency_contacts_see}</p>
      {c.conflict && <Callout tone="warn">{c.traveler}{copy.checked_in_safe_at}{formatTime(c.conflict.safeAt)}{copy.contact_reported_cant_reach_at}{formatTime(c.conflict.reportAt)}{copy.text_6}</Callout>}
      {c.status === 'unconfirmed' && <Button onClick={async () => { try { await sendCheckInRequest(c.caseId); toast(copy.checkin_request_sent) } catch { toast(copy.could_not_send_retry) } }}>{copy.send_checkin_request}</Button>}
      <Triage c={c} />
      {c.explanation && <p>{copy.matched_stop}{c.explanation}</p>}
      {c.itineraryText && <blockquote aria-label={copy.what_the_traveler_pasted_for_their_itinerary}>{c.itineraryText}</blockquote>}
      {/* The Case stays open: the Coordinator decides whether the traveler is still at risk. */}
      {c.correction && <section aria-label={c.correction.withdrawn ? copy.itinerary_withdrawn : copy.itinerary_corrected}>
        <h3>{c.correction.withdrawn ? copy.the_traveler_withdrew_this_itinerary : copy.the_traveler_corrected_this_itinerary}</h3>
        <p>{copy.opened_on}</p><Stops stops={c.correction.old} label={copy.stops_the_case_was_opened_on} />
        <p>{copy.now}</p><Stops stops={c.correction.new} label={copy.stops_now} />
      </section>}
      {/* Another Coordinator can take a Case over; claiming your own again would only repeat the entry. */}
      <EventForm legend={copy.owner} submitLabel={c.ownedByMe ? copy.unclaim : c.owner ? copy.take_over_case : copy.claim} note="none" onSubmit={() => record({ action: c.ownedByMe ? 'released' : 'claimed' })}>
        <p>{c.owner ? messages.claimed_by_2(c.owner,c.ownedByMe ? ' (you)' : '') : copy.unclaimed}</p>
      </EventForm>
      {c.ownedByMe && <label>{copy.reassign}<select defaultValue="" onChange={async e=>{if(!e.target.value)return;const id=e.target.value;if(!window.confirm(copy.reassign_this_case_to_the_selected_coordinator))return;try{await supabase.rpc('record_case_event',{p_case_id:c.caseId,p_action:'claimed',p_assignee:id}).throwOnError();onChange();toast(copy.case_reassigned)}catch{toast(copy.could_not_reassign_retry)}}}><option value="">{copy.choose_a_coordinator}</option>{coordinators.map(x=><option value={x.account_id} key={x.account_id}>{x.name}</option>)}</select></label>}
      <Tabs tabs={['Timeline','Contact attempt','Notes','Resolve']} selected={tab} onChange={setTab}/>
      {c.status === 'needs_assistance' && (
        <details className="case-tools"><summary>{copy.change_urgency}</summary>
        <EventForm legend={copy.urgency} submitLabel={copy.change_urgency} note="optional" choices={URGENCIES}
          onSubmit={(urgency, { note }) => record({ action: 'urgency_changed', urgency: urgency as Urgency, note })} />
        </details>
      )}
      {tab === 'Contact attempt' && <div className="case-tools" role="tabpanel">
      <EventForm legend={copy.contact_attempt} submitLabel={copy.record} note="required" reports={reports}
        choices={[['reached', 'Reached'], ['not_reached', 'Not reached']]}
        onSubmit={(choice, { note, ...extra }) => record({ action: 'contact_attempt', reached: choice === 'reached', note: note!, ...extra })} />
      </div>}
      {tab === 'Notes' && <div className="case-tools" role="tabpanel">
      <EventForm legend={copy.note} submitLabel={copy.add_note} note="required" reports={reports}
        onSubmit={(_, { note, ...extra }) => record({ action: 'note', note: note!, ...extra })} />
      </div>}
      {tab === 'Resolve' && <div className="case-tools" role="tabpanel">
      <EventForm legend={copy.resolve} submitLabel={copy.resolve} note="optional" reports={reports} choices={OUTCOMES}
        onSubmit={(outcome, extra) => record({ action: 'resolved', outcome: outcome as Outcome, ...extra })} />
      </div>}
      {tab === 'Timeline' && <div className="case-tools timeline" role="tabpanel">
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">{copy.loading_2}</p>
      ) : (
        // Read-only: a correction is a new entry above, never an edit.
        <ul className="rows" aria-label={copy.case_history}>
          {data.slice(0,historyLimit).map(item => <HistoryEntry key={item.id} item={item} from={data.find(r => r.id === item.fromReport)} />)}
        </ul>
      )}
      {data && <p className="lede">{copy.showing}{Math.min(historyLimit,data.length)}{copy.of}{data.length}{copy.history_entries}</p>}{data && data.length>historyLimit && <Button onClick={()=>setHistoryLimit(n=>n+25)}>{copy.load_more}</Button>}
      </div>}
    </section>
  )
}

function HistoryEntry({ item, from }: { item: CaseHistoryItem; from?: CaseHistoryItem }) {
  const badge = item.entry === 'cant_reach' || item.entry === 'resolved' ? item.entry : item.status
  return (
    <li className="row">
      <div className="row-main">
        <Avatar name={item.by}/><span className="row-name">
          {item.entry === 'contact_attempt' ? messages.contact_attempt_2(item.reached ? 'Reached' : 'Not reached') : ENTRY[item.entry]}
          {(item.urgency || item.entry === 'urgency_proposed') && <>{copy.text_4}<UrgencyTag urgency={item.urgency ?? 'untriaged'} /></>}
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
      if(err instanceof Error && err.message==='cancelled')return
      // Keep what they entered so they can try again.
      setFailure(copy.could_not_save_your_text_is_here)
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
            {choice && <button type="button" className="link-button" onClick={() => setChoice(undefined)}>{copy.clear_selection}</button>}
          </div>
        )}
        {note !== 'none' && (
          <>
            <label htmlFor={`${id}-note`}>{copy.note}</label>
            <textarea id={`${id}-note`} rows={2} required={note === 'required'} value={text} onChange={e => setText(e.target.value)} />
          </>
        )}
        {reports.length > 0 && (
          <>
            <label htmlFor={`${id}-report`}>{copy.from_report}</label>
            <select id={`${id}-report`} value={fromReport} onChange={e => setFromReport(e.target.value)}>
              <option value="">{copy.none}</option>
              {reports.map(r => <option key={r.id} value={r.id}>{ENTRY[r.entry]}{copy.from}{r.by}{copy.text_3}{formatTime(r.at)}</option>)}
            </select>
          </>
        )}
        <button type="submit" className="button" disabled={sending || !ready}>{sending && <span className="spinner" aria-hidden="true"/>}{sending?copy.saving:submitLabel}</button>
        {failure && <div role="alert"><p>{failure}</p><button type="submit" className="button" disabled={!ready || sending}>{copy.retry}</button></div>}
      </fieldset>
    </form>
  )
}

function IncidentEditor({incident,onSaved}:{incident?:PublicIncident;onSaved:()=>void}){
 const [editing,setEditing]=useState(false)
 const [name,setName]=useState('')
 const [area,setArea]=useState(JSON.stringify(incident?.area ?? {type:'Polygon',coordinates:[[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.11],[-112.1,36.1]]]}))
 const [start,setStart]=useState(new Date().toISOString().slice(0,16));const [end,setEnd]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
 return <form className="panel" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);try{await supabase.rpc('manage_incident',{p_id:editing?incident?.id:null,p_name:name,p_area:JSON.parse(area),p_start:new Date(start).toISOString(),p_end:end?new Date(end).toISOString():null}).throwOnError();toast(copy.incident_saved);onSaved()}catch{setError(copy.check_the_title_polygon_and_time_window)}finally{setBusy(false)}}}><label><input type="checkbox" checked={editing} onChange={e=>{setEditing(e.target.checked);setName(e.target.checked?incident?.name??'':'');setStart(e.target.checked&&incident?new Date(Date.parse(incident.starts_at)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));setEnd('')}}/>{copy.edit_selected_incident}</label><label>{copy.title}<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>{copy.area_geojson_polygon}<textarea required value={area} onChange={e=>setArea(e.target.value)}/></label><p>{copy.times_shown_in}{Intl.DateTimeFormat().resolvedOptions().timeZone}{copy.text_6}</p><label>{copy.start}<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>{copy.end_optional_set_to_end_the_incident}<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><Button type="submit" variant="primary" busy={busy}>{copy.save_incident}</Button>{error&&<p role="alert">{error}</p>}</form>
}
