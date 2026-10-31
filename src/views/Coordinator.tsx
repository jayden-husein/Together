import PotentialIncidentReview from './PotentialIncidentReview'
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type CaseHistoryItem, type CoordinatorAction, type QueueCase, recordCaseEvent, usePendingIncidents, useCaseHistory, useQueue } from '../lib/checkIns'
import { type CaseStatus, OUTCOME_LABEL, type Outcome, SourceLine, StatusBadge, UrgencyTag, formatTime, statusClass } from '../ui'

// Queue order, so the summary reads the same way as the list below it.
const STATUSES: CaseStatus[] = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved']

// What set each status, for the row's source line.
const SOURCE: Record<CaseStatus, string> = {
  needs_assistance: 'Check-in', safe: 'Check-in', cant_reach: "Can't-reach report", unconfirmed: 'Case opened', resolved: 'Resolved',
}

export default function Coordinator() {
  const { data, error, reload } = useQueue()
  const pending = usePendingIncidents()
  const [selected, setSelected] = useState<string>()
  const cases = data ?? []
  const open = cases.find(c => c.caseId === selected)
  return (
    <div className="coordinator">
      <header className="view-header">
        <h1>Cases</h1>
        <ul className="summary" aria-label="Cases by status">
          {STATUSES.map(s => (
            <li key={s}>
              <span className="summary-count">{cases.filter(c => c.status === s).length}</span>
              <StatusBadge status={s} />
            </li>
          ))}
        </ul>
      </header>
      {pending.error && <p role="alert">{pending.error}</p>}
      {pending.data?.map(draft => <PotentialIncidentReview key={draft.id} draft={draft} onVerify={() => { pending.reload(); reload() }} />)}
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : cases.length === 0 ? (
        <p className="empty">No open Cases.</p>
      ) : (
        // Already in Queue order (Case rules); the list keeps it.
        <ul className="rows" aria-label="Case queue">
          {cases.map(c => (
            <li className={`row ${statusClass(c.status)}`} key={c.caseId}>
              <div className="row-main">
                <button type="button" className="link-button row-name" aria-pressed={c.caseId === selected}
                  onClick={() => setSelected(c.caseId === selected ? undefined : c.caseId)}>{c.traveler}</button>
                <StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} />
              </div>
              <p className="lede">{c.incident}</p>
              {c.explanation && <p>Matched stop: {c.explanation}</p>}
              <p>{c.owner ? `Claimed by ${c.owner}${c.ownedByMe ? ' (you)' : ''}` : 'Unclaimed'}</p>
              <SourceLine source={SOURCE[c.status]} at={c.at} />
            </li>
          ))}
        </ul>
      )}
      {open ? (
        // Keyed so a different Case starts with empty forms.
        <CaseDetail key={open.caseId} c={open} onChange={reload} />
      ) : (
        <section className="panel case-detail">
          <h2>Case</h2>
          <p className="empty">Choose a Case to see its Reports and Contact Attempts.</p>
        </section>
      )}
    </div>
  )
}

const ENTRY: Record<CaseHistoryItem['entry'], string> = {
  check_in: 'Check-in', cant_reach: "Can't-reach report", opened: 'Case opened', check_in_request_sent: 'Check-in Request sent',
  urgency_proposed: 'Urgency proposed', urgency_changed: 'Urgency changed', claimed: 'Claimed', released: 'Claim released', contact_attempt: 'Contact Attempt',
  note: 'Note', resolved: 'Resolved',
}

const OUTCOMES = Object.entries(OUTCOME_LABEL) as [Outcome, string][]

function CaseDetail({ c, onChange }: { c: QueueCase; onChange: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  const { data, error, reload } = useCaseHistory(c.caseId)
  // Only Reports can be followed up, not other Case events.
  const reports = data?.filter(item => item.entry === 'check_in' || item.entry === 'cant_reach') ?? []
  async function record(event: CoordinatorAction) {
    await recordCaseEvent(c.caseId, event)
    reload()
    onChange()
  }
  return (
    <section className="panel case-detail" aria-label={`Case: ${c.traveler}`}>
      <header className="view-header"><h2 tabIndex={-1} ref={heading}>{c.traveler}</h2>
        <p>{c.incident}</p><div><StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} /></div>
      </header>
      <p className="lede">Notes stay with Coordinators. Emergency Contacts see only the outcome.</p>
      {c.explanation && <p>Matched stop: {c.explanation}</p>}
      {c.itineraryText && <blockquote aria-label="What the traveler pasted for their Itinerary">{c.itineraryText}</blockquote>}
      {/* Another Coordinator can take a Case over; claiming your own again would only repeat the entry. */}
      <EventForm legend="Owner" submitLabel={c.ownedByMe ? 'Unclaim' : c.owner ? 'Take over case' : 'Claim'} note="none" onSubmit={() => record({ action: c.ownedByMe ? 'released' : 'claimed' })}>
        <p>{c.owner ? `Claimed by ${c.owner}${c.ownedByMe ? ' (you)' : ''}` : 'Unclaimed'}</p>
      </EventForm>
      <details className="case-tools"><summary>Record a contact attempt</summary>
      <EventForm legend="Contact Attempt" submitLabel="Record" note="required" reports={reports}
        choices={[['reached', 'Reached'], ['not_reached', 'Not reached']]}
        onSubmit={(choice, { note, ...extra }) => record({ action: 'contact_attempt', reached: choice === 'reached', note: note!, ...extra })} />
      </details>
      <details className="case-tools"><summary>Add a coordinator note</summary>
      <EventForm legend="Note" submitLabel="Add note" note="required" reports={reports}
        onSubmit={(_, { note, ...extra }) => record({ action: 'note', note: note!, ...extra })} />
      </details>
      <details className="case-tools"><summary>{c.status === 'resolved' ? 'Correct the outcome' : 'Resolve case'}</summary>
      <EventForm legend="Resolve" submitLabel="Resolve" note="optional" reports={reports} choices={OUTCOMES}
        onSubmit={(outcome, extra) => record({ action: 'resolved', outcome: outcome as Outcome, ...extra })} />
      </details>
      <h3>History</h3>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : (
        // Read-only: a correction is a new entry above, never an edit.
        <ul className="rows" aria-label="Case history">
          {data.map(item => <HistoryEntry key={item.id} item={item} from={data.find(r => r.id === item.fromReport)} />)}
        </ul>
      )}
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
          {item.urgency && <>: <UrgencyTag urgency={item.urgency} /></>}
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
  const [text, setText] = useState('')
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
      setFailure(`Couldn't save: ${err instanceof Error ? err.message : 'try again'}.`)
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
