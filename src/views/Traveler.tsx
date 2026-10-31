import { CheckInButtons } from '../ui'

export default function Traveler() {
  return (
    <div className="column">
      <header className="view-header">
        <h1>Your Check-in</h1>
      </header>
      <section className="panel panel-request" aria-labelledby="request-heading">
        <h2 id="request-heading">Check-in Request</h2>
        <p>Coordinators for the flash flood at Phantom Ranch are asking whether you're safe. Choose one.</p>
        {/* #7 stores the Check-in as a Report. */}
        <CheckInButtons onCheckIn={() => {}} />
      </section>
      <section className="panel">
        <h2>Your last Check-in</h2>
        <p className="empty">You haven't checked in yet.</p>
      </section>
    </div>
  )
}
