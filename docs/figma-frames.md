# Figma frames

Where each screen's frame is in Noah's Figma copy (file `MkYNxuYFuktTR0yGExJnK7`, page App Wireframes, node `28:2943`). Cite the section's node ID at the top of the screen file and in the PR body (AGENTS.md, D14). Open a section with `https://www.figma.com/design/MkYNxuYFuktTR0yGExJnK7/Event-Planning-App--Copy-?node-id=<id with - for :>`.

## How the draft sections are drawn

The original sections (1.x to 6.x) were designed by hand. Every section below them is an AI draft (D14, D17) drawn in the same pattern, so the two can be read the same way:

- Each screen is a phone group named `iPhone · <screen>`: the 420×868 bezel with a 390×844 screen inside, on the same gradient as the originals.
- The screen stacks the `Status Bar` instance, the 52 pt nav bar, a `Content` auto layout (padding 8, 20, 24, 20), and then either the `Tab Bar` instance or a white `Footer` with a `Button` instance and the `Home Indicator`.
- Buttons, chips, tags, inputs, toggles, radios, checkboxes, avatars and icons are instances of the Components page (`3:2`). Cards, rows, the segmented control and the bottom sheet are copies of the ones on the original screens.
- Each section sets the Theme collection to the **Dawn** mode, as the originals do. Without it the components render in the grayscale Wireframe mode.
- A screen taller than one phone is split into two phones (`… · scrolled`). Sheets sit over the real screen behind them, dimmed with the scrim from 4.5.
- Sections ported from the D16 design artifact end with a white **Notes** card: the states, copy rules and cuts from that board. Treat the notes as part of the frame.
- Form errors use `accent/orange-ink` with an info icon under the field. The originals have no error state, and the tokens have no red.

The first versions of PRO-15 to PRO-20 (bare 390×844 frames without the phone, status bar or component instances) are on the page **Archive · replaced drafts**. The section IDs did not change.

## Original sections

| Section | Node | Screens |
| --- | --- | --- |
| Style Guide | `28:2944` | Colors and type |
| Onboarding & Access | `28:3024` | 1.1 Welcome `28:3027`, 1.2 Join with Code `28:3048`, 1.3 Profile Setup `28:3089`, 1.4 Interests & Budget `28:3118`, 1.5 Calendar & Permissions `28:3178` |
| Home & Groups | `28:3383` | 2.1 Home `28:3386`, 2.2 Create Group, 2.3 Group Lobby, 2.4 Group Hub `28:3591` |
| Planning Flow | `28:3915` | 3.1 New Plan, 3.2 Activity Quiz, 3.3 Mark Availability, 3.4 Best Times, 3.5 Group Suggestions, 3.6 Group Vote `28:4264`, 3.7 Plan Details & RSVP `28:4321` |
| Discover | `28:4623` | 4.1 Discover Feed `28:4626`, 4.2 Filters, 4.3 Map View `28:4763`, 4.4 Event Detail `28:4809`, 4.5 Plan This · Send to Group, 4.6 Post an Event |
| Meet People & Safety | `28:5234` | 5.1 to 5.4 (not in scope, PRO-9) |
| Activity, Memories & Profile | `28:5632` | 6.1 Activity, 6.2 Shared Album & Rating, 6.3 My Profile, 6.4 Bucket List, 6.5 Calendar & Notifications |

## P0 draft sections

| Section | Node | Req | Screens | App files |
| --- | --- | --- | --- | --- |
| PRO-15 · Suggest an activity and the review queue | `4046:3700` | P0-18 | Suggest an activity · form with 3 errors (and · scrolled); Your suggestions · every review state; Review queue · team reviewers only; Review a suggestion (and · scrolled) | not built yet (TEC-99, TEC-100) |
| PRO-16 · Settings: sign out and delete account | `4046:3937` | P0-02 | Settings; Delete account · confirm sheet | `auth/SettingsScreen.tsx` |
| PRO-17 · Group owner controls | `4046:4006` | P0-03 | Group · owner view; Join code options sheet; Member actions sheet; Leave group · owner picks a new owner | `groups/GroupManage.tsx`, `groups/GroupDetailScreen.tsx` |
| PRO-18 · Plan link and adding people to a sent plan | `4046:4165` | P0-13 | Invite more · organizer sheet; Plan link preview · invitee; Plan link ended or turned off; Add people to a sent plan | `plans/InviteesPanel.tsx`, `plans/PlanLinkScreen.tsx` |
| PRO-19 · Cancel a plan and the cancelled plan | `4046:4304` | P0-15 | Cancel plan sheet; Cancelled plan | `plans/CancelPlanSheet.tsx`, `plans/PlanScreen.tsx` |
| PRO-20 · Save sheet and group saved ideas | `4046:4367` | P0-07 | Save sheet; Group · Ideas tab (saved ideas) | `discovery/SaveSheet.tsx`, `groups/SavedIdeas.tsx` |
| P0-02 · Sign in with email code and username prompt | `4145:16991` | P0-02 | Sign in with email; Enter your code; Pick a username | `auth/EmailSignInScreen.tsx`, `auth/UsernamePromptScreen.tsx` |
| P0-08 · Group pick: build and vote Yes, Maybe or No | `4145:17286` | P0-08, P0-09 | Start a group pick; Vote · Yes, Maybe or No; Start a group pick · no ideas yet | `picks/PickBuilderScreen.tsx`, `picks/PickVotingScreen.tsx`, `picks/PickOrganizerActions.tsx` |
| P0-10 to P0-12 · Start a plan, draft, review and send | `4145:17963` | P0-10 to P0-12 | Start a plan · which group; Plan draft; Plan draft · errors; Review your plan | `plans/StartPlanButton.tsx`, `plans/PlanDraftScreen.tsx` |
| P0-14 · Edit a sent plan and reconfirm | `4145:18677` | P0-14 | Edit plan sheet; Save these changes?; Plan · changed, are you still going? | `plans/EditPlanSheet.tsx`, `plans/ReconfirmBanner.tsx` |
| P0-16 · Plans hub with Drafts and Past | `4145:19280` | P0-16 | Plans; Plans · nothing yet | `plans/PlansHubScreen.tsx` |
| P0-03 and P0-15 · Booking notices and leaving a group | `4145:19786` | P0-03, P0-15 | Booking notices on Detail; Group · you're no longer in this group | `discovery/BookingNotice.tsx`, `groups/GroupRosterScreen.tsx` |
| TEC-109 · Profile defaults and photo | `4145:12152` | P0-17 | A Profile tab, entry point; B Budget and getting around, nothing set; C Saved; D Field error; E Error on save; F Loading the saved values; G Profile photo sheet; H Photo library denied | `auth/ProfilePhotoControl.tsx` (TEC-157); profile defaults not built yet (TEC-98) |
| TEC-100 · Report outdated info | `4145:16403` | P0-18 | A Detail: the link; B Report sheet; C Sent | not built yet (TEC-100) |

## P1 draft sections

| Section | Node | Req | Screens |
| --- | --- | --- | --- |
| TEC-144 · Free or Busy per time option | `4145:20163` | P1-01 | A Pick builder: availability on; B Voting screen; C Saving, error and counting; D Voting closed |
| TEC-145 · Settings: Calendar | `4145:20920` | P1-02 | A Settings (entry point); B Calendar, not allowed yet; C Calendar allowed; D Denied or revoked in iPhone Settings |
| TEC-146 · Add to calendar and Update notice | `4145:22330` | P1-03 | A Plan, Going; B Choose a calendar; C Added; D After a time change: Update; E Calendar access denied |
| TEC-150 · Settings: Notifications and Nudge | `4145:21543` | P1-04 | A Notifications; B Asking for permission; C Denied in iPhone Settings; D Plan: Nudge (organizer) |
| TEC-147 · Fits everyone's budget chip | `4145:23408` | P1-05 | A Chip available, off; B Chip on; C Chip check failed |
| TEC-148 · Activity quiz | `4145:25136` | P1-06 | A Intro; B A card; C Last card: saving and error; D Discover, matches first | `quiz/QuizScreen.tsx` (A to C), label in `discovery/MapListScreen.tsx` and order in `discovery/DiscoveryResults.tsx` (D); entry in Settings |
| TEC-149 · Invite from contacts | `4145:24283` | P1-07 | A Group page: Invite from contacts; B Message preview; C Contacts denied |

## P2 draft sections

| Section | Node | Req | Screens |
| --- | --- | --- | --- |
| TEC-151 · Did it happen and Past outings | `4145:25677` | P2-01 | A Plan, organizer prompt; B Plan, invitee prompt; C After answering; D Group page: Past outings | `outings/OutingPrompts.tsx` (A to C), `outings/PastOutings.tsx` (D) |
| TEC-152 · Shared album | `4145:28190` | P2-02 | A Past plan: photos and notes; B Upload sheet; C Failed upload stays a draft; D Share with the group; E Someone else's photo: report; F Your photo: delete |
| TEC-153 · Feedback, summary and preferences | `4145:27293` | P2-03 | A Feedback sheet; B Sharing on, save error; C Group summary; D Preferences (Profile) | `feedback/FeedbackSheet.tsx` (A, B), `feedback/OutingFeedback.tsx` and `outings/PastOutings.tsx` (C), `feedback/PreferencesScreen.tsx` (D, opened from Settings until the Profile screen lands) |
| TEC-154 · Plan again and Repeat | `4145:29393` | P2-04 | A Past plan: Plan again and Repeat; B Repeat; C Plan again draft, price changed; D Activity no longer listed; E Landing from the reminder | `plans/again.ts`, `plans/PlanAgainScreen.tsx` (D), `plans/AgainBanner.tsx` (C, E), `plans/RepeatControl.tsx` (A, B); route `app/plan/again.tsx` |
| TEC-155 · Bucket list and seasonal picks | `4145:30172` | P2-05 | A Group page: Bucket list; B Bucket list, empty; C Detail: Want to do someday; D Which group?; E Discover: seasonal collection chip | `bucket/BucketList.tsx` (A, B), `bucket/WantToDo.tsx` (C, D), `bucket/collections.ts` and the chip in `discovery/MapListScreen.tsx` (E) |
| TEC-156 · Add a local spot | `4145:31425` | P2-11 | A Form, top; B Form, scrolled; C Discover: label and filter; D Detail: label, author, report, edit |

## Open design questions in the frames

- **Drafts and Past (P0-16):** where they live under the Figma bottom bar (Home or Activity) is not decided. The frame follows the app's Plans screen.
- **Group vote (P0-08):** 3.6 draws "pick all you'd go to" with checkboxes; the spec and the app use Yes, Maybe or No. The P0-08 section draws the spec's vote; 3.6 stays the frame for the result.
- **Cancelled plan in a calendar (P1-03):** the TEC-146 notes keep the D16 default (retitle the event "Cancelled: …").
- **Preference chips (P2-03):** the days, times and access chips are a starting list from the spec.
