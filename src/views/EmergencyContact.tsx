import { useEffect, useState } from 'react'
import { type ContactCase, fileCantReach, type IndividualUpdate, markIndividualUpdatesRead, useContactCases, useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge, UrgencyTag, statusClass } from '../ui'

const key = ({ caseId, update }: IndividualUpdate) => `${caseId} ${update.at} ${'status' in update ? update.status : update.urgency}`

export default function EmergencyContact() {
  const { data, error } = useIndividualUpdates()
  const cases = useContactCases()
  // Updates that were unread when they arrived: they stay New until the contact leaves the page, though they're marked read at once.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const unread = data?.filter(u => u.unreadNotificationId) ?? []
    if (!unread.length) return
    setFresh(prev => new Set([...prev, ...unread.map(key)]))
    // On failure they stay unread, and the next poll tries again.
    markIndividualUpdatesRead(unread.map(u => u.unreadNotificationId!)).catch(() => {})
  }, [data])
  return (
    <div className="column">
      <header className="view-header">
        <h1>Travelers who named you</h1>
        <p className="lede">You get an Individual Update when their Case changes.</p>
      </header>
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
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : data.length === 0 ? (
        <p className="empty">No Individual Updates yet.</p>
      ) : (
        // Status or Urgency, and time only (Case rules: Individual Update view), newest first.
        <ul className="rows" aria-label="Individual Updates">
          {data.map(entry => (
            <li className={'status' in entry.update ? `row ${statusClass(entry.update.status)}` : 'row'} key={key(entry)}>
              <div className="row-main">
                <span className="row-name">{entry.traveler}</span>
                {(entry.unreadNotificationId || fresh.has(key(entry))) && <span className="new">New</span>}
                {'status' in entry.update
                  ? <StatusBadge status={entry.update.status} outcome={entry.update.outcome} />
                  : <span>Urgency: <UrgencyTag urgency={entry.update.urgency} /></span>}
              </div>
              <SourceLine source="Individual Update" at={entry.update.at} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CaseRow({ c, onFiled }: { c: ContactCase; onFiled: () => void }) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed?: boolean }>()
  async function file() {
    if (sending) return // A double tap would store two Reports.
    setSending(true)
    setMessage(undefined)
    try {
      await fileCantReach(c.caseId)
      setMessage({ text: "Can't-reach report sent. Coordinators will see it on the Case." })
      onFiled()
    } catch (e) {
      setMessage({ text: `Couldn't send your report: ${e instanceof Error ? e.message : 'try again'}.`, failed: true })
    } finally {
      setSending(false)
    }
  }
  return (
    <li className={`row ${statusClass(c.status)}`}>
      <div className="row-main">
        <span className="row-name">{c.traveler}</span>
        <StatusBadge status={c.status} outcome={c.status === 'resolved' ? c.outcome : undefined} />
      </div>
      <p>{c.incident}</p>
      {/* Nothing to add once the Case is resolved or already says Can't reach. */}
      {c.status !== 'resolved' && c.status !== 'cant_reach' && (
        <button type="button" className="button" disabled={sending} onClick={file}>I can't reach {c.traveler}</button>
      )}
      {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
    </li>
  )
}
