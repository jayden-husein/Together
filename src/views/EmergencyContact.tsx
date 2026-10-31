import { SourceLine, StatusBadge } from '../ui'

export default function EmergencyContact() {
  return (
    <div className="column">
      <header className="view-header">
        <h1>People you follow</h1>
        <p className="lede">You get an Individual Update when their Case changes.</p>
      </header>
      <ul className="rows">
        <li className="row">
          <div className="row-main">
            <span className="row-name">Maya Chen</span>
            <StatusBadge status="unconfirmed" />
          </div>
          <SourceLine source="Check-in Request sent by a Coordinator" at="2026-10-31T14:05:00Z" />
        </li>
      </ul>
    </div>
  )
}
