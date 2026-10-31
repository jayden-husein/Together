// Public contract for the three signed-in screens: the Check-in loop (#7) and the Coordinator Case workflow (#8).
import { useCallback, useEffect, useRef, useState } from 'react'
import { caseStatus, compareTimes, individualUpdateView, orderQueue, type CaseHistoryEntry, type CaseStatus, type Outcome } from './caseRules'
import { supabase } from './supabase'

export type CheckInStatus = 'safe' | 'needs_assistance'
export type CheckInReport = { id: string; status: CheckInStatus; description: string | null; at: string }
export type CheckInRequest = { caseId: string; incident: string; reports: CheckInReport[] }
// `at`: when the status was set (the latest Report or resolution), else when the Case opened.
// `owner`: the Coordinator with the latest claim, if any; `ownedByMe`: that claim is the signed-in Account's.
// `itineraryText`: what the traveler pasted for the Itinerary that opened the Case, if anything.
export type QueueCase = {
  caseId: string; traveler: string; incident: string; explanation?: string; itineraryText?: string; at: string; owner: string | null; ownedByMe: boolean
} & CaseStatus
export type IndividualUpdate = {
  caseId: string
  traveler: string
  update: ReturnType<typeof individualUpdateView>
  // The Notification that delivered this update, while the contact hasn't seen it.
  unreadNotificationId: string | null
}

export type ContactUpdate = IndividualUpdate

type PollResult<T> = { data: T[] | undefined; error: string | null }
// `reload`: read again now, e.g. right after the Account's own change, instead of on the next poll.
type Poll<T> = PollResult<T> & { reload: () => void }

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

function usePoll<T>(load: () => Promise<T[]>): Poll<T> {
  const [result, setResult] = useState<PollResult<T>>({ data: undefined, error: null })
  const reload = useRef(() => {})
  useEffect(() => {
    let generation = 0
    let pending = false
    let again = false
    let account: string | null | undefined
    async function poll() {
      if (account === undefined) return
      // A read already in flight may predate the change, so read once more after it.
      if (pending) { again = true; return }
      pending = true
      again = false
      const version = generation
      try {
        const data = await load()
        if (version === generation) setResult({ data, error: null })
      } catch (error) {
        if (version === generation) setResult({ data: undefined, error: error instanceof Error ? error.message : 'Could not load updates.' })
      } finally {
        if (version === generation) {
          pending = false
          if (again) poll()
        }
      }
    }
    reload.current = poll
    // Discard prior-account rows and in-flight reads whenever the signed-in account changes.
    const { data } = supabase.auth.onAuthStateChange((_, session) => {
      const next = session?.user.id ?? null
      if (account === next) return
      account = next
      generation++
      pending = false
      again = false
      setResult({ data: undefined, error: null })
      queueMicrotask(poll)
    })
    const timer = window.setInterval(poll, 3000)
    return () => {
      generation++
      account = undefined
      reload.current = () => {}
      data.subscription.unsubscribe()
      window.clearInterval(timer)
    }
  }, [load])
  return { ...result, reload: useCallback(() => reload.current(), []) }
}

export function useMyCheckIns() { return usePoll(myCheckIns) }
export async function submitCheckIn(caseId: string, status: CheckInStatus, description?: string) {
  await supabase.rpc('submit_check_in', {
    p_case_id: caseId, p_status: status, p_description: description ?? null,
  }).throwOnError()
}

type QueueRow = {
  id: string
  created_at: string
  persons: { name: string }
  incidents: { name: string }
  reports: { kind: 'cant_reach' | 'check_in'; body: { status?: CheckInStatus }; created_at: string }[]
  opening?: { note: string | null; reports: { original_text: string | null } | null }[]
  case_events: { action: 'claimed' | 'released' | 'resolved'; actor: string | null; created_at: string; outcome: CaseHistoryEntry['outcome'] }[]
}

// Looks up a Coordinator's name by Account id; one without a name, or no longer listed, is just "Coordinator".
async function coordinatorNames() {
  const { data } = await supabase.from('coordinators').select('account_id, name').throwOnError()
  const names = new Map(data.map(c => [c.account_id as string, c.name as string | null]))
  return (accountId: string | null) => accountId ? names.get(accountId)?.trim() || `Coordinator #${accountId.slice(0, 8)}` : 'Coordinator'
}

async function queue(): Promise<QueueCase[]> {
  const { data: coordinator } = await supabase.rpc('is_coordinator').throwOnError()
  if (!coordinator) throw new Error('A Coordinator account is required.')
  const rows = await readPages((from, to) => supabase.from('cases').select(
    'id, created_at, persons!inner(name), incidents!inner(name), reports(kind, body, created_at), case_events(action, actor, created_at, outcome), opening:case_events(note, reports(original_text))',
  ).in('reports.kind', ['check_in', 'cant_reach']).in('case_events.action', ['claimed', 'released', 'resolved']).eq('opening.action', 'opened')
    .order('created_at', { referencedTable: 'reports', ascending: false }).limit(1, { referencedTable: 'reports' })
    .order('created_at', { referencedTable: 'case_events', ascending: false })
    .order('id', { referencedTable: 'case_events', ascending: false })
    .order('created_at').order('id').range(from, to).returns<QueueRow[]>().throwOnError())
  const names = await coordinatorNames()
  const { data: { session } } = await supabase.auth.getSession()
  return orderQueue(rows.map(row => {
    const history: CaseHistoryEntry[] = row.reports.map(report => ({
      at: report.created_at, outcome: null,
      status: report.kind === 'cant_reach' ? 'cant_reach' : report.body.status ?? null,
    }))
    const resolutions = row.case_events.filter(e => e.action === 'resolved')
    for (const event of resolutions) history.push({ at: event.created_at, outcome: event.outcome, status: 'resolved' })
    const status = caseStatus(history)
    // Select ownership explicitly, even when embedded events arrive unfiltered or unordered.
    const at = status.status === 'resolved' ? resolutions[0]?.created_at : row.reports[0]?.created_at
    const assignment = row.case_events
      .filter(e => e.action === 'claimed' || e.action === 'released')
      .sort((a, b) => compareTimes(b.created_at, a.created_at))[0]
    const claim = assignment?.action === 'claimed' ? assignment : undefined
    const owner = claim ? names(claim.actor) : null
    const ownedByMe = !!claim?.actor && claim.actor === session?.user.id
    return {
      caseId: row.id, traveler: row.persons.name, incident: row.incidents.name, explanation: row.opening?.[0]?.note ?? undefined,
      itineraryText: row.opening?.[0]?.reports?.original_text ?? undefined,
      at: at ?? row.created_at, owner, ownedByMe, ...status,
    }
  }))
}

async function individualUpdates(): Promise<IndividualUpdate[]> {
  const data = await readPages(async (from, to) => {
    const { data } = await supabase.rpc('contact_case_updates')
      .select('case_id, person_name, status, outcome, at')
      .in('entry_kind', ['check_in', 'cant_reach', 'resolved']).not('status', 'is', null)
      .order('at').order('case_id').order('status').range(from, to).throwOnError()
    if (!Array.isArray(data)) throw new Error('Expected a list of Individual Updates.')
    return { data }
  })
  // submit_check_in writes the Report and its Notifications in one transaction, so they share a created_at.
  const unread = await readPages((from, to) => supabase.from('notifications').select('id, refers_to, created_at')
    .eq('kind', 'individual_update').is('read_at', null).order('created_at').order('id').range(from, to).throwOnError())
  const unreadIds = new Map(unread.map(n => [`${n.refers_to} ${n.created_at}`, n.id]))
  return data.reverse().map(entry => ({
    caseId: entry.case_id, traveler: entry.person_name, update: individualUpdateView(entry),
    unreadNotificationId: unreadIds.get(`${entry.case_id} ${entry.at}`) ?? null,
  }))
}

export async function markIndividualUpdatesRead(notificationIds: string[]) {
  await supabase.rpc('mark_notifications_read', { p_ids: notificationIds }).throwOnError()
}

export function useQueue() { return usePoll(queue) }

type Urgency = 'immediate' | 'urgent' | 'can_wait'
type CaseAction = 'opened' | 'check_in_request_sent' | 'urgency_proposed' | 'urgency_changed' | 'claimed' | 'released' | 'contact_attempt' | 'note' | 'resolved'

// One entry of a Case's history for a Coordinator. `text`: the traveler's own words or the Coordinator's note.
// `fromReport`: the id of the Report the entry came from.
export type CaseHistoryItem = {
  id: string
  at: string
  entry: 'check_in' | 'cant_reach' | CaseAction
  by: string
  status: CheckInStatus | null
  reached: boolean | null
  outcome: Outcome | null
  urgency: Urgency | null
  text: string | null
  fromReport: string | null
}

const reportSource: Record<string, string> = { emergency_contact: 'Emergency Contact', venue: 'Venue', device: 'Device' }

async function caseHistory(caseId: string): Promise<CaseHistoryItem[]> {
  type HistoryReport = { id: string; kind: 'check_in' | 'cant_reach'; source: string; created_at: string; original_text: string | null; body: { status?: CheckInStatus }; persons: { name: string } }
  type HistoryEvent = { id: string; action: CaseAction; actor: string | null; created_at: string; note: string | null; reached: boolean | null; outcome: Outcome | null; urgency: Urgency | null; source_report_id: string | null }
  const [reports, events, names] = await Promise.all([
    readPages((from, to) => supabase.from('reports').select('id, kind, source, created_at, original_text, body, persons!inner(name)')
      .eq('case_id', caseId).order('created_at').order('id').range(from, to).returns<HistoryReport[]>().throwOnError()),
    readPages((from, to) => supabase.from('case_events').select('id, action, actor, created_at, note, reached, outcome, urgency, source_report_id')
      .eq('case_id', caseId).order('created_at').order('id').range(from, to).returns<HistoryEvent[]>().throwOnError()),
    coordinatorNames(),
  ])
  const none = { status: null, reached: null, outcome: null, urgency: null, fromReport: null }
  const items: CaseHistoryItem[] = [
    ...reports.map(r => ({
      ...none, id: r.id, at: r.created_at, entry: r.kind, text: r.original_text, status: r.body.status ?? null,
      by: r.source === 'traveler' ? r.persons.name : reportSource[r.source] ?? r.source,
    })),
    ...events.map(e => ({
      id: e.id, at: e.created_at, entry: e.action, text: e.note, status: null,
      reached: e.reached, outcome: e.outcome, urgency: e.urgency, fromReport: e.source_report_id,
      // No actor: Together itself, or the AI for a proposed Urgency.
      by: e.actor ? names(e.actor) : e.action === 'urgency_proposed' ? 'AI' : 'Together',
    })),
  ]
  return items.sort((a, b) => compareTimes(b.at, a.at))
}

export function useCaseHistory(caseId: string) {
  return usePoll(useCallback(() => caseHistory(caseId), [caseId]))
}

// What a Coordinator can add to a Case. Each is a new history entry; nothing earlier changes.
// `fromReport`: the id of one of the Case's Reports that the entry follows up.
export type CoordinatorAction =
  | { action: 'claimed' | 'released' }
  | { action: 'contact_attempt'; reached: boolean; note: string; fromReport?: string }
  | { action: 'note'; note: string; fromReport?: string }
  | { action: 'resolved'; outcome: Outcome; note?: string; fromReport?: string }

export async function recordCaseEvent(caseId: string, event: CoordinatorAction) {
  await supabase.rpc('record_case_event', {
    p_case_id: caseId, p_action: event.action,
    p_note: 'note' in event ? event.note ?? null : null,
    p_reached: 'reached' in event ? event.reached : null,
    p_outcome: 'outcome' in event ? event.outcome : null,
    p_source_report_id: 'fromReport' in event ? event.fromReport ?? null : null,
  }).throwOnError()
}
export function useIndividualUpdates() { return usePoll(individualUpdates) }

export type PotentialIncident = {
  id: string; name: string; summary: string; starts_at: string; fallback: boolean
  sources: { name: string; text: string; quote: string }[]
  area: { type: 'Polygon'; coordinates: number[][][] }
}

async function pendingIncidents() {
  return readPages((from, to) => supabase.from('potential_incidents')
    .select('id,name,summary,starts_at,fallback,sources,area').is('incident_id', null)
    .order('starts_at').order('id').range(from, to).returns<PotentialIncident[]>().throwOnError())
}
export function usePendingIncidents() { return usePoll(pendingIncidents) }
export async function verifyIncident(id: string, start: string, end: string | null) {
  const { error } = await supabase.functions.invoke('potential-incident', { body: { action: 'verify', id, start, end } })
  if (error) throw error
}

async function latestIncident() {
  const { data } = await supabase.from('incidents').select('id,name,created_at')
    .order('created_at', { ascending: false }).limit(1).throwOnError()
  return data
}
export function useLatestIncident() { return usePoll(latestIncident) }
