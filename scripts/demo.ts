// Shared by reset-demo.ts and access-check.ts: which project to use and the demo Accounts.
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2]
if (target !== 'staging' && target !== 'production') {
  console.error('Usage: node --env-file=.env scripts/<script>.ts staging|production')
  process.exit(1)
}
const prefix = target.toUpperCase()
function env(name: string) {
  const value = process.env[name]
  if (!value) {
    console.error(`Set ${name} in .env`)
    process.exit(1)
  }
  return value
}

export const url = env(`${prefix}_SUPABASE_URL`)
export const secretKey = env(`${prefix}_SUPABASE_SECRET_KEY`)
export const publishableKey = env(`${prefix}_SUPABASE_PUBLISHABLE_KEY`)
// Kept out of the repo so nobody can sign in to the public demo as its Coordinator.
export const password = env('DEMO_PASSWORD')

export const accounts = {
  maya: 'maya@demo.together.example.com',
  emergencyContact: 'sam@demo.together.example.com',
  coordinator: 'coordinator@demo.together.example.com',
  unrelated: 'unrelated@demo.together.example.com',
}

export const serverClient = () => createClient(url, secretKey, { auth: { persistSession: false } })

export async function signIn(email: string) {
  const client = createClient(url, publishableKey, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign in as ${email}: ${error.message}`)
  return client
}
