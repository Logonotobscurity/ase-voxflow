# Ase / VOXFLOW UX audit and revamp report

**Audit date:** 14 August 2026  
**Scope:** Marketing experience, product discovery, marketplace, Visual Canvas, Voice Studio, Vendor Operations, navigation, legal/trust routes, mobile behaviour, accessibility and conversion flow.  
**Reference direction:** Editorial-technical composition inspired by the supplied Automerge sample, adapted to Ase’s African business-intelligence context.

## 1. Executive summary

The original product demonstrated substantial capability but presented it as a generic purple/cyan SaaS site. Product discovery and product use were also conflated: `/platform` duplicated the working canvas, the Visual Canvas was difficult to discover from navigation, several cards and controls ended without a useful next step, and trust/legal destinations were absent.

The revamp establishes one coherent journey:

1. **Understand:** the homepage explains what Ase hears, understands and acts on.
2. **See it work:** schematic system, outcome tabs, voice console and canvas preview show the operating model.
3. **Choose a context:** solutions, marketplace entries and platform product paths meet different visitor intents.
4. **Prove a workflow:** all major conversion paths lead to a working studio, relevant template query or direct conversation.
5. **Operate with control:** trust, architecture, approval and status language is visible throughout.

The resulting interface uses amber, ink and cream; visible linework; dotted technical textures; flat high-contrast surfaces; compact mono labels; responsive schematics; and short interactions. It preserves the existing demos while making their relationship clear.

## 2. Findings and resolutions

| Severity | Finding | User impact | Resolution |
|---|---|---|---|
| Critical | `/platform` and `/app/canvas` rendered the same canvas experience. | Visitors could not distinguish product explanation from product use. | `/platform` is now a dedicated overview; `/app/canvas` remains the working Visual Canvas. |
| High | Visual Canvas had no clear place in the primary platform navigation. | The strongest functional demo was hard to discover. | Platform dropdown now exposes Visual Canvas, Voice Studio, Vendor Operations and Marketplace with distinct descriptions. |
| High | The visual system resembled a generic purple/cyan SaaS template. | Weak differentiation and poor alignment with the supplied reference. | Added a responsive amber/ink/cream editorial-technical design layer with hard borders, linework, dotted textures and schematic diagrams. |
| High | Homepage hierarchy moved through features without a clear conversion narrative. | Visitors had to infer value and the next action. | Reordered experience around value, system operation, selectable outcomes, voice proof, canvas proof, marketplace and final action. |
| High | Multiple CTAs and cards ended as generic buttons or repeated `/platform` links. | Lost intent and low confidence in interactions. | Solution cards open contextual canvas blueprints; marketplace installs open templates; vendor actions open registration/PO flows; resource cards route to relevant destinations. |
| High | Desktop-sized inline canvas columns overrode responsive layout rules. | Internal canvas could overflow on tablet/mobile. | Moved widths into responsive CSS custom properties and collapsed side/property panels at tablet and mobile breakpoints. |
| High | Dialogs did not consistently support Escape, initial focus or background scroll locking. | Keyboard and touch users could lose context. | Added Escape handling, close-button focus, backdrop dismissal, labelled dialogs and scroll locking to marketplace, vendor and canvas dialogs. |
| High | Missing legal pages and legacy aliases created dead ends. | Trust and migrated URLs were incomplete. | Added Privacy, Terms, Security, custom 404, `/voxflow → /platform` and `/log_on → /`. |
| Medium | Footer did not consistently meet the required responsive column progression. | Navigation became dense or disappeared at smaller widths. | Footer now moves from 2 columns on mobile to 3 on tablet and 4 link groups on desktop, plus a large wordmark. |
| Medium | Vendor module tabs and filters had weak feedback. | Controls appeared decorative. | Tabs now change module guidance; risk filter changes records; search is live; CSV export works; result state is announced. |
| Medium | Voice Studio controls lacked complete state/label feedback. | Preview controls were less usable by keyboard and assistive technology. | Added pressed states, explicit form labels, copy feedback, camera/microphone labels and a working session simulator. |
| Medium | PWA registration was imported but never rendered. | Manifest and service worker did not form a complete installable shell. | Root layout renders registration; cache versioning, same-origin handling, icon and theme metadata were updated. |
| Medium | Status wording implied an operational service without a verified status source. | Could overstate production readiness. | Resource status section clearly labels demo-ready versus frontend-preview surfaces. |

## 3. Information architecture

### Primary navigation

- **Platform dropdown**
  - `/platform` — explanatory overview and product architecture
  - `/app/canvas` — working Visual Canvas
  - `/app/voice` — working Voice Studio
  - `/app/vendors` — working Vendor Operations
- **Solutions** — `/solutions`
- **Marketplace dropdown**
  - `/marketplace` — all categories
  - category query links for agents, templates, integrations and connectors
- **Resources** — `/resources`
- **Company** — `/company`
- **Primary action** — `/app/canvas`

### Trust and compatibility routes

- `/privacy`
- `/terms`
- `/security`
- `/voxflow` → permanent redirect to `/platform`
- `/log_on` → permanent redirect to `/`
- Custom not-found route with recovery actions

### Route responsibility rule

Marketing routes explain, compare and establish trust. `/app/*` routes let the visitor perform or simulate product work. This avoids the previous ambiguity between platform narrative and application workspace.

## 4. Conversion and engagement flow

### Homepage

- The hero answers **what Ase does** and provides two distinct actions: explore the platform or open a working canvas.
- The system schematic answers **how signals become action**.
- Selectable outcome tabs answer **where it applies** and update a meaningful panel rather than acting as decorative pills.
- Voice and workflow sections provide **product evidence**, not only feature claims.
- Marketplace previews support **reuse and discovery**.
- Final CTA offers **build now** or **browse templates**, preserving self-serve and exploration paths.

### Contextual handoff

URLs now preserve intent through template or solution parameters. Visual Canvas reads those parameters and labels the resulting workspace, so a visitor arriving from Voice Studio, Vendor Operations, Solutions or Marketplace sees a contextual starting point rather than an unexplained generic canvas.

### Operational demos

- Marketplace category filters, search, modal details and install routes work.
- Vendor search, module selection, risk filter, CSV export and profile dialog work.
- Voice visual style, agent state, colour controls, code copy and media controls work.
- Canvas palette search, node filters, node creation/editing, edge connection, execute simulation, voice commands, vendor profile and PO flow work.

## 5. Visual system

### Core palette

- Amber: `#ffcc33`
- Ink: `#22221f`
- Paper: `#fff9e9`
- Cream: `#f8f5ec`
- Operational red: `#ef493d`
- Success green: `#18794e`

### Composition

- Flat surfaces and hard two-pixel borders replace glass-heavy gradient cards.
- Small monospaced labels identify state, category and architecture.
- Dotted and gridded fields suggest a working technical surface.
- Schematic nodes and connecting lines describe system behaviour.
- Large, restrained editorial headings create hierarchy without excessive decoration.
- Shadows are offset blocks rather than diffuse elevation.
- Interaction transitions stay at or below 0.2 seconds.

## 6. Accessibility and responsive review

### Implemented

- Semantic headings, landmarks, links and buttons retained across routes.
- Mobile controls and important icon buttons use a minimum 44px target.
- Navigation supports Escape, outside click, initial focus and body scroll locking.
- Dropdown and tab states expose `aria-expanded`, `aria-current`, `aria-selected` or `aria-pressed` as appropriate.
- Dialogs expose `role="dialog"`, `aria-modal`, useful labels and focused close controls.
- Chat launcher restores focus after dismissal.
- SVG system diagram has a labelled role and descriptive text.
- Reduced-motion media query disables or compresses animation and transition behaviour.
- Horizontal collections such as filters and outcome tabs scroll within their region instead of forcing document overflow.
- Layout breakpoints cover wide desktop, laptop, tablet and narrow mobile.
- Footer follows 4-column desktop, 3-column tablet and 2-column mobile progression.

### Responsive checkpoints reviewed in source

- **Wide/laptop:** four-entry platform grids, full navigation and three-column outcome panel.
- **Tablet:** menu sheet, two-column product/stack grids, stacked hero and system story, absolute canvas property panel.
- **Mobile:** single-column story/content grids, two-column footer, collapsed canvas toolset, horizontal tab/filter scrolling and full-width primary actions.

### Remaining production-stage verification

A final release should still include browser-based visual regression and assistive-technology checks on real devices. The current environment had no Chromium/Firefox executable, so this audit used production compilation, source inspection, route/link checks and server responses rather than screenshot comparison or an automated browser accessibility engine.

## 7. Architecture positioning

The product overview now states the intended responsibility split:

- **PostgreSQL 16 + Prisma:** source of truth for workflow definitions, tenants, vendor records and audit history.
- **Liveblocks:** CRDT collaboration and shared canvas presence.
- **WebRTC:** realtime voice and video media.
- **NATS:** voice and workflow event transport.
- **Socket.io:** mobile push and synchronisation.

MongoDB is treated as deprecated and is not positioned as the source of truth. LOG_ON AI appears only as a compatibility redirect; product naming is consistently Ase / VOXFLOW.

## 8. Validation evidence

Completed on 14 August 2026:

- `npm run build` — passed with strict type checking and static generation.
- Build produced 20 app outputs, including 14 user-facing/static routes, 3 API routes and not-found handling.
- Static internal-link scan — 62 references checked, 0 unresolved.
- Production server route check — all primary routes returned HTTP 200.
- Unknown route — returned HTTP 404.
- `/log_on` — HTTP 308 to `/`.
- `/voxflow` — HTTP 308 to `/platform`.
- Manifest, service worker and PWA icon — HTTP 200.
- Netlify production deployment — [https://ase-voxflow.netlify.app](https://ase-voxflow.netlify.app).
- Production HTTPS checks — homepage, platform and contextual canvas returned HTTP 200; unknown route returned HTTP 404.
- Production security headers — HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and scoped `Permissions-Policy` verified.
- Production deploy ID — `6a7ef59a1c50a600c5b07baa`.

## 9. Recommended next production steps

1. Run visual regression at 360, 390, 768, 1024, 1440 and 1920 CSS pixels in a browser-enabled CI environment.
2. Run axe-core and keyboard-only passes against all primary routes and dialog states.
3. Connect authentication, PostgreSQL/Prisma persistence and production realtime services behind the existing frontend contracts.
4. Replace demo metrics and logos with approved customer evidence before public launch.
5. Add event analytics for hero actions, outcome selection, template handoff, marketplace installation and successful canvas execution.
6. Connect a custom production domain and review service-worker update behaviour during the first controlled release.
