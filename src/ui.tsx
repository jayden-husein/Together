import './ui.css'

// Shared UI. Every view uses these instead of its own badge, button or label; styles are in ui.css, values in tokens.css.

export type CaseStatus = 'unconfirmed' | 'cant_reach' | 'needs_assistance' | 'safe' | 'resolved'
export type Urgency = 'immediate' | 'urgent' | 'can_wait' | 'untriaged'
export type CheckInStatus = 'safe' | 'needs_assistance'

export const STATUS_LABEL: Record<CaseStatus, string> = {
  unconfirmed: 'Unconfirmed',
  cant_reach: "Can't reach",
  needs_assistance: 'Needs assistance',
  safe: 'Safe',
  resolved: 'Resolved',
}

export const URGENCY_LABEL: Record<Urgency, string> = {
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

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}

export function UrgencyTag({ urgency }: { urgency: Urgency }) {
  return <span className={`tag tag-${urgency}`}>{URGENCY_LABEL[urgency]}</span>
}

export function CheckInButtons({ onCheckIn }: { onCheckIn: (status: CheckInStatus) => void }) {
  return (
    <div className="check-in" role="group" aria-label="Check in">
      <button type="button" className="check-in-button check-in-safe" onClick={() => onCheckIn('safe')}>
        Safe
      </button>
      <button type="button" className="check-in-button check-in-needs" onClick={() => onCheckIn('needs_assistance')}>
        Needs assistance
      </button>
    </div>
  )
}

const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Where a piece of information came from and when: for Resources, Reports and Case history. */
export function SourceLine({ source, at }: { source: string; at: string }) {
  return (
    <p className="source-line">
      {source}, <time dateTime={at}>{timeFormat.format(new Date(at))}</time>
    </p>
  )
}
