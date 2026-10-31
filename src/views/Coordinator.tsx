import { useQueue } from '../lib/checkIns'
import { type CaseStatus, SourceLine, StatusBadge, statusClass } from '../ui'

// Queue order, so the summary reads the same way as the list below it.
const STATUSES: CaseStatus[] = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved']

// What set each status, for the row's source line.
const SOURCE: Record<CaseStatus, string> = {
  needs_assistance: 'Check-in', safe: 'Check-in', cant_reach: "Can't-reach report", unconfirmed: 'Case opened', resolved: 'Resolved',
}

export default function Coordinator() {
  const { data, error } = useQueue()
  const cases = data ?? []
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
                <span className="row-name">{c.traveler}</span>
                <StatusBadge status={c.status} />
              </div>
              <p className="lede">{c.incident}</p>
              <SourceLine source={SOURCE[c.status]} at={c.at} />
            </li>
          ))}
        </ul>
      )}
      <section className="panel case-detail">
        <h2>Case</h2>
        <p className="empty">Choose a Case to see its Reports and Contact Attempts.</p>
      </section>
    </div>
  )
}
