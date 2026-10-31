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

// Resolved wins; otherwise the latest Check-in or Can't-reach report; otherwise Unconfirmed,
// so silence is never taken for Safe.
export function caseStatus(history: CaseHistoryEntry[]): CaseStatus {
  const resolved = history.find((e) => e.status === 'resolved' && e.outcome)
  if (resolved) return { status: 'resolved', outcome: resolved.outcome! }
  let latest: { at: string; status: 'safe' | 'needs_assistance' | 'cant_reach' } | undefined
  for (const { at, status } of history) {
    if (status && status !== 'resolved' && (!latest || Date.parse(at) >= Date.parse(latest.at))) latest = { at, status }
  }
  return { status: latest?.status ?? 'unconfirmed' }
}

export const queueOrder = ['needs_assistance', 'cant_reach', 'unconfirmed', 'safe', 'resolved'] as const

export function orderQueue<T extends { status: CaseStatus['status'] }>(rows: T[]) {
  return [...rows].sort((a, b) => queueOrder.indexOf(a.status) - queueOrder.indexOf(b.status))
}

export function individualUpdateView(entry: CaseHistoryEntry) {
  return { status: entry.status, at: entry.at }
}
