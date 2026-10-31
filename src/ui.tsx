import type { Outcome } from './lib/caseRules'
import './ui.css'

// Shared UI. Every view uses these instead of its own badge, button or label; styles are in ui.css, values in tokens.css.

export type CaseStatus = 'unconfirmed' | 'cant_reach' | 'needs_assistance' | 'safe' | 'resolved'
export type Urgency = 'immediate' | 'urgent' | 'can_wait' | 'untriaged'
export type CheckInStatus = Extract<CaseStatus, 'safe' | 'needs_assistance'>
export type { Outcome }

const STATUS_LABEL: Record<CaseStatus, string> = {
  unconfirmed: 'Unconfirmed',
  cant_reach: "Can't reach",
  needs_assistance: 'Needs assistance',
  safe: 'Safe',
  resolved: 'Resolved',
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  reached: 'Reached',
  assistance_provided: 'Assistance provided',
  not_in_area: 'Not in area',
}

const URGENCY_LABEL: Record<Urgency, string> = {
  immediate: 'Immediate',
  urgent: 'Urgent',
  can_wait: 'Can wait',
  untriaged: 'Untriaged',
}

/** Marks synthetic data. Put it wherever demo data shows; the app shell already shows one in the header. */
export function SimulationLabel() {
  return (
    <span className="simulation" title="Everything shown is synthetic demo data">
      Simulation
    </span>
  )
}

/** `status-<status>` sets that status's colors (ui.css). Put it on anything tinted by a status, such as a Case row. */
export const statusClass = (status: CaseStatus) => `status-${status}`

/** A resolved Case's badge names its outcome when given one. */
export function StatusBadge({ status, outcome }: { status: CaseStatus; outcome?: Outcome }) {
  const label = STATUS_LABEL[status]
  return <span className={`badge ${statusClass(status)}`}>{outcome ? `${label}: ${OUTCOME_LABEL[outcome]}` : label}</span>
}

export function UrgencyTag({ urgency }: { urgency: Urgency }) {
  return <span className={`tag tag-${urgency}`}>{URGENCY_LABEL[urgency]}</span>
}

export function CheckInButtons({ onCheckIn }: { onCheckIn: (status: CheckInStatus) => void }) {
  return (
    <div className="check-in" role="group" aria-label="Check in">
      <button type="button" className="check-in-button check-in-safe" onClick={() => onCheckIn('safe')}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        Safe
      </button>
      <button type="button" className="check-in-button check-in-needs-assistance" onClick={() => onCheckIn('needs_assistance')}>
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </svg>
        Needs assistance
      </button>
    </div>
  )
}

// Date and zone included: a Case's Reports can span days, and Coordinators may sit in another zone.
const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** `at` (ISO 8601) as SourceLine shows it; unparseable input comes back as is. */
export function formatTime(at: string) {
  const date = new Date(at)
  return isNaN(date.getTime()) ? at : timeFormat.format(date)
}

/** Where a piece of information came from and when: for Resources, Reports and a Case's Reports. `at` is ISO 8601. */
export function SourceLine({ source, at }: { source: string; at: string }) {
  return (
    <p className="source-line">
      {source}, <time dateTime={at}>{formatTime(at)}</time>
    </p>
  )
}
