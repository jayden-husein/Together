import { useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { accountAccessConfigured, getSupabase } from '../lib/supabase'

export function Account({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!accountAccessConfigured) return
    const { data } = getSupabase().auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!accountAccessConfigured) return <p>Account access has not been configured.</p>
  if (user === undefined) return <p>Loading account…</p>
  if (user) return <div key={user.id}>
    {children}
    <p>{user.email} <button onClick={async () => {
      const result = await getSupabase().auth.signOut()
      setError(result.error?.message ?? '')
    }}>Sign out</button></p>{error && <p role="alert">{error}</p>}
  </div>
  return <form className="panel" onSubmit={async e => {
    e.preventDefault()
    const fields = new FormData(e.currentTarget)
    const result = await getSupabase().auth.signInWithPassword({
      email: String(fields.get('email')), password: String(fields.get('password')),
    })
    setError(result.error?.message ?? '')
  }}>
    <label>Email <input type="email" name="email" autoComplete="username" required /></label>
    <label>Password <input type="password" name="password" autoComplete="current-password" required /></label>
    <button>Sign in</button>{error && <p role="alert">{error}</p>}
  </form>
}
