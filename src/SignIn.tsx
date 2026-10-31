import { type ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

/** Shows `children` once an Account is signed in; until then, a sign-in form. Row-level security does the access control. */
export function SignedIn({ children }: { children: ReactNode }) {
  // undefined until Supabase reports the stored session, so a signed-in reload doesn't flash the form.
  const [session, setSession] = useState<Session | null>()
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <SignInForm />
  return (
    <>
      {children}
      <p className="signed-in">
        Signed in as {session.user.email}.{' '}
        <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </p>
    </>
  )
}

function SignInForm() {
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function signIn(form: HTMLFormElement) {
    const fields = new FormData(form)
    setPending(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fields.get('email')),
      password: String(fields.get('password')),
    })
    setPending(false)
    setError(error?.message)
  }

  return (
    <div className="column">
      <header className="view-header">
        <h1>Sign in</h1>
        <p className="lede">Use one of the demo Accounts.</p>
      </header>
      <form className="panel sign-in" onSubmit={e => { e.preventDefault(); signIn(e.currentTarget) }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="button" disabled={pending}>Sign in</button>
      </form>
    </div>
  )
}
