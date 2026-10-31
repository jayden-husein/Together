// AI output check: accepts or rejects each part of a model reply before anyone sees it.
import { maxStops, places, type Place } from './itinerary.ts'

// A proposed stop for the traveler to review: a YYYY-MM-DD date and HH:MM times, Grand Canyon local (MST).
// `needs` names what the traveler must fill in before the stop can be confirmed.
export type ProposedStop = {
  quote: string; place: Place | null; date: string | null; start: string | null; end: string | null; needs: ('place' | 'date' | 'time')[]
}

export function proposedStops(text: string, reply: unknown): ProposedStop[] {
  const stops = (reply as { stops?: unknown } | null)?.stops
  if (!Array.isArray(stops)) throw new Error('The reply has no stops.')
  return stops.slice(0, maxStops).filter(stop => quoted(text, stop?.quote)).map(stop => {
    const needs: ProposedStop['needs'] = []
    const place = typeof stop.place === 'string' && Object.hasOwn(places, stop.place) ? stop.place as Place : null
    if (!place) needs.push('place')
    const date = isDate(stop.date) ? stop.date : null
    if (!date) needs.push('date')
    const times = isTime(stop.start) && isTime(stop.end) && stop.start < stop.end
    if (!times) needs.push('time')
    return { quote: stop.quote, place, date, start: times ? stop.start : null, end: times ? stop.end : null, needs }
  })
}

// A quote must be whole words of the pasted text, ignoring case and runs of whitespace,
// with at least three letters or digits so it shows where the stop came from.
function quoted(text: string, quote: unknown): quote is string {
  if (typeof quote !== 'string' || (quote.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 3) return false
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const escaped = normalize(quote).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(normalize(text))
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

const isTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
