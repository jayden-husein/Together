import { useState, type FormEvent } from 'react'
import { MapContainer, Polygon } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import MapTiles from '../MapTiles'
import { verifyIncident, type PotentialIncident } from '../lib/checkIns'

function localTime(iso: string) {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1)
}

export default function PotentialIncidentReview({ draft, onVerify }: { draft: PotentialIncident; onVerify: () => void }) {
  const [start, setStart] = useState(localTime(draft.starts_at))
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tileError, setTileError] = useState(false)
  const rings = draft.area.coordinates.map(ring => ring.map(([lng, lat]): LatLngTuple => [lat, lng]))
  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (end && new Date(end) <= new Date(start)) { setError('End time must follow the start time.'); return }
    setBusy(true)
    setError('')
    try {
      await verifyIncident(draft.id, start === localTime(draft.starts_at) ? draft.starts_at : new Date(start).toISOString(), end ? new Date(end).toISOString() : null)
      onVerify()
    } catch { setError('Could not verify the Incident. Try again.') }
    finally { setBusy(false) }
  }
  return <section className="panel potential-review">
    <h2>Potential incident</h2>
    <h3>{draft.name}</h3>
    <p>{draft.fallback ? 'Pre-written summary' : 'AI summary'}</p>
    <p>{draft.summary}</p>
    <ul>{draft.sources.map(source => <li key={source.name}>{source.name} <q>{source.quote}</q>
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
      {error && <p role="alert">{error}</p>}
    </fieldset></form>
  </section>
}
