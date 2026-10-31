import { beforeEach, expect, test, vi } from 'vitest'
import { VerificationSessionError, signInAgain, verifyIncident } from './incidentVerification'

const api = vi.hoisted(() => ({ invoke: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: api.invoke }, auth: api } }))
beforeEach(() => vi.resetAllMocks())
const unauthorized = () => ({ error: { context: Response.json({ message: 'Sign in as a Coordinator.' }, { status: 401 }) } })

test('a rejected session gives the Coordinator a sign-in recovery message', async () => {
  api.invoke.mockResolvedValue(unauthorized())
  api.refreshSession.mockResolvedValue({ error: new Error('Refresh token revoked') })
  await expect(verifyIncident('draft', '2026-10-31T08:00:00Z', null)).rejects.toBeInstanceOf(VerificationSessionError)
})
test('refreshes a stale token and retries the same verification once', async () => {
  api.invoke.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce({ error: null })
  api.refreshSession.mockResolvedValue({ error: null })
  await verifyIncident('draft', '2026-10-31T08:00:00Z', null)
  expect(api.invoke).toHaveBeenCalledTimes(2)
  expect(api.invoke.mock.calls[0]).toEqual(api.invoke.mock.calls[1])
})
test('server validation explains why verification failed', async () => {
  api.invoke.mockResolvedValue({ error: { context: Response.json({ message: 'Choose a valid Incident time window.' }, { status: 400 }) } })
  await expect(verifyIncident('draft', 'invalid', null)).rejects.toThrow('Choose a valid Incident time window.')
  expect(api.refreshSession).not.toHaveBeenCalled()
})
test('sign-in recovery signs out only this browser', async () => {
  api.signOut.mockResolvedValue({ error: null })
  await signInAgain()
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
