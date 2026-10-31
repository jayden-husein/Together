import { useEffect, useState } from 'react'
import { getSupabase } from './supabase'
import { caseStatus, individualUpdateView, orderQueue, type CaseHistoryEntry } from './caseRules'
import type { CheckInStatus } from '../ui'

export async function submitCheckIn(caseId: string, status: CheckInStatus, description?: string) {
  const { error } = await getSupabase().rpc('submit_check_in', {
    p_case_id: caseId, p_status: status, p_description: description ?? null,
  })
  if (error) throw error
}

async function myCheckIns() {
  const { data: requests } = await getSupabase().from('notifications').select('refers_to')
    .eq('kind', 'check_in_request').throwOnError()
  const ids = requests.map(r => r.refers_to)
  if (!ids.length) return []
  const { data } = await getSupabase().from('cases')
    .select('id, incidents!inner(name), reports(id,kind,body,original_text,created_at)')
    .in('id', ids).eq('reports.kind', 'check_in').order('created_at', { referencedTable: 'reports', ascending: false })
    .returns<{ id: string; incidents: {name: string}; reports: {
      id: string; body: {status: CheckInStatus}; original_text: string | null; created_at: string
    }[] }[]>().throwOnError()
  return data
}

async function queue() {
  const { data: allowed } = await getSupabase().rpc('is_coordinator').throwOnError()
  if (!allowed) throw new Error('Sign in with a Coordinator account to see Cases.')
  const { data } = await getSupabase().from('cases').select(
    'id,persons!inner(name),incidents!inner(name),reports(kind,body,created_at),case_events(action,outcome,created_at)',
  ).in('reports.kind', ['check_in', 'cant_reach']).eq('case_events.action', 'resolved').order('created_at')
    .returns<{id: string; persons: {name: string}; incidents: {name: string}; reports: {
      kind: string; body: {status: CheckInStatus}; created_at: string
    }[]; case_events: {created_at: string; outcome: CaseHistoryEntry['outcome']}[]}[]>().throwOnError()
  return orderQueue(data.map(c => {
    const history: CaseHistoryEntry[] = c.reports.map(r => ({
      at: r.created_at, status: r.kind === 'cant_reach' ? 'cant_reach' : r.body.status, outcome: null,
    }))
    for (const e of c.case_events) history.push({ at: e.created_at, status: 'resolved', outcome: e.outcome })
    return { id: c.id, name: c.persons.name, incident: c.incidents.name, ...caseStatus(history) }
  }))
}

async function individualUpdates() {
  const { data } = await getSupabase().rpc('contact_case_updates')
    .in('entry_kind', ['check_in', 'cant_reach', 'resolved']).order('at', { ascending: false })
    .throwOnError()
  const entries: (CaseHistoryEntry & {case_id: string; person_name: string})[] = data
  return entries.map(entry => ({ caseId: entry.case_id, name: entry.person_name, ...individualUpdateView(entry) }))
}

function usePoll<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [revision, refresh] = useState(0)
  useEffect(() => {
    let active = true
    let pending = false
    async function poll() {
      if (pending) return
      pending = true
      try {
        const next = await load()
        if (active) { setData(next); setError('') }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load updates. Retrying…')
      } finally { pending = false }
    }
    void poll()
    const timer = window.setInterval(poll, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [load, revision])
  return { data, error, refresh: () => refresh(n => n + 1) }
}

export const useMyCheckIns = () => usePoll(myCheckIns)
export const useQueue = () => usePoll(queue)
export const useIndividualUpdates = () => usePoll(individualUpdates)
