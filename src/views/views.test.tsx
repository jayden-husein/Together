import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { CaseHistoryItem, CheckInRequest, IndividualUpdate, QueueCase } from '../lib/checkIns'
import Coordinator from './Coordinator'
import EmergencyContact from './EmergencyContact'
import Traveler from './Traveler'

const data = vi.hoisted(() => ({ myCheckIns: [] as CheckInRequest[], queue: [] as QueueCase[], updates: [] as IndividualUpdate[], history: [] as CaseHistoryItem[] }))
const recordCaseEvent = vi.hoisted(() => vi.fn(async () => {}))
const submitCheckIn = vi.hoisted(() => vi.fn(async () => {}))
const markRead = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../lib/checkIns', () => ({
  submitCheckIn,
  markIndividualUpdatesRead: markRead,
  useMyCheckIns: () => ({ data: data.myCheckIns, error: null }),
  recordCaseEvent,
  useQueue: () => ({ data: data.queue, error: null, reload: () => {} }),
  useCaseHistory: () => ({ data: data.history, error: null, reload: () => {} }),
  useIndividualUpdates: () => ({ data: data.updates, error: null }),
}))

afterEach(() => {
  cleanup()
  submitCheckIn.mockClear()
  markRead.mockClear()
  recordCaseEvent.mockClear()
})

const request = (reports: CheckInRequest['reports'] = []): CheckInRequest => ({ caseId: 'case-1', incident: 'Flash flood at Phantom Ranch', reports })

test('Safe is one tap', async () => {
  data.myCheckIns = [request()]
  render(<Traveler />)
  expect(screen.getByText(/Flash flood at Phantom Ranch/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Safe' }))
  await waitFor(() => expect(submitCheckIn).toHaveBeenCalledWith('case-1', 'safe'))
})

test('Needs assistance asks for a description before sending', async () => {
  data.myCheckIns = [request()]
  render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Needs assistance' }))
  expect(submitCheckIn).not.toHaveBeenCalled()
  const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
  expect(send.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: 'Ankle injury, can walk slowly' } })
  fireEvent.click(send)
  await waitFor(() => expect(submitCheckIn).toHaveBeenCalledWith('case-1', 'needs_assistance', 'Ankle injury, can walk slowly'))
})

test('the traveler sees what they sent and when, newest first', () => {
  data.myCheckIns = [request([
    { id: 'r2', status: 'needs_assistance', description: 'Water rising at camp', at: '2026-10-31T14:12:00Z' },
    { id: 'r1', status: 'safe', description: null, at: '2026-10-31T13:55:00Z' },
  ])]
  render(<Traveler />)
  const history = within(screen.getByRole('list', { name: 'Your Check-ins' }))
  const items = history.getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(within(items[0]).getByText('Needs assistance')).toBeTruthy()
  expect(within(items[0]).getByText('Water rising at camp')).toBeTruthy()
  expect(items[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:12:00Z')
  expect(within(items[1]).getByText('Safe')).toBeTruthy()
})

test('the queue lists Cases with status badges in the order Case rules return', () => {
  data.queue = [
    { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'needs_assistance', at: '2026-10-31T14:12:00Z', owner: null },
    { caseId: 'c2', traveler: 'Priya Natarajan', incident: 'Flash flood at Phantom Ranch', status: 'unconfirmed', at: '2026-10-31T13:48:00Z', owner: null },
    { caseId: 'c3', traveler: 'Tom Alvarez', incident: 'Flash flood at Phantom Ranch', status: 'safe', at: '2026-10-31T13:55:00Z', owner: null },
  ]
  render(<Coordinator />)
  const rows = within(screen.getByRole('list', { name: 'Case queue' })).getAllByRole('listitem')
  expect(rows.map(row => row.textContent)).toEqual([
    expect.stringMatching(/Maya Chen.*Needs assistance/),
    expect.stringMatching(/Priya Natarajan.*Unconfirmed/),
    expect.stringMatching(/Tom Alvarez.*Safe/),
  ])
  // Each row says what set its status and when.
  expect(rows[0].textContent).toMatch(/Check-in,/)
  expect(rows[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:12:00Z')
  expect(rows[1].textContent).toMatch(/Case opened,/)
})

test('the Emergency Contact sees each Individual Update as status and time, newest first', () => {
  data.updates = [
    { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'needs_assistance', at: '2026-10-31T14:12:00Z' }, unreadNotificationId: null },
    { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'safe', at: '2026-10-31T13:55:00Z' }, unreadNotificationId: null },
  ]
  render(<EmergencyContact />)
  const items = within(screen.getByRole('list', { name: 'Individual Updates' })).getAllByRole('listitem')
  expect(items.map(item => item.textContent)).toEqual([
    expect.stringMatching(/Maya Chen.*Needs assistance/),
    expect.stringMatching(/Maya Chen.*Safe/),
  ])
  expect(items[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:12:00Z')
})

test('unread Individual Updates are marked New, marked read, and stay New while the page is open', async () => {
  const older = { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'safe' as const, at: '2026-10-31T13:55:00Z' }, unreadNotificationId: null }
  const latest = { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'needs_assistance' as const, at: '2026-10-31T14:12:00Z' } }
  data.updates = [{ ...latest, unreadNotificationId: 'n1' }, older]
  const { rerender } = render(<EmergencyContact />)
  const items = () => within(screen.getByRole('list', { name: 'Individual Updates' })).getAllByRole('listitem')
  expect(within(items()[0]).getByText('New')).toBeTruthy()
  expect(within(items()[1]).queryByText('New')).toBeNull()
  await waitFor(() => expect(markRead).toHaveBeenCalledWith(['n1']))
  // The next poll sees it read; the marker stays until the contact leaves the page.
  data.updates = [{ ...latest, unreadNotificationId: null }, older]
  rerender(<EmergencyContact />)
  expect(within(items()[0]).getByText('New')).toBeTruthy()
  expect(markRead).toHaveBeenCalledTimes(1)
})

const mayaCase: QueueCase = { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'needs_assistance', at: '2026-10-31T14:12:00Z', owner: null }
const item = (fields: Partial<CaseHistoryItem> & Pick<CaseHistoryItem, 'id' | 'entry' | 'by' | 'at'>): CaseHistoryItem =>
  ({ status: null, reached: null, outcome: null, urgency: null, text: null, fromReport: null, ...fields })

function openMayaCase() {
  render(<Coordinator />)
  fireEvent.click(screen.getByRole('button', { name: 'Maya Chen' }))
  return within(screen.getByRole('region', { name: 'Case: Maya Chen' }))
}

test('a claimed Case shows its owner in the queue', () => {
  data.queue = [{ ...mayaCase, owner: 'Dana Ortiz' }]
  render(<Coordinator />)
  expect(within(screen.getByRole('list', { name: 'Case queue' })).getByText(/Claimed by Dana Ortiz/)).toBeTruthy()
})

test('the Coordinator claims a Case', async () => {
  data.queue = [mayaCase]
  data.history = []
  fireEvent.click(openMayaCase().getByRole('button', { name: 'Claim' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'claimed' }))
})

test('the Coordinator records a Contact Attempt and a note', async () => {
  data.queue = [mayaCase]
  data.history = []
  const detail = openMayaCase()
  const attempt = within(detail.getByRole('group', { name: 'Contact Attempt' }))
  fireEvent.click(attempt.getByLabelText('Not reached'))
  fireEvent.change(attempt.getByLabelText('Note'), { target: { value: 'Voicemail' } })
  fireEvent.click(attempt.getByRole('button', { name: 'Record' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'contact_attempt', reached: false, note: 'Voicemail' }))
  const note = within(detail.getByRole('group', { name: 'Note' }))
  fireEvent.change(note.getByLabelText('Note'), { target: { value: 'SAR found the camp empty' } })
  fireEvent.click(note.getByRole('button', { name: 'Add note' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'note', note: 'SAR found the camp empty' }))
})

test('a note can say which Report it follows up', async () => {
  data.queue = [mayaCase]
  data.history = [item({ id: 'r1', entry: 'check_in', by: 'Maya Chen', at: '2026-10-31T14:12:00Z', status: 'needs_assistance', text: 'Water rising' })]
  const note = within(openMayaCase().getByRole('group', { name: 'Note' }))
  fireEvent.change(note.getByLabelText('From Report'), { target: { value: 'r1' } })
  fireEvent.change(note.getByLabelText('Note'), { target: { value: 'SAR reached the camp' } })
  fireEvent.click(note.getByRole('button', { name: 'Add note' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'note', note: 'SAR reached the camp', fromReport: 'r1' }))
})

test('resolving needs exactly one outcome', async () => {
  data.queue = [mayaCase]
  data.history = []
  const resolve = within(openMayaCase().getByRole('group', { name: 'Resolve' }))
  const button = resolve.getByRole('button', { name: 'Resolve' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  // Radios: choosing one outcome replaces the other.
  fireEvent.click(resolve.getByLabelText('Reached'))
  fireEvent.click(resolve.getByLabelText('Assistance provided'))
  fireEvent.click(button)
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'resolved', outcome: 'assistance_provided' }))
})

test('the Case history says who did what, when and from which Report, with no way to change an entry', () => {
  data.queue = [mayaCase]
  data.history = [
    item({ id: 'e2', entry: 'resolved', by: 'Dana Ortiz', at: '2026-10-31T14:40:00Z', outcome: 'reached' }),
    item({ id: 'e1', entry: 'contact_attempt', by: 'Dana Ortiz', at: '2026-10-31T14:20:00Z', reached: false, text: 'Voicemail' }),
    item({ id: 'u1', entry: 'urgency_proposed', by: 'AI', at: '2026-10-31T14:12:01Z', urgency: 'urgent', fromReport: 'r1' }),
    item({ id: 'r1', entry: 'check_in', by: 'Maya Chen', at: '2026-10-31T14:12:00Z', status: 'needs_assistance', text: 'Water rising' }),
  ]
  const history = within(openMayaCase().getByRole('list', { name: 'Case history' }))
  const entries = history.getAllByRole('listitem')
  expect(entries.map(e => e.textContent)).toEqual([
    expect.stringMatching(/Resolved: Reached.*Dana Ortiz/),
    expect.stringMatching(/Contact Attempt: Not reached.*Voicemail.*Dana Ortiz/),
    expect.stringMatching(/Urgency proposed: Urgent.*From the Check-in.*AI/),
    expect.stringMatching(/Check-in.*Needs assistance.*Water rising.*Maya Chen/),
  ])
  expect(entries[1].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:20:00Z')
  expect(history.queryAllByRole('button')).toHaveLength(0)
})

test('the Emergency Contact sees a resolution with its outcome', () => {
  data.updates = [{ caseId: 'c1', traveler: 'Maya Chen', update: { status: 'resolved', outcome: 'not_in_area', at: '2026-10-31T14:40:00Z' }, unreadNotificationId: null }]
  render(<EmergencyContact />)
  expect(within(screen.getByRole('list', { name: 'Individual Updates' })).getByText('Resolved: Not in area')).toBeTruthy()
})
