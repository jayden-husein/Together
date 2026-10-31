import { useState, type FormEvent } from 'react'
import { CircleMarker, MapContainer, Polygon, Tooltip } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { places } from '../../supabase/functions/_shared/itinerary'
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
  return <section className="panel potential-review" aria-label={draft.name}>
    <header className="review-heading">
      <div>
        <p className="review-kicker">Potential incident</p>
        <h2>{draft.name}</h2>
      </div>
      <span className="review-pending">Pending verification</span>
    </header>
    <div className="review-overview">
      <section className="review-situation">
        <h3>What’s happening</h3>
        <p className="review-summary">{draft.summary}</p>
        <p className="review-provenance">{draft.fallback ? 'Pre-written summary · AI unavailable' : 'AI summary · Review against the sources below'}</p>
        <dl className="review-facts">
          <div><dt>Reported start</dt><dd><time dateTime={draft.starts_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.starts_at))}</time></dd></div>
          <div><dt>Supporting readings</dt><dd>{draft.sources.length} sources available for review</dd></div>
          <div><dt>Current status</dt><dd>Awaiting a Coordinator’s decision. No travelers are affected by this Potential incident.</dd></div>
        </dl>
      </section>
      <figure className="review-geography">
        <MapContainer className="review-map" bounds={rings[0]} boundsOptions={{ padding: [32, 32] }} scrollWheelZoom={false}>
          <MapTiles onError={() => setTileError(true)} />
          <Polygon positions={rings} pathOptions={{ color: 'var(--color-info-fg)', fillColor: 'var(--color-info-fg)', fillOpacity: 0.18, weight: 3 }} />
          {(['Phantom Ranch', 'Black Bridge'] as const).map(place => {
            const [lng, lat] = places[place]
            return <CircleMarker key={place} center={[lat, lng]} radius={5} pathOptions={{ color: 'var(--color-text)', fillColor: 'var(--color-surface)', fillOpacity: 1 }}>
              <Tooltip permanent direction="top">{place}</Tooltip>
            </CircleMarker>
          })}
        </MapContainer>
        <figcaption><span className="review-map-key" aria-hidden="true" /> Shaded outline shows the weather warning area.</figcaption>
        {tileError && <p role="status">The base map could not load. The outline shows the warning area. Try refreshing the page.</p>}
      </figure>
    </div>
    <section className="review-evidence">
      <div className="review-section-heading"><h3>What the sources say</h3><p>Compare these excerpts with the summary before verifying.</p></div>
      <ul className="review-sources">{draft.sources.map(source => <li key={source.name}>
        <h4>{source.name}</h4>
        <blockquote>{source.quote}</blockquote>
        <details><summary>Read full source</summary><p>{source.text}</p></details>
      </li>)}</ul>
    </section>
    <form className="case-action review-decision" onSubmit={verify}>
      <div className="review-section-heading">
        <h3>Verify this Incident</h3>
        <p>Confirm the area and time window. Verification opens Cases for overlapping travelers and sends each a Check-in Request.</p>
      </div>
      <fieldset disabled={busy}>
        <legend>Incident time window</legend>
        <p className="review-provenance">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
        <div className="review-times">
          <label>Start <input type="datetime-local" step="any" required value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>End (optional) <input type="datetime-local" step="any" value={end} onChange={e => setEnd(e.target.value)} /><span className="review-provenance">Leave empty if the Incident is ongoing.</span></label>
        </div>
        <button className="button review-verify" disabled={busy}>{busy ? 'Verifying…' : 'Verify Incident'}</button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  </section>
}
