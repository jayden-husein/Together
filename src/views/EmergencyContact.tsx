import { useEffect, useState } from 'react'
import { type IndividualUpdate, markIndividualUpdatesRead, useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge, statusClass } from '../ui'

const key = ({ caseId, update }: IndividualUpdate) => `${caseId} ${update.at} ${update.status}`

export default function EmergencyContact() {
  const { data, error } = useIndividualUpdates()
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
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : data.length === 0 ? (
        <p className="empty">No Individual Updates yet.</p>
      ) : (
        // Status and time only (Case rules: Individual Update view), newest first.
        <ul className="rows" aria-label="Individual Updates">
          {data.map(entry => (
            <li className={`row ${statusClass(entry.update.status)}`} key={key(entry)}>
              <div className="row-main">
                <span className="row-name">{entry.traveler}</span>
                {(entry.unreadNotificationId || fresh.has(key(entry))) && <span className="new">New</span>}
                <StatusBadge status={entry.update.status} outcome={entry.update.outcome} />
              </div>
              <SourceLine source="Individual Update" at={entry.update.at} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
