import { copy } from '../copy'
import { VerificationSessionError, signInAgain } from '../lib/incidentVerification'
import { useState, type FormEvent } from 'react'
import { CircleMarker, MapContainer, Polygon, Tooltip } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { places } from '../../supabase/functions/_shared/itinerary'
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
  const [sessionExpired, setSessionExpired] = useState(false)
  const [reason, setReason] = useState('')
  const [tileError, setTileError] = useState(false)
  const rings = draft.area.coordinates.map(ring => ring.map(([lng, lat]): LatLngTuple => [lat, lng]))
  async function decide(action: () => Promise<void>, fallback: string) {
    if (busy) return
    setBusy(true)
    setError(copy.text)
    try {
      await action()
      onDecided()
    } catch (failure) {
      setSessionExpired(failure instanceof VerificationSessionError)
      setError(failure instanceof Error ? failure.message : fallback)
    }
    finally { setBusy(false) }
  }
  function verify(event: FormEvent) {
    event.preventDefault()
    if (end && new Date(end) <= new Date(start)) { setError(copy.end_time_must_follow_the_start_time); return }
    decide(() => verifyIncident(draft.id, start === localTime(draft.starts_at) ? draft.starts_at : new Date(start).toISOString(),
      end ? new Date(end).toISOString() : null), 'Could not verify the Incident. Try again.')
  }
  function dismiss(event: FormEvent) {
    event.preventDefault()
    if (reason.trim() && window.confirm(copy.dismiss_this_potential_incident_you_can_restore)) decide(() => dismissPotentialIncident(draft.id, reason.trim()), 'Could not dismiss the Potential incident. Try again.')
  }
  return <section className="panel potential-review" aria-label={draft.name}>
    <header className="review-heading">
      <div>
        <p className="review-kicker">{copy.potential_incident}</p>
        <h2>{draft.name}</h2>
      </div>
      <span className="review-pending">{draft.corroborated ? copy.corroborated : copy.single_source}{copy.pending_verification}</span>
    </header>
    {draft.earlier && <div role="note">
      <p>{copy.an_earlier_potential_incident_from_the_same}</p>
      <DismissalLine dismissal={draft.earlier} />
    </div>}
    <div className="review-overview">
      <section className="review-situation">
        <h3>{copy.whats_happening}</h3>
        <p className="review-summary">{draft.summary}</p>
        <p className="review-provenance">{draft.fallback ? copy.prewritten_summary_ai_unavailable : copy.ai_summary_review_against_the_sources_below}</p>
        <dl className="review-facts">
          <div><dt>{copy.reported_start}</dt><dd><time dateTime={draft.starts_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.starts_at))}</time></dd></div>
          <div><dt>{copy.supporting_readings}</dt><dd>{draft.sources.length}{copy.sources_available_for_review}</dd></div>
          <div><dt>{copy.current_status}</dt><dd>{copy.awaiting_a_coordinators_decision_no_travelers_are}</dd></div>
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
        <figcaption><span className="review-map-key" aria-hidden="true" />{copy.shaded_outline_shows_the_area_from_the}</figcaption>
        {tileError && <p role="status">{copy.the_base_map_could_not_load_the}</p>}
      </figure>
    </div>
    <section className="review-evidence">
      <div className="review-section-heading"><h3>{copy.what_the_sources_say}</h3><p>{copy.compare_these_excerpts_with_the_summary_before}</p></div>
      <ul className="review-sources">{draft.sources.map(source => <li key={source.name}>
        <h4>{source.name}</h4>
        <p className="review-provenance"><time dateTime={source.at}>{formatTime(source.at)}</time></p>
        <blockquote>{source.quote}</blockquote>
        <details><summary>{copy.read_full_source}</summary><p>{source.text}</p></details>
      </li>)}</ul>
    </section>
    <form className="case-action review-decision" onSubmit={verify}>
      <div className="review-section-heading">
        <h3>{copy.verify_this_incident}</h3>
        <p>{copy.confirm_the_area_and_time_window_verification}</p>
      </div>
      <fieldset disabled={busy}>
        <legend>{copy.incident_time_window}</legend>
        <p className="review-provenance">{copy.times_shown_in}{Intl.DateTimeFormat().resolvedOptions().timeZone}{copy.text_6}</p>
        <div className="review-times">
          <label>{copy.start_2}<input type="datetime-local" step="any" required value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>{copy.end_optional}<input type="datetime-local" step="any" value={end} onChange={e => setEnd(e.target.value)} /><span className="review-provenance">{copy.leave_empty_if_the_incident_is_ongoing}</span></label>
        </div>
        <button className="button review-verify" disabled={busy}>{busy ? copy.verifying : copy.verify_incident}</button>
      </fieldset>
    </form>
    <form className="case-action review-decision" onSubmit={dismiss}>
      <div className="review-section-heading">
        <h3>{copy.dismiss}</h3>
        <p>{copy.a_new_reading_from_these_sources_will}</p>
      </div>
      <fieldset disabled={busy}>
        <label>{copy.reason}<textarea required rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button className="button" disabled={busy || !reason.trim()}>{copy.dismiss}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    {sessionExpired && <button type="button" className="button" onClick={() => signInAgain().catch(() => setError(copy.could_not_sign_out_refresh_the_page))}>{copy.sign_in_again}</button>}
  </section>
}

export function DismissalLine({ dismissal }: { dismissal: Dismissal }) {
  return <>
    <p><q>{dismissal.dismissal_reason}</q></p>
    <SourceLine source={`Dismissed by ${dismissal.dismisser?.name ?? 'a Coordinator'}`} at={dismissal.dismissed_at} />
  </>
}
