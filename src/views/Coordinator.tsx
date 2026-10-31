import { useQueue } from '../lib/checkIns'
import { queueOrder } from '../lib/caseRules'
import { StatusBadge, statusClass } from '../ui'
import { Account } from './Account'

function Queue() {
  const { data, error } = useQueue()
  return <>{error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading Cases…</p>}
    {data && <><ul className="summary" aria-label="Cases by status">{queueOrder.map(s =>
      <li key={s}><span className="summary-count">{data.filter(c => c.status === s).length}</span><StatusBadge status={s}/></li>
    )}</ul>{!data.length && <p>No Cases yet.</p>}
    <ul className="rows" aria-label="Case queue">{data.map(c => <li key={c.id} className={`row ${statusClass(c.status)}`}>
      <div className="row-main"><span className="row-name">{c.name}</span><StatusBadge status={c.status}/></div>
      <p className="source-line">{c.incident}</p>
    </li>)}</ul></>}</>
}
export default function Coordinator() {
  return <div className="coordinator"><header className="view-header"><h1>Cases</h1></header>
    <Account><Queue /></Account></div>
}
