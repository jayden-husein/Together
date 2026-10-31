// Public contract for the three signed-in screens: the Check-in loop (#7) and the Coordinator Case workflow (#8).
import { useCallback, useEffect, useRef, useState } from 'react'
import { caseStatus, caseUrgency, compareTimes, individualUpdateView, orderQueue, type CaseHistoryEntry, type CaseStatus, type Outcome, type Urgency, type UrgencyEntry } from './caseRules'
import { withdraws, type Stop } from '../../supabase/functions/_shared/itinerary'
import { supabase } from './supabase'

export type CheckInStatus = 'safe' | 'needs_assistance'
export type CheckInReport = { id: string; status: CheckInStatus; description: string | null; at: string }
export type CheckInRequest = { caseId: string; incident: string; reports: CheckInReport[] }
// `at`: when the status was set (the latest Report or resolution), else when the Case opened.
// `owner`: the Coordinator with the latest claim, if any; `ownedByMe`: that claim is the signed-in Account's.
// `itineraryText`: what the traveler pasted for the Itinerary that opened the Case, if anything.
// `correction`: set when that Itinerary was since superseded: its stops (`old`) and those of the Itinerary in force now (`new`).
// `withdrawn`: the latest Correction had no stops still to come.
// For Needs assistance: `urgency` (Case rules), `urgencyQuote` the AI's quote behind its proposal, `urgencyChanged` a Coordinator set it.
export type QueueCase = {
<<<<<<< Updated upstream
  caseId: string; traveler: string; incident: string; explanation?: string; itineraryText?: string; at: string; owner: string | null; ownedByMe: boolean
  correction?: { withdrawn: boolean; old: Stop[]; new: Stop[] }
  urgency?: Urgency | 'untriaged'; urgencyQuote?: string | null; urgencyChanged?: boolean
=======
  caseId: string; incidentId?: string; incidentResolvedAt?: string | null; traveler: string; incident: string; explanation?: string; itineraryText?: string; at: string; owner: string | null; ownedByMe: boolean
>>>>>>> Stashed changes
} & CaseStatus
export type IndividualUpdate = {
  caseId: string
  traveler: string
  update: ReturnType<typeof individualUpdateView>
  // The Notification that delivered this update, while the contact hasn't seen it.
  unreadNotificationId: string | null
}

export type ContactUpdate = IndividualUpdate
// A Case of a traveler who named the signed-in Account as an Emergency Contact.
export type ContactCase = { caseId: string; traveler: string; incident: string } & CaseStatus

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
    const { data } = await supabase.from('cases').select('id, incidents!inner(name)').in('id', batch).is('incidents.resolved_at', null)
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

// A confirmed Itinerary of the signed-in traveler. `at`: when it was confirmed; `originalText`: the plans they pasted, if any;
// `supersedes`: the Itinerary this one corrects, if it is a Correction.
export type ConfirmedItinerary = { id: string; at: string; stops: Stop[]; originalText: string | null; supersedes: string | null }

async function myItineraries(): Promise<ConfirmedItinerary[]> {
  // Coordinators may read other travelers' Reports too, so keep only the signed-in Account's own Person.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const rows = await readPages((from, to) => supabase.from('reports')
    .select('id, created_at, original_text, body, supersedes, persons!inner(account_id)').eq('kind', 'itinerary').eq('persons.account_id', session.user.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    .returns<{ id: string; created_at: string; original_text: string | null; body: { stops: Stop[] }; supersedes: string | null }[]>().throwOnError())
  return rows.map(row => ({ id: row.id, at: row.created_at, stops: row.body.stops, originalText: row.original_text, supersedes: row.supersedes }))
}

export function useMyItineraries() { return usePoll(myItineraries) }
export class AlreadyCorrectedError extends Error {}
// `id`: an idempotency key, so a retried confirm stores one Itinerary. `supersedes`: the Itinerary a Correction replaces.
export async function confirmItinerary(body: { id: string; stops: Stop[]; originalText: string | null; supersedes?: string }) {
  const { error } = await supabase.functions.invoke('confirm-itinerary', { body })
  if (!error) return
  if (error.context instanceof Response && (await error.context.json().catch(() => null))?.code === 'already_corrected') throw new AlreadyCorrectedError()
  throw error
}
export async function submitCheckIn(caseId: string, status: CheckInStatus, description?: string) {
  await supabase.rpc('submit_check_in', {
    p_case_id: caseId, p_status: status, p_description: description ?? null,
  }).throwOnError()
  // The Check-in is saved either way; until the AI proposes an Urgency, or if it can't, the Case is Untriaged.
  if (status === 'needs_assistance') void supabase.functions.invoke('triage-check-in', { body: { caseId } })
}

type QueueRow = {
  id: string
  incident_id: string
  created_at: string
  persons: { name: string }
<<<<<<< Updated upstream
  incidents: { name: string }
  reports: { id: string; kind: 'cant_reach' | 'check_in'; body: { status?: CheckInStatus }; created_at: string }[]
  opening?: { note: string | null; reports: { id: string; original_text: string | null; body: { stops: Stop[] } } | null }[]
  case_events: {
    action: 'claimed' | 'released' | 'resolved' | UrgencyEntry['action']; actor: string | null; created_at: string; outcome: CaseHistoryEntry['outcome']
    urgency: Urgency | null; note: string | null; source_report_id: string | null
  }[]
=======
  incidents: { name: string; resolved_at?: string | null }
  reports: { kind: 'cant_reach' | 'check_in'; body: { status?: CheckInStatus }; created_at: string }[]
  opening?: { note: string | null; reports: { original_text: string | null } | null }[]
  case_events: { action: 'claimed' | 'released' | 'resolved'; actor: string | null; created_at: string; outcome: CaseHistoryEntry['outcome'] }[]
>>>>>>> Stashed changes
}

// Looks up a Coordinator's name by Account id; one without a name, or no longer listed, is just "Coordinator".
async function coordinatorNames() {
  const { data } = await supabase.from('coordinators').select('account_id, name').throwOnError()
  const names = new Map(data.map(c => [c.account_id as string, c.name as string | null]))
  return (accountId: string | null) => accountId ? names.get(accountId)?.trim() || `Coordinator #${accountId.slice(0, 8)}` : 'Coordinator'
}

<<<<<<< Updated upstream
type CorrectionRow = { id: string; supersedes: string; created_at: string; body: { stops: Stop[] } }
// The Itinerary now in force for each superseded opening Itinerary, following chains of Corrections.
// ponytail: one `in` list per chain step; batch the ids if the open-Case count outgrows a URL.
async function latestCorrections(openingIds: string[]) {
  const latest = new Map<string, CorrectionRow>()
  let frontier = new Map(openingIds.map(id => [id, id]))
  while (frontier.size) {
    const { data } = await supabase.from('reports').select('id, supersedes, created_at, body').in('supersedes', [...frontier.keys()])
      .returns<CorrectionRow[]>().throwOnError()
    const next = new Map<string, string>()
    for (const row of data) {
      const opening = frontier.get(row.supersedes)!
      latest.set(opening, row)
      next.set(row.id, opening)
    }
    frontier = next
  }
  return latest
}

async function queue(): Promise<QueueCase[]> {
  const { data: coordinator } = await supabase.rpc('is_coordinator').throwOnError()
  if (!coordinator) throw new Error('A Coordinator account is required.')
  const rows = await readPages((from, to) => supabase.from('cases').select(
    'id, created_at, persons!inner(name), incidents!inner(name), reports(id, kind, body, created_at), case_events(action, actor, created_at, outcome, urgency, note, source_report_id), opening:case_events(note, reports(id, original_text, body))',
  ).in('reports.kind', ['check_in', 'cant_reach']).in('case_events.action', ['claimed', 'released', 'resolved', 'urgency_proposed', 'urgency_changed']).eq('opening.action', 'opened')
=======
async function queue(includeResolvedIncidents = false): Promise<QueueCase[]> {
  const { data: coordinator } = await supabase.rpc('is_coordinator').throwOnError()
  if (!coordinator) throw new Error('A Coordinator account is required.')
  const rows = await readPages((from, to) => {
    let query = supabase.from('cases').select(
    'id, incident_id, created_at, persons!inner(name), incidents!inner(name,resolved_at), reports(kind, body, created_at), case_events(action, actor, created_at, outcome), opening:case_events(note, reports(original_text))',
  ).in('reports.kind', ['check_in', 'cant_reach']).in('case_events.action', ['claimed', 'released', 'resolved']).eq('opening.action', 'opened')
>>>>>>> Stashed changes
    .order('created_at', { referencedTable: 'reports', ascending: false }).limit(1, { referencedTable: 'reports' })
    .order('created_at', { referencedTable: 'case_events', ascending: false })
    .order('id', { referencedTable: 'case_events', ascending: false })
    .order('created_at').order('id').range(from, to)
    if (!includeResolvedIncidents) query = query.is('incidents.resolved_at', null)
    return query.returns<QueueRow[]>().throwOnError()
  })
  const names = await coordinatorNames()
  const { data: { session } } = await supabase.auth.getSession()
  const latest = await latestCorrections(rows.flatMap(row => row.opening?.[0]?.reports?.id ?? []))
  return orderQueue(rows.map(row => {
    const opening = row.opening?.[0]?.reports
    const inForce = opening && latest.get(opening.id)
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
    // Needs assistance is set by the latest Report, which is that Check-in.
    const checkIn = status.status === 'needs_assistance' ? row.reports[0] : undefined
    const triage = checkIn && caseUrgency({ id: checkIn.id, at: checkIn.created_at }, row.case_events.flatMap(e =>
      e.action === 'urgency_proposed' || e.action === 'urgency_changed'
        ? [{ action: e.action, at: e.created_at, urgency: e.urgency, note: e.note, fromReport: e.source_report_id }] : []))
    return {
<<<<<<< Updated upstream
      caseId: row.id, traveler: row.persons.name, incident: row.incidents.name, explanation: row.opening?.[0]?.note ?? undefined,
      itineraryText: opening?.original_text ?? undefined,
      correction: inForce ? {
        old: opening.body.stops, new: inForce.body.stops,
        withdrawn: withdraws(inForce.body.stops, Date.parse(inForce.created_at)),
      } : undefined,
=======
      caseId: row.id, incidentId: row.incident_id, incidentResolvedAt: row.incidents.resolved_at, traveler: row.persons.name, incident: row.incidents.name, explanation: row.opening?.[0]?.note ?? undefined,
      itineraryText: row.opening?.[0]?.reports?.original_text ?? undefined,
>>>>>>> Stashed changes
      at: at ?? row.created_at, owner, ownedByMe, ...status,
      ...(triage && { urgency: triage.urgency, urgencyQuote: triage.quote, urgencyChanged: triage.changed }),
    }
  }))
}

async function individualUpdates(): Promise<IndividualUpdate[]> {
  const data = await readPages(async (from, to) => {
    const { data } = await supabase.rpc('contact_case_updates')
      .select('case_id, person_name, status, urgency, outcome, at')
      .in('entry_kind', ['check_in', 'cant_reach', 'resolved', 'urgency_proposed', 'urgency_changed'])
      // An Untriaged proposal tells the contact nothing.
      .or('status.not.is.null,urgency.not.is.null')
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

async function contactCases(): Promise<ContactCase[]> {
  type Row = { case_id: string; incident_id: string; person_name: string } & CaseHistoryEntry
  const rows = await readPages(async (from, to) => {
    const { data } = await supabase.rpc('contact_case_updates')
      .select('case_id, incident_id, person_name, status, outcome, at')
      .in('entry_kind', ['opened', 'check_in', 'cant_reach', 'resolved'])
      .order('at').order('case_id').order('entry_kind').range(from, to).throwOnError()
    if (!Array.isArray(data)) throw new Error('Expected a list of Cases.')
    return { data: data as Row[] }
  })
  const incidentIds = [...new Set(rows.map(r => r.incident_id))]
  const { data: incidents } = await supabase.from('incidents').select('id, name').in('id', incidentIds).throwOnError()
  const names = new Map(incidents.map(i => [i.id as string, i.name as string]))
  const byCase = new Map<string, Row[]>()
  for (const row of rows) byCase.set(row.case_id, [...byCase.get(row.case_id) ?? [], row])
  return [...byCase.values()].map(entries => ({
    caseId: entries[0].case_id, traveler: entries[0].person_name, incident: names.get(entries[0].incident_id) ?? 'Incident',
    ...caseStatus(entries),
  })).reverse()
}

export function useContactCases() { return usePoll(contactCases) }
// Refused by the database unless the signed-in Account is an Emergency Contact of the Case's traveler.
export async function fileCantReach(caseId: string) {
  await supabase.rpc('file_cant_reach', { p_case_id: caseId }).throwOnError()
}

export async function markIndividualUpdatesRead(notificationIds: string[]) {
  await supabase.rpc('mark_notifications_read', { p_ids: notificationIds }).throwOnError()
}

export function useQueue(includeResolvedIncidents = false) {
  return usePoll(useCallback(() => queue(includeResolvedIncidents), [includeResolvedIncidents]))
}

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
  type HistoryReport = { id: string; kind: 'check_in' | 'cant_reach'; source: string; created_at: string; original_text: string | null; body: { status?: CheckInStatus; filed_by?: string }; persons: { name: string } }
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
      // A Can't-reach report names the Emergency Contact who filed it.
      by: r.source === 'traveler' ? r.persons.name : [reportSource[r.source] ?? r.source, r.body.filed_by].filter(Boolean).join(' '),
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
  | { action: 'urgency_changed'; urgency: Urgency; note?: string }

export async function recordCaseEvent(caseId: string, event: CoordinatorAction) {
  await supabase.rpc('record_case_event', {
    p_case_id: caseId, p_action: event.action,
    p_note: 'note' in event ? event.note ?? null : null,
    p_reached: 'reached' in event ? event.reached : null,
    p_outcome: 'outcome' in event ? event.outcome : null,
    p_source_report_id: 'fromReport' in event ? event.fromReport ?? null : null,
    p_urgency: 'urgency' in event ? event.urgency : null,
  }).throwOnError()
}
export function useIndividualUpdates() { return usePoll(individualUpdates) }

export type Dismissal = { dismissed_at: string; dismissal_reason: string; dismisser: { name: string | null } | null }
const dismissal = 'dismissed_at,dismissal_reason,dismisser:dismissed_by(name)'

export type PotentialIncident = {
  id: string; name: string; summary: string; starts_at: string; fallback: boolean; corroborated: boolean
  sources: { name: string; text: string; quote: string; at: string }[]
  area: { type: 'Polygon'; coordinates: number[][][] }
  earlier: Dismissal | null
}

async function pendingIncidents() {
  return readPages((from, to) => supabase.from('potential_incidents')
    .select(`id,name,summary,starts_at,fallback,corroborated,sources,area,earlier:earlier_dismissal_id(${dismissal})`)
    .is('incident_id', null).is('dismissed_at', null)
    .order('starts_at').order('id').range(from, to).returns<PotentialIncident[]>().throwOnError())
}
export function usePendingIncidents() { return usePoll(pendingIncidents) }
export { verifyIncident } from './incidentVerification'
async function dismissedIncidents() {
  return readPages((from, to) => supabase.from('potential_incidents').select(`id,name,${dismissal}`).not('dismissed_at', 'is', null)
    .order('dismissed_at', { ascending: false }).order('id').range(from, to).returns<({ id: string; name: string } & Dismissal)[]>().throwOnError())
}
export function useDismissedIncidents() { return usePoll(dismissedIncidents) }
export async function dismissPotentialIncident(id: string, reason: string) {
  await supabase.rpc('dismiss_potential_incident', { p_id: id, p_reason: reason }).throwOnError()
}

export type PublicIncident = {
  id: string; name: string; created_at: string; starts_at: string; ends_at: string | null; resolved_at?: string | null
  area: { type: 'Polygon'; coordinates: number[][][] }
}
async function publicIncidents() {
  return readPages((from, to) => supabase.from('incidents').select('id,name,created_at,starts_at,ends_at,area,resolved_at')
    .order('created_at', { ascending: false }).order('id').range(from, to).returns<PublicIncident[]>().throwOnError())
}
export function useIncidents() { return usePoll(publicIncidents) }


async function coordinatorIncidentCases() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data: coordinator } = await supabase.rpc('is_coordinator').throwOnError()
  return coordinator ? [{ cases: await queue(true) }] : []
}
export function useCoordinatorIncidentCases() { return usePoll(coordinatorIncidentCases) }
export async function resolveIncident(id: string) {
  await supabase.rpc('resolve_incident', { p_incident: id }).throwOnError()
}
