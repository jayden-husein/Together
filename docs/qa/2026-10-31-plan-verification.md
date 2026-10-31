# Together polish plan verification — October 31, 2026

## Changes by section

- **Access:** additive Traveler/Emergency Contact capabilities, exclusive Coordinator membership, route warning panels, home routing after sign-in, and server checks including coordinator exclusion from traveler data and contact selection.
- **Logic:** latest-event Case status, conflict banners, confirmed reports with five-minute cancellation, duplicate prevention, collapsed check-ins, resend requests, matching constraints, itinerary validation/correction/withdrawal, and dismissed-incident restoration.
- **Functionality:** four-second accessible toasts, pending controls and friendly failures, public-update preview and private-detail warnings, 500-character limit, edit/retract, short AI drafts, stable update positions and persisted read state.
- **Everyday behavior:** account and profile views, contact management, session warning/timeout, notification bell and realtime, 404/help/privacy/health routes, drafts and navigation protection, offline blocking, pagination, audit activity, presence, claim conflicts, takeover/reassignment, bulk actions, CSV and calendar export, public sharing/printing/refresh, and theme selection.
- **UI:** semantic dark/light tokens, shared component library and `UI.md`, themed controls, responsive navigation, compact queue with filters, tabbed detail, itinerary stepper/timeline/map, contact timeline, and resource/map legend controls. Common English copy is centralized in `src/copy.ts`.

## Evidence

- `npm run build`: PASS.
- `npm test`: PASS, 184 tests across the 14 test files in this checkout. Test discovery excludes unrelated worktrees; earlier larger counts included copies from another worktree.
- Staging access and negative permission scripts: PASS for Maya, Sam, and Coordinator. Every tested forbidden coordinator RPC returns SQLSTATE 42501; AI and itinerary Edge Function role checks return HTTP 403.
- Staging scenario: PASS for Safe → confirmed contact report → conflict banner → coordinator contact attempt → contact update without the private note → preview/post → delivery to Maya and Sam without reloads.
- Staging update operations: PASS for post, edit, retract, and a genuine AI draft below 280 characters.
- Staging operations: PASS for matching existing itineraries during incident creation, competing claims, reasoned takeover, release, bulk claim, reassignment, and reasoned incident resolution.
- Reliability browser checks: PASS for cancelled navigation with unsaved text, restored local draft, offline submission blocking, 29-minute warning, and automatic sign-out at 30 minutes using the browser clock.
- Responsive matrix: all four primary routes in visitor, Maya, Sam, and Coordinator contexts at 1440, 1280, 1024, 912, 768, 390, and 360 pixels. No horizontal overflow. One queue grouping axe issue discovered in the last full staging run was corrected; the focused rerun has zero serious findings.
- Lighthouse: 100 accessibility on all four signed-out routes. This is not a Lighthouse measurement of the authenticated workspaces.
- Supabase staging security advisor: no warning/error findings.

The reproducible checks live in `scripts/qa/`. They read demo credentials from environment variables. Screenshots and JSON/audit artifacts are generated under `/tmp/together-qa/`; credentials and browser session state are not written into the repository.

## Acceptance checklist

| Area | Result and limits |
| --- | --- |
| Role warnings, no forbidden forms, all nav tabs retained | PASS: all 16 role/route combinations |
| Additive traveler/contact access and home routing | PASS: browser matrix and capability tests |
| Coordinator blocked from traveler/contact operations and selection | PASS: staging negative integration tests |
| Safe/report precedence, confirmation, conflict and aligned Case state | PASS: unit and realtime scenario |
| One Case per traveler/Incident; distinguish sample names | PASS: existing unique constraint, matching tests, seed-name cleanup |
| Attempts create private-safe Individual Updates | PASS: integration and browser scenario |
| Itinerary validation and pre-Incident non-overlap | PASS: component/unit tests, database matching guard |
| Collapsed check-ins and Change answer | PASS: component and browser tests |
| Toasts and friendly errors | PASS for exercised main flows; not every failure branch was injected |
| General Update preview, counter, edit, retract and private-detail warning | PASS: component/integration checks; exhaustive private-detail patterns not tested |
| AI draft and Retry UI | PASS: actual staging draft and implemented failure handling; provider outage not forced live |
| Search/filter/sort/counter controls and responsive detail | Implemented; route matrix and component checks cover layout, not every filter combination |
| Map scroll, legend, labels/popups and coordinator-only controls | Implemented; screenshots and role tests; physical trackpad/touch hardware not tested |
| Tokens, focus, themed controls, reduced motion and contrast | PASS: token tests, axe and Lighthouse scope above |
| Sign-out clears private views and Back rechecks auth | PASS: browser matrix |
| Session timeout, draft restoration and offline behavior | PASS: browser clock/offline checks |
| Account, audit, presence, takeover, bulk actions, CSV and ICS | Implemented; backend operations tested; presence tested by implementation/polling rather than a prolonged multi-window session |
| Lighthouse >=95 and serious axe issues | PASS within measured scope above |
| Empty/loading/error states | Implemented; not every timeout/failure combination was manually exercised |

## Assumptions and remaining verification limits

- The brief conflicts about returning to the prior route versus always using the account home after sign-in. The explicit home-route rule takes precedence.
- The two Maya names and the Sam sample Case refer to different consenting, seeded traveler Accounts. Sample names are disambiguated instead of deleting valid Cases. Existing Cases remain historical evidence after an itinerary correction.
- Itinerary corrections preserve already-started stops, retaining the existing domain rule. Future stops can be edited or removed.
- Account deletion/reset and future email/SMS controls are explicitly labelled demo/coming-soon behavior as permitted by the plan.
- Native confirmation dialogs are used for several destructive actions; the public composer and report guard use shared modal components.
- Optimistic rollback is present for check-in and mute changes. Other sensitive writes wait for server acknowledgement and display pending feedback.
- Screenshot coverage is automated at every requested role/width, with representative visual inspection. The complete before/after browser script was not repeated after each individual code edit, and no exhaustive pre-change screenshot set exists.
- Real device testing, real session-token expiry, external email/SMS delivery, and every possible concurrency/failure permutation are outside the measured evidence.

## Production

[PR #51](https://github.com/jayden-husein/Together/pull/51) merged into main and deployed to [Together](https://together-fdys.vercel.app/). All twelve migrations applied through the Supabase integration; the three updated Edge Functions were explicitly deployed.

Fresh production browser contexts passed all 16 role/route combinations and all 112 viewport checks, with zero horizontal overflow and zero serious axe findings. The production workflow then exposed a stale local report control when an older open report was superseded by a Safe check-in. The follow-up regression test failed before the synchronization fix and passes afterward; the full staging browser scenario also passes with an open report preloaded. Final production scenario and QA retraction results are recorded on the follow-up PR.

The production MCP security advisor flags intentionally exposed, authorization-checked SECURITY DEFINER RPCs and the existing disabled leaked-password-protection setting. These are distinct from the staging CLI advisor's no-warning result; do not read the staging result as a clean production Auth configuration audit.

## Incident scrolling follow-up

The requested late fix has a real scrolling regression script at `scripts/qa/map-overlap.mjs`. Before the fix, a 1440px viewport at scroll position 1760 had 64,872 square pixels of overlap between the sticky map and the full-width Case summary. A browser-only static-position probe removed the overlap, confirming the sticky boundary as the cause. The fix preserves the sticky map inside a bounded public-content grid, with Case controls outside that boundary. The scroll regression passes at 1440, 1280, 1024, 912, 768, 390 and 360px; build and all 184 tests pass.

When verification is pending, the Coordinator Case detail/“Select a case” panel now scrolls normally as explicitly requested. The browser regression failed before the change (414px movement for a 600px page scroll), then passed with a read-only pending-verification fixture. This does not change the Incident map: that remains sticky inside its bounded public-content section.
