import { download } from '../lib/operations'
import { toast } from '../components'
import { useState } from 'react'
import { inForce, isCurrent, lockedStops, withdraws } from '../../supabase/functions/_shared/itinerary'
import { compareTimes } from '../lib/caseRules'
import { AlreadyCorrectedError, confirmItinerary, type ConfirmedItinerary } from '../lib/checkIns'
import { SourceLine, Stops } from '../ui'
import StopsMap from './StopsMap'

// The traveler's confirmed Itineraries that are in force (nothing supersedes them), still current and not withdrawn, newest first.
// `onChange`: called after a Withdraw, or its refusal, to reload the list.
export default function Itineraries({ data, error, onCorrect, onChange }: {
  data: ConfirmedItinerary[] | undefined; error: string | null; onCorrect: (itinerary: ConfirmedItinerary) => void; onChange: () => void
}) {
  const current = data && inForce(data).filter(i => isCurrent(i.stops) && !(i.supersedes && withdraws(i.stops, Date.parse(i.at)))).sort((a, b) => compareTimes(b.at, a.at))
  // Kept here, not in the entry: a refused Withdraw reloads the list, and the entry leaves it.
  const past = data && inForce(data).filter(i=>!isCurrent(i.stops))
  const [message, setMessage] = useState('')
  return <section className="panel">
    <h2>Your confirmed Itineraries</h2>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">Could not load your itineraries. Try again.</p>}
    {!current ? (
      !error && <p className="empty">Loading…</p>
    ) : current.length === 0 ? (
      <p className="empty">No confirmed Itineraries for upcoming outings.</p>
    ) : (
      <ul className="rows" aria-label="Your confirmed Itineraries">
        {current.map(itinerary => <Entry key={itinerary.id} itinerary={itinerary} onCorrect={() => onCorrect(itinerary)} onChange={onChange} onMessage={setMessage} />)}
      </ul>
    )}
    {!!past?.length && <details><summary>Past trips ({past.length})</summary>{past.map(i=><div className="row" key={i.id}><Stops stops={i.stops}/></div>)}</details>}
  </section>
}

function Entry({ itinerary, onCorrect, onChange, onMessage: setMessage }: {
  itinerary: ConfirmedItinerary; onCorrect: () => void; onChange: () => void; onMessage: (message: string) => void
}) {
  const [withdrawing, setWithdrawing] = useState(false)
  async function withdraw() {
    if (!window.confirm('Withdraw this Itinerary? Together will stop expecting you at its stops still to come.')) return
    setWithdrawing(true)
    setMessage('')
    try {
      // Started stops carry over; nothing else does.
      await confirmItinerary({ id: crypto.randomUUID(), stops: lockedStops(itinerary.stops), originalText: itinerary.originalText, supersedes: itinerary.id })
      toast('Itinerary withdrawn'); onChange()
    } catch (e) {
      if (e instanceof AlreadyCorrectedError) onChange()
      setMessage(e instanceof AlreadyCorrectedError ? 'This Itinerary was already corrected.' : 'Could not withdraw your Itinerary. Try again.')
    } finally { setWithdrawing(false) }
  }
  return <li className="row" aria-label={`Itinerary confirmed ${itinerary.at}`}>
    <SourceLine source="Confirmed" at={itinerary.at} />
    <Stops stops={itinerary.stops} />
    <StopsMap stops={itinerary.stops} />
    {itinerary.originalText && <details><summary>Your pasted plans</summary><blockquote>{itinerary.originalText}</blockquote></details>}
    <button className="button" type="button" onClick={()=>{const stamp=(at:string)=>new Date(at).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const events=itinerary.stops.map((s,i)=>['BEGIN:VEVENT',`UID:${itinerary.id}-${i}@together`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(s.start)}`,`DTEND:${stamp(s.end)}`,`SUMMARY:${s.place}`,`LOCATION:${s.place}`,'END:VEVENT'].join('\r\n')).join('\r\n');download('together-itinerary.ics',`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Together//Simulation//EN\r\n${events}\r\nEND:VCALENDAR\r\n`,'text/calendar')}}>Add to calendar</button>
    <div className="actions"><button className="button" type="button" disabled={withdrawing} onClick={onCorrect}>Correct</button>
      <button className="button" type="button" disabled={withdrawing} onClick={() => void withdraw()}>Withdraw</button></div>
  </li>
}
