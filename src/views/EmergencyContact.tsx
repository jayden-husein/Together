import { useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge, statusClass } from '../ui'

export default function EmergencyContact() {
  const { data, error } = useIndividualUpdates()
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
          {data.map(({ caseId, traveler, update }) => (
            <li className={`row ${statusClass(update.status)}`} key={`${caseId} ${update.at} ${update.status}`}>
              <div className="row-main">
                <span className="row-name">{traveler}</span>
                <StatusBadge status={update.status} />
              </div>
              <SourceLine source="Individual Update" at={update.at} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
