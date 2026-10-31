import Itineraries from './Itineraries'
import Itinerary from './Itinerary'
import { useState } from 'react'
import { type CheckInRequest, type CheckInStatus, submitCheckIn, useMyCheckIns, useMyItineraries } from '../lib/checkIns'
import { CheckInButtons, SourceLine, StatusBadge, statusClass } from '../ui'

export default function Traveler() {
  const { data, error } = useMyCheckIns()
  const itineraries = useMyItineraries()
  return (
    <div className="column">
      <header className="view-header">
        <h1>Your Check-in</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        !error && <p className="empty">Loading…</p>
      ) : data.length === 0 ? (
        <p className="empty">No Check-in Requests. Together asks here if an incident is near your trip.</p>
      ) : (
        data.map(request => <Request key={request.caseId} request={request} />)
      )}
      <Itinerary onConfirmed={itineraries.reload} />
      <Itineraries data={itineraries.data} error={itineraries.error} />
    </div>
  )
}

function Request({ request }: { request: CheckInRequest }) {
  const [asking, setAsking] = useState(false)
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed?: boolean }>()

  async function send(status: CheckInStatus) {
    if (sending) return // A double tap would store two Check-ins.
    setSending(true)
    setMessage(undefined)
    try {
      await (status === 'safe' ? submitCheckIn(request.caseId, status) : submitCheckIn(request.caseId, status, description.trim()))
      // A Safe tap leaves any description in place, so nothing typed is lost.
      if (status === 'needs_assistance') {
        setAsking(false)
        setDescription('')
      }
      setMessage({ text: 'Check-in sent.' })
    } catch (e) {
      // Keep the description so nothing they typed is lost; they can send again.
      setMessage({ text: `Couldn't send your Check-in: ${e instanceof Error ? e.message : 'try again'}.`, failed: true })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <section className="panel panel-request" aria-label="Check-in Request">
        <h2>Check-in Request</h2>
        <p>{request.incident}: Coordinators are asking whether you're safe. Choose one.</p>
        <CheckInButtons onCheckIn={status => (status === 'safe' ? send('safe') : setAsking(true))} />
        {asking && (
          <form className="describe" onSubmit={e => { e.preventDefault(); send('needs_assistance') }}>
            <label htmlFor={`describe-${request.caseId}`}>What do you need, and how urgent is it?</label>
            <textarea id={`describe-${request.caseId}`} rows={3} value={description} autoFocus
              onChange={e => setDescription(e.target.value)} />
            <button type="submit" className="button" disabled={sending || !description.trim()}>Send</button>
          </form>
        )}
        {message && <p role={message.failed ? 'alert' : 'status'}>{message.text}</p>}
      </section>
      <section className="panel">
        <h2>Your Check-ins</h2>
        {request.reports.length === 0 ? (
          <p className="empty">You haven't checked in yet.</p>
        ) : (
          <ul className="rows" aria-label="Your Check-ins">
            {request.reports.map(report => (
              <li className={`row ${statusClass(report.status)}`} key={report.id}>
                <div className="row-main"><StatusBadge status={report.status} /></div>
                {report.description && <p>{report.description}</p>}
                <SourceLine source="Sent" at={report.at} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
