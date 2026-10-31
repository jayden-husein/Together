# Together

A disaster accountability map, built at the AI at 70 Hackathon (Community track). When a flash flood or similar emergency hits a public place, Together pulls Itineraries and Check-ins into a shared picture of who might be caught in it. It asks those people to check in, helps emergency Coordinators follow up on the most urgent first, and keeps each traveler's Emergency Contacts informed.

The demo tells one story at Grand Canyon: Maya's overlook stop overlaps a simulated flash flood. **Every person, source, Incident and Resource in it is synthetic, and the app labels it "Simulation".**

- Live demo: <https://together-fdys.vercel.app>
> **Draft until feature freeze (8:00 a.m.).** Only **Built** and the run-through results describe what works today. The other sections describe the design for the final build, and anything that isn't shipped by freeze will be moved to Planned features.

- Spec: [#4](https://github.com/jayden-husein/Together/issues/4). Terms are defined in [GLOSSARY.md](GLOSSARY.md), and decisions are recorded in [docs/adr/](docs/adr/).

## Built

What works in the final build. Only list a feature here once it works end to end on the live demo. This list is final at feature freeze (8:00 a.m.).

- A deployed app skeleton: a Leaflet map of Grand Canyon on OpenStreetMap tiles, a simulation label, and a message if the map can't load.

## Simulated

- **People**: Maya, her Emergency Contact, about 20 other travelers, and one unrelated Account used to test access. All of them are made up.
- **Sources**: two stream gauge readings and one weather warning, written by hand. No live sensor, weather or news feed is connected.
- **Incident**: a flash flood near the overlook, flagged as a simulation.
- **Resources**: shelters, water and first aid, made up, each showing a made-up source and last-updated time.
- **Places**: the place list uses real Grand Canyon places and their real coordinates. Only the people and events are fictional.

The demo seed ([#6](https://github.com/jayden-husein/Together/issues/6)) marks all of these rows as demo data, and its reset command deletes and reloads only those rows.

## How the AI is used

Claude (Sonnet 5.5) has three jobs. It never makes the final decision in any of them. It is called only from Supabase Edge Functions, so the API key never reaches the browser. Its replies are structured, and plain code checks every reply before it is used: each quote must appear in the input, places must come from the fixed list, and any coordinates the model supplies are ignored. If the AI fails or times out, you can still do the job by hand. Together shows no percentages or confidence scores.

| Job | What the AI does | Human checkpoint |
| --- | --- | --- |
| Itinerary extraction | Turns a traveler's pasted plans into stops at known places, each with a time window and a quote from the text. A stop missing a date or time is marked for clarification. | The **traveler** confirms or corrects the stops. Only confirmed stops can open a Case. |
| Potential incident | Summarizes the source readings (the gauges and the weather warning) into a Potential incident, quoting each source. The incident area always comes from the source's own geometry, never from the model. | A **Coordinator** verifies or dismisses it. It affects nobody until verified. |
| Urgency triage | Proposes Immediate, Urgent or Can wait for a Needs assistance Check-in, quoting the traveler's words. Anything it can't assess becomes Untriaged, which sorts to the top of the queue. | The **Coordinator** can change the Urgency, and their change always wins. |

Matching stops to an Incident, deciding who can see what, and choosing who gets Notifications are done by plain code and database rules, not by the AI.

## Limitations and assumptions

- **Polling, not realtime.** Shared data refreshes every 3 seconds, so updates can arrive up to 3 seconds late.
- **A fixed place list, not geocoding.** Itinerary stops must be one of a short list of known Grand Canyon places.
- **Made-up sources, not live feeds.** The gauge readings and weather warning are fixed demo data.
- **Pre-linked Emergency Contacts, not invites.** The demo seed links Maya to her Emergency Contact. There is no flow for inviting a contact or for the contact to accept.
- **In-app Notifications only.** There is no SMS, email or push delivery. Someone sees a Notification only when they open the app.
- **Consent-only records.** In this build a Person comes only from sign-up or the demo seed. Venue records shared with consent are the only other way in, and they're planned ([ADR-0002](docs/adr/0002-no-third-party-missing-person-reports.md)). Family members can't report someone who isn't already in Together; they're directed to law enforcement.
- **Planned location is not presence.** A confirmed stop that overlaps an Incident opens a Case saying the person's whereabouts are unconfirmed. It doesn't claim they were there.
- **Synthetic checks only.** Our tests and the run-through use made-up data. They don't show how Together would perform in a real disaster, and we haven't measured accuracy, adoption or impact.

## Technical feasibility

How each limitation would be removed in production:

| Limitation | Production path |
| --- | --- |
| Polling | Supabase Realtime subscriptions on the same tables. Row-level security, not the UI, controls who can read each row, so realtime needs no new access rules. |
| Fixed place list | Geocoding through Google Places or Mapbox, followed by the traveler confirming a pin on the map. The model still never supplies coordinates. |
| Made-up sources | National Weather Service alerts (api.weather.gov) as a live source. The alerts already include an affected area, which becomes the Potential incident's area. USGS stream gauges could follow the same path. |
| Pre-linked Emergency Contacts | An invite-and-accept flow: the traveler invites a contact by email, and the contact must accept before receiving any Individual Updates. |
| In-app Notifications only | A native mobile app with push notifications, then SMS for people without the app. |
| One database for the demo | Supabase Branching gives each pull request its own database, replacing the single staging project. |

## Planned features

Not built, and not part of the demo:

- Venue record import, such as tour manifests shared with each person's consent, and device Location pings. Their Report kinds are part of the data model.
- Live sensor, weather and news feeds, with grouping of repeated deliveries of the same reading.
- Geocoding beyond the fixed place list.
- Emergency Contact invites and verification; SMS, email and push delivery.
- A native mobile app, offline drafts, stored audio, and Supabase Realtime.
- AI suggestions for linking Reports about the same person, always for a Coordinator to confirm.
- Flood prediction, route safety and Responder dispatch.

Deliberately excluded, not planned:

- AI-drawn incident areas or AI-supplied coordinates. Areas come from the sources and places from the place list.
- Reports about people who never signed up or consented through a venue, whether from family, Coordinators or law enforcement. Those belong in law enforcement's own systems ([ADR-0002](docs/adr/0002-no-third-party-missing-person-reports.md)).

## Run it locally

You need git and Node.js 22.22+ or 24.15+ (the test runner needs these versions). This works the same on macOS and on Linux under WSL. On WSL, clone into your Linux home directory (`~/`), not `/mnt/c/`, or installs and reloads are slow.

1. Clone and install:

   ```bash
   git clone https://github.com/jayden-husein/Together.git
   ```

   ```bash
   cd Together && npm install
   ```

2. Save the staging project's values into `.env`. The wizard asks you to paste each value from the Supabase dashboard. It opens the dashboard in your browser (on WSL, in your Windows browser). Ask a teammate to add you to the Supabase organization first.

   ```bash
   ./scripts/setup-staging.sh
   ```

3. Point the app at staging, then start it:

   ```bash
   grep -q '^VITE_' .env || cat .env.example >> .env
   ```

   ```bash
   npm run dev
   ```

   Open the URL it prints (usually <http://localhost:5173>).

Other commands: `npm test` runs the tests, `npm run typecheck` runs the type checker, and `npm run build` makes a production build.

`.env` holds secrets and is ignored by git. Never put the Supabase secret key or the Claude API key in a `VITE_` variable, because Vite copies those into the browser bundle.

## Staging workflow

There are two Supabase projects: **production** (`ojxqgqgmtwaehtdfaxrs`), which the live demo uses, and **staging**, which local development and Vercel preview deployments use.

- Merging to `main` applies `supabase/migrations/` to production and redeploys <https://together-fdys.vercel.app>.
- Every schema change is a migration. Create one with `npx supabase migration new <name>` and write the SQL in the file it creates.
- Before merging a migration, push it to staging and check it there:

  ```bash
  set -a; source .env; set +a; npx supabase db push --db-url "$STAGING_DB_URL"
  ```

- Every pull request gets a Vercel preview URL, which uses staging. Previews don't push migrations, so push them yourself or the preview runs against the old schema.
- Never edit a migration that has been merged. Fix it with a new migration.

The full setup, including Vercel, is in [docs/build-order.md](docs/build-order.md).

## Demo accounts

All demo accounts are synthetic. Sign-in details are added once the demo seed lands ([#6](https://github.com/jayden-husein/Together/issues/6)).

| Account | Role | Email | Password |
| --- | --- | --- | --- |
| Maya | Traveler | _to be added_ | _to be added_ |
| Maya's contact | Emergency Contact | _to be added_ | _to be added_ |
| Coordinator | Coordinator | _to be added_ | _to be added_ |
| Unrelated | Signed-in Account with no link to Maya, used for the access check | _to be added_ | _to be added_ |

The public incident page needs no login.

## Run-through results (7:30 a.m.)

These are the actual results of the run-through on fixed demo data. Each check records what we saw, not what we expected. Unfilled rows were not run yet.

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Maya pastes her plans; the AI proposes stops; she confirms them | | |
| 2 | A stop missing a date is marked for clarification, with the original text kept | | |
| 3 | The first gauge reading raises a Potential incident; the Coordinator dismisses it | | |
| 4 | The second gauge reading and the weather warning raise a new, Corroborated Potential incident that shows the earlier dismissal | | |
| 5 | The Coordinator verifies it; a Case opens for Maya, explained by her overlook stop and its time window | | |
| 6 | A traveler at the same place on a different day gets no Case | | |
| 7 | Verifying again opens no duplicate Case and sends no duplicate Notification | | |
| 8 | Maya gets a Check-in Request and replies Needs assistance | | |
| 9 | The AI proposes an Urgency with a quote; the Coordinator changes it and their change wins | | |
| 10 | AI turned off or timing out: Untriaged at the top of the queue, and manual entry still works | | |
| 11 | A traveler who doesn't reply stays Unconfirmed | | |
| 12 | The Emergency Contact files a Can't-reach report | | |
| 13 | The Coordinator claims the Case, records a Contact Attempt and resolves it | | |
| 14 | The Emergency Contact sees an Individual Update with no free text or Coordinator notes | | |
| 15 | The unrelated Account can't read Maya's Case, Reports or Notifications, even through direct API queries (access check script, on production) | | |
| 16 | The public page shows the Incident, Resources and General Updates without login and with no private details about anyone | | |
| 17 | Two browser sessions see each other's changes within a few seconds | | |
| 18 | Reset restores the demo story without touching other rows | | |
