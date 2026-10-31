import { expect, it } from 'vitest'
import { confirmedStops, inForce, isCurrent, lockedStops, withdraws, type Stop } from '../../supabase/functions/_shared/itinerary'

const now = Date.parse('2026-10-31T13:00:00Z')
const stop = (start: string, end: string): Stop => ({ place: 'Phantom Ranch', start, end })

it('is current while a stop has not ended', () => {
  expect(isCurrent([stop('2026-10-31T12:00:00Z', '2026-10-31T14:00:00Z')], now)).toBe(true)
  expect(isCurrent([stop('2026-11-01T12:00:00Z', '2026-11-01T14:00:00Z')], now)).toBe(true)
})
it('is not current once every stop has ended', () => {
  expect(isCurrent([stop('2026-10-31T10:00:00Z', '2026-10-31T11:00:00Z'), stop('2026-10-31T11:00:00Z', '2026-10-31T13:00:00Z')], now)).toBe(false)
  expect(isCurrent([], now)).toBe(false)
})

// An Itinerary underway: Mather Point has started, Phantom Ranch is still to come.
const started = stop('2026-10-31T12:00:00.000Z', '2026-10-31T14:00:00.000Z')
const toCome = stop('2026-10-31T15:00:00.000Z', '2026-10-31T16:00:00.000Z')
const old = [{ ...started, place: 'Mather Point' as const }, toCome]
it('locks the stops that have started', () => {
  expect(lockedStops(old, now)).toEqual([old[0]])
  expect(lockedStops(old, Date.parse('2026-10-31T11:00:00Z'))).toEqual([])
})
it('lets a Correction carry its started stops over unchanged and change the rest', () => {
  const later = stop('2026-10-31T17:00:00.000Z', '2026-10-31T18:00:00.000Z')
  expect(confirmedStops([old[0], later], now, old)).toEqual([old[0], later])
})
it('rejects a Correction that changes or drops a started stop', () => {
  expect(() => confirmedStops([toCome], now, old)).toThrow('started')
  expect(() => confirmedStops([{ ...old[0], end: '2026-10-31T14:30:00.000Z' }, toCome], now, old)).toThrow('started')
})
it('still requires new stops to start from now, in a Correction too', () => {
  expect(() => confirmedStops([old[0], stop('2026-10-31T12:30:00.000Z', '2026-10-31T16:00:00.000Z')], now, old)).toThrow('Arrival')
  expect(() => confirmedStops([started], now)).toThrow('Arrival')
})
it('accepts a Correction with no stops still to come, but not a new Itinerary with no stops', () => {
  expect(confirmedStops([old[0]], now, old)).toEqual([old[0]])
  expect(confirmedStops([], now, [toCome])).toEqual([])
  expect(() => confirmedStops([], now)).toThrow()
})

it('withdraws when every stop had started by the time the Correction was confirmed', () => {
  const stops: Stop[] = [{ place: 'Mather Point', start: '2026-10-31T09:00:00Z', end: '2026-10-31T10:00:00Z' }]
  expect(withdraws([], Date.parse('2026-10-31T09:30:00Z'))).toBe(true)
  expect(withdraws(stops, Date.parse('2026-10-31T09:00:00Z'))).toBe(true)
  expect(withdraws(stops, Date.parse('2026-10-31T08:59:00Z'))).toBe(false)
})

it('keeps every started stop in a Withdraw, including one that started after the traveler sent it', () => {
  const later = stop('2026-10-31T12:30:00.000Z', '2026-10-31T16:00:00.000Z')
  expect(confirmedStops([old[0]], now, [old[0], later, toCome])).toEqual([old[0], later])
  expect(confirmedStops([], now, [old[0], later, toCome])).toEqual([old[0], later])
})

it('keeps the Itineraries no Correction supersedes', () => {
  const reports = [{ id: 'a', supersedes: null }, { id: 'b', supersedes: 'a' }, { id: 'c', supersedes: 'b' }, { id: 'd', supersedes: null }]
  expect(inForce(reports).map(r => r.id)).toEqual(['c', 'd'])
})
