import { expect, it } from 'vitest'
import { match } from '../../supabase/functions/_shared/match'

const stop = { place: 'Phantom Ranch', start: '2026-10-31T12:00:00Z', end: '2026-10-31T14:00:00Z' }
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
