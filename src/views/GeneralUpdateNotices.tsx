import { useEffect, useState } from 'react'
import { type GeneralUpdateNotice, markNotificationsRead, useGeneralUpdateNotices } from '../lib/checkIns'
import { SourceLine } from '../ui'

// New General Updates about the signed-in Account's Incidents. Each is marked read at once but stays shown,
// marked New, until the Account leaves the page; all General Updates are on the public incident page.
export default function GeneralUpdateNotices() {
  const { data } = useGeneralUpdateNotices()
  const [shown, setShown] = useState<GeneralUpdateNotice[]>([])
  useEffect(() => {
    const arrived = data?.filter(n => !shown.some(s => s.notificationId === n.notificationId)) ?? []
    if (!arrived.length) return
    setShown(prev => [...arrived, ...prev])
    // On failure they stay unread, and the next poll tries again.
    markNotificationsRead(arrived.map(n => n.notificationId)).catch(() => {})
  }, [data, shown])
  if (!shown.length) return null
  return (
    <section className="panel" aria-labelledby="notices-heading">
      <h2 id="notices-heading">General Updates</h2>
      <ul className="rows" aria-label="New General Updates">
        {shown.map(n => <li className="row" key={n.notificationId}>
          <div className="row-main"><span className="row-name">{n.incident}</span><span className="new">New</span></div>
          <p>{n.body}</p>
          <SourceLine source="General Update" at={n.at} />
        </li>)}
      </ul>
      <p><a href="#/">See every General Update on the public incident page</a></p>
    </section>
  )
}
