import { toast } from '../components'
import { useDraft } from '../lib/drafts'
import { useEffect, useState } from 'react'
import type { ProposedStop } from '../../supabase/functions/_shared/aiOutputCheck'
import { confirmedStops, localDateTime, lockedStops, maxStops, maxTextLength, mstOffset, places, type Stop } from '../../supabase/functions/_shared/itinerary'
import { AlreadyCorrectedError, confirmItinerary, type ConfirmedItinerary } from '../lib/checkIns'
import { supabase } from '../lib/supabase'
import { formatTime } from '../ui'
import StopsMap from './StopsMap'

// From AI extraction: `quote`, the words the stop was read from; `needs`, what to fill in;
// `times`, the HH:MM window read from plans that didn't say which day.
// `locked`: a started stop of the Itinerary being corrected, carried over unchanged.
type Draft = Omit<Stop, 'place'> & { place: string } & { key: string; quote?: string; needs?: ProposedStop['needs']; times?: { start: string; end: string }; locked?: Stop }
const blank = (): Draft => ({ key: crypto.randomUUID(), place: '', start: '', end: '' })
const proposed = (p: ProposedStop): Draft => ({
  key: crypto.randomUUID(), quote: p.quote, needs: p.needs, place: p.place ?? '',
  start: p.date && p.start ? `${p.date}T${p.start}` : '',
  end: p.date && p.end ? `${p.date}T${p.end}` : '',
  times: !p.date && p.start && p.end ? { start: p.start, end: p.end } : undefined,
})

// `onConfirmed`: called once an Itinerary is stored, e.g. to show it in the list right away.
// `correcting`: the Itinerary a Correction will supersede, loaded into the form when it mounts.
export default function Itinerary({ correcting, onCancel, onConfirmed, onAlreadyCorrected }: {
  correcting?: ConfirmedItinerary | null; onCancel?: () => void; onConfirmed?: () => void; onAlreadyCorrected?: () => void
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  // Inputs show Grand Canyon time. Round up to the next selectable minute.
  const earliest = localDateTime(Math.ceil(now / 60_000) * 60_000)
  const latest = '9999-12-31T23:59'
  const [stops, setStops] = useState<Draft[]>(() => {
    const locked = lockedStops(correcting?.stops ?? [])
    return (correcting?.stops ?? []).map(s => ({ key: crypto.randomUUID(), place: s.place,
      start: localDateTime(Date.parse(s.start)), end: localDateTime(Date.parse(s.end)), locked: locked.includes(s) ? s : undefined }))
  })
  const [id, setId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  // The traveler's pasted plans, kept with the confirmed Itinerary whether or not the AI read them.
  const [text, setText] = useDraft(`itinerary:${correcting?.id ?? 'new'}`, correcting?.originalText ?? '')
  const [reading, setReading] = useState(false)
  const [readFailed, setReadFailed] = useState(false)
  function edit(next: Draft[]) {
    setStops(next)
    setId(crypto.randomUUID())
    setMessage('')
  }
  async function extract() {
    setReading(true)
    setReadFailed(false)
    try {
      // A little longer than the function's own 20-second limit on the AI call.
      const { data, error } = await supabase.functions.invoke<{ stops: ProposedStop[] }>('extract-itinerary', { body: { text }, timeout: 25_000 })
      if (error || !data) throw error
      // Reading again replaces the stops read last time and keeps the ones added by hand.
      edit([...stops.filter(s => !s.quote), ...data.stops.map(proposed)].slice(0, maxStops))
      if (!data.stops.length) setMessage('No stops found in your plans. Add them below.')
    } catch { setReadFailed(true) }
    finally { setReading(false) }
  }
  async function confirm() {
    setSaving(true)
    setMessage('')
    try {
      const payload = confirmedStops(stops.map(s => s.locked ?? { ...s, start: s.start + mstOffset, end: s.end + mstOffset }), Date.now(), correcting?.stops)
      try { await confirmItinerary({ id, stops: payload, originalText: text.trim() || null, ...correcting && { supersedes: correcting.id } }) }
      catch (e) {
        if (!(e instanceof AlreadyCorrectedError)) throw new Error('Could not confirm your Itinerary. Your stops are here to try again.')
        onAlreadyCorrected?.()
        throw new Error('This Itinerary was already corrected.')
      }
      edit([])
      setText('')
      setMessage('Itinerary confirmed.'); toast('Itinerary confirmed')
      onConfirmed?.()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not confirm your Itinerary.') }
    finally { setSaving(false) }
  }
  return <section className="panel">
    <h2>Your itinerary</h2><ol className="stepper" aria-label="Itinerary steps"><li>1 Paste plans</li><li>2 Review stops</li><li>3 Confirm</li></ol><p className="lede">Fill in stops, review places and times, then confirm your itinerary to share it with Coordinators.</p>
    {correcting && <p role="status">Correcting your Itinerary from <time dateTime={correcting.at}>{formatTime(correcting.at)}</time>. <button className="button" type="button" onClick={onCancel}>Discard correction</button></p>}
    <form className="itinerary" onSubmit={e => { e.preventDefault(); void extract() }}>
      <label>Paste your plans<textarea required maxLength={maxTextLength} rows={3} value={text} disabled={reading || saving}
        placeholder="November 1, 2026: visitor center 7 to 8, then Phantom Ranch 1 to 4" onChange={e => setText(e.target.value)} /></label>
      <div><button className="button" type="submit" disabled={reading || saving}>{reading ? 'Reading your plans…' : readFailed ? 'Try again' : 'Fill in stops'}</button></div>
      {readFailed && <p role="alert">Could not read your plans. Try again, or add your stops yourself below.</p>}
    </form>
    <form className="itinerary" onSubmit={e => { e.preventDefault(); void confirm() }}>
      {stops.length > 0 && <p>Enter arrival and departure in Grand Canyon local time (MST).</p>}
      {stops.map((stop, i) => {
        const change = (field: keyof Stop, value: string) => edit(stops.map(s => s.key === stop.key ? { ...s, [field]: field === 'place' ? value : value.replace(/^(\d{4})\d+(?=-)/, '$1') } : s))
        return <fieldset key={stop.key} disabled={saving || !!stop.locked}>
          <legend>Stop {i + 1}{stop.locked && ', started, kept as it was'}</legend>
          {stop.quote && <p>From your plans: “{stop.quote}”</p>}
          {stop.needs?.includes('place') && !stop.place && <p role="status">Choose which place you meant.</p>}
          {stop.needs?.includes('date') && !stop.start && <p role="status">Your plans don't say which day. Add the date.</p>}
          {stop.times && !stop.start && <label>Date<input type="date" min={earliest.slice(0, 10)}
            onChange={e => e.target.value && edit(stops.map(s => s.key === stop.key ? { ...s, start: `${e.target.value}T${stop.times!.start}`, end: `${e.target.value}T${stop.times!.end}` } : s))} /></label>}
          {stop.needs?.includes('time') && !stop.start && <p role="status">Add the arrival and departure times.</p>}
          <label>Place<select required value={stop.place} onChange={e => change('place', e.target.value)}>
            <option value="">Choose a place</option>
            {Object.keys(places).map(p => <option key={p}>{p}</option>)}
          </select></label>
          <label>Arrival · MST, Grand Canyon local<input type="datetime-local" required min={earliest} max={latest} value={stop.start} onChange={e => change('start', e.target.value)} /></label>
          <label>Departure · MST, Grand Canyon local<input type="datetime-local" required min={stop.start > earliest ? stop.start : earliest} max={latest} value={stop.end} onChange={e => change('end', e.target.value)} /></label>
          {!stop.place && <p className="field-error">Choose a place for this stop.</p>}
          {stop.start && stop.end && stop.end <= stop.start && <p className="field-error" role="alert">Departure must be after arrival.</p>}
          {stop.start && stop.end && stops.some((other,j) => j !== i && other.start < stop.end && other.end > stop.start) && <p className="field-error" role="alert">This stop overlaps another stop. Adjust its times.</p>}
          {stop.start && stop.end > stop.start && <span className="tag">{Math.round((Date.parse(stop.end)-Date.parse(stop.start))/60000)} min</span>}
          <button className="button" type="button" onClick={() => edit(stops.filter(s => s.key !== stop.key))}>Remove stop</button>
        </fieldset>
      })}
      <StopsMap stops={stops} />
      <div><button className="button" type="button" disabled={saving || stops.length >= maxStops} onClick={() => edit([...stops, blank()])}>Add stop</button>
        {(stops.length > 0 || correcting) && <button className="button" disabled={saving} type="submit">Confirm itinerary</button>}</div>
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}
