import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { useMyCheckIns } from './checkIns'

let status = 'safe'
vi.mock('./supabase', async () => {
  // Exercise the real Supabase client against a synthetic Data API.
  const client = createClient('https://example.test', 'test-key', { global: { fetch: async input => {
    const path = new URL(String(input)).pathname
    if (path.endsWith('/notifications')) return Response.json([{ refers_to: 'case-1' }])
    if (path.endsWith('/cases')) return Response.json([{ id: 'case-1', incidents: { name: 'Flood' },
      reports: [{ id: 'report-1', body: { status }, original_text: null, created_at: '2026-10-31T06:00:00Z' }],
    }])
    throw new Error('Unexpected request')
  } } })
  return { supabase: client }
})

test('the traveler receives their Report and sees a subsequent change on the next poll', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const hook = renderHook(() => useMyCheckIns())
  try {
    await waitFor(() => expect(hook.result.current.data?.[0]?.reports[0]?.status).toBe('safe'))
    status = 'needs_assistance'
    await act(() => vi.advanceTimersByTimeAsync(3000))
    await waitFor(() => expect(hook.result.current.data?.[0]?.reports[0]?.status).toBe('needs_assistance'))
  } finally {
    hook.unmount()
    vi.useRealTimers()
  }
})
