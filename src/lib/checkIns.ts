// Public contract for the three signed-in screens in #7.
import { useEffect, useState } from 'react'
import { caseStatus, individualUpdateView, orderQueue, type CaseHistoryEntry, type CaseStatus } from './caseRules'
import { supabase } from './supabase'

export type CheckInStatus = 'safe' | 'needs_assistance'
export type CheckInReport = { id: string; status: CheckInStatus; description: string | null; at: string }
export type CheckInRequest = { caseId: string; incident: string; reports: CheckInReport[] }
export type QueueCase = { caseId: string; traveler: string; incident: string } & CaseStatus
export type IndividualUpdate = {
  caseId: string
  traveler: string
  update: ReturnType<typeof individualUpdateView>
}

export type ContactUpdate = IndividualUpdate

type PollResult<T> = { data: T[] | undefined; error: string | null }

type ReportRow = { case_id: string; id: string; created_at: string; original_text: string | null; body: { status: CheckInStatus } }

const pageSize = 100

async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data } = await read(from, from + pageSize - 1)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

async function myCheckIns(): Promise<CheckInRequest[]> {
  const requests = await readPages((from, to) => supabase.from('notifications').select('refers_to')
    .eq('kind', 'check_in_request').order('created_at').order('id').range(from, to).throwOnError())
  const ids = [...new Set(requests.map(request => request.refers_to))]
  const cases = new Map<string, CheckInRequest>()
  // Limit UUIDs in each URL independently of the Data API response page size.
  const batchSize = 40
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize)
    const { data } = await supabase.from('cases').select('id, incidents!inner(name)').in('id', batch)
      .returns<{ id: string; incidents: { name: string } }[]>().throwOnError()
    for (const row of data) cases.set(row.id, { caseId: row.id, incident: row.incidents.name, reports: [] })
    const reports = await readPages((from, to) => supabase.from('reports')
      .select('case_id, id, created_at, original_text, body').in('case_id', batch).eq('kind', 'check_in')
      .order('created_at').order('id').range(from, to).returns<ReportRow[]>().throwOnError())
    for (const row of reports.reverse()) {
      cases.get(row.case_id)?.reports.push({ id: row.id, at: row.created_at, description: row.original_text, status: row.body.status })
    }
  }
  return ids.flatMap(id => cases.get(id) ?? [])
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
  const rows = await readPages((from, to) => supabase.from('cases').select(
    'id, persons!inner(name), incidents!inner(name), reports(kind, body, created_at), case_events(created_at, outcome)',
  ).in('reports.kind', ['check_in', 'cant_reach']).eq('case_events.action', 'resolved')
    .order('created_at', { referencedTable: 'reports', ascending: false }).limit(1, { referencedTable: 'reports' })
    .order('created_at').order('id').range(from, to).returns<QueueRow[]>().throwOnError())
  return orderQueue(rows.map(row => {
    const history: CaseHistoryEntry[] = row.reports.map(report => ({
      at: report.created_at, outcome: null,
      status: report.kind === 'cant_reach' ? 'cant_reach' : report.body.status ?? null,
    }))
    for (const event of row.case_events) history.push({ at: event.created_at, outcome: event.outcome, status: 'resolved' })
    return { caseId: row.id, traveler: row.persons.name, incident: row.incidents.name, ...caseStatus(history) }
  }))
}

async function individualUpdates(): Promise<IndividualUpdate[]> {
  const data = await readPages(async (from, to) => {
    const { data } = await supabase.rpc('contact_case_updates')
      .select('case_id, person_name, status, at')
      .in('entry_kind', ['check_in', 'cant_reach', 'resolved']).not('status', 'is', null)
      .order('at').order('case_id').order('status').range(from, to).throwOnError()
    if (!Array.isArray(data)) throw new Error('Expected a list of Individual Updates.')
    return { data }
  })
  return data.reverse().map(entry => ({ caseId: entry.case_id, traveler: entry.person_name, update: individualUpdateView(entry) }))
}

export function useQueue() { return usePoll(queue) }
export function useIndividualUpdates() { return usePoll(individualUpdates) }
