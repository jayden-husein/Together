import { copy } from './copy'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { actionEvent } from './lib/analytics'
import { supabase } from './lib/supabase'
import { type Capabilities, homeRoute } from './lib/access'

export type Account = { session: Session | null | undefined; capabilities: Capabilities | null; error: boolean; signOut: () => Promise<void> }
const AccountContext = createContext<Account>({ session: null, capabilities: null, error: false, signOut: async () => {} })
export const useAccount = () => useContext(AccountContext)
export function AccountProvider({ children }: { children: ReactNode }) {
  const currentId = useRef<string | null>(null)
  const explicitSignOut = useRef(false)
  const [session, setSession] = useState<Session | null>()
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let generation = 0
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!next && currentId.current && !explicitSignOut.current) window.dispatchEvent(new Event('together:expired'))
      if (next?.user.id && currentId.current === next.user.id) { setSession(next); return }
      currentId.current = next?.user.id ?? null
      const version = ++generation
      setSession(next)
      setCapabilities(null)
      setError(false)
      if (!next) return
      // Keep network calls outside Supabase's auth callback lock.
      queueMicrotask(async () => {
        const { data: c, error } = await supabase.rpc('account_capabilities')
        if (version !== generation) return
        if (error || !c) { setError(true); return }
        setCapabilities(c)
        if (event === 'SIGNED_IN') { actionEvent('sign_in'); window.location.hash = homeRoute(c); void supabase.rpc('record_sign_in') }
        explicitSignOut.current = false
      })
    })
    return () => { generation++; data.subscription.unsubscribe() }
  }, [])
  useEffect(()=>{const changed=async()=>{if(!currentId.current)return;const {data}=await supabase.rpc('account_capabilities');if(data)setCapabilities(data)};window.addEventListener('together:profile',changed);return()=>window.removeEventListener('together:profile',changed)},[])
  async function signOut() {
    explicitSignOut.current = true
    // Unmount all private views before awaiting network cleanup.
    setSession(null); setCapabilities(null)
    const accountId = session?.user.id
    if (accountId) for (const key of Object.keys(localStorage)) if (key.startsWith(`together:${accountId}:`)) localStorage.removeItem(key)
    await supabase.removeAllChannels()
    await supabase.auth.signOut({ scope: 'local' })
    window.location.replace('#/')
    window.dispatchEvent(new CustomEvent('together:toast', { detail: "You've been signed out." }))
  }
  return <AccountContext.Provider value={{ session, capabilities, error, signOut }}>{children}</AccountContext.Provider>
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { session, capabilities, error } = useAccount()
  if (session === undefined || session && !capabilities && !error) return <div className="skeleton" aria-label={copy.loading_account} />
  if (error) return <section className="panel"><h1>{copy.could_not_load_your_account}</h1><button className="button" onClick={() => window.location.reload()}>{copy.retry}</button></section>
  if (!session) return <SignInForm />
  return <>{children}</>
}

export function SignInForm() {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')
  const [show, setShow] = useState(false)
  const [reset, setReset] = useState(false)
  const [sent, setSent] = useState(false)
  const [failures, setFailures] = useState(0)
  const [cooldown, setCooldown] = useState(false)
  useEffect(() => { if (!cooldown) return; const t = setTimeout(() => setCooldown(false), 30_000); return () => clearTimeout(t) }, [cooldown])
  async function signIn(form: HTMLFormElement) {
    if (pending || cooldown) return
    if (reset) { setSent(true); return }
    setPending(true); setError(copy.text)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: String(new FormData(form).get('password')) })
      if (error) { setError(copy.that_email_or_password_doesnt_match); setFailures(n => n + 1); if (failures >= 4) setCooldown(true) }
    } catch { setError(copy.could_not_sign_in_check_your_connection) }
    finally { setPending(false) }
  }
  return <div className="sign-in-layout"><section className="panel sign-in">
    <h1>{reset ? copy.reset_your_password : copy.welcome_back}</h1>
    <p className="lede">{reset ? copy.enter_your_email_to_request_a_reset : copy.sign_in_to_together}</p>
    {!reset && <p>{copy.sign_in_to_see_this_page}</p>}
    <form onSubmit={e => { e.preventDefault(); void signIn(e.currentTarget) }}>
      <label htmlFor="email">{copy.email}</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      {!reset && <><label htmlFor="password">{copy.password}</label><div className="password-field"><input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" className="link-button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? copy.hide : copy.show}</button></div></>}
      {error && <p role="alert">{error}</p>}
      {cooldown && <p role="status">{copy.too_many_attempts_wait_30_seconds_before}</p>}
      {sent && <p role="status">{copy.demo_if_an_account_exists_you_will}</p>}
      <button className="button primary" disabled={pending || cooldown}>{pending ? copy.signing_in : reset ? copy.request_reset : copy.sign_in}</button>
      <button type="button" className="link-button" onClick={() => { setReset(!reset); setSent(false); setError(copy.text) }}>{reset ? copy.back_to_sign_in : copy.forgot_password}</button>
    </form>
    <details><summary>{copy.demo_accounts_demo_only}</summary><div className="demo-accounts">{['maya', 'sam', 'coordinator'].map(name => <button className="button" key={name} onClick={() => setEmail(`${name}@demo.together.example.com`)}>{name}{copy.demotogetherexamplecom}</button>)}</div></details>
  </section></div>
}
