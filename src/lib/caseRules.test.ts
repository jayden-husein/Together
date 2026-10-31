import { expect, test } from 'vitest'
import { caseStatus, individualUpdateView, orderQueue } from './caseRules'

test('a Case with no reply stays Unconfirmed', () => {
  expect(caseStatus([{ at: '2026-11-01T13:00:00Z', status: null, outcome: null }])).toEqual({ status: 'unconfirmed' })
})

test('the latest Check-in or Can\'t-reach report sets the status', () => {
  const checkIn = { at: '2026-11-01T13:10:00Z', status: 'needs_assistance', outcome: null } as const
  const cantReach = { at: '2026-11-01T13:20:00Z', status: 'cant_reach', outcome: null } as const
  const safe = { at: '2026-11-01T13:30:00Z', status: 'safe', outcome: null } as const
  expect(caseStatus([checkIn, cantReach])).toEqual({ status: 'cant_reach' })
  expect(caseStatus([safe, checkIn, cantReach])).toEqual({ status: 'safe' })
})

test('Resolved with its outcome wins over everything, even a later Check-in', () => {
  const resolved = { at: '2026-11-01T14:00:00Z', status: 'resolved', outcome: 'reached' } as const
  const laterCheckIn = { at: '2026-11-01T14:05:00+00:00', status: 'needs_assistance', outcome: null } as const
  expect(caseStatus([resolved, laterCheckIn])).toEqual({ status: 'resolved', outcome: 'reached' })
})

test('queue follows Case priority with resolved Cases last', () => {
  const statuses = ['resolved', 'safe', 'cant_reach', 'unconfirmed', 'needs_assistance'] as const
  expect(orderQueue(statuses.map(status => ({ status }))).map(row => row.status))
    .toEqual(['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved'])
})

test('Individual Update exposes only status and time even when passed private fields', () => {
  const entry = { status: 'needs_assistance', at: '2026-10-31T15:00:00Z', outcome: null,
    original_text: 'private description', note: 'private coordinator note' } as const
  expect(individualUpdateView(entry)).toEqual({ status: entry.status, at: entry.at })
})
