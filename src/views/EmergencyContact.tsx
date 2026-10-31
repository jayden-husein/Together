import { SourceLine, StatusBadge, statusClass } from '../ui'

export default function EmergencyContact() {
  return (
    <div className="column">
      <header className="view-header">
        <h1>Travelers who named you</h1>
        <p className="lede">You get an Individual Update when their Case changes.</p>
      </header>
      <ul className="rows">
        <li className={`row ${statusClass('unconfirmed')}`}>
          <div className="row-main">
            <span className="row-name">Maya Chen</span>
            <StatusBadge status="unconfirmed" />
          </div>
          <SourceLine source="Individual Update" at="2026-10-31T14:05:00Z" />
        </li>
      </ul>
    </div>
  )
}
