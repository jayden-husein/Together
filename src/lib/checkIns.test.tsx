import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, expectTypeOf, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { type ContactUpdate, type IndividualUpdate, useCaseHistory, useIndividualUpdates, useMyCheckIns, useQueue } from './checkIns'

let status = 'safe'
let queueFixture = false
vi.mock('./supabase', async () => {
  // Exercise the real Supabase client against a synthetic Data API.
  const client = createClient('https://example.test', 'test-key', { global: { fetch: async input => {
    const url = new URL(String(input))
    const path = url.pathname
    if (path.endsWith('/rpc/is_coordinator')) return Response.json(true)
    if (path.endsWith('/coordinators')) return Response.json([{ account_id: 'acct-dana', name: 'Dana Ortiz' }])
    if (queueFixture && path.endsWith('/cases')) {
      const offset = Number(url.searchParams.get('offset'))
      const size = Number(url.searchParams.get('limit') ?? 100)
      const rows = Array.from({ length: Math.min(size, 101 - offset) }, (_, i) => ({
        id: String(offset + i), created_at: '2026-10-31T05:00:00Z', persons: { name: 'Traveler' }, incidents: { name: 'Flood' },
        // Newest first, as requested: Dana took over Case 1 from another Coordinator.
        case_events: offset + i === 1 ? [
          { action: 'claimed', actor: 'acct-dana', created_at: '2026-10-31T05:20:00Z', outcome: null },
          { action: 'claimed', actor: 'acct-lee', created_at: '2026-10-31T05:10:00Z', outcome: null },
        ] : offset + i === 100 ? [
          { action: 'released', actor: 'acct-dana', created_at: '2026-10-31T05:20:00Z', outcome: null },
          { action: 'claimed', actor: 'acct-dana', created_at: '2026-10-31T05:10:00Z', outcome: null },
        ] : [],
        reports: offset + i === 100 ? [{ kind: 'check_in', body: { status: 'needs_assistance' }, created_at: '2026-10-31T06:00:00Z' }] : [],
      }))
      return Response.json(rows)
    }
    if (url.searchParams.get('case_id') === 'eq.case-h') {
      if (path.endsWith('/reports')) return Response.json([
        { id: 'r1', kind: 'check_in', source: 'traveler', created_at: '2026-10-31T06:00:00Z', original_text: 'Water rising', body: { status: 'needs_assistance' }, persons: { name: 'Maya' } },
      ])
      if (path.endsWith('/case_events')) return Response.json([
        { id: 'e1', action: 'opened', actor: null, created_at: '2026-10-31T05:00:00Z', note: null, reached: null, outcome: null, urgency: null, source_report_id: null },
        { id: 'e2', action: 'urgency_proposed', actor: null, created_at: '2026-10-31T06:00:01Z', note: null, reached: null, outcome: null, urgency: 'urgent', source_report_id: 'r1' },
        { id: 'e3', action: 'contact_attempt', actor: 'acct-dana', created_at: '2026-10-31T06:10:00Z', note: 'Voicemail', reached: false, outcome: null, urgency: null, source_report_id: null },
        { id: 'e4', action: 'resolved', actor: 'acct-gone', created_at: '2026-10-31T06:30:00Z', note: null, reached: null, outcome: 'reached', urgency: null, source_report_id: null },
      ])
    }
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const page = <T,>(rows: T[]) => Response.json(rows.slice(offset, offset + limit))
    const ids = Array.from({ length: 1001 }, (_, i) => 'case-' + i)
    const at = '2026-10-31T06:00:00Z'
    if (path.endsWith('/notifications') && url.searchParams.get('kind') === 'eq.individual_update') {
      return page([{ id: 'n-0', refers_to: 'case-0', created_at: at }])
    }
    if (path.endsWith('/notifications')) return page(ids.map(refers_to => ({ refers_to })))
    if (path.endsWith('/rpc/contact_case_updates')) {
      return page(ids.map(case_id => case_id === 'case-2'
        ? { case_id, person_name: 'Maya', status: 'resolved', outcome: 'not_in_area', at }
        : { case_id, person_name: 'Maya', status: 'safe', outcome: null, at }))
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
    // Each Case's time is when its status was set: the latest Report, else when the Case opened.
    expect(hook.result.current.data?.[0].at).toBe('2026-10-31T06:00:00Z')
    expect(hook.result.current.data?.[1].at).toBe('2026-10-31T05:00:00Z')
    // The latest claim names the owner.
    expect(hook.result.current.data?.find(c => c.caseId === '1')?.owner).toBe('Dana Ortiz')
    expect(hook.result.current.data?.[0].owner).toBeNull()
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
    // The unread Individual Update Notification matches the update its Check-in delivered.
    expect(hook.result.current.data?.find(entry => entry.caseId === 'case-0')?.unreadNotificationId).toBe('n-0')
    expect(hook.result.current.data?.find(entry => entry.caseId === 'case-1')?.unreadNotificationId).toBeNull()
    expect(hook.result.current.data?.find(entry => entry.caseId === 'case-2')?.update).toEqual({ status: 'resolved', outcome: 'not_in_area', at: '2026-10-31T06:00:00Z' })
  } finally { hook.unmount() }
})

test('a Case history merges Reports and Case events, newest first, saying who did each', async () => {
  const hook = renderHook(() => useCaseHistory('case-h'))
  try {
    await waitFor(() => expect(hook.result.current.data).toHaveLength(5))
    expect(hook.result.current.data?.map(item => [item.entry, item.by])).toEqual([
      ['resolved', 'Coordinator #acct-gon'], // an actor no longer listed still shows as a Coordinator
      ['contact_attempt', 'Dana Ortiz'],
      ['urgency_proposed', 'AI'],
      ['check_in', 'Maya'],
      ['opened', 'Together'],
    ])
    const [resolved, attempt, proposed, checkIn] = hook.result.current.data!
    expect(resolved.outcome).toBe('reached')
    expect(attempt).toMatchObject({ reached: false, text: 'Voicemail', at: '2026-10-31T06:10:00Z' })
    expect(proposed).toMatchObject({ urgency: 'urgent', fromReport: 'r1' })
    expect(checkIn).toMatchObject({ id: 'r1', status: 'needs_assistance', text: 'Water rising' })
  } finally { hook.unmount() }
})
