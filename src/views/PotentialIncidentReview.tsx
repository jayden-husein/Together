import { useState, type FormEvent } from 'react'
import { MapContainer, Polygon } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import MapTiles from '../MapTiles'
import { dismissPotentialIncident, verifyIncident, type Dismissal, type PotentialIncident } from '../lib/checkIns'
import { SourceLine, formatTime } from '../ui'

function localTime(iso: string) {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1)
}

export default function PotentialIncidentReview({ draft, onDecided }: { draft: PotentialIncident; onDecided: () => void }) {
  const [start, setStart] = useState(localTime(draft.starts_at))
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [tileError, setTileError] = useState(false)
  const rings = draft.area.coordinates.map(ring => ring.map(([lng, lat]): LatLngTuple => [lat, lng]))
  async function decide(action: () => Promise<void>, failure: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      onDecided()
    } catch { setError(failure) }
    finally { setBusy(false) }
  }
  function verify(event: FormEvent) {
    event.preventDefault()
    if (end && new Date(end) <= new Date(start)) { setError('End time must follow the start time.'); return }
    decide(() => verifyIncident(draft.id, start === localTime(draft.starts_at) ? draft.starts_at : new Date(start).toISOString(),
      end ? new Date(end).toISOString() : null), 'Could not verify the Incident. Try again.')
  }
  function dismiss(event: FormEvent) {
    event.preventDefault()
    if (reason.trim()) decide(() => dismissPotentialIncident(draft.id, reason.trim()), 'Could not dismiss the Potential incident. Try again.')
  }
  return <section className="panel potential-review">
    <h2>Potential incident</h2>
    {draft.earlier && <div role="note">
      <p>An earlier Potential incident from the same source was dismissed.</p>
      <DismissalLine dismissal={draft.earlier} />
    </div>}
    <h3>{draft.name}</h3>
    <p><strong>{draft.corroborated ? 'Corroborated' : 'Single source'}</strong></p>
    <p>{draft.fallback ? 'Pre-written summary' : 'AI summary'}</p>
    <p>{draft.summary}</p>
    <ul>{draft.sources.map(source => <li key={source.name}>{source.name}, <time dateTime={source.at}>{formatTime(source.at)}</time> <q>{source.quote}</q>
      <details><summary>Full reading</summary>{source.text}</details></li>)}</ul>
    <h3>Weather warning area</h3>
    <MapContainer className="review-map" bounds={rings[0]} scrollWheelZoom={false}>
      <MapTiles onError={() => setTileError(true)} /><Polygon positions={rings} />
    </MapContainer>
    {tileError && <p>The base map could not load. The outline shows the warning area.</p>}
    <form className="case-action" onSubmit={verify}><fieldset>
      <legend>Review times ({Intl.DateTimeFormat().resolvedOptions().timeZone})</legend>
      <label>Start <input type="datetime-local" step="any" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>End (optional) <input type="datetime-local" step="any" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <p>Verification sends a Check-in Request to each traveler with a matching Itinerary.</p>
      <button className="button" disabled={busy}>{busy ? 'Verifying…' : 'Verify Incident'}</button>
    </fieldset></form>
    <form className="case-action" onSubmit={dismiss}><fieldset>
      <legend>Dismiss</legend>
      <label>Reason <textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <p>A new reading from these sources will raise a new Potential incident showing this dismissal.</p>
      <button className="button" disabled={busy || !reason.trim()}>Dismiss</button>
    </fieldset></form>
    {error && <p role="alert">{error}</p>}
  </section>
}

export function DismissalLine({ dismissal }: { dismissal: Dismissal }) {
  return <>
    <p><q>{dismissal.dismissal_reason}</q></p>
    <SourceLine source={`Dismissed by ${dismissal.dismisser?.name ?? 'a Coordinator'}`} at={dismissal.dismissed_at} />
  </>
}
