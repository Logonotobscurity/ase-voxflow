# Ase / VOXFLOW UX audit

**Audit status:** repository-aligned as of 14 August 2026

**Brand:** Ase

**Platform:** VOXFLOW

**Legacy alias:** LOG_ON AI redirects through `/log_on`

This is a code and build audit of the current product preview. It distinguishes interactive implementation from illustrative content. Browser interaction and responsive visual regression remain **UNVERIFIED** because no supported browser executable was available in the workspace.

## 1. Experience objective

The interface is designed as an editorial, African-business-oriented workflow product rather than a generic AI dashboard. Its clearest journey is:

1. understand the governed workflow proposition on `/`;
2. inspect the product boundaries on `/platform`;
3. open `/app/canvas` and edit one canonical React Flow graph;
4. save and run that graph through the versioned `/api/v1` contracts;
5. inspect explicit execution, evidence, failure, or approval-stop feedback;
6. use marketplace, vendor, and voice surfaces as labelled previews—not as evidence of provider integrations.

The current implementation proves a bounded memory-mode demo path. It does not prove production identity, durable PostgreSQL operation, collaboration, media transport, mobile synchronization, LLM planning, or external enterprise actions.

## 2. Information architecture

### Marketing and trust routes

- `/` — product narrative and entry points
- `/platform` and `/voxflow` — platform overview
- `/solutions` — illustrative industry starting points
- `/marketplace` — curated concept and demo listings
- `/resources` — current references, demo paths, and capability boundaries
- `/company` — purpose and contact route
- `/privacy`, `/security`, `/terms` — preview-aware trust and legal boundaries
- `/log_on` — legacy alias route

### Product routes

- `/app/canvas` — canonical workflow graph editor and demo execution path
- `/app/vendors` — scripted vendor-operations interface using illustrative records
- `/app/voice` — scripted voice-interface preview and deterministic command proposal path

### HTTP routes

- `/api/v1/workflows`
- `/api/v1/workflows/[workflowId]/executions`
- `/api/v1/transactions`
- `/api/v1/approvals/[approvalId]/decision`
- `/api/v1/agent/commands` — canonical text/already-transcribed-voice proposals
- `/api/v1/voice/commands` — transcript compatibility adapter
- `/api/vendors` — read-only illustrative legacy response; writes fail closed
- `/api/voice/transcribe` and `/api/voice/synthesize` — deprecated provider stubs that fail closed

The latest optimized build generates or analyses 24 routes, including the framework not-found route. This count must not be read as 23 production capabilities.

## 3. Navigation and conversion flow

The persistent header groups product destinations under a Platform dropdown and includes Visual Canvas as required. Primary calls to action lead to `/app/canvas`; secondary links lead to architecture, solutions, resources, or a mail conversation.

The homepage avoids dead category tags: category pills update a feature panel in place. Marketplace categories filter the listing catalogue, while each listing opens an accessible-labelled detail dialog and then links to an editable canvas demo. Marketplace publishing and commercial rails are explicitly roadmap items.

The responsive footer is structured as two columns on mobile, three on tablet, and four on desktop, followed by the Ase wordmark. Location labels describe contexts in view rather than claiming operating offices.

## 4. Visual system

The visual direction follows the supplied editorial automation reference while retaining Ase terminology and African operating context.

- warm paper, cream, amber, cyan, purple, and ink surfaces;
- strong serif display hierarchy with compact sans-serif controls;
- generous whitespace, thin rules, rounded cards, and structured metadata;
- African business references such as NGN, vendor onboarding, approvals, Lagos, Port Harcourt, Nairobi, and Johannesburg;
- homepage hero artwork combining the rotating Ase orb, workflow snippet card, and AI-assist card;
- custom scrollbar styling and named animation keyframes in the global stylesheet;
- interaction transitions capped at 0.2 seconds, with reduced-motion behavior in CSS.

The visual workflow preview on the homepage is intentionally non-operational: zoom, run, replay, and save controls are disabled. The real editable path is `/app/canvas`.

## 5. Interaction and accessibility audit

Implemented in code:

- semantic links for navigation and calls to action;
- explicit labels for icon-only buttons and form fields;
- minimum control sizing rules intended to provide 44px mobile touch targets;
- keyboard activation for native links and buttons;
- Escape dismissal for marketplace and chat dialogs;
- backdrop dismissal for the marketplace dialog;
- initial focus on the marketplace close button and focus return for the chat launcher;
- screen-reader dialog names and live status regions in interactive surfaces;
- visible labels when controls are scripted, preview-only, disabled, or not connected;
- reduced-motion CSS support.

Remaining accessibility work:

- full browser keyboard traversal is **UNVERIFIED**;
- the marketplace and chat dialogs do not yet implement a complete Tab/Shift+Tab focus trap;
- focus return from the marketplace dialog should be tied to the listing trigger;
- colour contrast, zoom/reflow, screen-reader announcements, and 44px computed hit areas require browser measurement;
- canvas keyboard behavior requires dedicated assistive-technology testing.

## 6. Truthful capability labelling

The claim audit changed successful-looking samples into explicit boundaries:

- canonical canvas saves and runs use the same workflow contract as the backend;
- memory-mode execution evidence says `simulated: true` and uses deterministic demo handlers;
- transaction nodes stop at human approval and do not issue payment or purchase-order instructions;
- the voice command API creates deterministic proposals, not transcripts or proof of action;
- legacy transcription and synthesis routes return `501 NOT_IMPLEMENTED` instead of fabricated provider output;
- legacy vendor reads are labelled illustrative, and writes return `501` rather than pretend persistence;
- marketplace cards are concept listings with no verified adapter;
- Liveblocks, WebRTC, NATS, Socket.io, LLM, MCP, and external transaction rails are labelled not integrated.

## 7. Responsive behavior

The stylesheet contains mobile and tablet breakpoints for navigation, hero composition, category controls, cards, product workspaces, footer columns, and floating assistant geometry. Canvas and panel dimensions are calculated for smaller screens rather than using one desktop-only fixed size.

Responsive implementation has passed static TypeScript, lint, and production-build checks. Actual browser layout, rotation, safe-area behavior, touch interaction, and visual diff testing remain **UNVERIFIED**.

## 8. Engagement risks and mitigations

| Risk | Current mitigation | Remaining work |
|---|---|---|
| Marketing surface implies unsupported automation | Preview/demo/not-integrated labels and disabled fake controls | Repeat browser/content review before release |
| User reaches a dead-end category pill | Homepage pills update one feature panel; marketplace pills filter results | Persist category selection in URL if analytics justify it |
| Scripted chat is mistaken for an agent | Header and replies state that no LLM or tool ran | Add a direct handoff that serializes a draft into the canvas |
| Marketplace listing is mistaken for an integration | Modal says no external adapter is verified | Add machine-readable implementation status per listing |
| Approval is mistaken for execution | Runtime stops at `WAITING_APPROVAL`; transaction copy says no external action | Build durable approval resumption and external evidence later |
| Status labels look like uptime | Resources now says capability boundary, not live availability | Create a real status service only when telemetry exists |

## 9. Verification evidence

Repository validation on 14 August 2026 covers:

- ESLint and strict TypeScript;
- six Vitest files with 26 passing tests, including bounded timeout, composition-root continuity, atomic rollback, pending-outbox, concurrent idempotency, and single-winner approval regressions;
- Prisma schema validation and client generation;
- optimized Next.js production build;
- production-server HTTP checks for canonical workflow, execution/evidence, transaction/approval, identity failure, and voice proposal paths.

The final production-server rerun also passed 18 canonical demo/memory HTTP checks, 6 legacy fail-closed checks, and the non-demo identity fail-closed check; `docs/ARCHITECTURE.md` is the authoritative verification record. Live PostgreSQL, browser behavior, third-party integrations, and deployment of the uncommitted P0 workspace remain **UNVERIFIED**.

## 10. Recommended next UX increment

1. Add browser automation for header/dropdown, category tabs, dialogs, chat, canvas save/run, approval stop, and responsive footer.
2. Implement complete focus trapping and trigger-focus restoration for all dialogs.
3. Add per-listing capability badges sourced from one typed implementation-status field.
4. Turn scripted chat handoff into a validated draft-workflow proposal rather than another execution surface.
5. Add durable approval/resume UX only after backend approval records and resumption exist.
6. Validate mobile behavior on representative low-memory Android devices and constrained networks.
7. Instrument conversion and failure events only after consent, retention, and telemetry boundaries are implemented.
