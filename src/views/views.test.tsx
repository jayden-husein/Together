import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { CaseHistoryItem, CheckInRequest, ConfirmedItinerary, ContactCase, IndividualUpdate, QueueCase } from '../lib/checkIns'
import Coordinator from './Coordinator'
import EmergencyContact from './EmergencyContact'
import Traveler from './Traveler'
import { resources } from '../../supabase/functions/_shared/resources'

const data = vi.hoisted(() => ({ myCheckIns: [] as CheckInRequest[], queue: [] as QueueCase[], updates: [] as IndividualUpdate[], contactCases: [] as ContactCase[], history: [] as CaseHistoryItem[], itineraries: [] as ConfirmedItinerary[] | undefined, itinerariesError: null as string | null }))
const reloadItineraries = vi.hoisted(() => vi.fn())
const confirmItinerary = vi.hoisted(() => vi.fn(async () => {}))
const recordCaseEvent = vi.hoisted(() => vi.fn(async () => {}))
const submitCheckIn = vi.hoisted(() => vi.fn(async () => {}))
const markRead = vi.hoisted(() => vi.fn(async () => {}))
const fileCantReach = vi.hoisted(() => vi.fn(async () => {}))
const notices = vi.hoisted(() => ({ data: [] as import('../lib/checkIns').GeneralUpdateNotice[] }))
const postGeneralUpdate = vi.hoisted(() => vi.fn(async () => {}))
const draftGeneralUpdate = vi.hoisted(() => vi.fn(async () => 'Flash flooding near Phantom Ranch. Water at Havasupai Gardens.'))
vi.mock('../lib/checkIns', () => ({
  useGeneralUpdates: () => ({data:[],reload:()=>{}}),
  usePendingIncidents: () => ({ data: [], error: null }),
  useIncidents: () => ({ data: [{ id: 'incident-1', name: 'Flash flood at Phantom Ranch', created_at: '2026-10-31T13:40:00Z', starts_at: '2026-10-31T13:00:00Z', ends_at: null, area: { type: 'Polygon', coordinates: [] } }], error: null }),
  postGeneralUpdate,
  draftGeneralUpdate,
  useGeneralUpdateNotices: () => ({ data: notices.data, error: null }),
  useDismissedIncidents: () => ({ data: [], error: null }),
  submitCheckIn,
  markIndividualUpdatesRead: markRead,
  markNotificationsRead: markRead,
  useMyCheckIns: () => ({ data: data.myCheckIns, error: null }),
  recordCaseEvent,
  useQueue: () => ({ data: data.queue, error: null, reload: () => {} }),
  useCaseHistory: () => ({ data: data.history, error: null, reload: () => {} }),
  useIndividualUpdates: () => ({ data: data.updates, error: null }),
  useContactCases: () => ({ data: data.contactCases, error: null, reload: () => {} }),
  fileCantReach,
  useMyItineraries: () => ({ data: data.itineraries, error: data.itinerariesError, reload: reloadItineraries }),
  confirmItinerary,
  AlreadyCorrectedError,
}))
vi.mock('../lib/operations', () => ({ useConnections: () => ({data:[]}), useActivity: () => ({data:[]}), usePresence: () => [], csv: () => '', download: () => {} }))
const AlreadyCorrectedError = vi.hoisted(() => class extends Error {})

afterEach(() => {
  cleanup()
  window.location.hash = '#/coordinator'
  vi.restoreAllMocks()
  submitCheckIn.mockClear()
  markRead.mockClear()
  fileCantReach.mockClear()
  recordCaseEvent.mockClear()
  postGeneralUpdate.mockClear()
  notices.data = []
  reloadItineraries.mockClear()
  confirmItinerary.mockReset()
  data.itineraries = []
  data.itinerariesError = null
})

const request = (reports: CheckInRequest['reports'] = []): CheckInRequest => ({ caseId: 'case-1', incident: 'Flash flood at Phantom Ranch', nearestResource: resources[2], reports })

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

const itinerary = (fields: Partial<ConfirmedItinerary> & Pick<ConfirmedItinerary, 'id' | 'at'>): ConfirmedItinerary =>
  ({ stops: [{ place: 'Phantom Ranch', start: '2099-11-01T14:00:00Z', end: '2099-11-01T18:00:00Z' }], originalText: null, supersedes: null, ...fields })

test('the traveler sees their current Itineraries, newest first, each with its stops in Grand Canyon time', () => {
  data.itineraries = [
    itinerary({ id: 'older', at: '2026-10-30T09:00:00Z', originalText: 'Phantom Ranch 7 to 11' }),
    itinerary({ id: 'past', at: '2026-10-31T09:00:00Z', stops: [{ place: 'Mather Point', start: '2026-01-01T14:00:00Z', end: '2026-01-01T15:00:00Z' }] }),
    itinerary({ id: 'newer', at: '2026-10-31T10:00:00Z', stops: [
      { place: 'Mather Point', start: '2026-01-01T14:00:00Z', end: '2026-01-01T15:00:00Z' },
      { place: 'Yavapai Point', start: '2099-11-02T17:30:00Z', end: '2099-11-02T19:00:00Z' },
    ] }),
  ]
  render(<Traveler />)
  const entries = within(screen.getByRole('list', { name: 'Your confirmed Itineraries' })).getAllByRole('listitem', { name: /Itinerary confirmed/ })
  expect(entries).toHaveLength(2)
  expect(entries.map(e => e.querySelector('.source-line time')?.getAttribute('dateTime'))).toEqual(['2026-10-31T10:00:00Z', '2026-10-30T09:00:00Z'])
  // A started stop of a current Itinerary still shows; times are Grand Canyon local (UTC-7).
  expect(within(entries[0]).getByText('Mather Point')).toBeTruthy()
  expect(within(entries[0]).getByText('Yavapai Point').closest('li')?.textContent).toMatch(/10:30.*12:00/)
  expect(entries[0].querySelector('.itinerary-map')).toBeTruthy()
  // Pasted plans are collapsed, and only shown when there were plans.
  expect(entries[0].querySelector('details')).toBeNull()
  const plans = entries[1].querySelector('details')!
  expect(plans.open).toBe(false)
  expect(within(plans).getByText('Phantom Ranch 7 to 11')).toBeTruthy()
})

test('the Itinerary list has an empty state and an error state', () => {
  data.itineraries = []
  render(<Traveler />)
  expect(screen.getByText(/No confirmed Itineraries/)).toBeTruthy()
  cleanup()
  data.itineraries = undefined
  data.itinerariesError = 'Network down'
  render(<Traveler />)
  expect(screen.getByRole('alert').textContent).toMatch(/Could not load your itineraries/)
})

test('confirming an Itinerary refreshes the list', async () => {
  render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
  fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Phantom Ranch' } })
  fireEvent.change(screen.getByLabelText(/Arrival/), { target: { value: '2099-11-01T07:00' } })
  fireEvent.change(screen.getByLabelText(/Departure/), { target: { value: '2099-11-01T11:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm itinerary' }))
  await waitFor(() => expect(reloadItineraries).toHaveBeenCalled())
  expect(confirmItinerary).toHaveBeenCalledWith(expect.objectContaining({ stops: [{ place: 'Phantom Ranch', start: '2099-11-01T14:00:00.000Z', end: '2099-11-01T18:00:00.000Z' }] }))
})

// Underway: Mather Point has started, Phantom Ranch is still to come.
const underway = () => itinerary({ id: 'trip', at: '2026-10-31T09:00:00Z', originalText: 'Mather Point, then Phantom Ranch', stops: [
  { place: 'Mather Point', start: '2026-01-01T14:00:00.000Z', end: '2099-01-01T15:00:00.000Z' },
  { place: 'Phantom Ranch', start: '2099-11-01T14:00:00.000Z', end: '2099-11-01T18:00:00.000Z' },
] })
const startCorrecting = () => {
  data.itineraries = [underway()]
  render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
}

test('Correct loads the Itinerary into the form with started stops locked, and discarding it records nothing', () => {
  startCorrecting()
  expect(screen.getByText(/Correcting your Itinerary from/)).toBeTruthy()
  expect((screen.getByLabelText('Paste your plans') as HTMLTextAreaElement).value).toBe('Mather Point, then Phantom Ranch')
  const [started, toCome] = screen.getAllByRole('group', { name: /^Stop/ })
  expect((started as HTMLFieldSetElement).disabled).toBe(true)
  expect((within(started).getByLabelText('Place') as HTMLSelectElement).value).toBe('Mather Point')
  expect((toCome as HTMLFieldSetElement).disabled).toBe(false)
  expect((within(toCome).getByLabelText(/Arrival/) as HTMLInputElement).value).toBe('2099-11-01T07:00')
  fireEvent.click(screen.getByRole('button', { name: 'Discard correction' }))
  expect(screen.queryByText(/Correcting your Itinerary/)).toBeNull()
  expect(screen.queryAllByRole('group', { name: /^Stop/ })).toHaveLength(0)
  expect(confirmItinerary).not.toHaveBeenCalled()
})

test('confirming a Correction supersedes the old Itinerary and carries its started stops over', async () => {
  startCorrecting()
  const toCome = screen.getAllByRole('group', { name: /^Stop/ })[1]
  fireEvent.change(within(toCome).getByLabelText('Place'), { target: { value: 'Yavapai Point' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm itinerary' }))
  await waitFor(() => expect(reloadItineraries).toHaveBeenCalled())
  expect(confirmItinerary).toHaveBeenCalledWith(expect.objectContaining({ supersedes: 'trip', stops: [
    underway().stops[0], { ...underway().stops[1], place: 'Yavapai Point' },
  ] }))
  expect(screen.queryByText(/Correcting your Itinerary/)).toBeNull()
})

test('a superseded Itinerary leaves the list and its Correction shows', () => {
  data.itineraries = [underway(), itinerary({ id: 'fix', at: '2026-10-31T10:00:00Z', supersedes: 'trip' })]
  render(<Traveler />)
  const entries = within(screen.getByRole('list', { name: 'Your confirmed Itineraries' })).getAllByRole('listitem', { name: /Itinerary confirmed/ })
  expect(entries.map(e => e.getAttribute('aria-label'))).toEqual(['Itinerary confirmed 2026-10-31T10:00:00Z'])
})

test('a second Correction of the same Itinerary is refused, keeping the draft and showing the current Itinerary', async () => {
  confirmItinerary.mockRejectedValueOnce(new AlreadyCorrectedError())
  startCorrecting()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm itinerary' }))
  expect(await screen.findByText('This Itinerary was already corrected.')).toBeTruthy()
  expect(reloadItineraries).toHaveBeenCalled()
  expect(screen.getAllByRole('group', { name: /^Stop/ })).toHaveLength(2)
})

test('Withdraw asks for confirmation, and declining records nothing', () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
  data.itineraries = [underway()]
  render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  expect(ask).toHaveBeenCalled()
  expect(confirmItinerary).not.toHaveBeenCalled()
  ask.mockRestore()
})

test('withdrawing records a Correction that keeps only the started stops', async () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
  data.itineraries = [underway()]
  render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  await waitFor(() => expect(reloadItineraries).toHaveBeenCalled())
  expect(confirmItinerary).toHaveBeenCalledWith(expect.objectContaining({ supersedes: 'trip', stops: [underway().stops[0]] }))
  ask.mockRestore()
})

test('a withdrawn Itinerary leaves the list, though its started stop carries over', () => {
  data.itineraries = [underway(), { ...underway(), id: 'withdrawn', at: '2026-10-31T10:00:00Z', supersedes: 'trip', stops: [underway().stops[0]] }]
  render(<Traveler />)
  expect(screen.getByText(/No confirmed Itineraries/)).toBeTruthy()
})

test('withdrawing an already-corrected Itinerary is refused like Correct', async () => {
  const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
  confirmItinerary.mockRejectedValueOnce(new AlreadyCorrectedError())
  data.itineraries = [underway()]
  const { rerender } = render(<Traveler />)
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
  await waitFor(() => expect(reloadItineraries).toHaveBeenCalled())
  // The reload shows the Correction in force instead, so the withdrawn entry leaves the list.
  data.itineraries = [underway(), itinerary({ id: 'fix', at: '2026-10-31T10:00:00Z', supersedes: 'trip' })]
  rerender(<Traveler />)
  expect(await screen.findByText('This Itinerary was already corrected.')).toBeTruthy()
  ask.mockRestore()
})

test('the queue lists Cases with status badges in the order Case rules return', () => {
  data.queue = [
    { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'needs_assistance', at: '2026-10-31T14:12:00Z', owner: null, ownedByMe: false },
    { caseId: 'c2', traveler: 'Priya Natarajan', incident: 'Flash flood at Phantom Ranch', status: 'unconfirmed', at: '2026-10-31T13:48:00Z', owner: null, ownedByMe: false },
    { caseId: 'c3', traveler: 'Tom Alvarez', incident: 'Flash flood at Phantom Ranch', status: 'safe', at: '2026-10-31T13:55:00Z', owner: null, ownedByMe: false },
  ]
  render(<Coordinator />)
  const rows = within(screen.getByRole('list', { name: 'Case queue' })).getAllByRole('listitem')
  expect(rows.map(row => row.textContent)).toEqual([
    expect.stringMatching(/Maya Chen.*Needs assistance/),
    expect.stringMatching(/Priya Natarajan.*Unconfirmed/),
    expect.stringMatching(/Tom Alvarez.*Safe/),
  ])
  // Each row says what set its status and when.
  expect(rows[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:12:00Z')
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

test('unread Individual Updates clear after opening and remain read on the next poll', async () => {
  const older = { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'safe' as const, at: '2026-10-31T13:55:00Z' }, unreadNotificationId: null }
  const latest = { caseId: 'c1', traveler: 'Maya Chen', update: { status: 'needs_assistance' as const, at: '2026-10-31T14:12:00Z' } }
  data.updates = [{ ...latest, unreadNotificationId: 'n1' }, older]
  const { rerender } = render(<EmergencyContact />)
  const items = () => within(screen.getByRole('list', { name: 'Individual Updates' })).getAllByRole('listitem')
  expect(within(items()[0]).getByText('New')).toBeTruthy()
  expect(within(items()[1]).queryByText('New')).toBeNull()
  fireEvent.click(items()[0]);
  await waitFor(() => expect(markRead).toHaveBeenCalledWith(['n1']))
  // The next poll sees it read; the marker stays until the contact leaves the page.
  data.updates = [{ ...latest, unreadNotificationId: null }, older]
  rerender(<EmergencyContact />)
  expect(within(items()[0]).queryByText('New')).toBeNull()
  expect(markRead).toHaveBeenCalledTimes(1)
})

const mayaCase: QueueCase = { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'needs_assistance', at: '2026-10-31T14:12:00Z', owner: null, ownedByMe: false }
const item = (fields: Partial<CaseHistoryItem> & Pick<CaseHistoryItem, 'id' | 'entry' | 'by' | 'at'>): CaseHistoryItem =>
  ({ status: null, reached: null, outcome: null, urgency: null, text: null, fromReport: null, ...fields })

function openMayaCase() {
  window.location.hash = '#/coordinator/case/c1'
  render(<Coordinator />)
  return within(screen.getByRole('region', { name: 'Case: Maya Chen' }))
}

test('a Case whose opening Itinerary was corrected shows the old and new stops; status and claim are unchanged', () => {
  data.queue = [{ ...mayaCase, owner: 'Dana Ortiz', correction: {
    withdrawn: false,
    old: [{ place: 'Phantom Ranch', start: '2099-11-02T14:00:00Z', end: '2099-11-02T18:00:00Z' }],
    new: [{ place: 'Mather Point', start: '2099-11-02T17:30:00Z', end: '2099-11-02T19:00:00Z' }],
  } }]
  data.history = []
  const detail = openMayaCase()
  const correction = within(detail.getByRole('region', { name: 'Itinerary corrected' }))
  // Times are Grand Canyon local (UTC-7).
  expect(within(correction.getByRole('list', { name: 'Stops the Case was opened on' })).getByText('Phantom Ranch').closest('li')?.textContent).toMatch(/7:00.*11:00/)
  expect(within(correction.getByRole('list', { name: 'Stops now' })).getByText('Mather Point').closest('li')?.textContent).toMatch(/10:30.*12:00/)
  expect(detail.getByText('Needs assistance')).toBeTruthy()
  expect(detail.getByText('Claimed by Dana Ortiz')).toBeTruthy()
})

test('a Case whose opening Itinerary was withdrawn says so', () => {
  data.queue = [{ ...mayaCase, correction: { withdrawn: true, old: [{ place: 'Phantom Ranch', start: '2099-11-02T14:00:00Z', end: '2099-11-02T18:00:00Z' }], new: [] } }]
  data.history = []
  const correction = within(openMayaCase().getByRole('region', { name: 'Itinerary withdrawn' }))
  expect(correction.getByText('Phantom Ranch')).toBeTruthy()
  expect(correction.getByText('No stops.')).toBeTruthy()
})

test('a Case whose Itinerary was not corrected shows no Correction', () => {
  data.queue = [mayaCase]
  data.history = []
  expect(openMayaCase().queryByRole('region', { name: /Itinerary (corrected|withdrawn)/ })).toBeNull()
})

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

test('the named owner can release their Case', async () => {
  vi.spyOn(window,'confirm').mockReturnValue(true)
  data.queue = [{ ...mayaCase, owner: 'Dana Ortiz', ownedByMe: true }]
  data.history = []
  const owner = within(openMayaCase().getByRole('group', { name: 'Owner' }))
  expect(owner.getByText('Claimed by Dana Ortiz (you)')).toBeTruthy()
  fireEvent.click(owner.getByRole('button', { name: 'Unclaim' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'released' }))
})

test('the Coordinator records a Contact Attempt and a note', async () => {
  data.queue = [mayaCase]
  data.history = []
  const detail = openMayaCase()
  fireEvent.click(detail.getByRole('tab',{name:'Contact attempt'}))
  const attempt = within(detail.getByRole('group', { name: 'Contact Attempt' }))
  fireEvent.click(attempt.getByLabelText('Not reached'))
  // A Contact Attempt needs its note too.
  const record = attempt.getByRole('button', { name: 'Record' }) as HTMLButtonElement
  expect(record.disabled).toBe(true)
  fireEvent.change(attempt.getByLabelText('Note'), { target: { value: 'Voicemail' } })
  fireEvent.click(record)
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'contact_attempt', reached: false, note: 'Voicemail' }))
  fireEvent.click(detail.getByRole('tab',{name:'Notes'}))
  const note = within(detail.getByRole('group', { name: 'Note' }))
  fireEvent.change(note.getByLabelText('Note'), { target: { value: 'SAR found the camp empty' } })
  fireEvent.click(note.getByRole('button', { name: 'Add note' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'note', note: 'SAR found the camp empty' }))
})

test('a note can say which Report it follows up', async () => {
  data.queue = [mayaCase]
  data.history = [item({ id: 'r1', entry: 'check_in', by: 'Maya Chen', at: '2026-10-31T14:12:00Z', status: 'needs_assistance', text: 'Water rising' })]
  const detail = openMayaCase()
  fireEvent.click(detail.getByRole('tab',{name:'Notes'}))
  const note = within(detail.getByRole('group', { name: 'Note' }))
  fireEvent.change(note.getByLabelText('From Report'), { target: { value: 'r1' } })
  fireEvent.change(note.getByLabelText('Note'), { target: { value: 'SAR reached the camp' } })
  fireEvent.click(note.getByRole('button', { name: 'Add note' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'note', note: 'SAR reached the camp', fromReport: 'r1' }))
})

test('resolving needs exactly one outcome', async () => {
  vi.spyOn(window,'confirm').mockReturnValue(true)
  data.queue = [mayaCase]
  data.history = []
  const detail = openMayaCase()
  fireEvent.click(detail.getByRole('tab',{name:'Resolve'}))
  const resolve = within(detail.getByRole('group', { name: 'Resolve' }))
  const button = resolve.getByRole('button', { name: 'Resolve' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  // Radios: choosing one outcome replaces the other.
  fireEvent.click(resolve.getByLabelText('Reached'))
  fireEvent.click(resolve.getByRole('button', { name: 'Clear selection' }))
  expect(button.disabled).toBe(true)
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
  const detail = openMayaCase()
  fireEvent.click(detail.getByRole('tab',{name:'Timeline'}))
  const history = within(detail.getByRole('list', { name: 'Case history' }))
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

test('a Needs assistance Case shows its Urgency and the traveler\'s words behind it', () => {
  data.queue = [{ ...mayaCase, urgency: 'immediate', urgencyQuote: 'my son cut his leg badly', urgencyChanged: false }]
  const row = openMayaCase()
  expect(row.getByText('Immediate')).toBeTruthy()
  expect(row.getByText('my son cut his leg badly')).toBeTruthy()
  expect(row.queryByText(/%/)).toBeNull()
})

test('a Coordinator changes the Urgency', async () => {
  data.queue = [{ ...mayaCase, urgency: 'untriaged', urgencyQuote: null, urgencyChanged: false }]
  data.history = []
  const detail = openMayaCase()
  fireEvent.click(detail.getByText('Change Urgency', { selector: 'summary' }))
  fireEvent.click(detail.getByLabelText('Urgent'))
  fireEvent.click(detail.getByRole('button', { name: 'Change Urgency' }))
  await waitFor(() => expect(recordCaseEvent).toHaveBeenCalledWith('c1', { action: 'urgency_changed', urgency: 'urgent', note: undefined }))
})

test('the Emergency Contact sees an Urgency update without the AI\'s quote', () => {
  data.updates = [{ caseId: 'c1', traveler: 'Maya Chen', update: { urgency: 'immediate', at: '2026-10-31T14:12:02Z' }, unreadNotificationId: null }]
  render(<EmergencyContact />)
  const [entry] = within(screen.getByRole('list', { name: 'Individual Updates' })).getAllByRole('listitem')
  expect(entry.textContent).toMatch(/Maya Chen.*Urgency: Immediate/)
})

test("the Emergency Contact files a Can't-reach report from the traveler's Case", async () => {
  data.contactCases = [
    { caseId: 'c1', traveler: 'Maya Chen', incident: 'Flash flood at Phantom Ranch', status: 'unconfirmed' },
    { caseId: 'c2', traveler: 'Maya Chen', incident: 'Earlier flood', status: 'resolved', outcome: 'reached' },
  ]
  render(<EmergencyContact />)
  const cases = within(screen.getByRole('list', { name: 'Cases' })).getAllByRole('listitem')
  // A resolved Case has nothing left to report.
  expect(within(cases[1]).queryByRole('button',{name:/I can't reach/})).toBeNull()
  fireEvent.click(within(cases[0]).getByRole('button', { name: "I can't reach Maya Chen" }))
  expect(fileCantReach).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Yes, report it'}))
  await waitFor(() => expect(fileCantReach).toHaveBeenCalledWith('c1'))
})

test('the Emergency Contact view sends anyone else to 911 or local law enforcement, with no form for them', () => {
  data.contactCases = []
  render(<EmergencyContact />)
  expect(screen.getByText(/contact 911 or local law enforcement/)).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('an AI draft only fills the General Update for the Coordinator to edit; it posts on Post', async () => {
  render(<Coordinator />)
  fireEvent.click(screen.getByRole('button',{name:'Post update'}))
  const panel = within(screen.getByRole('region', { name: 'Post a General Update' }))
  fireEvent.click(panel.getByRole('button', { name: 'Draft with AI' }))
  const text = panel.getByLabelText(/General Update for Flash flood at Phantom Ranch/) as HTMLTextAreaElement
  await waitFor(() => expect(text.value).toBe('Flash flooding near Phantom Ranch. Water at Havasupai Gardens.'))
  expect(draftGeneralUpdate).toHaveBeenCalledWith('incident-1')
  expect(postGeneralUpdate).not.toHaveBeenCalled()
  fireEvent.change(text, { target: { value: 'Flash flooding near Phantom Ranch. Stay off the River Trail.' } })
  fireEvent.click(panel.getByRole('button', { name: 'Preview update' }))
  expect(postGeneralUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Post publicly'}))
  await waitFor(() => expect(postGeneralUpdate).toHaveBeenCalledWith('incident-1', 'Flash flooding near Phantom Ranch. Stay off the River Trail.',expect.any(String)))
  await waitFor(() => expect(text.value).toBe(''))
})

test.each([['traveler', Traveler], ['Emergency Contact', EmergencyContact]])('a %s sees a new General Update about their Incident, which is then marked read', async (_, View) => {
  notices.data = [{ notificationId: 'n-7', incident: 'Flash flood at Phantom Ranch', body: 'Stay off the River Trail.', at: '2026-10-31T14:00:00Z' }]
  render(<View />)
  const item = within(screen.getByRole('list', { name: 'New General Updates' })).getByRole('listitem')
  expect(within(item).getByText('Stay off the River Trail.')).toBeTruthy()
  expect(within(item).getByText('New')).toBeTruthy()
  expect(item.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:00:00Z')
  expect(screen.getByRole('link', { name: /public incident page/ }).getAttribute('href')).toBe('#/')
  fireEvent.click(item)
  await waitFor(() => expect(markRead).toHaveBeenCalledWith(['n-7']))
})

test('a newer traveler check-in releases the contact report action without reloading', () => {
 data.contactCases=[{caseId:'c1',traveler:'Maya',incident:'Flood',status:'cant_reach',openReport:{id:'old-report',at:'2026-10-31T12:00:00Z'}}]
 const view=render(<EmergencyContact />)
 expect(screen.queryByRole('button',{name:"I can't reach Maya"})).toBeNull()
 data.contactCases=[{caseId:'c1',traveler:'Maya',incident:'Flood',status:'safe',safeAt:'2026-10-31T13:00:00Z'}]
 view.rerender(<EmergencyContact />)
 expect(screen.getByRole('button',{name:"I can't reach Maya"})).toBeTruthy()
})
