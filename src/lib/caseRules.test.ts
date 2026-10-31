import { expect, test } from 'vitest'
import { caseStatus } from './caseRules'

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
