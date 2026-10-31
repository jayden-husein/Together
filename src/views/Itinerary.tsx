import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet'
import type { ProposedStop } from '../../supabase/functions/_shared/aiOutputCheck'
import { confirmedStops, maxStops, maxTextLength, places, type Stop } from '../../supabase/functions/_shared/itinerary'
import MapTiles from '../MapTiles'
import { supabase } from '../lib/supabase'

// `quote` and `needs` come from AI extraction: the words the stop was read from, and what to fill in.
type Draft = Omit<Stop, 'place'> & { place: string } & { key: string; quote?: string; needs?: ProposedStop['needs'] }
const blank = (): Draft => ({ key: crypto.randomUUID(), place: '', start: '', end: '' })

export default function Itinerary() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  // Inputs show Grand Canyon time. Round up to the next selectable minute.
  const earliest = new Date(Math.ceil(now / 60_000) * 60_000 - 7 * 60 * 60_000).toISOString().slice(0, 16)
  const latest = '9999-12-31T23:59'
  const [stops, setStops] = useState<Draft[]>([])
  const [id, setId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const [message, setMessage] = useState('')
  // The traveler's pasted plans, kept with the confirmed Itinerary whether or not the AI read them.
  const [text, setText] = useState('')
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
      const { data, error } = await supabase.functions.invoke<{ stops: ProposedStop[] }>('extract-itinerary', { body: { text } })
      if (error || !data) throw error
      edit(data.stops.map(p => ({ key: crypto.randomUUID(), quote: p.quote, needs: p.needs, place: p.place ?? '', start: p.start ?? '', end: p.end ?? '' })))
      if (!data.stops.length) setMessage('No stops found in your plans. Add them below.')
    } catch { setReadFailed(true) }
    finally { setReading(false) }
  }
  async function confirm() {
    setSaving(true)
    setMessage('')
    try {
      // Arizona stays on Mountain Standard Time year-round at these places.
      const payload = confirmedStops(stops.map(s => ({ ...s, start: s.start + '-07:00', end: s.end + '-07:00' })))
      const { error } = await supabase.functions.invoke('confirm-itinerary', { body: { id, stops: payload, originalText: text.trim() || null } })
      if (error) throw new Error('Could not confirm your Itinerary. Your stops are here to try again.')
      edit([])
      setText('')
      setMessage('Itinerary confirmed.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not confirm your Itinerary.') }
    finally { setSaving(false) }
  }
  return <section className="panel">
    <h2>Your Itinerary</h2>
    <form className="itinerary" onSubmit={e => { e.preventDefault(); void extract() }}>
      <label>Paste your plans<textarea required maxLength={maxTextLength} rows={3} value={text} disabled={reading || saving}
        placeholder="November 1: visitor center 7 to 8, then Phantom Ranch 1 to 4" onChange={e => setText(e.target.value)} /></label>
      <div><button className="button" type="submit" disabled={reading || saving}>{reading ? 'Reading your plans…' : readFailed ? 'Try again' : 'Fill in stops'}</button></div>
      {readFailed && <p role="alert">Could not read your plans. Try again, or add your stops yourself below.</p>}
    </form>
    <form className="itinerary" onSubmit={e => { e.preventDefault(); void confirm() }}>
      {stops.length > 0 && <p>Enter arrival and departure in Grand Canyon local time (MST).</p>}
      {stops.map((stop, i) => {
        const change = (field: keyof Stop, value: string) => edit(stops.map(s => s.key === stop.key ? { ...s, [field]: field === 'place' ? value : value.replace(/^(\d{4})\d+(?=-)/, '$1') } : s))
        return <fieldset key={stop.key} disabled={saving}>
          <legend>Stop {i + 1}</legend>
          {stop.quote && <p>From your plans: “{stop.quote}”</p>}
          {stop.needs?.includes('place') && !stop.place && <p role="status">Choose which place you meant.</p>}
          {stop.needs?.includes('date') && !stop.start && <p role="status">Your plans don't say which day. Add the date.</p>}
          {stop.needs?.includes('time') && !stop.start && <p role="status">Add the arrival and departure times.</p>}
          <label>Place<select required value={stop.place} onChange={e => change('place', e.target.value)}>
            <option value="">Choose a place</option>
            {Object.keys(places).map(p => <option key={p}>{p}</option>)}
          </select></label>
          <label>Arrival<input type="datetime-local" required min={earliest} max={latest} value={stop.start} onChange={e => change('start', e.target.value)} /></label>
          <label>Departure<input type="datetime-local" required min={stop.start > earliest ? stop.start : earliest} max={latest} value={stop.end} onChange={e => change('end', e.target.value)} /></label>
          <button className="button" type="button" onClick={() => edit(stops.filter(s => s.key !== stop.key))}>Remove stop</button>
        </fieldset>
      })}
      {stops.some(s => s.place) && <MapContainer className="itinerary-map" center={[36.082, -112.115]} zoom={11}>
        <MapTiles onError={() => setTilesFailed(true)} />
        {stops.filter(s => s.place).map(s => {
          const [lng, lat] = places[s.place as keyof typeof places]
          return <CircleMarker key={s.key} center={[lat, lng]} radius={7}><Tooltip>{s.place}</Tooltip></CircleMarker>
        })}
      </MapContainer>}
      {tilesFailed && <p role="status">Map tiles could not load. Review your places in the stop list above.</p>}
      <div><button className="button" type="button" disabled={saving || stops.length >= maxStops} onClick={() => edit([...stops, blank()])}>Add stop</button>
        {stops.length > 0 && <button className="button" disabled={saving} type="submit">Confirm Itinerary</button>}</div>
    </form>
    {message && <p role="status">{message}</p>}
  </section>
}
