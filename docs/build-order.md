# Build order

The tickets are sub-issues of the spec, [#4](https://github.com/jayden-husein/Together/issues/4). GitHub's blocking links are the source of truth; this page is the same order at a glance. A ticket can start once everything blocking it is closed.

## Order

| Step | Tickets | Blocked by | Notes |
| --- | --- | --- | --- |
| 1 | [#5 App skeleton, deployed](https://github.com/jayden-husein/Together/issues/5) | none | Done; live at <https://together-fdys.vercel.app>. |
| 1 | [#16 README](https://github.com/jayden-husein/Together/issues/16) | none | Draft now; fill in results at freeze. |
| 2 | [#6 Shared data and access rules](https://github.com/jayden-husein/Together/issues/6) | #5 | Run `scripts/setup-staging.sh` first. |
| 2 | [#17 Visual direction and shared UI](https://github.com/jayden-husein/Together/issues/17) | #5 | Runs in parallel with #6. |
| 3 | [#7 Check-in loop](https://github.com/jayden-husein/Together/issues/7) | #6, #17 | First complete flow. |
| 4 | [#10 Itinerary and matching](https://github.com/jayden-husein/Together/issues/10) | #7 | **Critical path: take this first.** |
| 4 | [#8 Coordinator Case workflow](https://github.com/jayden-husein/Together/issues/8) | #7 | |
| 4 | [#14 Urgency triage](https://github.com/jayden-husein/Together/issues/14) | #7 | Only if #7 is done by about 2:00 a.m. |
| 4 | [#9 Can't-reach report](https://github.com/jayden-husein/Together/issues/9) | #7 | Small. |
| 4 | [#15 Public page: Resources and General Updates](https://github.com/jayden-husein/Together/issues/15) | #7 | Cut if #7 isn't working by about 1:00 a.m. |
| 5 | [#12 Potential incident → verified Incident](https://github.com/jayden-husein/Together/issues/12) | #10 | Critical path. |
| 5 | [#11 AI itinerary extraction](https://github.com/jayden-husein/Together/issues/11) | #10 | |
| 6 | [#13 Dismiss, re-raise, Corroborated](https://github.com/jayden-husein/Together/issues/13) | #12 | Critical path; the video's re-trip scene. |

**Critical path:** #5 → #6 → #7 → #10 → #12 → #13. A slip on any of these moves the whole schedule; everything else fits around them.

## Human setup steps

These need someone's own accounts, so an agent can't do them. They're slotted in where they block a ticket.

| When | Step | Blocks |
| --- | --- | --- |
| **Now**, while #5 is built | Run `./scripts/setup-staging.sh` (one person creates staging; the others run it to save its values). | #6 |
| **During #5**, once the app skeleton is on `main` | Vercel import and Production variables (below). | #5's "deployed" criterion |
| **After both of the above**, before #6 opens its PR | Vercel Preview variables and deployment protection (below). | #6's preview |

### Vercel import (once)

1. Go to [vercel.com/new](https://vercel.com/new) → **Continue with GitHub**. When asked to install the Vercel app, choose **Only select repositories** → `jayden-husein/Together`.
2. **Import** `Together`. Framework preset **Vite** (build `npm run build`, output `dist`).
3. Name the project `together-fdys` (already done; Production is <https://together-fdys.vercel.app>).
4. Under **Environment Variables**, add these for **Production only**:
   - `VITE_SUPABASE_URL` = `https://ojxqgqgmtwaehtdfaxrs.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the production publishable key (Supabase → production project → Project Settings → API Keys; it starts with `sb_publishable_`).
5. **Deploy.** From now on every merge to `main` redeploys the main URL.

Never put the secret key or an AI API key (Dartmouth Chat or Claude) in Vercel; those are Supabase Edge Function secrets.

### Vercel previews (once)

Every PR gets its own preview URL, posted as a comment on the PR. Previews must use **staging**, or unfinished PRs change the production demo data.

1. Vercel → `together-fdys` → **Settings → Environment Variables**. Add the same two names again with only **Preview** ticked, using `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_PUBLISHABLE_KEY` from your `.env`.
2. **Settings → Deployment Protection**: turn **Vercel Authentication** off for previews. On the free plan, teammates can't be added to your Vercel account, so otherwise they hit a login wall. Previews only show synthetic staging data.
3. Push any commit to redeploy; variable changes only apply to new deploys.
4. Check: open a PR's preview, sign in as a demo Account, change something, and confirm it appears in the **staging** dashboard, not in production.

Vercel deploys only the app, not the database. A PR that adds a migration must push it to staging itself, or its preview runs against the old schema: `set -a; source .env; set +a; npx supabase db push --db-url "$STAGING_DB_URL"`.

## Split for two people

- **Person A (critical path):** #6, the data and Case rules half of #7, then #10, #12, #13.
- **Person B (everything else):** #16 and #17 first, then the screens half of #7 ([split](https://github.com/jayden-husein/Together/issues/7#issuecomment-6539474566)). After #7, in this order: #8, #11 (once #10 closes), #9, then #14 and #15 only if time allows; the cut times below still apply.

Whoever is free first takes the other's next unblocked ticket. Nothing should wait on the critical path.

## Schedule (Saturday)

| Time | What |
| --- | --- |
| about 1:00 a.m. | Cut #15 if #7 isn't working. |
| about 2:00 a.m. | Cut #14 if #7 isn't working. |
| 6:30 a.m. | Polish pass on the screens the video shows. No new features. |
| 7:30 a.m. | Run-through on fixed demo data; record pass/fail results. |
| 8:00 a.m. | Feature freeze; fill in the README results. |
| 8:00–9:15 a.m. | Record the video. |
| 9:30 a.m. | Submit (deadline 10:00). |
