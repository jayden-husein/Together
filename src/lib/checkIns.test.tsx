import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, expectTypeOf, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { type ContactUpdate, type IndividualUpdate, useIndividualUpdates, useMyCheckIns, useQueue } from './checkIns'

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
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const page = <T,>(rows: T[]) => Response.json(rows.slice(offset, offset + limit))
    const ids = Array.from({ length: 1001 }, (_, i) => 'case-' + i)
    const at = '2026-10-31T06:00:00Z'
    if (path.endsWith('/notifications')) return page(ids.map(refers_to => ({ refers_to })))
    if (path.endsWith('/rpc/contact_case_updates')) {
      return page(ids.map(case_id => ({ case_id, person_name: 'Maya', status: 'safe', at })))
    }
    const filter = url.searchParams.get('id') ?? url.searchParams.get('case_id') ?? ''
    if (filter.length > 2000) return Response.json({ message: 'URI too long' }, { status: 414 })
    const requested = filter.slice(4, -1).replace(/"/g, '').split(',')
    if (path.endsWith('/cases')) return page(requested.map(id => ({ id, incidents: { name: 'Flood' } })))
    if (path.endsWith('/reports')) return page(requested.includes('case-0') ? ids.map(id => ({
      id, case_id: 'case-0', body: { status }, original_text: null, created_at: at,
    })) : [])
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

test('traveler can read requests and Report history beyond the API row cap', async () => {
  const hook = renderHook(useMyCheckIns)
  try {
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1001))
    expect(hook.result.current.data?.find(c => c.caseId === 'case-0')?.reports).toHaveLength(1001)
    expect(hook.result.current.data?.some(c => c.caseId === 'case-1000')).toBe(true)
  } finally { hook.unmount() }
})

test('contact receives the full update history through the original screen contract', async () => {
  expectTypeOf<ContactUpdate>().toEqualTypeOf<IndividualUpdate>()
  const hook = renderHook(useIndividualUpdates)
  try {
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1001))
    expect(hook.result.current.data?.some(entry => entry.caseId === 'case-1000')).toBe(true)
  } finally { hook.unmount() }
})
