import { supabase } from './supabase'

export class VerificationSessionError extends Error {
  constructor() {
    super('Your session has ended. Sign in again to verify this Incident.')
  }
}

export async function signInAgain() {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}

export async function verifyIncident(id: string, start: string, end: string | null) {
  const body = { action: 'verify', id, start, end }
  let result = await supabase.functions.invoke('potential-incident', { body })
  if (!result.error) return
  if (result.error.context instanceof Response && result.error.context.status === 401) {
    const { error } = await supabase.auth.refreshSession()
    if (error) throw new VerificationSessionError()
    result = await supabase.functions.invoke('potential-incident', { body })
    if (!result.error) return
  }
  const response = result.error.context
  if (response instanceof Response) {
    if (response.status === 401) throw new VerificationSessionError()
    const detail = await response.json().catch(() => null)
    if (typeof detail?.message === 'string') throw new Error(detail.message)
  }
  throw new Error('Could not verify the Incident. Check your connection and try again.')
}
