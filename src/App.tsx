import { copy } from './copy'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AccountProvider, SignInForm, SignedIn, useAccount } from './SignIn'
import Account from './views/Account'
import { ErrorBoundary, Health, Help, NotificationBell, Runtime } from './runtime'
import { AccountMenu, Avatar, Drawer, Icon, Toasts } from './components'
import { homeRoute, mayOpen } from './lib/access'
import { SimulationLabel } from './ui'
import Coordinator from './views/Coordinator'
import EmergencyContact from './views/EmergencyContact'
import PublicIncident from './views/PublicIncident'
import Traveler from './views/Traveler'

// Hash routing: no server rewrites needed on Vercel. The first route is the fallback; only it needs no sign-in.
const ROUTES = [
  { hash: '#/', label: copy.incident, View: PublicIncident, signIn: false },
  { hash: '#/traveler', label: copy.traveler, View: Traveler, signIn: true },
  { hash: '#/contact', label: copy.emergency_contact, View: EmergencyContact, signIn: true },
  { hash: '#/coordinator', label: copy.coordinator, View: Coordinator, signIn: true },
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
    <div className="shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();main.current?.focus()}}>{copy.skip_to_content}</a>
      <header className="app-header">
        <a className="wordmark" href="#/">
          <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="10.5" cy="14" r="7.5" />
            <circle cx="17.5" cy="14" r="7.5" />
          </svg>{copy.together}</a>
        <SimulationLabel />
        <nav aria-label={copy.views}>
          {ROUTES.map(r => (
            <a key={r.hash} href={r.hash} aria-current={r === route ? 'page' : undefined}>
              <Icon name={r.label === 'Incident' ? 'pin' : r.label === 'Traveler' ? 'user' : r.label === 'Coordinator' ? 'shield' : 'users'} />{r.label}{account.capabilities && !mayOpen(r.hash, account.capabilities) && <span title={copy.not_available_for_your_account}><Icon name="lock" size={14}/></span>}
            </a>
          ))}
        </nav>
        <div className="auth-controls"><NotificationBell/>{account.session ? <><AccountMenu name={account.capabilities?.name??'Account'} email={account.session.user.email??''} role={account.capabilities?.isCoordinator?'Coordinator':[account.capabilities?.isTraveler&&'Traveler',account.capabilities?.isEmergencyContact&&'Emergency Contact'].filter(Boolean).join(' and ')||'Traveler'} onSignOut={account.signOut}/><button className="link-button wide-logout" onClick={account.signOut}>{copy.log_out}</button></> : <a className="button primary" href="#/signin">{copy.sign_in}</a>}</div>
      </header>
      <Runtime><main id="main-content" ref={main} tabIndex={-1}><ErrorBoundary>
        {path === '#/signin' ? <SignInForm /> : path === '#/account' ? <SignedIn><Account/></SignedIn> : path === '#/help' ? <Drawer title={copy.help} onClose={()=>{if(history.length>1)history.back();else window.location.hash='#/'}}><Help/></Drawer> : path === '#/privacy' ? <Help privacy/> : path === '#/health' ? <Health/> : !route && !special ? <section className="panel"><h1>{copy.we_cant_find_that_page}</h1><a className="button primary" href="#/">{copy.go_to_incident_page}</a></section> : route?.signIn ? <SignedIn>{account.capabilities && !mayOpen(route.hash, account.capabilities) ? <AccessWarning /> : <route.View />}</SignedIn> : route ? <route.View /> : null}
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
    <h1>{coordinator ? copy.coordinator_accounts_cant_use_this_page : copy.coordinator_access_required}</h1>
    <p>{coordinator ? copy.coordinators_manage_cases_and_cant_be_travelers : copy.this_page_is_only_for_coordinators_your}</p>
    <a className="button primary" href={capabilities ? homeRoute(capabilities) : '#/'}>{coordinator ? copy.go_to_coordinator : copy.go_to_my_page}</a>
  </section>
}
