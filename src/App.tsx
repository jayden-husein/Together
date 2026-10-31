import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AccountProvider, SignInForm, SignedIn, useAccount } from './SignIn'
import { Toasts } from './components'
import { homeRoute, mayOpen } from './lib/access'
import { SimulationLabel } from './ui'
import Coordinator from './views/Coordinator'
import EmergencyContact from './views/EmergencyContact'
import PublicIncident from './views/PublicIncident'
import Traveler from './views/Traveler'

// Hash routing: no server rewrites needed on Vercel. The first route is the fallback; only it needs no sign-in.
const ROUTES = [
  { hash: '#/', label: 'Incident', View: PublicIncident, signIn: false },
  { hash: '#/traveler', label: 'Traveler', View: Traveler, signIn: true },
  { hash: '#/contact', label: 'Emergency Contact', View: EmergencyContact, signIn: true },
  { hash: '#/coordinator', label: 'Coordinator', View: Coordinator, signIn: true },
]

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export default function App() { return <AccountProvider><AppShell /></AccountProvider> }

function AppShell() {
  const account = useAccount()
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const route = ROUTES.find(r => r.hash === hash) ?? ROUTES[0]
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // A hash change resets nothing for assistive tech: retitle the page and move focus to the new view.
  useEffect(() => {
    document.title = `${route.label} – Together`
    // On a phone the nav scrolls sideways; keep the current view's link in sight.
    document.querySelector('nav [aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    if (firstRender.current) firstRender.current = false
    else main.current?.focus()
  }, [route])

  return (
    <div className="shell"><a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <a className="wordmark" href="#/">
          <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="10.5" cy="14" r="7.5" />
            <circle cx="17.5" cy="14" r="7.5" />
          </svg>
          Together
        </a>
        <SimulationLabel />
        <nav aria-label="Views">
          {ROUTES.map(r => (
            <a key={r.hash} href={r.hash} aria-current={r === route ? 'page' : undefined}>
              {r.label}{account.capabilities && !mayOpen(r.hash, account.capabilities) && <span aria-label="Not available for your account"> ♧</span>}
            </a>
          ))}
        </nav>
        <div className="auth-controls">{account.session ? <><details className="account-menu"><summary aria-label="Account menu">{account.capabilities?.name || account.session.user.email?.split('@')[0]}</summary><div className="panel"><strong>{account.capabilities?.name}</strong><span>{account.session.user.email}</span><span>{account.capabilities?.isCoordinator ? 'Coordinator' : [account.capabilities?.isTraveler && 'Traveler', account.capabilities?.isEmergencyContact && 'Emergency Contact'].filter(Boolean).join(' and ') || 'Traveler'}</span><a href="#/account">My account</a><a href="#/help">Help</a><button className="button" onClick={account.signOut}>Sign out</button></div></details><button className="link-button wide-logout" onClick={account.signOut}>Log out</button></> : <a className="button primary" href="#/signin">Sign in</a>}</div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        {hash === '#/signin' ? <SignInForm /> : route.signIn ? <SignedIn>{account.capabilities && !mayOpen(route.hash, account.capabilities) ? <AccessWarning /> : <route.View />}</SignedIn> : <route.View />}
      </main>
      <Toasts />
    </div>
  )
}

function AccessWarning() {
  const { capabilities } = useAccount()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const coordinator = capabilities?.isCoordinator
  return <section className="panel access-warning" role="alert" tabIndex={-1} ref={ref}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z" /></svg>
    <h1>{coordinator ? "Coordinator accounts can't use this page" : 'Coordinator access required'}</h1>
    <p>{coordinator ? "Coordinators manage cases and can't be travelers or emergency contacts. Use a separate traveler account to test this view." : 'This page is only for Coordinators. Your account can use the Traveler and Emergency Contact pages.'}</p>
    <a className="button primary" href={capabilities ? homeRoute(capabilities) : '#/'}>{coordinator ? 'Go to Coordinator' : 'Go to my page'}</a>
  </section>
}
