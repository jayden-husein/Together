# React + Supabase stack, with row-level security as the authorization

The app is React + Vite + TypeScript with Leaflet for the map, on Supabase (Postgres, auth, Edge Functions), with the AI model called only from an Edge Function (GPT-6 Luna through Dartmouth Chat; see [ADR-0003](0003-gpt-6-luna-via-dartmouth-chat.md)). We chose it because one free service covers the database, demo logins, the server-side AI call and access control in a 16-hour build. Access to private Cases is enforced by Postgres row-level security, not the UI: an unrelated signed-in Account must be refused even when it queries the API directly.

## Consequences

- Shared state now refreshes through Supabase Realtime, with polling every few seconds as a fallback. This replaces the original polling-only limitation under the October 31 polish plan; row-level security still controls private delivery.
- The AI API key never reaches the browser.
