import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { useMyCheckIns, useQueue } from './checkIns'

let status = 'safe'
let queueFixture = false
vi.mock('./supabase', async () => {
  // Exercise the real Supabase client against a synthetic Data API.
  const client = createClient('https://example.test', 'test-key', { global: { fetch: async input => {
    const url = new URL(String(input))
    const path = url.pathname
    if (path.endsWith('/rpc/is_coordinator')) return Response.json(true)
    if (queueFixture && path.endsWith('/cases')) {
      const offset = Number(url.searchParams.get('offset'))
      const size = Number(url.searchParams.get('limit') ?? 100)
      const rows = Array.from({ length: Math.min(size, 101 - offset) }, (_, i) => ({
        id: String(offset + i), persons: { name: 'Traveler' }, incidents: { name: 'Flood' }, case_events: [],
        reports: offset + i === 100 ? [{ kind: 'check_in', body: { status: 'needs_assistance' }, created_at: '2026-10-31T06:00:00Z' }] : [],
      }))
      return Response.json(rows)
    }
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

test('a Needs assistance Case on the next page appears first in the queue', async () => {
  queueFixture = true
  const hook = renderHook(useQueue)
  try {
    await waitFor(() => expect(hook.result.current.data?.[0].caseId).toBe('100'))
    expect(hook.result.current.data).toHaveLength(101)
  } finally {
    hook.unmount()
    queueFixture = false
  }
})
