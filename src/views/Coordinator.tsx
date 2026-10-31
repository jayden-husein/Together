import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { type CaseHistoryItem, type CoordinatorAction, type QueueCase, recordCaseEvent, useCaseHistory, useQueue } from '../lib/checkIns'
import { type CaseStatus, OUTCOME_LABEL, type Outcome, SourceLine, StatusBadge, UrgencyTag, statusClass } from '../ui'

// Queue order, so the summary reads the same way as the list below it.
const STATUSES: CaseStatus[] = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved']

// What set each status, for the row's source line.
const SOURCE: Record<CaseStatus, string> = {
  needs_assistance: 'Check-in', safe: 'Check-in', cant_reach: "Can't-reach report", unconfirmed: 'Case opened', resolved: 'Resolved',
}

export default function Coordinator() {
  const { data, error, reload } = useQueue()
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
                  onClick={() => setSelected(c.caseId)}>{c.traveler}</button>
                <StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} />
              </div>
              <p className="lede">{c.incident}</p>
              {c.owner && <p className="lede">Claimed by {c.owner}</p>}
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
  urgency_proposed: 'Urgency proposed', urgency_changed: 'Urgency changed', claimed: 'Claimed', contact_attempt: 'Contact Attempt',
  note: 'Note', resolved: 'Resolved',
}

const OUTCOMES = Object.entries(OUTCOME_LABEL) as [Outcome, string][]

function CaseDetail({ c, onChange }: { c: QueueCase; onChange: () => void }) {
  const { data, error, reload } = useCaseHistory(c.caseId)
  async function record(event: CoordinatorAction) {
    await recordCaseEvent(c.caseId, event)
    reload()
    onChange()
  }
  return (
    <section className="panel case-detail" aria-label={`Case: ${c.traveler}`}>
      <h2>{c.traveler}</h2>
      <p className="lede">Notes stay with Coordinators. Emergency Contacts see only the outcome.</p>
      <EventForm legend="Owner" submitLabel="Claim" note="none" onSubmit={() => record({ action: 'claimed' })}>
        <p>{c.owner ? `Claimed by ${c.owner}` : 'Unclaimed'}</p>
      </EventForm>
      <EventForm legend="Contact Attempt" submitLabel="Record" note="optional"
        choices={[['reached', 'Reached'], ['not_reached', 'Not reached']]}
        onSubmit={(choice, note) => record({ action: 'contact_attempt', reached: choice === 'reached', ...(note && { note }) })} />
      <EventForm legend="Note" submitLabel="Add note" note="required" onSubmit={(_, note) => record({ action: 'note', note })} />
      <EventForm legend="Resolve" submitLabel="Resolve" note="optional" choices={OUTCOMES}
        onSubmit={(outcome, note) => record({ action: 'resolved', outcome: outcome as Outcome, ...(note && { note }) })} />
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
  const label = item.entry === 'contact_attempt' ? `Contact Attempt: ${item.reached ? 'reached' : 'not reached'}`
    : item.outcome ? `Resolved: ${OUTCOME_LABEL[item.outcome]}`
    : ENTRY[item.entry]
  return (
    <li className="row">
      <div className="row-main">
        <span className="row-name">{label}{item.urgency && <>: <UrgencyTag urgency={item.urgency} /></>}</span>
        {item.status && <StatusBadge status={item.status} />}
        {item.entry === 'cant_reach' && <StatusBadge status="cant_reach" />}
      </div>
      {item.text && <p>{item.text}</p>}
      {from && <SourceLine source={`From the ${ENTRY[from.entry]}`} at={from.at} />}
      <SourceLine source={item.by} at={item.at} />
    </li>
  )
}

// One Coordinator action: at most one choice from `choices`, a note, and a submit button.
function EventForm({ legend, submitLabel, choices = [], note, onSubmit, children }: {
  legend: string
  submitLabel: string
  choices?: [string, string][]
  note: 'none' | 'optional' | 'required'
  onSubmit: (choice: string, note: string) => Promise<void>
  children?: ReactNode
}) {
  const id = useId()
  const [choice, setChoice] = useState<string>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const ready = (!choices.length || choice !== undefined) && (note !== 'required' || text.trim() !== '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending || !ready) return // A double tap would add two entries.
    setSending(true)
    setFailure(undefined)
    try {
      await onSubmit(choice ?? '', text.trim())
      setChoice(undefined)
      setText('')
    } catch (err) {
      // Keep what they entered so they can try again.
      setFailure(`Couldn't save: ${err instanceof Error ? err.message : 'try again'}.`)
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="case-action" onSubmit={submit}>
      <fieldset>
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
          </div>
        )}
        {note !== 'none' && (
          <>
            <label htmlFor={`${id}-note`}>Note</label>
            <textarea id={`${id}-note`} rows={2} value={text} onChange={e => setText(e.target.value)} />
          </>
        )}
        <button type="submit" className="button" disabled={sending || !ready}>{submitLabel}</button>
        {failure && <p role="alert">{failure}</p>}
      </fieldset>
    </form>
  )
}
