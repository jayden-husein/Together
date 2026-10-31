// Grand Canyon places, in GeoJSON longitude/latitude order.
export const places: Readonly<Record<string, [number, number]>> = {
  'Grand Canyon Visitor Center': [-112.1094, 36.0591],
  'Mather Point': [-112.1078, 36.0617],
  'Bright Angel Trailhead': [-112.1436, 36.0573],
  'Phantom Ranch': [-112.0947, 36.1058],
  'Black Bridge': [-112.0894, 36.0997],
  'Yavapai Point': [-112.1186, 36.0657],
}

export type Stop = { place: string; start: string; end: string }

export function confirmedStops(input: unknown): Stop[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error('Choose 1 to 100 stops.')
  return input.map(row => {
    if (!row || typeof row.place !== 'string' || !Object.hasOwn(places, row.place)) throw new Error('Choose a listed place.')
    const { place, start, end } = row
    for (const time of [start, end]) {
      if (typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(time) || !Number.isFinite(Date.parse(time))) {
        throw new Error('Each stop needs a date and time window.')
      }
    }
    if (Date.parse(start) >= Date.parse(end)) throw new Error('Departure must follow arrival.')
    return { place, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  })
}
