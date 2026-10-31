# Build order

The tickets are sub-issues of the spec, [#4](https://github.com/jayden-husein/Together/issues/4). GitHub's blocking links are the source of truth; this page is the same order at a glance. A ticket can start once everything blocking it is closed.

## Order

| Step | Tickets | Blocked by | Notes |
| --- | --- | --- | --- |
| 1 | [#5 App skeleton, deployed](https://github.com/jayden-husein/Together/issues/5) | none | Then a human imports the repo into Vercel. |
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

## Suggested split for three people

- **Person A (UI):** #17, then the UI side of #7, then #8, #9 and #15.
- **Person B (data):** #5, #6, #7, then #10 and #12, the critical path.
- **Person C (AI):** #16, then #14 and #11 once #7 and #10 close, then #13.

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
