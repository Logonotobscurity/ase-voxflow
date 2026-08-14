# Ase · VOXFLOW operational intelligence platform

A production-style Next.js App Router experience for voice-first, multi-surface business automation focused on African operations.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `/` — conversion-focused marketing experience and interactive product proof
- `/platform` — platform overview, execution model and technical architecture
- `/app/canvas` — interactive React Flow Visual Canvas
- `/app/voice` — agent visualizer and realtime voice session studio
- `/app/vendors` — searchable vendor operations command centre
- `/marketplace` — searchable/filterable agent, template and connector marketplace
- `/solutions` — industry entry points with contextual canvas blueprints
- `/resources` — guides, builder paths and transparent demo-status model
- `/company` — purpose, principles and regional operating context
- `/privacy`, `/terms`, `/security` — trust and legal routes
- `/api/vendors` — Zod-validated demo vendor API
- `/api/voice/transcribe`, `/api/voice/synthesize` — voice gateway contract demos

Legacy aliases: `/log_on` redirects to `/`; `/voxflow` redirects to `/platform`. Unknown routes use a branded recovery page.

## Product decisions

- **Ase** is the customer-facing brand; **VOXFLOW** is the workflow platform.
- PostgreSQL 16 + Prisma is the intended operational source of truth; MongoDB is deprecated and intentionally absent from the architecture.
- Next.js App Router is the canonical web stack.
- Liveblocks owns canvas CRDT collaboration, WebRTC owns realtime media, NATS owns voice/workflow events, and Socket.io is reserved for mobile push/synchronisation.
- The visual prototype uses local state and safe demo API contracts; production credentials and services are not included.

## Design system

The responsive editorial-technical system uses amber `#ffcc33`, ink `#22221f`, cream/paper surfaces, hard linework, dotted technical fields, schematic workflows and short transitions. `app/globals.css` retains functional component foundations; `app/revamp.css` applies the current system.

The full audit and validation record is in [`docs/UX-AUDIT.md`](docs/UX-AUDIT.md).

## Netlify deployment

**Production:** [https://ase-voxflow.netlify.app](https://ase-voxflow.netlify.app)

The repository includes `netlify.toml` for Netlify’s OpenNext runtime:

- Build command: `npm run build`
- Publish directory: `.next`
- Node.js: 22.13
- App Router, API routes, redirects and PWA assets are supported by Netlify’s automatic Next.js adapter.

Deploy from the repository in Netlify, or from the CLI:

```bash
npx netlify-cli deploy --build --prod
```

Configure production secrets in **Netlify → Site configuration → Environment variables**. Do not commit credentials.

## Quality checks

```bash
npm run build
```

The project includes responsive breakpoints, reduced-motion support, keyboard-visible focus states, 44px touch targets, a PWA manifest/service worker shell, contextual template handoff and Escape/backdrop/focus handling for primary dialogs.
