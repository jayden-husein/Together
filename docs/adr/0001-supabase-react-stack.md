# React + Supabase stack, with row-level security as the authorization

The app is React + Vite + TypeScript with Leaflet for the map, on Supabase (Postgres, auth, Edge Functions), with the AI model called only from an Edge Function (GPT-6 Luna through Dartmouth Chat for Itinerary extraction, see [ADR-0003](0003-gpt-6-luna-via-dartmouth-chat.md); Claude for the Potential incident summary). We chose it because one free service covers the database, demo logins, the server-side AI call and access control in a 16-hour build. Access to private Cases is enforced by Postgres row-level security, not the UI: an unrelated signed-in Account must be refused even when it queries the API directly.

## Consequences

- Shared state refreshes by polling every few seconds rather than Supabase Realtime. That's acceptable for a demo; it's a documented limitation, not a design.
- The AI API key never reaches the browser.
