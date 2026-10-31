import { useEffect, useRef, useSyncExternalStore } from 'react'
import { SimulationLabel } from './ui'
import Coordinator from './views/Coordinator'
import EmergencyContact from './views/EmergencyContact'
import PublicIncident from './views/PublicIncident'
import Traveler from './views/Traveler'

// Hash routing: no server rewrites needed on Vercel. The first route is the fallback.
const ROUTES = [
  { hash: '#/', label: 'Incident', View: PublicIncident },
  { hash: '#/traveler', label: 'Traveler', View: Traveler },
  { hash: '#/contact', label: 'Emergency Contact', View: EmergencyContact },
  { hash: '#/coordinator', label: 'Coordinator', View: Coordinator },
]

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export default function App() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const route = ROUTES.find(r => r.hash === hash) ?? ROUTES[0]
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // A hash change resets nothing for assistive tech: retitle the page and move focus to the new view.
  useEffect(() => {
    document.title = `${route.label} – Together`
    if (firstRender.current) firstRender.current = false
    else main.current?.focus()
  }, [route])

  return (
    <div className="shell">
      <header className="app-header">
        <a className="wordmark" href="#/">Together</a>
        <SimulationLabel />
        <nav aria-label="Views">
          {ROUTES.map(r => (
            <a key={r.hash} href={r.hash} aria-current={r === route ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main ref={main} tabIndex={-1}>
        <route.View />
      </main>
    </div>
  )
}
