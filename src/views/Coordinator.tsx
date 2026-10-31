import { type CaseStatus, SourceLine, StatusBadge, type Urgency, UrgencyTag } from '../ui'

// Placeholder rows so the queue's layout can be judged; #7 replaces them with real Cases.
const CASES: { name: string; status: CaseStatus; urgency?: Urgency; source: string; at: string }[] = [
  { name: 'Maya Chen', status: 'needs_assistance', urgency: 'immediate', source: 'Check-in', at: '2026-10-31T14:12:00Z' },
  { name: 'Daniel Okafor', status: 'cant_reach', source: "Can't-reach report from an Emergency Contact", at: '2026-10-31T14:02:00Z' },
  { name: 'Priya Natarajan', status: 'unconfirmed', source: 'Venue record', at: '2026-10-31T13:48:00Z' },
  { name: 'Tom Alvarez', status: 'safe', source: 'Check-in', at: '2026-10-31T13:55:00Z' },
  { name: 'Lena Fischer', status: 'resolved', source: 'Contact Attempt: Reached', at: '2026-10-31T13:30:00Z' },
]

export default function Coordinator() {
  return (
    <div className="coordinator">
      <header className="view-header">
        <h1>Cases</h1>
        <p className="lede">Grand Canyon incident</p>
      </header>
      <ul className="rows" aria-label="Case queue">
        {CASES.map(c => (
          <li className="row" key={c.name}>
            <div className="row-main">
              <span className="row-name">{c.name}</span>
              <StatusBadge status={c.status} />
              {c.urgency && <UrgencyTag urgency={c.urgency} />}
            </div>
            <SourceLine source={c.source} at={c.at} />
          </li>
        ))}
      </ul>
      <section className="panel case-detail">
        <h2>Case</h2>
        <p className="empty">Choose a Case to see its Reports and Contact Attempts.</p>
      </section>
    </div>
  )
}
