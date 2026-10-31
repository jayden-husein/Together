import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

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
