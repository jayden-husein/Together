import { useIndividualUpdates } from '../lib/checkIns'
import { SourceLine, StatusBadge } from '../ui'
import { Account } from './Account'

function Updates() {
  const {data, error} = useIndividualUpdates()
  return <>{error && <p role="alert">{error}</p>}{!data && !error && <p>Loading updates…</p>}
    {data?.length === 0 && <p>No Individual Updates yet.</p>}
    <ul className="rows">{data?.map((u, i) => <li key={`${u.caseId}-${u.at}-${i}`} className="row">
      <div className="row-main"><span className="row-name">{u.name}</span>{u.status && <StatusBadge status={u.status}/>}</div>
      <SourceLine source="Individual Update" at={u.at}/></li>)}</ul></>
}
export default function EmergencyContact() {
  return <div className="column"><header className="view-header"><h1>Travelers who named you</h1>
    <p className="lede">You get an Individual Update when their Case changes.</p></header>
    <Account><Updates /></Account></div>
}
