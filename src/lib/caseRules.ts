// Case rules: plain functions with no database or network access, shared by Edge Functions and the UI.

export type Outcome = 'reached' | 'assistance_provided' | 'not_in_area'
export type Urgency = 'immediate' | 'urgent' | 'can_wait'

// One entry of a Case's history: what it says about the person, if anything.
// Same shape as a row of the contact_case_updates() database function.
export type CaseHistoryEntry = {
  at: string
  status: 'safe' | 'needs_assistance' | 'cant_reach' | 'resolved' | null
  outcome: Outcome | null
}

export type CaseStatus =
  | { status: 'unconfirmed' | 'safe' | 'needs_assistance' | 'cant_reach' }
  | { status: 'resolved'; outcome: Outcome }

// Date.parse handles offsets but discards the final three digits of a Postgres timestamp.
export function compareTimes(a: string, b: string) {
  const millis = Date.parse(a) - Date.parse(b)
  if (millis) return millis
  const fraction = (at: string) => (at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0')
  return fraction(a).localeCompare(fraction(b))
}

// Resolved wins, and a later resolution corrects an earlier one; otherwise the latest Check-in
// or Can't-reach report; otherwise Unconfirmed, so silence is never taken for Safe.
export function caseStatus(history: CaseHistoryEntry[]): CaseStatus {
  let resolved: CaseHistoryEntry | undefined
  for (const e of history) {
    if (e.status === 'resolved' && e.outcome && (!resolved || compareTimes(e.at, resolved.at) >= 0)) resolved = e
  }
  if (resolved) return { status: 'resolved', outcome: resolved.outcome! }
  let latest: { at: string; status: 'safe' | 'needs_assistance' | 'cant_reach' } | undefined
  for (const { at, status } of history) {
    if (status && status !== 'resolved' && (!latest || compareTimes(at, latest.at) >= 0)) latest = { at, status }
  }
  return { status: latest?.status ?? 'unconfirmed' }
}

// An Urgency entry of a Case's history. `note`: the AI's quote from the traveler, on a proposal.
export type UrgencyEntry = {
  action: 'urgency_proposed' | 'urgency_changed'; at: string; urgency: Urgency | null; note: string | null; fromReport: string | null
}

// The Urgency of a Case's latest Needs assistance Check-in: the latest Coordinator change made since it,
// otherwise the AI's proposal for it, otherwise Untriaged. `quote`: what the proposal quoted.
export function caseUrgency(checkIn: { id: string; at: string }, entries: readonly UrgencyEntry[]) {
  const latest = (action: UrgencyEntry['action'], counts: (e: UrgencyEntry) => boolean) => entries
    .filter(e => e.action === action && counts(e)).sort((a, b) => compareTimes(b.at, a.at))[0]
  const change = latest('urgency_changed', e => compareTimes(e.at, checkIn.at) >= 0)
  const proposal = latest('urgency_proposed', e => e.fromReport === checkIn.id)
  const quote = proposal?.urgency ? proposal.note : null
  return { urgency: change?.urgency ?? proposal?.urgency ?? 'untriaged' as const, quote, changed: !!change }
}

const queuePriority: Record<CaseStatus['status'], number> = {
  needs_assistance: 0, cant_reach: 1, unconfirmed: 2, safe: 3, resolved: 4,
}

// Untriaged first: nobody has judged how soon it needs acting on.
const urgencyPriority: Record<Urgency | 'untriaged', number> = { untriaged: 0, immediate: 1, urgent: 2, can_wait: 3 }

export function orderQueue<T extends { status: CaseStatus['status']; urgency?: Urgency | 'untriaged' }>(cases: T[]) {
  const urgency = (c: T) => c.status === 'needs_assistance' ? urgencyPriority[c.urgency ?? 'untriaged'] : 0
  return [...cases].sort((a, b) => queuePriority[a.status] - queuePriority[b.status] || urgency(a) - urgency(b))
}

type StatusUpdate = { status: NonNullable<CaseHistoryEntry['status']>; at: string; outcome?: Outcome }
type UrgencyUpdate = { urgency: Urgency; at: string }

// Status, time and a resolution's outcome, or an Urgency and time. Never notes, the AI's quote or the traveler's own words.
export function individualUpdateView(entry: { status: CaseHistoryEntry['status']; at: string; outcome?: Outcome | null; urgency?: Urgency | null }):
  StatusUpdate | UrgencyUpdate {
  if (!entry.status && entry.urgency) return { urgency: entry.urgency, at: entry.at }
  if (!entry.status) throw new Error('An Individual Update needs a status or an Urgency.')
  return entry.status === 'resolved' && entry.outcome ? { status: entry.status, at: entry.at, outcome: entry.outcome } : { status: entry.status, at: entry.at }
}
