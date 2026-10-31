// AI output check: accepts or rejects each part of a model reply before anyone sees it.
import { maxStops, places, type Place } from './itinerary.ts'

// A proposed stop for the traveler to review. Times are Grand Canyon local (MST), in datetime-local form.
// `needs` names what the traveler must fill in before the stop can be confirmed.
export type ProposedStop = { quote: string; place: Place | null; start: string | null; end: string | null; needs: ('place' | 'date' | 'time')[] }

export function checkItinerary(text: string, reply: unknown): ProposedStop[] {
  const stops = (reply as { stops?: unknown } | null)?.stops
  if (!Array.isArray(stops)) throw new Error('The reply has no stops.')
  const pasted = normalize(text)
  return stops.slice(0, maxStops).filter(stop => typeof stop?.quote === 'string' && normalize(stop.quote) && pasted.includes(normalize(stop.quote))).map(stop => {
    const needs: ProposedStop['needs'] = []
    const place = typeof stop.place === 'string' && Object.hasOwn(places, stop.place) ? stop.place as Place : null
    if (!place) needs.push('place')
    const date = isDate(stop.date) ? stop.date : null
    if (!date) needs.push('date')
    const times = isTime(stop.start) && isTime(stop.end) && stop.start < stop.end
    if (!times) needs.push('time')
    return {
      quote: stop.quote,
      place,
      start: date && times ? `${date}T${stop.start}` : null,
      end: date && times ? `${date}T${stop.end}` : null,
      needs,
    }
  })
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

const isTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

// Quotes match the pasted text ignoring case and runs of whitespace.
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
