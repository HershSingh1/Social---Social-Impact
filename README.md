# Sidequest

A mobile app for a group of friends in Austin to pick something to do and turn it into a plan with RSVPs.
Built with Expo (React Native, TypeScript, Expo Router) on the front and Supabase (Postgres, RLS, RPCs, Realtime) on the back. iPhone only for now (decision D9).

This page takes you from a fresh Mac to your first pull request. You bring your own AI coding agent (Claude Code, Codex or similar). The rules every agent must follow are in [`AGENTS.md`](AGENTS.md), and your agent reads that file by itself.

**This repository is public.** Never put keys, passwords, sign-in codes, emails or real names of testers in a commit, a PR, a Linear comment or an agent prompt.

## How work flows from issue to merge

```
Linear issue (agent-ready)  ->  your agent builds it on its own branch  ->  PR into v2-figma  ->  a person reviews and merges
```

- Work is tracked in Linear. Build issues are `TEC-` (team Tech); decisions and design are `PRO-`. [`docs/linear.md`](docs/linear.md) maps every requirement to its issues.
- The working branch is **`v2-figma`**, not `main`. Every branch starts from `v2-figma` and every PR goes into it.
- One issue = one agent = one branch = one PR. Two agents on the same issue or the same files will conflict.
- **Agents never merge their own PRs.** A person reviews and merges every one.
- The spec and the team's decisions are the source of truth for what to build. Figma is the source of truth for how it looks. Order of precedence: `docs/spec-decisions.md`, then `docs/spec.md`, then Figma, then `docs/wireframe.html`.

## 1. What you need before you start

Ask your team lead for these. Nothing below can be found in the repo, and none of it should ever be committed.

| You need | Why | Who gives it |
| --- | --- | --- |
| Write access to this GitHub repo (or a fork) | Push branches and open PRs | Team lead |
| A Linear invite to the Sidequest workspace (teams Tech and Product & Design) | Read issues, post verification comments, see which issues are yours | Team lead |
| Access to the Figma file [Event Planning App](https://www.figma.com/design/CUXYzgoB8YBvoorBUj1Oly/Event-Planning-App?node-id=28-2943) with enough rights for your agent's Figma connection to read frames and variables | Build screens from the real design | Team lead / file owner |
| The Supabase dev project **URL** and **anon (publishable) key**, shared privately | Fill in `app/.env` so the app can talk to the backend | Team lead |
| Your issue assignment | Only the team assigns owners. Don't pick your own | Team lead |
| Your own agent subscription and API access | We don't share agent accounts | You |

Only if you need them:

| You need | When | Who gives it |
| --- | --- | --- |
| Your email added to the Supabase org (or the email provider's authorized-recipient list) | To receive the 6-digit sign-in code. The dev project's built-in email only delivers to approved addresses | Team lead |
| The Expo project ID (`EAS_PROJECT_ID`) and an invite to the Expo org | Only for cloud builds with EAS | Team lead |
| Membership in the paid Apple Developer team and your phone registered | Only for running on a physical iPhone and for Sign in with Apple. The Simulator works without it | Team lead |

## 2. Set up your Mac

You need a Mac with:

- Xcode from the App Store, opened once so it finishes installing, with an iOS Simulator runtime.
- Node.js, a current LTS or newer.
- CocoaPods: `brew install cocoapods`
- git and the GitHub CLI (`brew install gh`, then `gh auth login`).

Then:

```bash
git clone https://github.com/HershSingh1/Social---Social-Impact.git sidequest
cd sidequest
git switch v2-figma

cd app
npm ci
cp .env.example .env
```

Open `app/.env` and fill in the two values your lead gave you:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Leave `EAS_PROJECT_ID` alone unless you are doing EAS cloud builds. `.env` is git-ignored. Keep it that way. Use only the anon/publishable key; a `service_role` key must never go in the app.

Check it:

```bash
npm run check:env
```

It prints "Client environment is configured" when the values look right. It does not test the network.

## 3. Run the app on the iPhone Simulator

Expo Go will **not** work. The app uses native modules (Sign in with Apple, maps, location, clipboard), so it needs a development build. Building it locally is free.

**First time (about 5 to 10 minutes):**

```bash
cd app
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # stops CocoaPods crashing with a Unicode error
xcrun simctl list devices available            # pick a device name, e.g. "iPhone 17 Pro"
npx expo run:ios --device "iPhone 17 Pro"
```

This generates the `ios/` folder, installs the pods, compiles, installs the app in the Simulator and starts Metro. `ios/` is generated and git-ignored: never edit or commit it.

**Every day after that**, you only need Metro:

```bash
cd app
npm run start:dev
```

Press `i` to open the Simulator, or open the Sidequest app that is already installed there. JavaScript changes reload on save.

**Rebuild the native app** (`npx expo run:ios` again) whenever someone adds a native package, changes `app.json` or `app.config.js` plugins, or you pull changes that do. The sign that you forgot: a red screen saying `Cannot find native module 'ExpoSomething'`.

**Quick check that it works:** the app opens to the welcome or sign-in screen. If you get a red `Cannot find native module` screen instead, see section 10. To see every shared UI component, run `xcrun simctl openurl booted sidequest://dev/ui-kit`.

Notes:

- Signing in uses an email code (or Apple or Google). The first time, you need to be on the allowed-recipients list (see section 1).
- Sign in with Apple may need the Simulator signed in to an Apple ID. Use the email code if it doesn't work.
- Android is not a target right now (decision D9). Don't build or test for it.
- Physical iPhone: see [`docs/development-builds.md`](docs/development-builds.md). It needs the paid Apple team.

## 4. Connect your agent

Your agent needs three things connected, on top of the repo itself:

| Connection | What the agent uses it for |
| --- | --- |
| **Linear** (MCP) | Read the issue and its comments, read its branch name, post the verification comment when done |
| **Figma** (MCP) | Read the exact frame the issue names: spacing, colors, copy |
| **GitHub CLI** (`gh`, logged in) | Push the branch, open the PR |

Set up the Linear and Figma MCP servers by following each vendor's current instructions for your agent. For Claude Code, that is usually:

```bash
claude mcp add --transport http linear-server https://mcp.linear.app/mcp
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

Then run `/mcp` inside Claude Code and sign in to each. Codex and other agents have their own MCP settings. Check that your agent can read an issue and a Figma frame before you give it real work.

**The rules are already wired in.** Claude Code reads [`CLAUDE.md`](CLAUDE.md), which imports [`AGENTS.md`](AGENTS.md). Codex reads `AGENTS.md` directly. If your agent reads neither, tell it to read `AGENTS.md` first. Edit rules in `AGENTS.md` only, never in `CLAUDE.md`.

## 5. Your first issue

1. **Get an issue from your lead.** It must be labeled `agent-ready` and assigned to you.
2. **Check it is safe to start.** In Linear, look at the issue's relations:
   - Every issue in **Blocked by** should be done. If something is still open, don't start.
   - If it links to a `PRO-` decision that is not decided, **stop** and write that on the issue. Decisions are recorded in [`docs/spec-decisions.md`](docs/spec-decisions.md) and the Decision Register linked from [`docs/linear.md`](docs/linear.md).
   - Phases go in order. Phase 2 code doesn't start until Phase 1 has passed on real phones.
3. **Start from a fresh `v2-figma`, on the branch Linear gives the issue.** Copy the branch name from the issue ("Copy git branch name"). It looks like `yourname/tec-12-p0-06-experience-detail`.

   ```bash
   git fetch origin
   git switch -c <branch-from-linear> origin/v2-figma
   ```

4. **Give your agent the issue.** Open your agent in the repo and say:

   > Work Linear issue TEC-NN. Follow CLAUDE.md and AGENTS.md exactly. Read the issue and its comments, the matching section of docs/spec.md, docs/spec-decisions.md, and the Figma frame the issue names. Use the branch Linear gives the issue. When done, open a PR into v2-figma with "Fixes TEC-NN" and comment on the issue with what you verified and what you couldn't.

5. **Review what it did.** You are responsible for the PR, not the agent. Read the diff. Run the app. Check the states and the rules in section 7.

### Running several agents at once

Use one git worktree per issue so they never touch the same files:

```bash
git worktree add ../sidequest-tec-12 -b <branch-from-linear> origin/v2-figma
cd ../sidequest-tec-12/app
npm ci
cp ../../sidequest/app/.env .env    # .env is git-ignored, so it is not copied for you
```

Each worktree needs its own `npm ci` and `.env`. Run only one Metro per port. Two agents must never work on the same issue.

## 6. Check your work before the PR

From `app/`:

```bash
npm run typecheck
npm run lint
npm test
```

If you changed the database (`supabase/`):

```bash
cd supabase/tests
npm ci
npm test
```

This runs the SQL (pgTAP) tests locally with no Docker and no hosted project. Every migration needs tests. Hosted Auth and Realtime still need a check against the dev project.

Then run the screens you changed in the Simulator and look at every state (section 7).

## 7. What reviewers check first

The full list is in [`AGENTS.md`](AGENTS.md). These come up most:

1. **Clients never write tables.** Every write is an RPC, RLS is on every table, and permissions are checked on the server. Hiding a button is never the only protection.
2. **Tables and function signatures in the spec are a team contract.** Changing one needs a `spec-decision` issue first.
3. **Every create-type write carries a client-generated `client_key`**, so the server can tell a retry from a new request.
4. **Times are stored in UTC plus `time_zone`** (America/Chicago), shown in that zone.
5. **Every data screen has four states:** Loading, Empty, Error ("Try again" keeps what was on screen) and Ready. Form errors go under the field and never clear input. Slow buttons show progress and can't be double-tapped.
6. **Device permissions** (location, contacts, notifications) are asked at the moment of use, and every flow works when denied.
7. **Accessibility:** 44 x 44 pt targets, labels on every control, works at 200% text, status in words and never color alone.
8. **Never log** notes, contacts, calendar contents, budgets, photos or raw invite codes.
9. **No hard-coded colors, sizes or fonts.** Use the tokens in `app/src/ui/theme.ts` and the components in `app/src/ui`.
10. **No guests.** Everyone signs in first. Never add anonymous auth, `is_guest` or guest UI.

Out of scope, don't build: P2 revenue (P2-06 to P2-10), niche spots, and the demo itself. The team plans, scripts and schedules the demo, so agents shouldn't.

## 8. Open the pull request

```bash
git push -u origin HEAD
gh pr create --base v2-figma --title "TEC-NN <short title>" --body "Fixes TEC-NN ..."
```

Careful: push your own branch by name. Never push to `v2-figma` directly.

- **One issue per PR**, under about 400 lines of non-generated code. Split it if it's bigger.
- The PR body starts with `Fixes TEC-NN` and says what changed and how you checked it.
- Don't merge it. Ask a person to review.
- **Comment on the Linear issue** with what you verified and what you couldn't. Be honest: "not run on a phone" is a fine thing to write.
- If your work changes what the issue does, update the issue's **In plain words** summary, in plain language.
- Issues labeled `needs-device` are closed only after a person runs them on real phones.

## 9. Where things live

| Path | What's there |
| --- | --- |
| `app/src/app/` | Routes. Thin re-exports of screens, nothing else |
| `app/src/features/<feature>/` | Screens, hooks and tests for one feature |
| `app/src/ui/` | Theme tokens and shared components (see [`docs/ui-kit.md`](docs/ui-kit.md)) |
| `app/src/lib/` | Supabase client, time, errors |
| `supabase/migrations/` | Database changes |
| `supabase/tests/` | pgTAP tests (`npm test` in that folder) |
| `supabase/seed.sql` | Seed data |
| `docs/spec.md` | The build spec. Requirement IDs like P0-08 are used everywhere |
| `docs/spec-decisions.md` | Team decisions that override the spec |
| `docs/linear.md` | Which Linear issues belong to which requirement |
| `docs/core-schema.md` | The database design |
| `docs/dev-project.md` | The hosted Supabase dev project and its checks |
| `docs/development-builds.md` | Simulator and phone builds |

Data rules in short: react-query for reads (`supabase.from().select()`, RLS decides), `supabase.rpc()` for every write, and Realtime only to invalidate queries.

## 10. When something breaks

| What you see | What to do |
| --- | --- |
| `Cannot find native module 'ExpoSomething'` | The Simulator is running an older build than the code. Rebuild with `npx expo run:ios`. If the error survives a rebuild, a second, older Sidequest build is probably installed: run `xcrun simctl listapps booted` and look for more than one Sidequest bundle ID (this project's is `com.sidequest.app`). Remove the extra one with `xcrun simctl uninstall booted <its-bundle-id>` and open the app again. Both builds register the `exp+sidequest` link scheme, so iOS keeps opening the old one even though the new one is installed |
| CocoaPods crashes with `Unicode Normalization not appropriate for ASCII-8BIT` | `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` and run the command again |
| `The sandbox is not in sync with the Podfile.lock` | `cd app/ios && pod install` (with the locale line above), then build again |
| `Port 8081 is being used by another process` | Another Metro is running (maybe another agent's). Stop it, or use the port Expo suggests |
| Blank or old screen after pulling | `npm ci`, then `npx expo start --dev-client --clear` |
| `npm run check:env` fails | `app/.env` still has the placeholder values. Ask your lead for the real ones |
| The sign-in code never arrives | Your email isn't on the allowed list yet (section 1). The dev project sends very few emails per hour, so wait between tries |
| Your agent says it can't read Linear or Figma | Reconnect the MCP server and sign in again (`/mcp` in Claude Code) |

Don't use `npm install <pkg>` for native packages. Use `npx expo install <pkg>` so versions match the Expo SDK, and tell your lead, because everyone will need to rebuild.

Expo changes a lot between SDK versions. Before using any Expo, EAS or React Native API, check the docs for the SDK in `app/package.json` (see [`app/AGENTS.md`](app/AGENTS.md)). Don't trust your agent's memory of the API.

## Questions

Ask your team lead, or write it on the Linear issue so the answer stays with the work.
