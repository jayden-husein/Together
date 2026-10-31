import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

const incident = vi.hoisted(() => ({ data: [] as import('./lib/checkIns').PublicIncident[] }))
const updates = vi.hoisted(() => ({ data: [] as import('./lib/checkIns').GeneralUpdate[], error: null }))
vi.mock('./lib/checkIns', async importOriginal => ({
  ...await importOriginal<typeof import('./lib/checkIns')>(),
  useIncidents: () => incident,
  useGeneralUpdates: () => updates,
}))

afterEach(() => {
  incident.data = []
  updates.data = []
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

test('each Resource on the list shows its source, last-updated time and a simulated label, and the map marks the same Resources', () => {
  incident.data = [flood('one', 'Flash flood at Phantom Ranch')]
  const { container } = render(<App />)
  const list = within(screen.getByRole('list', { name: 'Resources' }))
  const items = list.getAllByRole('listitem')
  expect(items.map(item => within(item).getByRole('heading').textContent)).toEqual(
    ['Bright Angel Lodge shelter', 'Havasupai Gardens water station', 'Tipoff first-aid point'])
  const firstAid = items[2]
  expect(within(firstAid).getByText('Simulation')).toBeTruthy()
  expect(within(firstAid).getByText(/Simulated ranger dispatch/)).toBeTruthy()
  expect(Date.parse(firstAid.querySelector('time')!.getAttribute('dateTime')!)).toBeLessThan(Date.now())
  expect(container.querySelectorAll('.incident-map .resource-marker')).toHaveLength(items.length)
})

test('General Updates for the Incident show newest first, with when they were posted', () => {
  incident.data = [flood('one', 'Flash flood at Phantom Ranch')]
  updates.data = [
    { id: 'u2', body: 'Water is at the Havasupai Gardens station.', created_at: '2026-10-31T14:30:00Z' },
    { id: 'u1', body: 'Stay off the River Trail.', created_at: '2026-10-31T14:00:00Z' },
  ]
  render(<App />)
  const items = within(screen.getByRole('list', { name: 'General Updates' })).getAllByRole('listitem')
  expect(items.map(item => item.querySelector('p')?.textContent)).toEqual(['Water is at the Havasupai Gardens station.', 'Stay off the River Trail.'])
  expect(items[0].querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-31T14:30:00Z')
})
