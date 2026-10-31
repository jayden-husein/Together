import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { CheckInRequest, IndividualUpdate, QueueCase } from '../lib/checkIns'
import Coordinator from './Coordinator'
import EmergencyContact from './EmergencyContact'
import Traveler from './Traveler'

const data = vi.hoisted(() => ({ myCheckIns: [] as CheckInRequest[], queue: [] as QueueCase[], updates: [] as IndividualUpdate[] }))
const submitCheckIn = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../lib/checkIns', () => ({
  submitCheckIn,
  useMyCheckIns: () => ({ data: data.myCheckIns, error: null }),
  useQueue: () => ({ data: data.queue, error: null }),
  useIndividualUpdates: () => ({ data: data.updates, error: null }),
}))

afterEach(() => {
  cleanup()
  submitCheckIn.mockClear()
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
    { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'needs_assistance' },
    { caseId: 'c2', traveler: 'Priya Natarajan', incident: 'Flash flood at Phantom Ranch', status: 'unconfirmed' },
    { caseId: 'c3', traveler: 'Tom Alvarez', incident: 'Flash flood at Phantom Ranch', status: 'safe' },
  ]
  render(<Coordinator />)
  const rows = within(screen.getByRole('list', { name: 'Case queue' })).getAllByRole('listitem')
  expect(rows.map(row => row.textContent)).toEqual([
    expect.stringMatching(/Maya Chen.*Needs assistance/),
    expect.stringMatching(/Priya Natarajan.*Unconfirmed/),
    expect.stringMatching(/Tom Alvarez.*Safe/),
  ])
})

test('the Emergency Contact sees each Individual Update as status and time, newest first', () => {
  data.updates = [
    { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'needs_assistance', at: '2026-10-31T14:12:00Z' } },
    { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'safe', at: '2026-10-31T13:55:00Z' } },
  ]
  render(<EmergencyContact />)
  const items = within(screen.getByRole('list', { name: 'Individual Updates' })).getAllByRole('listitem')
  expect(items.map(item => item.textContent)).toEqual([
    expect.stringMatching(/Maya Chen.*Needs assistance/),
    expect.stringMatching(/Maya Chen.*Safe/),
  ])
  expect(items[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:12:00Z')
})
