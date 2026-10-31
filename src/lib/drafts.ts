import { useEffect, useState } from 'react'
import { useAccount } from '../SignIn'
// Drafts are scoped to an authenticated account and cleared on explicit sign-out.
export function useDraft(key: string, initial='') {
  const { session } = useAccount()
  const storageKey = session ? `together:${session.user.id}:draft:${key}` : null
  const [value,setValue] = useState(() => { try { return storageKey ? localStorage.getItem(storageKey) ?? initial : initial } catch { return initial } })
  useEffect(() => { if(storageKey) { try { if(value) localStorage.setItem(storageKey,value); else localStorage.removeItem(storageKey) } catch { /* Storage may be disabled. */ } } },[storageKey,value])
  return [value,setValue] as const
}
