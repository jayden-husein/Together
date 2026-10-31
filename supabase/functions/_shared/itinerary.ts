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

// Grand Canyon local time is Mountain Standard Time (UTC-7) all year: Arizona has no daylight saving time.
export const mstOffset = '-07:00'
// An instant as a Grand Canyon wall-clock time, YYYY-MM-DDTHH:MM (datetime-local form).
export const localDateTime = (ms: number) => new Date(ms - 7 * 60 * 60_000).toISOString().slice(0, 16)
// Longest pasted plan text accepted for AI extraction and stored with the Itinerary.
export const maxTextLength = 2000

export type Place = keyof typeof places

export type Stop = { place: Place; start: string; end: string }

// An Itinerary is current while one of its stops has not yet ended.
export const isCurrent = (stops: Stop[], now = Date.now()) => stops.some(s => Date.parse(s.end) > now)

// Stops that have started are locked: a Correction carries them over unchanged.
export const lockedStops = (stops: Stop[], now = Date.now()) => stops.filter(s => Date.parse(s.start) <= now)
// A Correction confirmed at `at` withdraws its Itinerary when it has no stops still to come.
export const withdraws = (stops: Stop[], at: number) => lockedStops(stops, at).length === stops.length
const same = (a: Stop, b: Stop) => a.place === b.place && a.start === b.start && a.end === b.end

// `corrected`: the stops of the Itinerary this one supersedes, for a Correction. A Correction may have
// no stops still to come (a Withdraw), but must keep the old stops that have started.
export function confirmedStops(input: unknown, now = Date.now(), corrected?: Stop[]): Stop[] {
  if (!Array.isArray(input) || (!corrected && !input.length) || input.length > maxStops) throw new Error(`Choose 1 to ${maxStops} stops.`)
  const stops: Stop[] = input.map(row => {
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
    if (Date.parse(start) >= Date.parse(end)) throw new Error('Departure must follow arrival.')
    return { place, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  })
  const locked = lockedStops(corrected ?? [], now)
  if (!locked.every(l => stops.some(s => same(s, l)))) throw new Error('Keep the stops that have started as they were.')
  // Carried-over started stops are exempt from starting from now.
  if (stops.some(s => Date.parse(s.start) < now && !locked.some(l => same(s, l)))) throw new Error('Arrival must be at the current time or later.')
  return stops
}
