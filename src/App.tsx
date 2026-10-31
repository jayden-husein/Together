import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AccountProvider, SignInForm, SignedIn, useAccount } from './SignIn'
import Account from './views/Account'
import { ErrorBoundary, Health, Help, NotificationBell, Runtime } from './runtime'
import { AccountMenu, Avatar, Icon, Toasts } from './components'
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
  const path = hash.split('?')[0] || '#/'
  const route = ROUTES.find(r => r.hash === path || r.hash === '#/coordinator' && path.startsWith('#/coordinator/case/'))
  const special = ['#/signin','#/account','#/help','#/privacy','#/health'].includes(path)
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // A hash change resets nothing for assistive tech: retitle the page and move focus to the new view.
  useEffect(() => {
    document.title = `${route?.label ?? ({'#/account':'My account','#/signin':'Sign in','#/help':'How it works','#/privacy':'Privacy','#/health':'Service status'}[path] ?? 'Page not found')} · Together`
    // On a phone the nav scrolls sideways; keep the current view's link in sight.
    document.querySelector('nav [aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    if (firstRender.current) firstRender.current = false
    else main.current?.focus()
  }, [route, path])

  return (
    <div className="shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();main.current?.focus()}}>Skip to content</a>
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
              <Icon name={r.label === 'Incident' ? 'pin' : r.label === 'Traveler' ? 'user' : r.label === 'Coordinator' ? 'shield' : 'users'} />{r.label}{account.capabilities && !mayOpen(r.hash, account.capabilities) && <span title="Not available for your account"><Icon name="lock" size={14}/></span>}
            </a>
          ))}
        </nav>
        <div className="auth-controls"><NotificationBell/>{account.session ? <><AccountMenu name={account.capabilities?.name??'Account'} email={account.session.user.email??''} role={account.capabilities?.isCoordinator?'Coordinator':[account.capabilities?.isTraveler&&'Traveler',account.capabilities?.isEmergencyContact&&'Emergency Contact'].filter(Boolean).join(' and ')||'Traveler'} onSignOut={account.signOut}/><button className="link-button wide-logout" onClick={account.signOut}>Log out</button></> : <a className="button primary" href="#/signin">Sign in</a>}</div>
      </header>
      <Runtime><main id="main-content" ref={main} tabIndex={-1}><ErrorBoundary>
        {path === '#/signin' ? <SignInForm /> : path === '#/account' ? <SignedIn><Account/></SignedIn> : path === '#/help' || path === '#/privacy' ? <Help privacy={path === '#/privacy'}/> : path === '#/health' ? <Health/> : !route && !special ? <section className="panel"><h1>We can't find that page</h1><a className="button primary" href="#/">Go to Incident page</a></section> : route?.signIn ? <SignedIn>{account.capabilities && !mayOpen(route.hash, account.capabilities) ? <AccessWarning /> : <route.View />}</SignedIn> : route ? <route.View /> : null}
      </ErrorBoundary></main></Runtime>
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
