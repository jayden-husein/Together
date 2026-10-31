// Grand Canyon places, in GeoJSON longitude/latitude order.
export const places = {
  'Grand Canyon Visitor Center': [-112.1094, 36.0591],
  'Mather Point': [-112.1078, 36.0617],
  'Bright Angel Trailhead': [-112.1436, 36.0573],
  'Phantom Ranch': [-112.0947, 36.1058],
  'Black Bridge': [-112.0894, 36.0997],
  'Yavapai Point': [-112.1186, 36.0657],
} as const

export const maxStops = 100
// Longest pasted plan text accepted for AI extraction and stored with the Itinerary.
export const maxTextLength = 2000

export type Place = keyof typeof places

export type Stop = { place: Place; start: string; end: string }

export function confirmedStops(input: unknown, now = Date.now()): Stop[] {
  if (!Array.isArray(input) || !input.length || input.length > maxStops) throw new Error(`Choose 1 to ${maxStops} stops.`)
  return input.map(row => {
    if (!row || typeof row.place !== 'string' || !Object.hasOwn(places, row.place)) throw new Error('Choose a listed place.')
    const { place, start, end } = row
    for (const time of [start, end]) {
      if (typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(time) || !Number.isFinite(Date.parse(time))) {
        throw new Error('Each stop needs a date and time window.')
      }
    }
    for (const time of [start, end]) {
      const date = time.slice(0, 10)
      if (new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
        throw new Error('Choose a valid calendar date.')
      }
    }
    if (Date.parse(start) < now) throw new Error('Arrival must be at the current time or later.')
    if (Date.parse(start) >= Date.parse(end)) throw new Error('Departure must follow arrival.')
    return { place, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  })
}
