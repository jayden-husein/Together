import { useState } from 'react'
import { isCurrent, lockedStops } from '../../supabase/functions/_shared/itinerary'
import { compareTimes } from '../lib/caseRules'
import { AlreadyCorrectedError, confirmItinerary, type ConfirmedItinerary } from '../lib/checkIns'
import { SourceLine } from '../ui'
import StopsMap from './StopsMap'

// Grand Canyon local time: Arizona keeps MST all year.
const localTime = new Intl.DateTimeFormat(undefined, { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const Local = ({ at }: { at: string }) => <time dateTime={at}>{localTime.format(new Date(at))}</time>

// A Withdraw is a Correction with no stops still to come: every stop had started when it was confirmed.
const withdraws = (i: ConfirmedItinerary) => !!i.supersedes && i.stops.every(s => Date.parse(s.start) <= Date.parse(i.at))

// The traveler's confirmed Itineraries that are in force (nothing supersedes them), still current and not withdrawn, newest first.
// `onChange`: called after a Withdraw, or its refusal, to reload the list.
export default function Itineraries({ data, error, onCorrect, onChange }: {
  data: ConfirmedItinerary[] | undefined; error: string | null; onCorrect: (itinerary: ConfirmedItinerary) => void; onChange: () => void
}) {
  const current = data?.filter(i => isCurrent(i.stops) && !withdraws(i) && !data.some(c => c.supersedes === i.id)).sort((a, b) => compareTimes(b.at, a.at))
  return <section className="panel">
    <h2>Your confirmed Itineraries</h2>
    {error && <p role="alert">Could not load your Itineraries: {error}</p>}
    {!current ? (
      !error && <p className="empty">Loading…</p>
    ) : current.length === 0 ? (
      <p className="empty">No confirmed Itineraries for upcoming outings.</p>
    ) : (
      <ul className="rows" aria-label="Your confirmed Itineraries">
        {current.map(itinerary => <Entry key={itinerary.id} itinerary={itinerary} onCorrect={() => onCorrect(itinerary)} onChange={onChange} />)}
      </ul>
    )}
  </section>
}

function Entry({ itinerary, onCorrect, onChange }: { itinerary: ConfirmedItinerary; onCorrect: () => void; onChange: () => void }) {
  const [withdrawing, setWithdrawing] = useState(false)
  const [message, setMessage] = useState('')
  async function withdraw() {
    if (!window.confirm('Withdraw this Itinerary? Together will stop expecting you at its stops still to come.')) return
    setWithdrawing(true)
    setMessage('')
    try {
      // Started stops carry over; nothing else does.
      await confirmItinerary({ id: crypto.randomUUID(), stops: lockedStops(itinerary.stops), originalText: itinerary.originalText, supersedes: itinerary.id })
      onChange()
    } catch (e) {
      if (e instanceof AlreadyCorrectedError) onChange()
      setMessage(e instanceof AlreadyCorrectedError ? 'This Itinerary was already corrected.' : 'Could not withdraw your Itinerary. Try again.')
    } finally { setWithdrawing(false) }
  }
  return <li className="row" aria-label={`Itinerary confirmed ${itinerary.at}`}>
    <SourceLine source="Confirmed" at={itinerary.at} />
    <ol>
      {itinerary.stops.map((stop, i) => <li key={i}>
        <strong>{stop.place}</strong>: <Local at={stop.start} /> to <Local at={stop.end} /> (Grand Canyon time)
      </li>)}
    </ol>
    <StopsMap stops={itinerary.stops} />
    {itinerary.originalText && <details><summary>Your pasted plans</summary><blockquote>{itinerary.originalText}</blockquote></details>}
    <div><button className="button" type="button" disabled={withdrawing} onClick={onCorrect}>Correct</button>
      <button className="button" type="button" disabled={withdrawing} onClick={() => void withdraw()}>Withdraw</button></div>
    {message && <p role="status">{message}</p>}
  </li>
}
