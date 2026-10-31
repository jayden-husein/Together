// Case rules: plain functions with no database or network access, shared by Edge Functions and the UI.

export type Outcome = 'reached' | 'assistance_provided' | 'not_in_area'

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

const queuePriority: Record<CaseStatus['status'], number> = {
  needs_assistance: 0, cant_reach: 1, unconfirmed: 2, safe: 3, resolved: 4,
}

export function orderQueue<T extends { status: CaseStatus['status'] }>(cases: T[]) {
  return [...cases].sort((a, b) => queuePriority[a.status] - queuePriority[b.status])
}

// Status, time and a resolution's outcome. Never notes or the traveler's own words.
export function individualUpdateView(entry: { status: NonNullable<CaseHistoryEntry['status']>; at: string; outcome?: Outcome | null }):
  { status: NonNullable<CaseHistoryEntry['status']>; at: string; outcome?: Outcome } {
  return entry.status === 'resolved' && entry.outcome ? { status: entry.status, at: entry.at, outcome: entry.outcome } : { status: entry.status, at: entry.at }
}
