# Linear map

Project: **Sidequest P0–P2** (https://linear.app/social-impact-finance/project/sidequest-p0-p2-0942a624f45e). Build work is in team Tech (`TEC-`), decisions and design in Product & Design (`PRO-`). Linear is the source of truth for status; this file only says where things are. Every issue opens with an **In plain words** summary.

Decisions and the three-act demo script: Decision Register, https://claude.ai/artifact/5RqNeJLkWgALx3AzjdRdbK

## Phases (milestones)

| Milestone | Target (proposed) | Covers | Phone check |
| --- | --- | --- | --- |
| Phase 1a – P0 core path | ~Nov 21 | Sign in, groups, map, votes, plans, answers, time change | TEC-47 (steps TEC-48–55) |
| Phase 1b – Rest of P0 | ~Nov 25 | Saves, group management, plan links, cancel, sessions, online drafts, Past, profile defaults, suggest a listing, account deletion, analytics | TEC-75 (with T01 TEC-56, T04 TEC-57) |
| Phase 2 – P1 coordination | ~Dec 4 | P1-01…07 (TEC-58…64) | TEC-76 |
| Phase 3 – P2 group memory | ~Dec 11 | P2-01…05 (TEC-65…69) | TEC-77 |
| Rehearsal and demo | week of Dec 14 | All three acts | TEC-78 |
| P2 revenue (on hold) | none | P2-06…10 (TEC-70…74) | none |

Each phase's code starts only after the previous phone check passes. Design can run ahead (PRO-11).

## Setup
TEC-1 Supabase dev project · TEC-3 core database and access rules · TEC-4 phone test builds · TEC-5 Linear GitHub integration · TEC-6 Figma tokens + UI kit · PRO-11 missing Figma frames

## P0 requirements → issues

| Req | Parent | Phase 1a sub-issues | Phase 1b sub-issues |
| --- | --- | --- | --- |
| P0-01 Join by code | TEC-7 | TEC-25, TEC-35 | (plan links: TEC-91/92) |
| P0-02 Accounts | TEC-8 | TEC-26, TEC-34 | TEC-79, TEC-80 |
| P0-03 Groups | TEC-9 | TEC-27, TEC-36 | TEC-81, TEC-82 |
| P0-04 Map and list | TEC-10 | TEC-37 | TEC-83 |
| P0-05 Filters, content | TEC-11 | TEC-28, TEC-38 | TEC-84, TEC-85 |
| P0-06 Detail | TEC-12 | TEC-39 | |
| P0-07 Saves | TEC-13 | | TEC-86, TEC-87 |
| P0-08 Group vote | TEC-14 | TEC-29, TEC-40 | |
| P0-09 Closing | TEC-15 | TEC-30, TEC-41 | |
| P0-10 Pick to plan | TEC-16 | (in TEC-31, TEC-41) | TEC-88 |
| P0-11 Draft and review | TEC-17 | TEC-42 | TEC-89, TEC-90 |
| P0-12 Sending | TEC-18 | TEC-31, (TEC-42) | |
| P0-13 RSVP, plan links | TEC-19 | TEC-32, TEC-43 | TEC-91, TEC-92 |
| P0-14 Changes | TEC-20 | TEC-33, TEC-44 | TEC-93, TEC-94 |
| P0-15 Cancel, booking | TEC-21 | (booking notice in TEC-39) | TEC-95, TEC-96 |
| P0-16 Plans tab | TEC-22 | TEC-45 | TEC-97 |
| P0-17 Friends, profile | TEC-23 | TEC-46 | TEC-98 |
| P0-18 Suggest a listing | TEC-24 | | TEC-99, TEC-100 |
| Analytics log | TEC-101 | | |

P1 and P2-memory issues are single parents for now; split them into backend/app sub-issues when their phase starts. P1-08 (Google sign-in) moved into P0-02 (D2).

## Decisions (PRO)
PRO-1 no guests + Google (done) · PRO-2 vote privacy · PRO-3 drafts · PRO-4 P2 gate · PRO-5 partner stats · PRO-6 budget · PRO-7 price changes · PRO-8 venue edits · PRO-9 Figma vs spec · PRO-10 spec gaps

## Labels
Phase (P0/P1/P2) · Area (backend/app/design/content/infra; one per issue) · `spec-decision` · `agent-ready` · `needs-device`.

## Working an issue with an agent
Only after the decisions it depends on are agreed (Decision Register, W1). Open Claude Code in this repo and say "work TEC-NN". The agent reads the issue through Linear MCP, uses the issue's branch, follows `CLAUDE.md`, opens a PR into `v2-figma` with `Fixes TEC-NN`, and comments on the issue with what it verified and what it couldn't. A person reviews every PR.
