# Sidequest P0–P2 Specification

Nov 8, 2026 · @Noah

**This is the build specification for P0, P1 and P2: what each feature does, who can use it, its rules and edge cases, the data behind it, and how it is accepted.** It expands phases P0 to P2 of the [Sidequest Product Spec](https://claude.ai/artifact/5zUQic45hFucMoWdYPRZkN); for these phases, this doc is the source of truth. Items marked **Demo** ship for the live demo on Nov 22, 2026; items marked **Pilot** complete P0 before the first user pilot. P1 and P2 start only when their entry gates are met.

## Scope

**P0 completes one outing, P1 cuts the coordination work around it, and P2 makes the group come back and makes Sidequest money.** Each phase works without the permissions the next one adds.

| Phase | Entry gate | Requirements |
| --- | --- | --- |
| P0: complete a first outing | None | P0-01 Guest join · P0-02 Accounts · P0-03 Groups and join codes · P0-04 Map and list · P0-05 Filters and starter content · P0-06 Experience detail · P0-07 Saves · P0-08 Group pick · P0-09 Closing and tie-breaker · P0-10 Pick to plan · P0-11 Draft and review · P0-12 Sending · P0-13 RSVP and plan links · P0-14 Material changes · P0-15 Cancellation and booking · P0-16 Plans hub · P0-17 Friends and profile · P0-18 Suggest a listing |
| P1: reduce coordination work | P0 reliable in the pilot; scheduling is a repeated complaint | P1-01 Availability grid · P1-02 Calendar free/busy · P1-03 Add to calendar · P1-04 Push notifications · P1-05 Budget-safe filtering · P1-06 Activity quiz · P1-07 Contact invites · P1-08 Google sign-in |
| P2: group memory and revenue | Groups plan a second outing; at least 25 Austin venues in the catalog with repeat plans | P2-01 Did it happen · P2-02 Shared album · P2-03 Feedback and preferences · P2-04 Plan again and repeating plans · P2-05 Bucket list and seasonal picks · P2-06 Partner listings · P2-07 Group offers · P2-08 Sponsored placements · P2-09 Booking referrals · P2-10 Partner portal and billing |

### P0 demo subset (Nov 22)

| ID | In the demo | Before the pilot |
| --- | --- | --- |
| P0-01 | Join by code with a display name | Plan links |
| P0-02 | Sign in with Apple and email code; guest upgrade | Account deletion |
| P0-03 | Create, join by code, member list | Revoke, regenerate, remove member, transfer ownership |
| P0-04, 05 | Map and list over 40 curated experiences; activity and price filters | Date filter, Search this area, unknown-price toggle |
| P0-06 | Full | Full |
| P0-07 | Not shown | Full |
| P0-08, 09 | Full, using Close now | Full |
| P0-10 | Draft from winner | Organizer override |
| P0-11, 12 | Full for flexible-time experiences | Fixed sessions, unknown-fact acknowledgement |
| P0-13 | RSVP | Plan links, adding invitees |
| P0-14 | Time change with reconfirmation | All material fields, minor edits |
| P0-15 | Booking notice | Cancellation |
| P0-16, 17 | Needs your response, Open picks, Upcoming; groups and group detail | Drafts, Past, profile defaults |
| P0-18 | Not shown | Full, with review queue |

**Not in P0–P2:** in-app payments or ticket sales, contact upload, live location, group chat, public reviews, meeting strangers, learned recommendations. Those stay in P3–P4 of the product spec.

## Users and permissions

**There are two kinds of user (guest and account holder) and three roles that come from actions (member, organizer, owner).** The server checks every permission below; the app hides controls only for convenience.

- **Guest:** an anonymous user on one device with a display name. Becomes a member by joining a group, or an invitee by joining a plan through its link.
- **Account holder:** signed in with Apple or an email code. A guest who signs in keeps the same user ID.
- **Member:** has joined a group (guest or account holder).
- **Organizer:** the account holder who started a group pick or a plan. Each pick and plan has exactly one.
- **Owner:** the account holder who created a group, or received ownership.
- **Invitee:** a person on a plan's recipient list, or who joined through its plan link. The organizer is an invitee too.

| Action | Guest member | Account member | Organizer | Owner |
| --- | --- | --- | --- | --- |
| Browse Map, List, Detail | Yes | Yes | Yes | Yes |
| Save for me or to a group | No | Yes | Yes | Yes |
| Create a group | No | Yes | Yes | Yes |
| See members, join code, saved ideas | Yes | Yes | Yes | Yes |
| Revoke or regenerate the join code; remove members; transfer ownership | No | No | No | Yes |
| Start a group pick | No | Yes | Yes | Yes |
| Vote in a group pick | Yes | Yes | Yes | Yes |
| Close a pick early, override the winner, cancel a pick | No | No | Their own pick | No (unless organizer) |
| Start, send, edit or cancel a plan | No | Yes, own plans only | Their own plan | No (unless organizer) |
| See a plan | Only if invited | Only if invited | Yes | Only if invited |
| RSVP | If invited | If invited | Always Going on send; can't decline own plan | If invited |
| Create or revoke a plan link | No | No | Their own plan | No |
| Suggest a listing | No | Yes | Yes | Yes |

**Group membership never grants access to a plan.** Joining a group after a plan was sent does not add you to it; the organizer must add you, or share the plan link.

## P0: Accounts, guests and groups

### P0-01 Guest join

- **Who:** anyone holding a valid group code, group link or plan link.
- **Flow:**
  1. Enter the 6-character code on the Join screen, or open a link (`sidequest://join/SQ7K2M` in P0; universal links in P1).
  2. See a preview: group name and owner for a group code; for a plan link, activity, inviter, group name, time, price and booking need.
  3. Tap Continue as guest and enter a display name, or sign in (P0-02).
  4. Tap Join group (or Join plan). The app opens the group (or the plan).
- **Rules:** display name 1–60 characters after trimming spaces. Codes are case-insensitive and use the alphabet A–Z and 2–9 without 0, O, 1 or I. The preview never shows the member list, other people's answers or private notes. Opening a link alone never adds anyone.
- **Edge cases:** wrong code shows "That code doesn't match a group" and keeps what was typed; expired or revoked shows "This code has expired. Ask for a new one."; already a member opens the group without a second join. Reinstalling the app or changing phones loses a guest who never signed in; the guest banner says so.
- **Data:** anonymous auth user plus `profiles` row (`display_name`, `is_guest = true`); `join_group(code)`; plan links in P0-13.
- **Done when:** a second phone joins by code as a guest and appears in the member list within 5 seconds, marked "guest". Five wrong codes in a minute from one device show "Too many tries, wait a minute."

### P0-02 Accounts

- **Who:** anyone. Required to create a group, start a pick or plan, save, or suggest a listing; the app asks to sign in at that moment and returns to the same step afterwards.
- **Methods:** Sign in with Apple; email one-time code (6 digits, valid 10 minutes, at most 5 tries). Google arrives in P1 (P1-08).
- **Guest upgrade:** a guest who signs in keeps the same user ID, so memberships, votes and RSVPs stay. If that Apple ID or email already belongs to another account, show "This sign-in already has an account" and offer to sign in to that account instead; the guest's activity stays with the guest.
- **Profile:** display name required; avatar optional (JPEG, PNG or WebP up to 10 MB, cropped square).
- **Account deletion (Pilot):** Settings → Delete account removes the profile, saves, votes and RSVPs, transfers or archives owned groups, and cancels the person's unsent drafts. Sent plans they organized are cancelled with the reason "Organizer deleted their account". Required by the App Store for guests too.
- **Done when:** a guest who voted and RSVP'd signs in with Apple and still sees their vote and answer; a signed-out person who taps Create group signs in and lands back on the Create group sheet.

### P0-03 Groups and join codes

- **Who:** account holders create groups; the creator is the owner.
- **Create:** name 1–50 characters. The group starts with the owner as its only member and one active join code.
- **Join code:** one active code per group, valid 14 days. The owner can Copy, Share (system share sheet with "Join {group} on Sidequest with code {code}"), Revoke or Regenerate. Revoking stops new joins right away and never removes existing members.
- **Members:** listed with avatar, name, "guest" label and Owner badge. Members can leave; the owner must transfer ownership first (or the group is archived if they are the only member). The owner can remove a member; a removed member can't rejoin until the owner taps Allow back.
- **Leaving or removal** ends access to the roster, saved ideas and open picks. Plan invitations already received stay unless the plan's organizer removes the person.
- **Limits:** up to 30 members per group; a person can be in up to 20 groups.
- **Data:** `groups`, `group_members` (`role`, `joined_at`, `removed_at`, `blocked`), `join_codes`.
- **Done when:** a revoked code fails on a new phone while existing members keep access; a removed member's phone shows "You're no longer in this group" and can't rejoin with the old or new code until allowed back.

## P0: Discovery

### P0-04 Map and list

- **Who:** everyone, guests included. Map is the first tab and the home screen.
- **Behavior:** Map and List show the same result set, search text, filters, area and selected experience; switching keeps all of them and scrolls the list to the selected item. Tapping a pin selects it and shows a preview card (image, name, category and area, price label, timing, Booking required tag); tapping the card opens Detail.
- **Context chips:** Explore Austin (whole catalog), My saves, and one chip per group the person belongs to (that group's saved ideas). Guests see Explore Austin and their groups only.
- **Search this area (Pilot):** panning the map shows a "Search this area" button instead of reloading; tapping it limits results to the visible map. A chip "In this area" clears it.
- **Location:** asked for only when the person taps the locate button. If denied, the map opens centered on downtown Austin and everything else still works.
- **Search box:** matches experience name, area and category; results update after 300 ms of no typing.
- **Done when:** with location denied, a person can search, filter, switch Map to List and back, and the same experience stays selected.

### P0-05 Filters and starter content

- **Filters:** Activity (one category: Art and walks, Make something, Outdoors, Food and drink, Games and trivia, Music and film, Active), Price (Any, Free, Under $25, Under $50), Date (Any, This weekend, Next weekend, a picked date) in Pilot.
- **Price rules:** an experience matches a price cap if its known maximum price is at or under the cap. Unknown prices don't match a cap unless "Include unknown prices" is on (default on). Estimated prices use the top of their range.
- **Date rules:** fixed-session experiences match if a session falls on that date; flexible experiences match if their hours include that day; unknown timing never matches a date.
- **Starter content:** at least 40 team-written Austin experiences, spread across all seven categories, before the demo; 100 before the pilot. Each has a named source and a "checked on" date.
- **Empty results:** "Nothing matches here" with Clear filters.
- **Done when:** Under $25 with unknown prices off hides every unknown-price experience; turning the toggle on brings them back with a "Price unknown" label.

### P0-06 Experience detail

- **Shows:** image (or a category placeholder), category, name, description (up to 2,000 characters), duration, location and meeting point, price with its label, timing, source with checked-on date, booking notice.
- **Price labels:** Exact ("$38 per person"), Estimated ("About $5 to $9"), Free, Unknown ("Price unknown. Check the source."). Currency is always USD in P0.
- **Timing:** Fixed sessions listed as chips ("Sat 10:00 AM") with "Plans must use one of these sessions"; flexible hours as text with "Pick any time within these hours"; unknown as "Hours unknown".
- **Booking:** if required, "Booking required. Going here does not reserve a spot." plus a link to the provider; otherwise "No booking needed".
- **Actions:** Start a plan (primary), Add to group pick, Save. Guests see Start a plan and Save as sign-in prompts.
- **Removed listing:** "This listing was removed"; existing plans keep their snapshot.
- **Done when:** every catalog row renders all fields without empty labels; a booking-required experience shows the notice and provider link.

### P0-07 Saves (Pilot)

- **Who:** account holders.
- **Behavior:** the Save sheet offers "Save for me" (private, under My saves) and "Save to {group}" for each group. Each is a toggle; the sheet confirms the destination with a short message.
- **Group library:** holds each experience once and shows who saved it. Removing your save removes only your contribution; the item stays while anyone else's save remains. Leaving a group removes your contributions there.
- **Privacy:** personal saves are never visible to anyone else. "Saved by 2 in Saturday crew" counts only saves the viewer can see.
- **Data:** `saves` (`experience_id`, `user_id`, `group_id` null for personal); unique per (experience, user, group).
- **Done when:** saving to two groups and removing one leaves the other intact; a personal save never appears in any group library.

## P0: Group pick

### P0-08 Group pick

- **Who:** any account-holding member starts a pick and becomes its organizer. Every current member votes, guests included, and so does anyone who joins while it is open.
- **Create:**
  1. From Detail tap Add to group pick, or from the Plans hub tap Start a group pick.
  2. Choose the group (if the person has more than one).
  3. Add 2–5 options. Each option is an experience with an optional proposed start time; two options may be the same experience at different times.
  4. Optionally star one option (used only to break ties).
  5. Choose a deadline: 6, 12, 24 (default) or 48 hours, or a custom time from 1 hour to 7 days ahead.
  6. Tap Open voting.
- **Limits:** one open pick per group at a time. Starting another shows "Saturday crew already has an open pick" with a link to it.
- **Voting:** each option has Yes, Maybe and No buttons; tapping one sets that vote, tapping it again clears it. Votes can change until the pick closes. Each option shows a bar and counts (Yes, Maybe, No) and its points; the header shows time left and "5 of 6 voted". A member counts as voted once they have voted on every option.
- **Adding an option while open:** the organizer can add options up to 5; members who already voted see "New option" and the pick shows them as not fully voted again.
- **Live updates:** other people's votes appear within 2 seconds without refreshing.
- **Visibility:** members see totals and who has voted, not who voted what. The tie-breaker rule is shown on the pick from the start.
- **Where it appears:** Plans hub under Open group picks (with "Vote needed" until you've voted), and on Group detail.
- **Done when:** a vote on one phone shows on the others within 2 seconds; a seventh member who joins mid-pick can vote; a second pick for the same group is blocked.

### P0-09 Closing and tie-breaker

- **Closes when:** the deadline passes (server job, every minute) or the organizer taps Close now and confirms. Closing happens once, on the server; votes sent after it fail with "Voting closed".
- **Scoring:** Yes = 2, Maybe = 1, No or no vote = 0. Highest total wins.
- **Ties, in order:** fewer No votes; then the starred option; then the option added first.
- **No votes at all:** the pick closes with no winner and the organizer chooses an option.
- **Result screen:** winner highlighted, options in final order with their counts, and one sentence naming the rule that decided it, such as "Tied at 8 points. Sketch and stroll wins with fewer No votes (1 vs 2)."
- **Cancel:** the organizer can cancel an open or closed pick before it becomes a plan; members see "Maya cancelled this pick."
- **Done when:** the worked example closes the same way on every phone: Sketch and stroll (3 Yes, 2 Maybe, 1 No = 8) beats Clay and conversation (4 Yes, 2 No = 8) on fewer No votes, and Barton Springs swim (5) is third.

### P0-10 From pick to plan

- **Plan this:** after closing, the organizer taps Plan this on the result. A plan draft (P0-11) opens with the winner's experience and proposed time, and every current member selected as a recipient.
- **Override (Pilot):** the organizer may pick another option instead. The group sees "Maya chose Clay and conversation instead of the vote winner, Sketch and stroll."
- **States:** Open → Closed → Planned, or Cancelled from Open or Closed. A pick that is Planned links to its plan.
- **Done when:** Plan this opens a draft with the right experience, time and recipients, and the pick then shows "Planned" with a link to the plan.

## P0: Plans

### P0-11 Draft and review

- **Who:** account holders. A draft starts from Plan this (P0-10) or from Start a plan on Detail.
- **Fields:** group; recipients (members, preselected, each can be unticked; the organizer alone is allowed and shows "No other invitees yet"); date; start and end time; meeting point (1–200 characters, prefilled from the experience); note (up to 500 characters, optional).
- **Time rules:** start must be in the future and end after start. Fixed-session experiences offer only their listed sessions. Flexible experiences must fit their known hours; if hours are unknown, show "Hours unverified" and allow it. All times show in America/Chicago with the zone named on Review.
- **Unknown facts (Pilot):** if price or booking is unknown, Send requires ticking "I understand the price/booking is unconfirmed".
- **Review:** one summary card with What, When, Where, Who, Cost and Booking, then Send invitation.
- **Draft saving:** drafts save to the server as fields change; only the organizer sees them (Plans hub → Drafts). Offline, the draft is kept on the phone and labeled "Not synced"; Send needs a connection.
- **Done when:** a past time, an end before start, or a time outside a fixed session can't be sent, each with its own message under the field.

### P0-12 Sending

- **Behavior:** Send creates exactly one plan in state Sent, revision 1. The organizer is Going; every other recipient is Awaiting reply. The plan appears in each recipient's Plans hub under Needs your response.
- **Reliability:** the app generates a request ID when the draft is created and sends it with Send. A retry with the same ID returns the existing plan. While sending, the button shows a spinner and can't be tapped again. Success ("Invitations sent") shows only after the server confirms; a failure keeps the draft and shows Retry.
- **Meaning of "sent":** the plan is in recipients' Plans hubs. It says nothing about whether anyone read it.
- **Done when:** cutting the network mid-send and retrying creates one plan and one invitation per person (test T04).

### P0-13 RSVP and plan links

- **Answers:** invitees tap Going or Can't go. No Maybe on a plan. They can change their answer until the start time; after that, answers are locked.
- **Failure:** if saving an answer fails, the previous answer stays and the button offers Retry. A pending answer never shows as saved.
- **Counts:** Going, Awaiting reply, Can't go, Needs reconfirmation, organizer included. They always add up to the number of invitees. People who opened a link but didn't join are never counted.
- **Adding invitees after send (Pilot):** the organizer can add group members; each starts Awaiting reply. Removing an invitee ends their access and drops them from the counts.
- **Plan links (Pilot):** the organizer can create one link per plan. The preview shows activity, inviter, group, time, price and booking need, but no attendee list or notes. Tapping Join plan (as guest or account holder) makes the person an invitee of this plan only, not a group member. Links expire at the plan's end time; the organizer can revoke one, which stops new joins but keeps people who already joined.
- **Done when:** counts reconcile through the worked example (1/5/0/0 → 3/3/0/0 → 3/2/1/0 → 1/2/1/2 → 2/2/1/1 → 2/2/2/0 for Going/Awaiting/Can't go/Reconfirm), and opening a plan link twice adds the person once.

### P0-14 Material changes

- **Material (new revision):** date, start or end time, venue or meeting point, fixed session, a higher price, a price going from unknown to known, or a newly required booking.
- **Minor (same revision):** note text, spelling fixes, a lower price, removing a booking requirement. Invitees see an "Updated" label; nobody's answer changes.
- **Before saving a material edit,** the organizer sees the changed fields and "2 Going invitees will need to reconfirm."
- **After saving:** every Going invitee except the organizer becomes Needs reconfirmation. Awaiting reply and Can't go stay as they are. Invitees see a banner with old and new values and Still going / Can't go buttons. Several edits in a row only need confirmation of the latest.
- **Stale answers:** each answer carries the revision it was given against. If it isn't the current revision, the server rejects it, and the app reloads the plan and asks again.
- **Changing the experience itself** isn't an edit: the organizer cancels and starts a new plan.
- **Done when:** after a time change no one but the organizer shows as Going until they reconfirm; an answer sent from a screen opened before the change is rejected.

### P0-15 Cancellation and booking

- **Cancel (Pilot):** the organizer taps Cancel plan, picks a reason (Weather, Not enough people, Venue closed, Other with text) and confirms. The plan stays visible to invitees with "Maya cancelled this plan: {reason}"; RSVPs and edits are disabled. Start a new plan from it creates a fresh draft with no answers carried over.
- **Cancellation wins:** an RSVP or edit that arrives at the same moment as a cancellation fails, and the plan stays cancelled.
- **Booking notice:** on Detail, Review and Plan whenever booking is required: "Booking required. Going here does not reserve a spot." with the provider link. The app never records or implies a ticket or reservation.
- **Unavailable session:** if the catalog marks the plan's session unavailable, the plan shows a warning to the organizer with Change session (a material edit) or Cancel; the group is never moved silently.

### Plan and RSVP states

| Event | Plan | Organizer | Other invitees |
| --- | --- | --- | --- |
| Send | Draft → Sent | Going | Awaiting reply |
| Invitee answers | No change | No change | Going or Can't go |
| Joins by plan link or is added | No change | No change | New invitee, Awaiting reply |
| Material edit | New revision | Stays Going | Going → Needs reconfirmation; others unchanged |
| Minor edit | Same revision | No change | No change; "Updated" label |
| Reconfirm | No change | No change | Going or Can't go on the latest revision |
| Start time passes | No change | Answers locked | Answers locked |
| Cancel | Sent → Cancelled | Answers locked | Answers locked |

Upcoming, In progress and Past are computed from the clock and not stored. Past means the end time passed, not that anyone attended (that comes in P2-01).

## P0: Plans hub, Friends and listings

### P0-16 Plans hub

- **Sections, in order:** Needs your response (Needs reconfirmation first, then Awaiting reply, each by start time); Open group picks ("Vote needed" first); Upcoming (by start time, cancelled ones stay in place with a Cancelled label until their original end time); Drafts (organizer only); Past (collapsed, newest first, last 90 days).
- **Each row:** date block, activity, time range, group, and the viewer's status tag. A plan appears in exactly one section.
- **Badge:** the Plans tab shows the count of Needs your response plus picks where the viewer hasn't voted.
- **Start a group pick** button at the top for account holders.
- **Empty:** "No plans yet" with Find something to do (opens Map).
- **Done when:** after a material edit, the plan moves from Upcoming to Needs your response on every Going invitee's phone without a refresh.

### P0-17 Friends and profile

- **Friends tab:** Create group and Join with code at the top; then each group with name, joined-member count, up to four avatars, and its next item ("Sketch and stroll, Sat Nov 14", "Group pick open, closes Mon 9:12 AM" or "No plan yet").
- **Group detail:** members (P0-03), join code (owner controls), saved ideas (P0-07), open pick, and only the plans the viewer is invited to ("Plans you weren't invited to stay hidden").
- **Guests** see a banner: "You're a guest on this device. Sign in to keep your groups if you switch phones."
- **Profile (Pilot):** name, avatar, optional usual budget (a per-person dollar amount) and transport preference (Walk, Bike, Transit, Drive, Need a ride). Both are private and only prefill the person's own filters; they are never shown to others or copied into a plan.
- **Done when:** a member added after a plan was sent sees the group but not that plan.

### P0-18 Suggest a listing (Pilot)

- **Who:** account holders, from the + in the Map search bar.
- **Form:** name (1–100), description (20–2,000), location or meeting point, timing (Fixed sessions with session list, or Flexible hours with hours text), duration, price status (Exact or Estimated with amount, Free, Unknown), source link (must start with http:// or https://), optional image (JPEG, PNG or WebP up to 10 MB). Errors show under each field and nothing typed is lost.
- **States:** Pending review → Approved, Needs changes (with reason) or Rejected (with reason). Needs changes can be edited and resubmitted. Editing an approved listing creates a new pending version while the current one stays live.
- **Review queue:** a restricted admin view for named team reviewers. Checks: in Austin, usable location and timing, honest price label, working source link, not a duplicate, permission to use the image. Duplicates are merged into the existing listing.
- **Report outdated info:** a link on Detail records the issue and the listing version, and replies "Thanks, a reviewer will check it"; no promised response time.
- **Done when:** a submission with three errors keeps all typed text; an approved submission appears on the map; resubmitting the same draft twice creates one submission.

## P1: Availability and calendar

**Entry gate:** P0 works reliably in the pilot (no duplicate plans or access bugs for two weeks) and at least 3 of the 10 pilot groups name scheduling as their main problem. **Exit gate:** organizers say coordination got easier and first-response completion doesn't drop.

### P1-01 Availability grid

- **Who:** the organizer turns it on when creating a pick whose options are times (same experience, 2–5 start times). Every member can fill it in.
- **Behavior:** under each time option, members tap Free or Busy. The pick shows "4 free, 1 busy, 1 not answered" per option. Members who connected a calendar (P1-02) see their own answer prefilled and can change it.
- **Rules:** availability is separate from votes and RSVPs and never changes either. The tie-breaker ignores it. Members see counts, not who is busy.
- **Data:** `availability` (`option_id`, `user_id`, `status` free or busy, `source` manual or calendar, `updated_at`).
- **Done when:** marking Busy on one phone updates the count on others within 2 seconds, and the winner is still decided only by votes.

### P1-02 Calendar free/busy

- **Who:** account holders, opt-in, per group.
- **Connect:** Settings → Calendar → Allow calendar access. The app reads the phone's calendars (Apple, plus any Google or Outlook account synced to the phone) through the device. The person picks which calendars count and which groups may see their free/busy.
- **What is read:** only whether an event overlaps a proposed time. Titles, attendees, locations and notes are never read into Sidequest, stored or sent.
- **What others see:** Free, Busy or Unknown for that person on each time option. Unknown covers: not connected, not shared with this group, permission revoked, or last check older than 10 minutes. A partly connected group never shows as "everyone free".
- **Revoke:** turning it off stops checks, clears shared answers from every view and leaves plans untouched.
- **Done when:** with calendar access denied, every flow still works with manual Free/Busy; a revoked calendar shows Unknown on other phones within one refresh.

### P1-03 Add to calendar

- **Who:** any invitee of a sent plan.
- **Behavior:** Add to calendar writes an event (title, time, meeting point, a link back to the plan) to a calendar the person picks. It is a one-time copy labeled as such.
- **Changes:** after a material edit or cancellation, the plan shows "Your calendar has the old time. Update it?" and Update replaces that event (the app stores the event ID on the phone only).
- **Rules:** adding to a calendar never sets an RSVP.
- **Done when:** after a time change, Update moves the existing calendar event instead of adding a second one.

## P1: Notifications, budget, interests and invites

### P1-04 Push notifications

- **Who:** anyone who allowed notifications; the app asks after the person's first join or send, never at launch.
- **Sent for:**

| Event | Who gets it | Text example |
| --- | --- | --- |
| Plan sent to you | Invitees except organizer | "Maya invited you: Sketch and stroll, Sat 2:00 PM" |
| Pick opened | Group members except organizer | "Vote: What should we do this weekend? Closes Mon 9:12 AM" |
| Pick closes in 1 hour | Members who haven't fully voted | "1 hour left to vote in Saturday crew" |
| Pick result | Group members | "Sketch and stroll won the vote" |
| Material change | Going invitees | "Time changed to 3:00 PM. Still going?" |
| Cancellation | Invitees | "Maya cancelled Sketch and stroll" |
| Organizer nudge | Chosen invitees still Awaiting reply | "Maya is waiting on your answer" |

- **Rules:** tapping a notification opens that plan or pick. The same event never notifies twice. A reminder is dropped if the person already answered or the plan was cancelled. The organizer can nudge each person at most once per 24 hours. Settings has one switch per type. Everything still appears in the Plans hub if notifications are off.
- **Done when:** after Jordan answers, his scheduled reminder is not delivered; turning off "Pick results" stops only those.

### P1-05 Budget-safe filtering

- **Who:** account holders may set a private cap per outing (Profile → Budget, a dollar amount per person).
- **Behavior:** when building a group pick, a "Fits everyone's budget" filter hides experiences priced above the lowest cap among members who set one. Unknown prices stay visible with a "Price unknown" label.
- **Privacy:** nobody sees anyone's cap, the lowest cap, or an average. The filter only appears when at least 3 members have set a cap, so no single cap can be worked out.
- **Done when:** with caps of $20, $40 and $60 set, a $25 experience is hidden and a $15 one shown, and no screen or API response reveals "$20".

### P1-06 Activity quiz

- **Who:** account holders, offered once after sign-up and later from Profile.
- **Behavior:** about 10 cards (one per activity type, such as "Pottery or crafts"); swipe or tap Yes, Maybe or No. Answers become the person's interests.
- **Use in P1:** sorts the person's own Explore list (matching categories first) and labels them "Matches your interests". Nothing is shared with the group; group suggestions wait for P4.
- **Done when:** skipping the quiz changes nothing; retaking it replaces the old answers.

### P1-07 Contact invites

- **Behavior:** Invite from contacts opens the phone's contact picker; the person picks individuals, sees a preview of the message (group code or plan link) and sends it through the share sheet or Messages.
- **Rules:** contacts are never uploaded or stored. Denying contact permission leaves Copy and Share fully working. No group is created automatically.
- **Done when:** with contact permission denied, inviting by code still works with no dead end.

### P1-08 Google sign-in

- **Behavior:** Continue with Google appears next to Sign in with Apple (required by the App Store when Google is offered) and email code. Linking Google to an existing account keeps the same user ID.
- **Done when:** a guest who signs in with Google keeps their votes and RSVPs.

## P2: Group memory

**Entry gate:** at least 4 pilot groups sent a second plan within 28 days of their first. **Exit gate:** groups can correct their history and start a second plan from it without help.

### P2-01 Did it happen?

- **Who:** the organizer reports the outing; each invitee reports themselves.
- **Behavior:** 2 hours after a plan's end time, the organizer sees "Did Sketch and stroll happen?" with Happened, Didn't happen, Not sure. Invitees who were Going see "Did you go?" with Yes, No, Skip. Both can change their answer later from the plan.
- **Rules:** a Going RSVP never counts as attendance. Silence is never counted as Yes or No. Cancelled plans are kept in history but excluded from outing counts. Changing to Didn't happen removes it from the counts.
- **Group history:** Group detail shows Past outings with labels "Planned", "Maya says it happened" and "You went".
- **Data:** `outing_reports` (`plan_id`, `organizer_status`, `reported_at`), `attendance` (`plan_id`, `user_id`, `attended` yes/no, `updated_at`).
- **Done when:** a plan with 4 Going and no reports shows 0 attended; correcting Happened to Didn't happen lowers the group's outing count by one.

### P2-02 Shared album

- **Who:** invitees who said they went.
- **Behavior:** each past plan has Photos and notes. Upload up to 20 photos per person per plan (JPEG, PNG, HEIC, WebP, up to 15 MB each) and a note up to 500 characters. The upload sheet names the audience first: "Visible to the 4 people on this plan". Sharing to the whole group is a separate button with "Current and future group members will see this".
- **Privacy:** location data is stripped from every photo on the phone before upload and again on the server. No face tagging. Albums are never public in P2.
- **Control:** people can delete their own photos and notes at any time, even after leaving the group; deletion removes them from every Sidequest view. Members can report a photo, which hides it for the reporter and queues it for review.
- **Failures:** a failed upload stays as a draft with Retry and never shows as posted.
- **Data:** `album_items` (`plan_id`, `user_id`, `kind`, `storage_path`, `audience` plan or group, `note`, `reported_count`); files in Supabase Storage with access rules matching `audience`.
- **Done when:** someone who wasn't on the plan can't open a plan-audience photo by URL; a deleted photo disappears from every phone within one refresh.

### P2-03 Feedback and preferences

- **Feedback:** after reporting they went, each person can rate the outing Would do again, Maybe, or Not for me, with optional tags (Too pricey, Too far, Great for groups, Bad timing) and a short reason. It is private unless they tap Share with group.
- **Group summary:** shows only shared feedback ("3 of 4 who shared would do again"); never an average that includes people who didn't share.
- **Preferences:** Profile lets people set interests (from P1-06), a budget comfort range, preferred days and times, and accessibility needs. All private, all editable or removable.
- **Data:** `feedback` (`plan_id`, `user_id`, `rating`, `tags`, `reason`, `shared`), `preferences` (per user).
- **Done when:** unshared feedback never appears in any group view or API response for other members.

### P2-04 Plan again and repeating plans

- **Plan again:** on a past plan, creates a new draft with the same experience and the same recipients selected for the organizer to review. Price, hours and sessions are re-read from the current catalog and any change is shown. No RSVP, vote, booking or attendance carries over. A removed experience offers three similar ones in its place.
- **Repeating plans:** the organizer can set Repeat: weekly, every 2 weeks or monthly on a plan. Each repeat creates a new draft 7 days before its date and notifies the organizer to review and send. Nothing is sent automatically.
- **Done when:** Plan again on a plan whose price rose shows "Price changed from $30 to $38" before sending.

### P2-05 Bucket list and seasonal picks

- **Bucket list:** each group gets a Bucket list tab next to Saved ideas: experiences members mark "Want to do someday", ordered by how many members added them. Any item can start a pick or plan.
- **Seasonal picks:** a team-curated collection on Map ("Fall in Austin", "Holiday lights") with a curator name, date range and review date. Experiences out of season or with no upcoming sessions are hidden.
- **Done when:** a seasonal collection disappears from Map after its end date without a code change.

## P2: Revenue

**Sidequest earns from local businesses that want groups to come to them, not from users.** Every group plan is a booking of 3–8 people, which is what venues pay for. The app stays free for users, never sells personal data, and never processes ticket or venue payments. Prices below are proposals to test with venues, not decisions.

| Stream | Who pays | How it earns | Proposed price |
| --- | --- | --- | --- |
| P2-06 Partner listings | Venues and activity hosts | Monthly subscription for a managed listing and group stats | $49/month; first 2 months free for the first 15 Austin partners |
| P2-07 Group offers | Included for partners | Drives partner sign-ups and renewals | Included in the listing |
| P2-08 Sponsored placements | Partners | Flat fee per week for a labeled slot | $25/week per category slot |
| P2-09 Booking referrals | Booking providers with affiliate programs | Commission on bookings that start from Sidequest | Provider's published rate |
| P2-10 Partner portal and billing | (Enables the above) | Self-serve sign-up and payment | Card processing fees only |

**Rules for every revenue feature:**

- Paid items are always labeled ("Partner", "Offer", "Sponsored") in words, on every screen they appear.
- The person's filters (activity, price, date, area) apply before any paid item is shown. A sponsored item that doesn't match the filters isn't shown.
- Paid status never affects group pick scoring, the tie-breaker or a plan's details.
- Targeting uses only the visible context (category, area, date filter). Budgets, calendars, feedback, attendance and private saves are never used to place paid items or shared with partners.
- Partners see aggregate numbers only, and only when at least 10 people are counted; never names or profiles.
- Booking stays on the provider's site. Sidequest never takes payment from users.

### P2-06 Partner listings

- **Who:** a venue or activity host whose experience is already in the catalog (or passes review via P0-18) and signs up in the partner portal (P2-10).
- **What they get:** a Partner badge on their experiences; up to 10 photos; editable sessions and hours (reviewed changes go live after a team check, within 1 business day); a booking link; group offers (P2-07); and monthly stats: views, saves, picks it appeared in, plans made, and reported outings (P2-01).
- **What doesn't change:** partners can't edit price labels to hide costs, remove the booking notice or delete user-shared photos. Partner experiences appear in normal results by the same rules as everyone else; there's no ranking boost.
- **Ending:** if billing lapses for 14 days, the badge, offers and extra photos turn off; the basic listing stays.
- **Data:** `partners` (`id`, `name`, `contact_email`, `status` trial, active, past\_due, cancelled), `partner_experiences` (`partner_id`, `experience_id`), `partner_stats_monthly`.
- **Done when:** a partner edits a session time in the portal, a reviewer approves it, and the change appears on Detail; a lapsed partner's badge disappears automatically.

### P2-07 Group offers

- **What:** a partner creates an offer for groups, such as "Groups of 4+: 15% off" or "Free appetizer for 5+". Each offer has a title, terms (up to 300 characters), minimum group size, valid days and times, an end date and an optional monthly cap.
- **Where users see it:** an Offer tag on Map, List and Detail; on the plan when the plan's Going count meets the minimum, the plan shows the offer and a 6-character redemption code the organizer shows at the venue.
- **Redemption:** Sidequest doesn't process payment or discounts. The venue marks a code Redeemed in the portal (or the code is shown and that's it, if the partner prefers). Each plan gets one code per offer.
- **Rules:** an offer never changes the experience's listed price label. Expired or capped offers disappear automatically. Offers are never shown on cancelled plans.
- **Data:** `offers` (`partner_id`, `experience_id`, `title`, `terms`, `min_group`, `valid_rules`, `ends_at`, `monthly_cap`), `offer_codes` (`offer_id`, `plan_id`, `code`, `redeemed_at`).
- **Done when:** a plan with 3 Going for a "4+" offer shows "1 more Going unlocks this offer"; at 4 Going the code appears; a second plan gets a different code.

### P2-08 Sponsored placements

- **What:** a partner buys a weekly slot for one category in Austin (for example Make something). Their experience appears as one card labeled "Sponsored" in that category's results.
- **Placement rules:** at most one sponsored card per screen of results, never first on Map, never inside a group pick, a plan, the Plans hub or a seasonal collection. It must match the person's current filters, and it is hidden from someone who has already saved, planned or dismissed it.
- **Controls:** "Why am I seeing this?" explains "Sponsored by Eastside Clay Co-op for Make something this week"; Hide this hides it for 30 days.
- **Inventory:** one slot per category per week, sold first-come in the portal, so there are at most 7 sponsored experiences at once.
- **Data:** `sponsorships` (`partner_id`, `experience_id`, `category`, `week_start`, `status`), `sponsor_impressions` and `sponsor_clicks` (counts per day, no user IDs stored with them).
- **Done when:** with the price filter at Under $25, a $38 sponsored experience doesn't appear; hiding one keeps it hidden for 30 days on that account.

### P2-09 Booking referrals

- **What:** when an experience's booking provider runs an affiliate or referral program, the Book link carries Sidequest's referral ID, and Sidequest earns that provider's commission on completed bookings.
- **Disclosure:** every referral link shows "Sidequest may earn a commission if you book" beside the button, and the same line is in the Terms.
- **Rules:** the referral version of a link must go to the same page and price as the plain link. Referral status never changes which experiences are shown or their order. Clicks are counted per experience per day without user IDs.
- **Data:** `experiences.booking_url_referral`, `referral_programs` (provider, terms link, rate), `referral_clicks_daily`.
- **Done when:** every booking-required experience with a known program shows the disclosure, and the link opens the provider's own page.

### P2-10 Partner portal and billing

- **What:** a small web app for partners, separate from the phone app, using the same Supabase project with its own partner login (email code).
- **Pages:** Sign up (business name, contact, which catalog experiences are theirs, verified by the team before activation); Listing (photos, sessions, booking link; edits go to review); Offers (create, pause, see codes and redemptions); Sponsorship (buy available weeks); Stats (monthly numbers from P2-06); Billing.
- **Billing:** card payments through Stripe Checkout for the monthly subscription and sponsorship weeks; invoices and cancellation through Stripe's customer portal. Partners pay on the web, not in the phone app. A webhook updates `partners.status` when payments succeed or fail.
- **Team admin view:** approve partners, review listing edits and offers, see revenue by stream and refund or pause any paid item.
- **Done when:** a test partner signs up, pays with a Stripe test card, gets the Partner badge on their experience, and loses it when the subscription is cancelled.

### Revenue measures

| Measure | Definition |
| --- | --- |
| Monthly recurring revenue | Sum of active partner subscriptions |
| Paying partners | Partners in status active at month end |
| Partner retention | Partners active this month who were active 3 months ago |
| Plans at partner venues | Sent plans whose experience belongs to an active partner |
| Offer redemptions | Codes marked redeemed per month |
| Sponsored click-through | Clicks divided by impressions, per slot |
| Referral clicks | Book taps on referral links per month |
| Guardrails | Hide-this rate on sponsored cards, reports of misleading offers, any drop in first-plan activation after revenue features launch |

## Rules for every screen

- **States:** every screen that loads data has Loading (skeleton), Empty (what's missing and one action), Error (what failed, Try again keeps what was on screen) and Ready. Expired links, revoked access, closed picks and cancelled plans each have their own message and next step.
- **Forms:** errors appear under the field in words that say how to fix them; typed values are never cleared by an error. A slow action shows progress and can't be tapped twice.
- **Text limits:** display name 1–60; group name 1–50; experience name 1–100; meeting point 1–200; plan note 500; description 2,000; feedback reason 280; offer terms 300. Leading and trailing spaces are trimmed. Prices are zero or more, in USD; a range needs max ≥ min.
- **Time:** store every time as UTC plus the experience's time zone (America/Chicago). Show times in that zone with the zone named on Review and Plan. Reject local times that don't exist on daylight-saving change days instead of shifting them.
- **Retries:** every write that creates something (send, vote, RSVP, submission, offer code, payment webhook) carries a request ID so repeating it never creates a duplicate.
- **Permissions are server-side:** row-level security plus server functions decide every read and write. Hiding a button is never the only protection.
- **Device permissions:** location, notifications, calendar, contacts and photos are each asked for only at the moment they're used, and every flow has a path that works when they're denied.
- **Accessibility:** tap targets at least 44 × 44 pt; works at 200% text size; screen reader labels on every control; status always in words, never color alone; everything on the map is also in the list.
- **Analytics (PostHog from P1; event log table in P0):** experience\_viewed, pick\_created, vote\_cast, pick\_closed, plan\_drafted, plan\_sent, invite\_viewed, rsvp\_saved, plan\_edited (material or minor), plan\_cancelled, outing\_reported, offer\_shown, offer\_redeemed, sponsored\_shown, sponsored\_clicked, referral\_clicked. Never log notes, contacts, calendar contents, budgets, photos or raw invite codes.

## Data model and server functions

**These tables and functions are the contract between the app and the backend; change them only with the whole team.** Stack: Supabase (Postgres, row-level security, Realtime, pg\_cron) and an Expo app; no separate server. Every write goes through a database function so access checks and state rules live in one place.

### Tables

| Table | Key columns | Phase |
| --- | --- | --- |
| `profiles` | `id` (auth user ID), `display_name` (null until first set), `avatar_path`, `budget_cap`, `transport` | P0 |
| `groups` | `id`, `name`, `owner_id`, `archived_at`, `client_key` (unique) | P0 |
| `group_members` | `group_id`, `user_id`, `role` (owner, member), `joined_at`, `removed_at`, `blocked`; unique (group, user) | P0 |
| `join_codes` | `code` (6 chars, no 0/O/1/I), `group_id`, `expires_at`, `revoked_at` | P0 |
| `experiences` | `id`, `name`, `category`, `description`, `lat`, `lng`, `area`, `image_url`, `address`, `provider_name`, `price_kind`, `price_min`, `price_max`, `timing_kind`, `sessions` (JSON), `hours_text`, `duration_min`, `meeting_point`, `booking_required`, `booking_url`, `booking_url_referral`, `source`, `checked_on`, `status`, `version` | P0 (referral P2) |
| `saves` | `experience_id`, `user_id`, `group_id` (null = personal); unique (experience, user, group) | P0 |
| `picks` | `id`, `group_id`, `organizer_id`, `client_key` (unique), `title`, `created_at`, `closed_at`, `deadline`, `starred_option_id`, `state` (open, closed, planned, cancelled), `winner_option_id`, `tie_rule`, `override_option_id` | P0 |
| `pick_options` | `id`, `pick_id`, `experience_id`, `proposed_start`, `position` | P0 |
| `votes` | `option_id`, `user_id`, `value` (yes, maybe, no); unique (option, user) | P0 |
| `option_tallies` | `option_id` (primary key), `yes`, `maybe`, `no`; server-maintained counts | P0 |
| `pick_voter_status` | `pick_id`, `user_id`, `complete`; unique (pick, user), server-maintained | P0 |
| `join_attempts` | `user_id` (primary key), `window_start`, `attempts`, `blocked_until`; server-only counters, no raw codes | P0 |
| `plans` | `id`, `group_id`, `organizer_id`, `experience_id`, `pick_id`, `state` (draft, sent, cancelled), `current_revision`, `client_key` (unique), `cancel_reason`, `experience_name`, `experience_category` (snapshots), `updated_at`, `repeat_rule` | P0 (repeat P2) |
| `plan_revisions` | `plan_id`, `revision`, `start_at`, `end_at` (UTC), `time_zone`, `meeting_point`, `note`, `price_snapshot`, `booking_required`; unique (plan, revision) | P0 |
| `rsvps` | `plan_id`, `user_id`, `status` (going, cant\_go, awaiting, needs\_reconfirm), `revision`, `removed_at`; unique (plan, user) | P0 |
| `plan_links` | `token`, `plan_id`, `expires_at`, `revoked_at` | P0 |
| `submissions` | `id`, `author_id`, `experience_id` (for edits), `payload` (JSON), `state`, `reason`, `reviewer_id`, `client_key` | P0 |
| `listing_reports` | `experience_id`, `version`, `user_id`, `issue`, `created_at` | P0 |
| `availability` | `option_id`, `user_id`, `status` (free, busy), `source` (manual, calendar) | P1 |
| `calendar_shares` | `user_id`, `group_id`, `enabled` | P1 |
| `push_tokens`, `notification_prefs`, `notification_log` | device token per user; on/off per type; one row per sent notification (for de-duplication) | P1 |
| `interests` | `user_id`, `category`, `answer` (yes, maybe, no) | P1 |
| `outing_reports`, `attendance` | organizer's Happened / Didn't / Not sure; each person's Yes / No | P2 |
| `album_items` | `plan_id`, `user_id`, `storage_path`, `audience` (plan, group), `note`, `hidden` | P2 |
| `feedback`, `preferences`, `bucket_items` | rating, tags, shared flag; private preferences; group bucket list | P2 |
| `partners`, `partner_experiences` | business, contact, Stripe customer ID, `status` (trial, active, past\_due, cancelled) | P2 |
| `offers`, `offer_codes` | offer terms and limits; one code per plan per offer, `redeemed_at` | P2 |
| `sponsorships`, `sponsor_stats_daily`, `referral_clicks_daily`, `sponsor_hides` | weekly slots; daily counts without user IDs; per-user hides for 30 days | P2 |

### Functions

| Function | Does | Rules it enforces | Phase |
| --- | --- | --- | --- |
| `create_group(name)`, `join_group(code)`, `regenerate_code(group_id)`, `remove_member(group_id, user_id)`, `transfer_owner(group_id, user_id)` | Group lifecycle | Account for create; owner for the rest; codes valid, not revoked or expired; blocked users can't join | P0 |
| `toggle_save(experience_id, group_id)` | Adds or removes one save | Account holder; member of the group | P0 |
| `create_pick(group_id, options[], deadline, starred)`, `add_option(pick_id, …)` | Opens a pick | Account and member; 2–5 options; one open pick per group; deadline 1 h to 7 days | P0 |
| `cast_vote(option_id, value)` | Upserts or clears one vote | Member; pick open | P0 |
| `close_pick(pick_id)`, `close_due_picks()` | Scores, stores winner and `tie_rule` | Organizer or cron; runs once. Order: score desc, No asc, starred first, position asc | P0 |
| `send_plan(client_key, …)` | Plan, revision 1, RSVPs | Same key returns the same plan; organizer Going, others Awaiting reply | P0 |
| `respond(plan_id, revision, status)` | Sets caller's RSVP | Invitee; plan Sent; before start; revision current, else `stale_revision` | P0 |
| `edit_plan(plan_id, changes)` | Minor edit or new revision | Organizer; material fields create a revision and flip Going to Needs reconfirmation; returns that count | P0 |
| `cancel_plan(plan_id, reason)` | Cancels | Organizer; wins over concurrent RSVPs | P0 |
| `add_invitees`, `create_plan_link`, `join_plan(token)` | Invitees after send | Organizer for add and link; token valid; joining twice does nothing | P0 |
| `submit_listing(client_key, payload)`, `review_submission(id, decision, reason)` | Suggestions and review | Account; reviewer role for decisions | P0 |
| `set_availability`, `calendar_freebusy` (on the phone) | Free/busy per option | Member; only free/busy leaves the phone | P1 |
| `notify(event)` (Edge Function) | Push via Expo | De-duplicates via `notification_log`; respects prefs | P1 |
| `report_outing`, `report_attendance`, `add_album_item`, `set_feedback` | Group memory | Organizer for outing; self for the rest; attended = yes for album | P2 |
| `issue_offer_code(plan_id, offer_id)`, `redeem_code(code)` | Offers | Going count ≥ minimum; offer active; partner for redeem | P2 |
| `stripe_webhook` (Edge Function) | Updates partner and sponsorship status | Verifies Stripe signature; idempotent on event ID | P2 |

**Realtime subscriptions:** `group_members`, `picks`, `pick_options`, `option_tallies`, `pick_voter_status`, `plans`, `plan_revisions`, `rsvps`. Clients invalidate queries and refetch under RLS. Raw `votes` are never published; only each voter can read their own rows (C1/G9, approved Nov 10).

**Row-level security in one line each:** members read their group, its picks, aggregate tallies and voter completion; voters read only their own votes; invitees read their plans, revisions and RSVPs; nobody writes tables directly, only through the functions above; `experiences` publishes catalog rows to signed-in accounts only (D1); profile rows are self-only because budget and transport are private. Roster RPCs must return only display name/avatar projections. Plans are visible only to the organizer or active invitees, never through group membership. Partners (P2) read only their own partner, offer and sponsorship rows and aggregated stats; they can never read users, groups, plans or RSVPs.

## Demo acceptance (Nov 22)

**The demo is done when all eight steps below pass live, in order, on three phones (at least one iPhone and one Android), with no app restart and no manual database edits.** Requirement IDs refer to the [Sidequest Product Spec](https://claude.ai/artifact/5zUQic45hFucMoWdYPRZkN).

| Step | What happens on stage | Passes when | Spec |
| --- | --- | --- | --- |
| D1 | Maya signs in (Apple or email code) and creates "Saturday crew" | Group exists; a 6-character join code is shown | P0-02, P0-03 |
| D2 | Jordan and Sam enter the code on their own phones and join as guests | Both appear in Maya's member list within 5 seconds, marked guest | P0-01, P0-03 |
| D3 | Maya opens Map, filters by price, opens three experiences and adds each to a new group pick | Pick shows 3 options; guests see it in their Plans hub | P0-04–06, P0-08 |
| D4 | All three vote Yes / Maybe / No | Tallies update on every phone within 2 seconds, no pull-to-refresh | P0-08 |
| D5 | Maya taps Close now | Every phone shows the same winner and the tie-break sentence | P0-09 |
| D6 | Maya drafts the plan from the winner, reviews it and sends | Plan shows 1 Going, 2 Awaiting reply; guests see it under Needs your response | P0-10–12 |
| D7 | Jordan taps Going, Sam taps Can't go | Counts read 2 Going, 0 Awaiting, 1 Can't go on all phones | P0-13 |
| D8 | Maya moves the start time 1 hour later | Jordan becomes Needs reconfirmation, sees old and new time, taps Going again; counts return to 2 Going | P0-14 |

**Two reliability checks run before demo day (not on stage):** sending a plan with the network cut and retrying creates exactly one plan (T04), and the whole script works with location permission denied (T01).

**Demo deadline note:** the spec's minimum pick deadline is 1 hour, so the demo creates the pick with the default deadline and uses Close now. No special demo deadline is needed.

## Open questions

- [ ] **Tallies:** members see totals plus who has voted, not who voted what (current default). Confirm with design.
- [ ] **Partner pricing:** $49/month listing and $25/week sponsorship are guesses. Interview 5 Austin venues before P2; ask what a group of 6 is worth to them.
- [ ] **Affiliate programs:** list which booking providers in the catalog actually run referral programs and their terms before building P2-09.
- [ ] **Partner payments outside the app:** confirm that partners paying on the web (not in the phone app) is allowed under App Store rules, since what they buy is advertising, not something used in the app.
- [ ] **Legal before P2:** Terms of Service, Privacy Policy, sponsored and affiliate disclosures (FTC), and a content policy for albums.
- [ ] **Product spec update:** the product spec places sponsored placements in P4 and partner content in P3; this spec moves paid listings, offers and sponsorship to P2. Update the product spec to match once the team agrees.
- [ ] **Reviewer and content owner:** who reviews submissions (P0-18) and partner edits (P2-06), and what response time we promise partners.
