import { isCurrent } from '../../supabase/functions/_shared/itinerary'
import { compareTimes } from '../lib/caseRules'
import type { ConfirmedItinerary } from '../lib/checkIns'
import { SourceLine } from '../ui'
import StopsMap from './StopsMap'

// Grand Canyon local time: Arizona keeps MST all year.
const localTime = new Intl.DateTimeFormat(undefined, { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const Local = ({ at }: { at: string }) => <time dateTime={at}>{localTime.format(new Date(at))}</time>

// The traveler's confirmed Itineraries that are in force (nothing supersedes them) and still current, newest first.
export default function Itineraries({ data, error, onCorrect }: { data: ConfirmedItinerary[] | undefined; error: string | null; onCorrect: (itinerary: ConfirmedItinerary) => void }) {
  const current = data?.filter(i => isCurrent(i.stops) && !data.some(c => c.supersedes === i.id)).sort((a, b) => compareTimes(b.at, a.at))
  return <section className="panel">
    <h2>Your confirmed Itineraries</h2>
    {error && <p role="alert">Could not load your Itineraries: {error}</p>}
    {!current ? (
      !error && <p className="empty">Loading…</p>
    ) : current.length === 0 ? (
      <p className="empty">No confirmed Itineraries for upcoming outings.</p>
    ) : (
      <ul className="rows" aria-label="Your confirmed Itineraries">
        {current.map(itinerary => <Entry key={itinerary.id} itinerary={itinerary} onCorrect={() => onCorrect(itinerary)} />)}
      </ul>
    )}
  </section>
}

function Entry({ itinerary, onCorrect }: { itinerary: ConfirmedItinerary; onCorrect: () => void }) {
  return <li className="row" aria-label={`Itinerary confirmed ${itinerary.at}`}>
    <SourceLine source="Confirmed" at={itinerary.at} />
    <ol>
      {itinerary.stops.map((stop, i) => <li key={i}>
        <strong>{stop.place}</strong>: <Local at={stop.start} /> to <Local at={stop.end} /> (Grand Canyon time)
      </li>)}
    </ol>
    <StopsMap stops={itinerary.stops} />
    {itinerary.originalText && <details><summary>Your pasted plans</summary><blockquote>{itinerary.originalText}</blockquote></details>}
    <div><button className="button" type="button" onClick={onCorrect}>Correct</button></div>
  </li>
}
