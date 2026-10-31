import { useState } from 'react'
import { submitCheckIn, useMyCheckIns } from '../lib/checkIns'
import { CheckInButtons, type CheckInStatus, StatusBadge, SourceLine } from '../ui'
import { Account } from './Account'

function Request({ id, incident, refresh }: { id: string; incident: string; refresh: () => void }) {
  const [assistance, setAssistance] = useState(false)
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  async function send(status: CheckInStatus) {
    setSending(true)
    setMessage('')
    try {
      await submitCheckIn(id, status, status === 'needs_assistance' ? description.trim() : undefined)
      setDescription('')
      setAssistance(false)
      setMessage('Check-in sent.')
      refresh()
    } catch { setMessage('Could not send your Check-in. Please try again.') }
    finally { setSending(false) }
  }
  return <section className="panel panel-request"><h2>Check-in Request</h2>
    <p>Coordinators for {incident} are asking whether you're safe.</p>
    <fieldset disabled={sending} className="check-in-fields">
      <CheckInButtons onCheckIn={s => s === 'safe' ? void send(s) : setAssistance(true)} />
      {assistance && <form onSubmit={e => { e.preventDefault(); void send('needs_assistance') }}>
        <label>What do you need and how urgent is it?
          <textarea autoFocus required value={description} onChange={e => setDescription(e.target.value)} />
        </label><button disabled={!description.trim()}>Send Check-in</button>
      </form>}
    </fieldset><p role="status">{message}</p>
  </section>
}

function Requests() {
  const {data, error, refresh} = useMyCheckIns()
  return <>{error && <p role="alert">{error}</p>}{!data && !error && <p>Loading requests…</p>}
    {data?.length === 0 && <p>You have no Check-in Requests.</p>}
    {data?.map(c => <div key={c.id}><Request id={c.id} incident={c.incidents.name} refresh={refresh} />
      <section className="panel"><h2>Your Check-ins</h2>
        {!c.reports.length && <p>You haven't checked in yet.</p>}
        {c.reports.map(r => <article key={r.id}><StatusBadge status={r.body.status}/>
          {r.original_text && <p>{r.original_text}</p>}<SourceLine source="Your Check-in" at={r.created_at}/>
        </article>)}</section></div>)}</>
}
export default function Traveler() {
  return <div className="column"><header className="view-header"><h1>Your Check-in</h1></header>
    <Account><Requests /></Account></div>
}
