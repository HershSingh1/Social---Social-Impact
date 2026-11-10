# Demo runbook: D1-D8, T01, T04

Run this on **three phones, at least one iPhone and one Android**, with no app restart and no manual database edits.
Cast: **Maya** (iPhone, signs in), **Jordan** and **Sam** (guests; one of them Android).

## Before you start (once)
- Supabase running somewhere all three phones can reach (hosted project, or local over the LAN: `docs/setup.md`).
  Anonymous sign-ins on, Email on, Apple on with the bundle id, "Allow manual linking" on, `pg_cron` enabled.
- Seed loaded (`supabase db reset`, or `supabase db push --include-seed`). Experiences are placeholders; that is fine for the demo.
- `app/.env` has the URL and anon key on every build; Android build has `GOOGLE_MAPS_ANDROID_API_KEY`.
- Fresh installs of the development build on all three phones (so each starts as a new guest).
- Pick three **flexible-time** experiences for D3 (for example Sketch and stroll, Barton Springs swim, Mount Bonnell sunset).
  Fixed-session experiences (Clay and conversation, kayak, ...) cannot be planned yet.

## The script
| Step | Do | Pass when |
| --- | --- | --- |
| D1 | Maya: Friends tab -> Create group (sign in with Apple or an email code when asked; you land back on the Create group sheet) -> name it "Saturday crew" | The group page opens and shows a 6-character join code |
| D2 | Jordan and Sam: Friends -> Join with code -> enter the code -> type a name -> Continue as guest | Both appear in Maya's member list within 5 s, labelled "guest", without Maya refreshing |
| D3 | Maya: Map tab -> filter Price to "Under $25" -> open three experiences -> **Add to group pick** on each -> Review pick -> Open voting | The pick shows 3 options; Jordan and Sam see it under **Open group picks** in their Plans tab with "Vote needed", and the Plans tab shows a badge |
| D4 | All three vote Yes / Maybe / No on each option | Tallies update on every phone within 2 s, no pull-to-refresh; "X of 3 voted" counts up |
| D5 | Maya: **Close voting now** -> confirm | Every phone shows the same winner and the same sentence naming the rule |
| D6 | Maya: **Plan this** -> pick a date and times -> review the card -> **Send invitation** | The plan shows 1 Going, 2 Awaiting reply; Jordan and Sam have it under **Needs your response** |
| D7 | Jordan taps **Going**, Sam taps **Can't go** | All phones read 2 Going, 0 Awaiting, 1 Can't go |
| D8 | Maya: Edit plan -> start 1 hour later -> read "1 Going invitee will need to reconfirm" -> Save | Jordan becomes Needs reconfirmation and sees the old and new time; Jordan taps **Still going**; counts return to 2 Going. The plan moves from Upcoming to Needs your response on Jordan's phone without a refresh |

## Reliability checks (before demo day, not on stage)
- **T01, location denied:** on all three phones answer "Don't allow" the first time location is asked (tap **Locate me**, or deny in Settings).
  Run the whole script again. Expect: a notice that the map stays on downtown Austin, and every step above still passes.
- **T04, network cut during send:** at D6, turn on airplane mode just before tapping Send. Expect "Invitation not sent. Your draft is saved,
  and Retry won't send it twice." Turn the network back on and tap Retry. Expect exactly **one** plan and one invitation per person
  (Jordan and Sam each see it once). Never "Invitations sent" before the server confirms.

## Also worth trying on a device
VoiceOver / TalkBack through the Map list, a pick vote and a plan RSVP; system text size at 200 %; dark mode; a phone with no sound-of-network
(airplane mode) opening the app (expect the connection error with Try again).

## What is automated already
`npm run db:test` / `npm run db:test:local` runs `05_demo_script.test.sql`: D1-D8 and T04 through the server functions with the same three
people. `cd app && npm test` covers the screens. The runbook above is what remains: the real devices, real network and real Realtime timing.
