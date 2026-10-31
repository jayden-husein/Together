// Public contract for the three signed-in screens in #7.
import type { CaseStatus } from './caseRules'

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

export async function submitCheckIn(_caseId: string, _status: CheckInStatus, _description?: string): Promise<void> {}
export function useMyCheckIns(): PollResult<CheckInRequest> {
  return { data: [{ caseId: 'example', incident: 'Example Incident', reports: [] }], error: null }
}
export function useQueue(): PollResult<QueueCase> {
  return { data: [{ caseId: 'example', traveler: 'Maya', incident: 'Example Incident', status: 'unconfirmed' }], error: null }
}
export function useIndividualUpdates(): PollResult<ContactUpdate> {
  return { data: [], error: null }
}
