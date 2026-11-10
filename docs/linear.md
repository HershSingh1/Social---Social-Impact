# Linear map

Project: **Sidequest P0–P2** (https://linear.app/social-impact-finance/project/sidequest-p0-p2-0942a624f45e). Build work is in team Tech (`TEC-`), spec decisions in Product & Design (`PRO-`). Linear is the source of truth for status; this file only says where things are.

## Milestones
- **Demo – Nov 22:** setup, demo-scope requirements and their sub-issues, rehearsal.
- **Pilot P0:** P0-07, P0-18 and the "pilot scope" parts of other P0 issues.
- **P1 (gated)**, **P2 (gated):** plan only; entry gates are in the milestone descriptions.

## Demo critical path

| Order | Issues |
| --- | --- |
| Setup | TEC-1 Supabase dev project · TEC-3 core schema/RLS · TEC-6 Figma tokens + UI kit · TEC-4 dev builds · TEC-5 Linear GitHub integration |
| Backend | TEC-25 join · TEC-26 profiles · TEC-27 create group · TEC-28 seed (content) · TEC-29 pick/vote · TEC-30 close · TEC-31 send_plan · TEC-32 respond · TEC-33 edit_plan |
| App | TEC-34 sign-in · TEC-35 join · TEC-36 create group · TEC-37 map/list · TEC-38 filters · TEC-39 detail · TEC-40 pick · TEC-41 result · TEC-42 draft/send · TEC-43 plan/RSVP · TEC-44 edit/reconfirm · TEC-45 hub · TEC-46 friends |
| Rehearsal | TEC-47 parent · TEC-48–55 D1–D8 · TEC-56 T01 · TEC-57 T04 |

Each backend/app issue is a sub-issue of its requirement and has blocking relations set.

## Requirement → issue

| Req | Issue | Req | Issue |
| --- | --- | --- | --- |
| P0-01 | TEC-7 | P0-10 | TEC-16 |
| P0-02 | TEC-8 | P0-11 | TEC-17 |
| P0-03 | TEC-9 | P0-12 | TEC-18 |
| P0-04 | TEC-10 | P0-13 | TEC-19 |
| P0-05 | TEC-11 | P0-14 | TEC-20 |
| P0-06 | TEC-12 | P0-15 | TEC-21 |
| P0-07 | TEC-13 | P0-16 | TEC-22 |
| P0-08 | TEC-14 | P0-17 | TEC-23 |
| P0-09 | TEC-15 | P0-18 | TEC-24 |
| P1-01…07 | TEC-58…64 | P2-01…10 | TEC-65…74 |

P1-08 (Google sign-in) moved into P0-02 (decision D2).

## Labels
Phase (P0/P1/P2, one per issue) · Area (backend/app/design/content/infra, one per issue) · `spec-decision` · `agent-ready` · `needs-device`.

## Working an issue with an agent
Open Claude Code in this repo and say "work TEC-NN". The agent reads the issue through Linear MCP, checks out the issue's branch (`gitBranchName`), follows `CLAUDE.md`, opens a PR with `Fixes TEC-NN`, and comments on the issue with what it verified and what it couldn't.
