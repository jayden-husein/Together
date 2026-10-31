import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import PotentialIncidentReview from './PotentialIncidentReview'
import { VerificationSessionError } from '../lib/incidentVerification'
import { floodReadings } from '../../supabase/functions/_shared/flood'

const verify = vi.hoisted(() => vi.fn())
vi.mock('../lib/checkIns', () => ({ verifyIncident: verify }))
afterEach(cleanup)

test('a rejected verification shows sign-in recovery and retains the edited time window', async () => {
  verify.mockRejectedValue(new VerificationSessionError())
  const readings = floodReadings()
  render(<PotentialIncidentReview onVerify={() => {}} draft={{
    id: 'pending', name: 'Creek flood', starts_at: '2026-10-31T08:00:00Z', fallback: false,
    summary: 'Water rising', area: readings.warning.area,
    sources: [readings.gauge, readings.warning, readings.news].map(source => ({ ...source, quote: source.text })),
  }} />)
  const end = screen.getByLabelText(/End \(optional\)/) as HTMLInputElement
  fireEvent.change(end, { target: { value: '2026-11-02T12:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify Incident' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your session has ended'))
  expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy()
  expect(end.value).toBe('2026-11-02T12:00')
})
