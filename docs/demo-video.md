# Demo video plan and script

A 2–3 minute video, due **10:00 a.m. Saturday**. Aim for **2:40** so a slow take still fits. It follows one story: Maya's trip plan, the flash flood, her Check-in, the Coordinator's follow-up, and the update her Emergency Contact gets.

Only show what passed in the run-through ([run-through.md](run-through.md)). If a row failed, cut its scene and say less, not more.

## Timeline

| Time | Scene | Window on screen | Point it makes |
| --- | --- | --- | --- |
| 0:00–0:15 | 1. The problem | Public page (`#/`) with the map | Nobody has one shared picture of who might be caught in a flood |
| 0:15–0:40 | 2. Maya's plans | Traveler (Maya) | The AI reads plain text; Maya confirms |
| 0:40–1:10 | 3. The flood | Coordinator | The AI drafts an incident, but a person verifies it |
| 1:10–1:20 | 4. Who might be there | Coordinator queue | Plain code opens Cases, and says why |
| 1:20–1:45 | 5. Maya checks in | Traveler, then Coordinator | AI proposes an Urgency; the Coordinator decides |
| 1:45–2:05 | 6. Her contact | Emergency Contact (Sam) | Sam gets the status, not her private words |
| 2:05–2:25 | 7. Follow-up | Coordinator, then Sam | Claimed, attempted, resolved, with full history |
| 2:25–2:45 | 8. What's real | Public page, then a title card | What's simulated, and what's next |

## Script

Lines in quotes are the voice-over. Each scene's word count fits its slot at a calm pace (about 150 words a minute).

### 1. The problem (0:00–0:15)

**Show:** the public page, with the Simulation label and the flood area on the map.

> "After a flash flood in a place like the Grand Canyon, a family knows where someone planned to go, and coordinators have scattered reports. Nobody has one picture of who might be caught in it. Together builds that picture. Everything you'll see is simulated."

### 2. Maya's plans (0:15–0:40)

**Show:** Maya pastes her plans, clicks **Fill in stops**, and the stops appear with their "From your plans" quotes. Then she clicks **Confirm Itinerary**.

> "Maya pastes her trip plans in her own words. The AI turns them into stops at known places, and quotes the words each stop came from. It never supplies coordinates. If her plans leave out the day, the stop is flagged for her to fill in. Nothing counts until Maya confirms it."

### 3. The flood (0:40–1:10)

**Show:** the Coordinator view. Pause on the **Dismissed Potential incidents** row (gauge sensor fault), then the pending panel: **Corroborated**, the note about the earlier dismissal, and the source quotes. Click **Verify Incident**.

> "A stream gauge, a weather warning and a news report come in. The AI summarizes them into a Potential incident, quoting each source, and the area comes from the sources themselves. Earlier, the gauge tripped alone and the Coordinator dismissed it as a sensor fault, and Together shows that. Now two sources agree. A person, not the AI, verifies it."

### 4. Who might be there (1:10–1:20)

**Show:** the queue filling with Cases, then zoom in on Maya's "Matched stop: Phantom Ranch" line.

> "Plain code, not the AI, matches confirmed stops to the flood. Each Case says which stop and time window opened it, and that her whereabouts are unconfirmed."

### 5. Maya checks in (1:20–1:45)

**Show:** Maya's Check-in Request. She taps **Needs assistance**, types her need, and sends. Cut to the Coordinator queue: Needs assistance at the top with the AI's Urgency and quote. The Coordinator changes the Urgency, and the queue shows "Urgency set by a Coordinator."

> "Maya gets a Check-in Request. She could tap Safe; instead she asks for help. Within seconds, her Case moves to the top. The AI proposes an Urgency and quotes her words, and the Coordinator can overrule it. If the AI fails, the Case is marked Untriaged and goes to the top anyway."

### 6. Her contact (1:45–2:05)

**Show:** Sam's view: the **New** Individual Update showing Maya's status and time. Sam clicks **I can't reach Maya**.

> "Sam, Maya's Emergency Contact, sees that she needs assistance, and when. Sam doesn't see what she wrote. Sam can't reach her, and says so. That report goes straight into her Case."

### 7. Follow-up (2:05–2:25)

**Show:** the Coordinator claims Maya's Case, records a Contact Attempt marked Reached, and resolves it as **Assistance provided**. Scroll the Case history. Cut to Sam's view showing the outcome.

> "The Coordinator claims the Case, records reaching her, and resolves it. Every step is in the history, with who did it and when, and nothing can be edited after the fact. Sam gets the outcome, never the notes."

### 8. What's real (2:25–2:45)

**Show:** the public page, then a title card with the live URL and the repo.

> "The AI reads and drafts. People confirm, decide, and stay accountable. The people, sources and flood here are made up, updates arrive every three seconds, and notifications are in-app only. Next, we'd connect live weather alerts and test this with the people who'd run it."

**Title card text:**

```
Together
together-fdys.vercel.app · github.com/jayden-husein/Together
All people, sources and incidents are simulated.
```

## Recording plan

### Set up (7:45–8:15 a.m.)

1. Finish the run-through and copy the results into the README.
2. Reset production right before recording: `npm run reset-demo -- production`. The seed puts Maya's stop an hour after the reset, so don't reset hours early.
3. Open three windows in separate browser profiles, all on production: Maya (`#/traveler`), Sam (`#/contact`) and the Coordinator (`#/coordinator`). Sign in to all three **before** you start recording, so the password never appears on screen.
4. Set browser zoom to 125% and the window to 1920×1080. Hide bookmarks, extensions and notifications.
5. Have Maya's paste text ready in a note: `Today: Mather Point 9 to 10, then Phantom Ranch 2 to 4`, with real times later today so they overlap the flood.

### Record (8:15–9:00 a.m.)

- Record each scene as its own clip in the order above. A mistake costs one clip, not the whole video. The story only moves forward, so if you get a step wrong, reset production and start again from scene 2.
- Leave two seconds of stillness at the start and end of each clip, which makes cutting easier.
- Record the voice-over separately, after the screen clips, and cut the clips to fit it.
- Cut out the AI waits ("Reading your plans…") and the up-to-3-second polling waits, but don't speed up the clip in scene 5 where her Case moves to the top: that delay is the point. If you cut any wait, the claim "within seconds" must still be true of the raw footage.
- Tools: macOS screen recording (Shift-Cmd-5) or OBS; edit in iMovie, CapCut or DaVinci Resolve.

### Edit and submit (9:00–9:45 a.m.)

- Add captions. Judges often watch without sound.
- Keep the Simulation label on screen in every shot. Don't crop it out.
- Check the length is between 2:00 and 3:00.
- Upload by 9:45 a.m. so a slow upload still makes the 10:00 a.m. deadline.

## If something breaks while recording

| Problem | What to do |
| --- | --- |
| The AI is slow or down | Scene 2: show the "Could not read your plans" message and add the stops by hand; say "If the AI fails, Maya enters her stops herself." Scene 5: show Untriaged at the top. Don't fake an AI result. |
| The summary says "Pre-written summary · AI unavailable" | Keep it and say that the AI was unavailable. Don't claim it as an AI summary. |
| Something is wrong after a mistake | `npm run reset-demo -- production` and start again from scene 2. |
| A scene can't be shown at all | Cut it and drop its claim from the voice-over and from the README's **Built** list. |

## Don'ts

- Don't claim accuracy, speed or lives saved. We only measured synthetic run-through results.
- Don't call a planned stop "where Maya is". Say "where she planned to be".
- Don't show the password, `.env`, or the Supabase dashboard.
