import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { type Capabilities, homeRoute } from './lib/access'

export type Account = { session: Session | null | undefined; capabilities: Capabilities | null; error: boolean; signOut: () => Promise<void> }
const AccountContext = createContext<Account>({ session: null, capabilities: null, error: false, signOut: async () => {} })
export const useAccount = () => useContext(AccountContext)
export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>()
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let generation = 0
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
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
        if (event === 'SIGNED_IN') window.location.hash = homeRoute(c)
      })
    })
    return () => { generation++; data.subscription.unsubscribe() }
  }, [])
  async function signOut() {
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
  if (session === undefined || session && !capabilities && !error) return <div className="skeleton" aria-label="Loading account" />
  if (error) return <section className="panel"><h1>Could not load your account</h1><button className="button" onClick={() => window.location.reload()}>Retry</button></section>
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
    setPending(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: String(new FormData(form).get('password')) })
      if (error) { setError("That email or password doesn't match."); setFailures(n => n + 1); if (failures >= 4) setCooldown(true) }
    } catch { setError('Could not sign in. Check your connection and retry.') }
    finally { setPending(false) }
  }
  return <div className="sign-in-layout"><section className="panel sign-in">
    <h1>{reset ? 'Reset your password' : 'Welcome back'}</h1>
    <p className="lede">{reset ? 'Enter your email to request a reset.' : 'Sign in to Together'}</p>
    {!reset && <p>Sign in to see this page.</p>}
    <form onSubmit={e => { e.preventDefault(); void signIn(e.currentTarget) }}>
      <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      {!reset && <><label htmlFor="password">Password</label><div className="password-field"><input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" className="link-button" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></>}
      {error && <p role="alert">{error}</p>}
      {cooldown && <p role="status">Too many attempts. Wait 30 seconds before trying again.</p>}
      {sent && <p role="status">Demo: if an account exists, you will receive reset instructions. No email is sent in this demo.</p>}
      <button className="button primary" disabled={pending || cooldown}>{pending ? 'Signing in…' : reset ? 'Request reset' : 'Sign in'}</button>
      <button type="button" className="link-button" onClick={() => { setReset(!reset); setSent(false); setError('') }}>{reset ? 'Back to sign in' : 'Forgot password?'}</button>
    </form>
    <details><summary>Demo accounts · Demo only</summary><div className="demo-accounts">{['maya', 'sam', 'coordinator'].map(name => <button className="button" key={name} onClick={() => setEmail(`${name}@demo.together.example.com`)}>{name}@demo.together.example.com</button>)}</div></details>
  </section></div>
}
