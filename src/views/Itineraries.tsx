import { copy, messages } from '../copy'
import { download } from '../lib/operations'
import { Skeleton, toast } from '../components'
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
    <h2>{copy.your_confirmed_itineraries}</h2>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{copy.could_not_load_your_itineraries_try_again}</p>}
    {!current ? (
      !error && <p className="empty">{copy.loading_2}</p>
    ) : current.length === 0 ? (
      <p className="empty">{copy.no_confirmed_itineraries_for_upcoming_outings}</p>
    ) : (
      <ul className="rows" aria-label={copy.your_confirmed_itineraries}>
        {current.map(itinerary => <Entry key={itinerary.id} itinerary={itinerary} onCorrect={() => onCorrect(itinerary)} onChange={onChange} onMessage={setMessage} />)}
      </ul>
    )}
    {!!past?.length && <details><summary>{copy.past_trips}{past.length}{copy.text_8}</summary>{past.map(i=><div className="row" key={i.id}><Stops stops={i.stops}/></div>)}</details>}
  </section>
}

function Entry({ itinerary, onCorrect, onChange, onMessage: setMessage }: {
  itinerary: ConfirmedItinerary; onCorrect: () => void; onChange: () => void; onMessage: (message: string) => void
}) {
  const [withdrawing, setWithdrawing] = useState(false)
  async function withdraw() {
    if (!window.confirm(copy.withdraw_this_itinerary_together_will_stop_expecting)) return
    setWithdrawing(true)
    setMessage('')
    try {
      // Started stops carry over; nothing else does.
      await confirmItinerary({ id: crypto.randomUUID(), stops: lockedStops(itinerary.stops), originalText: itinerary.originalText, supersedes: itinerary.id })
      toast(copy.itinerary_withdrawn); onChange()
    } catch (e) {
      if (e instanceof AlreadyCorrectedError) onChange()
      setMessage(e instanceof AlreadyCorrectedError ? 'This Itinerary was already corrected.' : 'Could not withdraw your Itinerary. Try again.')
    } finally { setWithdrawing(false) }
  }
  return <li className="row confirmed-trip" aria-label={messages.itinerary_confirmed_2(itinerary.at)}>
    <SourceLine source={copy.confirmed} at={itinerary.at} />
    <Stops stops={itinerary.stops} />
    <StopsMap stops={itinerary.stops} />
    {itinerary.originalText && <details><summary>{copy.your_pasted_plans}</summary><blockquote>{itinerary.originalText}</blockquote></details>}
    <button className="button" type="button" onClick={()=>{const stamp=(at:string)=>new Date(at).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const events=itinerary.stops.map((s,i)=>['BEGIN:VEVENT',`UID:${itinerary.id}-${i}@together`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(s.start)}`,`DTEND:${stamp(s.end)}`,`SUMMARY:${s.place}`,`LOCATION:${s.place}`,'END:VEVENT'].join('\r\n')).join('\r\n');download('together-itinerary.ics',`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Together//Simulation//EN\r\n${events}\r\nEND:VCALENDAR\r\n`,'text/calendar')}}>{copy.add_to_calendar}</button>
    <div className="actions"><button className="button" type="button" disabled={withdrawing} onClick={onCorrect}>{copy.correct}</button>
      <button className="button" type="button" disabled={withdrawing} onClick={() => void withdraw()}>{copy.withdraw}</button></div>
  </li>
}
