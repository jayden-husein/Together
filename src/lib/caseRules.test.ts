import { expect, test } from 'vitest'
import { caseStatus, caseUrgency, individualUpdateView, orderQueue } from './caseRules'

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

test('a later traveler Check-in overrides an earlier resolution', () => {
  const resolved = { at: '2026-11-01T14:00:00Z', status: 'resolved', outcome: 'reached' } as const
  const laterCheckIn = { at: '2026-11-01T14:05:00+00:00', status: 'needs_assistance', outcome: null } as const
  expect(caseStatus([resolved, laterCheckIn])).toEqual({ status: 'needs_assistance' })
})

test('queue prioritizes assistance, then unreachable, unanswered, safe and resolved Cases', () => {
  const statuses = ['resolved', 'safe', 'cant_reach', 'unconfirmed', 'needs_assistance'] as const
  expect(orderQueue(statuses.map(status => ({ status }))).map(row => row.status))
    .toEqual(['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved'])
})

test('the Individual Update contains only status and time even when the Report carries private fields', () => {
  const report = { status: 'needs_assistance', at: '2026-10-31T06:00:00Z', original_text: 'Private', note: 'Private note' } as const
  expect(individualUpdateView(report)).toEqual({ status: 'needs_assistance', at: report.at })
})

test('two Reports in the same millisecond retain database timestamp order', () => {
  const earlier = { status: 'safe', at: '2026-10-31T06:00:00.1231Z', outcome: null } as const
  const later = { status: 'needs_assistance', at: '2026-10-31T06:00:00.123900Z', outcome: null } as const
  expect(caseStatus([later, earlier])).toEqual({ status: 'needs_assistance' })
  expect(caseStatus([earlier, later])).toEqual({ status: 'needs_assistance' })
})

test('a later resolution corrects an earlier one', () => {
  const first = { at: '2026-11-01T14:00:00Z', status: 'resolved', outcome: 'not_in_area' } as const
  const correction = { at: '2026-11-01T14:10:00Z', status: 'resolved', outcome: 'reached' } as const
  expect(caseStatus([first, correction])).toEqual({ status: 'resolved', outcome: 'reached' })
  expect(caseStatus([correction, first])).toEqual({ status: 'resolved', outcome: 'reached' })
})

test('a resolved Individual Update carries its outcome', () => {
  expect(individualUpdateView({ status: 'resolved', at: '2026-11-01T14:00:00Z', outcome: 'assistance_provided' }))
    .toEqual({ status: 'resolved', at: '2026-11-01T14:00:00Z', outcome: 'assistance_provided' })
})

const latestCheckIn = { id: 'r2', at: '2026-11-01T14:00:00Z' }
const proposal = { action: 'urgency_proposed', at: '2026-11-01T14:00:02Z', urgency: 'can_wait', note: 'we have water', fromReport: 'r2' } as const

test('the AI\'s proposal for the latest Check-in sets the Urgency, with its quote', () => {
  expect(caseUrgency(latestCheckIn, [proposal])).toEqual({ urgency: 'can_wait', quote: 'we have water', changed: false })
})

test('a Coordinator override wins over the AI\'s proposal, even a later one', () => {
  const change = { action: 'urgency_changed', at: '2026-11-01T14:00:01Z', urgency: 'immediate', note: null, fromReport: null } as const
  expect(caseUrgency(latestCheckIn, [change, proposal])).toEqual({ urgency: 'immediate', quote: 'we have water', changed: true })
})

test('without a valid proposal for the latest Check-in the Case is Untriaged', () => {
  expect(caseUrgency(latestCheckIn, [])).toEqual({ urgency: 'untriaged', quote: null, changed: false })
  // The AI couldn't assess it.
  expect(caseUrgency(latestCheckIn, [{ ...proposal, urgency: null, note: null }]).urgency).toBe('untriaged')
  // A proposal or a change about an earlier Check-in says nothing about the new one.
  const earlier = [
    { ...proposal, fromReport: 'r1', at: '2026-11-01T14:00:05Z' },
    { action: 'urgency_changed', at: '2026-11-01T13:00:00Z', urgency: 'can_wait', note: null, fromReport: null },
  ] as const
  expect(caseUrgency(latestCheckIn, earlier)).toEqual({ urgency: 'untriaged', quote: null, changed: false })
})

test('Needs assistance Cases sort Untriaged first, then Immediate, Urgent and Can wait', () => {
  const cases = [
    { status: 'needs_assistance', urgency: 'can_wait' },
    { status: 'cant_reach' },
    { status: 'needs_assistance', urgency: 'urgent' },
    { status: 'needs_assistance', urgency: 'untriaged' },
    { status: 'needs_assistance', urgency: 'immediate' },
  ] as const
  expect(orderQueue([...cases]).map(c => 'urgency' in c ? c.urgency : c.status))
    .toEqual(['untriaged', 'immediate', 'urgent', 'can_wait', 'cant_reach'])
})

test('an Urgency Individual Update carries the level and time, never the AI\'s quote', () => {
  const entry = { status: null, urgency: 'immediate', at: '2026-11-01T14:00:02Z', note: 'my son cut his leg badly' } as const
  expect(individualUpdateView(entry)).toEqual({ urgency: 'immediate', at: entry.at })
})

test("a Check-in after a Can't-reach report replaces Can't reach", () => {
  const cantReach = { at: '2026-11-01T13:20:00Z', status: 'cant_reach', outcome: null } as const
  const checkIn = { at: '2026-11-01T13:40:00Z', status: 'needs_assistance', outcome: null } as const
  expect(caseStatus([cantReach])).toEqual({ status: 'cant_reach' })
  expect(caseStatus([checkIn, cantReach])).toEqual({ status: 'needs_assistance' })
})

test('a reached coordinator attempt is a dated Safe event, and a newer report wins', () => {
 const reached={status:'safe',outcome:null,at:'2026-10-31T14:00:00Z'} as const
 const report={status:'cant_reach',outcome:null,at:'2026-10-31T14:01:00Z'} as const
 expect(caseStatus([reached,report])).toEqual({status:'cant_reach'})
 expect(caseStatus([report,{...reached,at:'2026-10-31T14:02:00Z'}])).toEqual({status:'safe'})
})
