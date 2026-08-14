# Ase · VOXFLOW integrated workflow platform

A production-style Next.js App Router prototype for a voice-first, multi-platform business automation product focused on African operations.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `/` — marketing experience: hero, voice-first demo, workflow canvas preview, vendor intelligence, visualizer showcase, marketplace, testimonials
- `/platform` and `/app/canvas` — interactive React Flow workflow studio
- `/app/voice` — agent audio visualizer and realtime session studio
- `/app/vendors` — vendor operations dashboard
- `/marketplace` — searchable/filterable agent and connector marketplace
- `/solutions` — industries and transformation initiatives
- `/company` — company story and values
- `/resources` — documentation and community hub
- `/api/vendors` — Zod-validated demo vendor API
- `/api/voice/transcribe`, `/api/voice/synthesize` — voice service gateway contract demos

Legacy aliases: `/log_on` redirects to `/`; `/voxflow` redirects to `/platform`.

## Product decisions

- **Ase** is the customer-facing brand; **VOXFLOW** is the workflow application shell.
- PostgreSQL + Prisma is the intended operational source of truth; MongoDB is intentionally not part of the architecture.
- Next.js App Router is the canonical web stack.
- Liveblocks is intended for canvas collaboration, WebRTC for media, NATS for voice events, and Socket.io only for the mobile sync bridge.
- The visual prototype uses local state and safe demo API contracts; production credentials/services are not included.

## Quality checks

```bash
npm run build
```

The project includes responsive breakpoints, reduced-motion support, keyboard-visible focus states, touch targets, PWA manifest/service worker shell, modal escape handling, and an interactive mobile canvas property sheet.
