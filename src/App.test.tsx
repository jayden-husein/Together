import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

const management = vi.hoisted(() => ({ data: [] as { cases: import('./lib/checkIns').QueueCase[] }[] }))
const resolve = vi.hoisted(() => vi.fn(async () => {}))
const incident = vi.hoisted(() => ({ data: [] as import('./lib/checkIns').PublicIncident[] }))
vi.mock('./lib/checkIns', async importOriginal => ({
  ...await importOriginal<typeof import('./lib/checkIns')>(),
  useIncidents: () => ({ ...incident, reload: () => {} }),
  useCoordinatorIncidentCases: () => ({ ...management, error: null, reload: () => {} }),
  resolveIncident: resolve,
}))

afterEach(() => {
  incident.data = []
  management.data = []
  resolve.mockClear()
  cleanup()
  window.location.hash = ''
})

test.each([
  ['#/traveler', 'Sign in'],
  ['#/contact', 'Sign in'],
  ['#/coordinator', 'Sign in'],
  ['', 'Incident'],
])('signed out, route %s shows %s with the Simulation label', async (hash, heading) => {
  window.location.hash = hash
  render(<App />)
  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy()
  expect(screen.getAllByText('Simulation')).toHaveLength(1)
})

test('following a nav link switches the view', async () => {
  render(<App />)
  act(() => {
    window.location.hash = '#/coordinator'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
})

test('public incident page shows the Simulation label and OpenStreetMap attribution', () => {
  render(<App />)
  expect(screen.getByText('Simulation')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toBeTruthy()
})

test('page still renders with a list placeholder when map tiles fail', () => {
  const { container } = render(<App />)
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.error(container.querySelector('img.leaflet-tile')!)
  expect(screen.getByRole('status').textContent).toMatch(/map couldn't load/)
})


test('only a verified Incident is announced publicly', () => {
  const page = render(<App />)
  expect(screen.getByText('No verified Incident yet.')).toBeTruthy()
  expect(screen.queryByText('Verified by a Coordinator')).toBeNull()
  incident.data = [flood('one', 'Flash flood at Phantom Ranch')]
  page.rerender(<App />)
  expect(screen.getByRole('heading', { name: 'Flash flood at Phantom Ranch' })).toBeTruthy()
})


function flood(id: string, name: string): import('./lib/checkIns').PublicIncident {
  return { id, name, created_at: '2026-10-31T13:40:00Z', starts_at: '2026-10-31T13:00:00Z', ends_at: null,
    area: { type: 'Polygon', coordinates: [[[-112.1, 36.095], [-112.085, 36.095], [-112.085, 36.112], [-112.1, 36.095]]] } }
}

test('choosing an Incident changes the details and map and preserves selection on refresh', () => {
  incident.data = [flood('one', 'Creek flood'), { ...flood('two', 'Bridge flood'), ends_at: '2026-10-31T18:00:00Z' }]
  const page = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Bridge flood/ }))
  expect(screen.getByRole('heading', { level: 1, name: 'Bridge flood' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Area for Bridge flood' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Area for Creek flood' })).toBeNull()
  incident.data = [flood('three', 'New flood'), ...incident.data]
  page.rerender(<App />)
  expect(screen.getByRole('button', { name: /Bridge flood/ }).getAttribute('aria-pressed')).toBe('true')
})


test('resolved Incidents are available as history and hidden from the active list', () => {
  incident.data = [flood('active', 'Current flood'), { ...flood('old', 'Old flood'), resolved_at: '2026-10-31T18:00:00Z' }]
  render(<App />)
  expect(screen.queryByRole('button', { name: /Old flood/ })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show resolved Incidents' }))
  fireEvent.click(screen.getByRole('button', { name: /Old flood/ }))
  expect(screen.getByRole('heading', { level: 1, name: 'Old flood' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Resolve Incident' })).toBeNull()
})

test('Coordinator statistics use Incident IDs and resolution requires confirmation', async () => {
  incident.data = [flood('one', 'Flood'), flood('two', 'Flood')]
  management.data = [{ cases: [
    { caseId: 'c1', incidentId: 'one', traveler: 'Maya', incident: 'Flood', at: '2026-10-31T13:00:00Z', owner: null, ownedByMe: false, status: 'unconfirmed' },
    { caseId: 'c2', incidentId: 'two', traveler: 'Maya', incident: 'Flood', at: '2026-10-31T13:00:00Z', owner: null, ownedByMe: false, status: 'safe' },
  ] }]
  render(<App />)
  const controls = screen.getByRole('region', { name: 'Coordinator Incident controls' })
  expect(within(controls).getByText('1 total · 1 unresolved')).toBeTruthy()
  expect(within(controls).getByRole('list', { name: 'Incident Case statistics' }).textContent).toContain('1Unconfirmed')
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Incident' }))
  expect(resolve).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm resolution' }))
  await waitFor(() => expect(resolve).toHaveBeenCalledWith('one'))
})

test('public visitors see no Coordinator controls or Case statistics', () => {
  incident.data = [flood('one', 'Flood')]
  render(<App />)
  expect(screen.queryByRole('region', { name: 'Coordinator Incident controls' })).toBeNull()
})
