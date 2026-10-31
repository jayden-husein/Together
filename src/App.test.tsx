import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

test.each([
  ['#/traveler', 'Sign in'],
  ['#/contact', 'Sign in'],
  ['#/coordinator', 'Sign in'],
  ['', 'Flash flood at Phantom Ranch'],
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
