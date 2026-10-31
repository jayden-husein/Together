// Public contract for the three signed-in screens in #7.
import { useEffect, useState } from 'react'
import { caseStatus, individualUpdateView, orderQueue, type CaseHistoryEntry, type CaseStatus } from './caseRules'
import { supabase } from './supabase'

export type CheckInStatus = 'safe' | 'needs_assistance'
export type CheckInReport = { id: string; status: CheckInStatus; description: string | null; at: string }
export type CheckInRequest = { caseId: string; incident: string; reports: CheckInReport[] }
export type QueueCase = { caseId: string; traveler: string; incident: string } & CaseStatus
export type ContactUpdate = {
  caseId: string
  traveler: string
  update: { status: Exclude<CaseStatus['status'], 'unconfirmed'>; at: string }
}

type PollResult<T> = { data: T[] | undefined; error: string | null }

type ReportRow = { id: string; created_at: string; original_text: string | null; body: { status: CheckInStatus } }

async function myCheckIns(): Promise<CheckInRequest[]> {
  const { data: requests } = await supabase.from('notifications').select('refers_to')
    .eq('kind', 'check_in_request').throwOnError()
  if (!requests.length) return []
  const { data } = await supabase.from('cases')
    .select('id, incidents!inner(name), reports(id, created_at, original_text, body)')
    .in('id', requests.map(request => request.refers_to)).eq('reports.kind', 'check_in')
    .order('created_at', { referencedTable: 'reports', ascending: false })
    .returns<{ id: string; incidents: { name: string }; reports: ReportRow[] }[]>().throwOnError()
  return data.map(row => ({
    caseId: row.id, incident: row.incidents.name,
    reports: row.reports.map(r => ({ id: r.id, at: r.created_at, description: r.original_text, status: r.body.status })),
  }))
}

function usePoll<T>(load: () => Promise<T[]>): PollResult<T> {
  const [result, setResult] = useState<PollResult<T>>({ data: undefined, error: null })
  useEffect(() => {
    let generation = 0
    let pending = false
    let account: string | null | undefined
    async function poll() {
      if (pending || account === undefined) return
      pending = true
      const version = generation
      try {
        const data = await load()
        if (version === generation) setResult({ data, error: null })
      } catch (error) {
        if (version === generation) setResult({ data: undefined, error: error instanceof Error ? error.message : 'Could not load updates.' })
      } finally {
        if (version === generation) pending = false
      }
    }
    // Discard prior-account rows and in-flight reads whenever the signed-in account changes.
    const { data } = supabase.auth.onAuthStateChange((_, session) => {
      const next = session?.user.id ?? null
      if (account === next) return
      account = next
      generation++
      pending = false
      setResult({ data: undefined, error: null })
      queueMicrotask(poll)
    })
    const timer = window.setInterval(poll, 3000)
    return () => {
      generation++
      account = undefined
      data.subscription.unsubscribe()
      window.clearInterval(timer)
    }
  }, [load])
  return result
}

export function useMyCheckIns() { return usePoll(myCheckIns) }
export async function submitCheckIn(caseId: string, status: CheckInStatus, description?: string) {
  await supabase.rpc('submit_check_in', {
    p_case_id: caseId, p_status: status, p_description: description ?? null,
  }).throwOnError()
}

type QueueRow = {
  id: string
  persons: { name: string }
  incidents: { name: string }
  reports: { kind: 'cant_reach' | 'check_in'; body: { status?: CheckInStatus }; created_at: string }[]
  case_events: { created_at: string; outcome: CaseHistoryEntry['outcome'] }[]
}

async function queue(): Promise<QueueCase[]> {
  const { data: coordinator } = await supabase.rpc('is_coordinator').throwOnError()
  if (!coordinator) throw new Error('A Coordinator account is required.')
  const { data } = await supabase.from('cases').select(
    'id, persons!inner(name), incidents!inner(name), reports(kind, body, created_at), case_events(created_at, outcome)',
  ).in('reports.kind', ['check_in', 'cant_reach']).eq('case_events.action', 'resolved')
    .order('created_at').returns<QueueRow[]>().throwOnError()
  return orderQueue(data.map(row => {
    const history: CaseHistoryEntry[] = row.reports.map(report => ({
      at: report.created_at, outcome: null,
      status: report.kind === 'cant_reach' ? 'cant_reach' : report.body.status ?? null,
    }))
    for (const event of row.case_events) history.push({ at: event.created_at, outcome: event.outcome, status: 'resolved' })
    return { caseId: row.id, traveler: row.persons.name, incident: row.incidents.name, ...caseStatus(history) }
  }))
}

async function individualUpdates(): Promise<ContactUpdate[]> {
  const { data } = await supabase.rpc('contact_case_updates')
    .select('case_id, person_name, status, at')
    .in('entry_kind', ['check_in', 'cant_reach', 'resolved']).not('status', 'is', null)
    .order('at', { ascending: false }).throwOnError()
  if (!Array.isArray(data)) throw new Error('Expected a list of Individual Updates.')
  return data.map(entry => ({ caseId: entry.case_id, traveler: entry.person_name, update: individualUpdateView(entry) }))
}

export function useQueue() { return usePoll(queue) }
export function useIndividualUpdates() { return usePoll(individualUpdates) }
