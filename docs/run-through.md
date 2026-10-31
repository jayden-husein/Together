# Run-through procedure

How to fill in the **Run-through results** table in the README. Do it before feature freeze (8:00 a.m.), then reset the demo before you record the video.

## Rules for the table

- **Result** is one of: `Pass`, `Fail`, `Partial` or `Not run`. Don't leave a row empty: an empty row reads as "we forgot".
- **Notes** say what you saw, not what should happen. Include the time or a number where you can. For example: "Queue showed Needs assistance 2 s after Send", not "works".
- If a row passed only on staging, or only through a script, say so in Notes.
- If something fails, write `Fail` and what you saw. Don't fix it and quietly re-run. Fix it, re-run, then write `Pass (after fix: …)`.
- After freeze, change the heading time to when you actually ran it, for example `## Run-through results (7:40 a.m., Oct 31)`.

## Before you start (10 min)

1. Have `DEMO_PASSWORD` and staging values in `.env` (`./scripts/setup-staging.sh` if not).
2. Open five browser windows, each in its own profile or private window, because one browser holds one sign-in:

   | Window | Go to | Sign in as |
   | --- | --- | --- |
   | A | `#/traveler` | `maya@demo.together.example.com` |
   | B | `#/contact` | `sam@demo.together.example.com` |
   | C | `#/coordinator` | `coordinator@demo.together.example.com` |
   | D | `#/traveler` | `unrelated@demo.together.example.com` |
   | E | `#/` | nobody |

3. Keep a notes file open and paste the table rows into it as you go. Copy them into the README at the end.

### Which project for which row

Most rows run on **production** (<https://together-fdys.vercel.app>), because that's what judges see. Three rows would break or confuse the live demo, so run those on **staging** (`npm run dev`, which points at staging):

- **#7** (double verification) and **#10** (AI turned off): staging.
- **#18** (reset): staging first, then reset production for real at the end.

## Pass 1: the story, on production

Reset production so you start clean:

```bash
npm run reset-demo -- production
```

The reset seeds Maya's Phantom Ranch stop (starting one hour from the reset), 20 other travelers, a dismissed first gauge reading and one pending Potential incident.

Who the seed puts where (useful for #6 and #11):

- **Overlap Phantom Ranch, so they get Cases:** Maya, plus traveler-1, 4, 7, 10, 13, 16 and 19 (named Maya, Quinn, Sam, Sage, Jules, Ellis and Remy). That's 8 Cases.
- **Mather Point, on the rim, so no Case:** Alex, Avery, Taylor, Reese, River, Indy, Casey.
- **Phantom Ranch but yesterday, so no Case:** Jordan, Riley, Morgan, Blair, Noor, Ari.

| # | Window | Do this | Pass if you see |
| --- | --- | --- | --- |
| 1 | A | Paste `Today: Mather Point 9 to 10, then Phantom Ranch 2 to 4` (use times later today) into **Paste your plans**, click **Fill in stops**, check the stops, click **Confirm Itinerary**. | Stops at known places, each with a "From your plans" quote. After confirming, it appears under **Your confirmed Itineraries** with your pasted text. |
| 2 | A | Paste `visitor center 7 to 8` (no date), click **Fill in stops**. | "Your plans don't say which day. Add the date." on that stop, with the quote kept. Don't confirm. Clear it. |
| 3 | C | Look at **Dismissed Potential incidents**. | The first gauge reading, dismissed with the reason "gauge sensor fault". The reset script did the dismissal, not a click, so put that in Notes. |
| 4 | C | Look at the pending Potential incident panel. | **Corroborated · Pending verification**, the note "An earlier Potential incident from the same source was dismissed", and each source quoted. Note whether the summary says "AI summary" or "Pre-written summary · AI unavailable". |
| 5 | C | Leave the time window as it is and click **Verify Incident**. | The queue fills with 8 Unconfirmed Cases. Maya's says "Matched stop: Phantom Ranch …" with the time window. |
| 6 | C | Look for Jordan (Phantom Ranch, yesterday) and Alex (Mather Point) in the queue. | Neither has a Case. |
| 8 | A | Refresh if needed. In the **Check-in Request**, choose **Needs assistance**, type `Twisted my ankle near the bridge, water is rising, I can't walk out`, click **Send**. | "Check-in sent." and the Check-in under **Your Check-ins**. |
| 17 | A + C | Time it from clicking **Send** in #8. | Window C shows Maya as Needs assistance within a few seconds. Write down the seconds. |
| 9 | C | Open Maya's Case. Look at the Urgency, then change it. | "Urgency proposed by the AI." plus the quote from her words. After your change: "Urgency set by a Coordinator.", and it stays after the next refresh. |
| 11 | C | Look at the other 7 Cases. | They stay Unconfirmed. Nothing changes them to Safe. |
| 12 | B | Click **I can't reach Maya**. | The report appears in Maya's Case history in window C. (Maya stays Needs assistance, which sorts above Can't reach.) |
| 13 | C | On Maya's Case: claim it, record a Contact Attempt (Reached, with a note), then resolve it as **Assistance provided**. | Queue shows "Claimed by Dana Ortiz (you)". History lists each action with who did it and when. Status becomes Resolved. |
| 14 | B | Read **Individual Updates**. | Status and time entries plus the outcome. None of Maya's description and none of the Coordinator's note text. |
| 16 | E | Open `#/`, no login. | Incident, Resources (each with source and last-updated time) and General Updates. No traveler names, statuses or notes. |
| 15 | terminal | `npm run access-check -- production` | Every line says `pass` and the command exits 0. Paste the pass count into Notes. |
| 15 | D | Also look by hand: the unrelated Account's views. | Nothing of Maya's. |

## Pass 2: the risky rows, on staging

Run `npm run dev` and use the same windows at <http://localhost:5173>.

**#7: verifying twice.** Reset staging and let the script verify twice at once:

```bash
npm run reset-demo -- staging
```

```bash
npm run access-check -- staging --verify
```

Pass if these lines say `pass`: "verification creates exactly one Incident", "two verifications open Cases for exactly the eight overlapping demo travelers", "each matched traveler receives one Check-in Request". The UI can't verify twice, because the panel goes away after the first click, so say "checked by script" in Notes.

**#10: AI turned off.** Remove the key from **staging only**. The project ref is the `db.<ref>.supabase.co` part of `STAGING_DB_URL` in `.env`.

```bash
npx supabase secrets unset DARTMOUTH_CHAT_API_KEY --project-ref <staging-ref>
```

Then:

1. Reset staging and verify the Incident (window C).
2. As Maya, send a Needs assistance Check-in. Pass if her Case shows "Untriaged: no Urgency from the AI. Set one." and sits at the top of the queue. Set an Urgency by hand.
3. As Maya, paste plans and click **Fill in stops**. Pass if you get "Could not read your plans…" and can still **Add stop** by hand and confirm.

Put the key back afterwards:

```bash
npx supabase secrets set DARTMOUTH_CHAT_API_KEY=<key> --project-ref <staging-ref>
```

**#18: reset leaves other rows alone.** In the staging SQL editor in the Supabase dashboard, count rows that aren't demo data:

```sql
select (select count(*) from persons where not demo) as persons,
       (select count(*) from reports  where not demo) as reports;
```

Run `npm run reset-demo -- staging`, run the query again, and check the counts didn't change. Then check the story is back: one pending Potential incident in the Coordinator view and no Cases. If both counts are 0, say so: it means there were no other rows to protect, so the row only half-tests the claim.

## Finish

1. Copy your rows into the README table and update the heading time.
2. Reset production so the live demo and the video start clean:

   ```bash
   npm run reset-demo -- production
   ```

3. Anything that failed and won't be fixed by freeze: take it out of **Built** and add it to **Planned features**, as the README's draft note says.
