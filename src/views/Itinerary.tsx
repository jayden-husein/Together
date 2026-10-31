import { useState } from 'react'
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet'
import { confirmedStops, maxStops, places, type Stop } from '../../supabase/functions/_shared/itinerary'
import MapTiles from '../MapTiles'
import { supabase } from '../lib/supabase'

type Draft = Omit<Stop, 'place'> & { place: string } & { key: string }
const blank = (): Draft => ({ key: crypto.randomUUID(), place: '', start: '', end: '' })

export default function Itinerary() {
  const [stops, setStops] = useState<Draft[]>([])
  const [id, setId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const [message, setMessage] = useState('')
  function edit(next: Draft[]) {
    setStops(next)
    setId(crypto.randomUUID())
    setMessage('')
  }
  async function confirm() {
    setSaving(true)
    setMessage('')
    try {
      // Arizona stays on Mountain Standard Time year-round at these places.
      const payload = confirmedStops(stops.map(s => ({ ...s, start: s.start + '-07:00', end: s.end + '-07:00' })))
      const { error } = await supabase.functions.invoke('confirm-itinerary', { body: { id, stops: payload } })
      if (error) throw new Error('Could not confirm your Itinerary. Your stops are here to try again.')
      edit([])
      setMessage('Itinerary confirmed.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not confirm your Itinerary.') }
    finally { setSaving(false) }
  }
  return <section className="panel">
    <h2>Your Itinerary</h2>
    <form className="itinerary" onSubmit={e => { e.preventDefault(); void confirm() }}>
      {stops.length > 0 && <p>Enter arrival and departure in Grand Canyon local time (MST).</p>}
      {stops.map((stop, i) => {
        const change = (field: keyof Stop, value: string) => edit(stops.map(s => s.key === stop.key ? { ...s, [field]: value } : s))
        return <fieldset key={stop.key} disabled={saving}>
          <legend>Stop {i + 1}</legend>
          <label>Place<select required value={stop.place} onChange={e => change('place', e.target.value)}>
            <option value="">Choose a place</option>
            {Object.keys(places).map(p => <option key={p}>{p}</option>)}
          </select></label>
          <label>Arrival<input type="datetime-local" required value={stop.start} onChange={e => change('start', e.target.value)} /></label>
          <label>Departure<input type="datetime-local" required min={stop.start} value={stop.end} onChange={e => change('end', e.target.value)} /></label>
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
