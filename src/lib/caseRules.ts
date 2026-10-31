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
function compareTimes(a: string, b: string) {
  const millis = Date.parse(a) - Date.parse(b)
  if (millis) return millis
  const fraction = (at: string) => (at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0')
  return fraction(a).localeCompare(fraction(b))
}

// Resolved wins; otherwise the latest Check-in or Can't-reach report; otherwise Unconfirmed,
// so silence is never taken for Safe.
export function caseStatus(history: CaseHistoryEntry[]): CaseStatus {
  const resolved = history.find((e) => e.status === 'resolved' && e.outcome)
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

export function individualUpdateView(entry: { status: NonNullable<CaseHistoryEntry['status']>; at: string }) {
  return { status: entry.status, at: entry.at }
}
