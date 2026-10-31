/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Placeholder project so modules that import the Supabase client load; tests mock or never reach the network.
  test: { environment: 'jsdom', css: true, env: { VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' } },
})
