import { confirmedStops, type Stop } from '../../supabase/functions/_shared/itinerary'
import { expect, it } from 'vitest'
import { match } from '../../supabase/functions/_shared/match'

const stop: Stop = { place: 'Phantom Ranch', start: '2026-10-31T12:00:00Z', end: '2026-10-31T14:00:00Z' }
const incident = { id: 'flood', starts_at: '2026-10-31T13:00:00Z', ends_at: '2026-10-31T15:00:00Z',
  area: { type: 'Polygon' as const, coordinates: [[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.11],[-112.1,36.1]]] } }
it('explains the Case with the overlapping stop', () => {
  expect(match('maya', [stop], [incident])).toEqual([{ personId: 'maya', incidentId: 'flood', stop }])
})
it('leaves a stop on a different day unmatched', () => {
  expect(match('maya', [stop], [{ ...incident, starts_at: '2026-11-01T10:00:00Z', ends_at: null }])).toEqual([])
})
it('leaves a stop just outside the polygon unmatched', () => {
  expect(match('maya', [{ ...stop, place: 'Black Bridge' }], [incident])).toEqual([])
})
it('treats an open-ended Incident as ongoing', () => {
  expect(match('maya', [stop], [{ ...incident, starts_at: '2025-01-01T10:00:00Z', ends_at: null }])).toHaveLength(1)
})
it('opens one Case for two matching stops or a repeated Match, and separates namesakes by Person', () => {
  const opened = match('maya-1', [stop, { ...stop }], [incident])
  expect(opened).toHaveLength(1)
  expect(match('maya-1', [stop], [incident], opened)).toEqual([])
  expect(match('maya-2', [stop], [incident], opened)).toEqual([{ personId: 'maya-2', incidentId: 'flood', stop }])
})

it('rejects impossible calendar dates before Match', () => {
  expect(() => confirmedStops([{ ...stop, start: '2026-02-30T10:00:00Z', end: '2026-02-30T11:00:00Z' }])).toThrow()
})
it('accepts leap days and preserves timestamp precision', () => {
  expect(confirmedStops([{ ...stop, start: '2028-02-29T10:00:10.123-07:00', end: '2028-02-29T10:00:50.456-07:00' }], Date.parse('2028-02-28T00:00:00Z'))[0])
    .toEqual({ ...stop, start: '2028-02-29T17:00:10.123Z', end: '2028-02-29T17:00:50.456Z' })
})
it('rejects past starts and accepts the current instant at the earliest', () => {
  const now = Date.parse('2028-02-29T17:00:10Z')
  expect(() => confirmedStops([{ ...stop, start: '2028-02-29T17:00:09Z', end: '2028-02-29T18:00:00Z' }], now)).toThrow()
  expect(confirmedStops([{ ...stop, start: '2028-02-29T17:00:10Z', end: '2028-02-29T18:00:00Z' }], now)).toHaveLength(1)
})
it('requires exactly four digits in both years', () => {
  expect(() => confirmedStops([{ ...stop, start: '111111-01-01T10:00:00Z', end: '111111-01-01T11:00:00Z' }])).toThrow()
})

it('a Phantom Ranch stop ending at 5:11 MST does not overlap an incident starting at 5:42 MST', () => {
  expect(match('maya', [{ place: 'Phantom Ranch', start: '2026-10-31T04:11:00-07:00', end: '2026-10-31T05:11:00-07:00' }], [{ ...incident, starts_at: '2026-10-31T05:42:00-07:00', ends_at: null }])).toEqual([])
})
