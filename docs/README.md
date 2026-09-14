# OD Cortex — documentation

Full technical documentation for the app. The root [`README.md`](../README.md)
covers what exists and how to bring it online at a glance (setup steps,
current status, deploy walkthrough); these pages go deeper on how each part
actually works.

- **[Architecture](./ARCHITECTURE.md)** — stack, the no-login/service-role
  design, demo mode, request flows, app structure, observability.
- **[Data model](./DATA_MODEL.md)** — every table across all 6 migrations,
  RLS (and why it isn't the app's real security boundary), the retrieval
  RPCs, storage, denormalization triggers.
- **[Agents & tools](./AGENTS_AND_TOOLS.md)** — the agent runtime, context
  assembly, every tool's behavior and approval requirements, the approval
  gate, the integration stubs.
- **[API reference](./API_REFERENCE.md)** — every route under `app/api/`:
  method, params, request/response shape, demo-mode behavior.
- **[Frontend](./FRONTEND.md)** — every page and shared component,
  including a full breakdown of the Colony (`/office`, the 3D viewport,
  left nav, activity feed, terminal strip) and `/graph`'s hologram
  treatment.
- **[Testing](./TESTING.md)** — the Playwright e2e suite (runs against demo
  mode, no backend needed) and the scripted checks that need a live
  Supabase project.
- **[Deployment](./DEPLOYMENT.md)** — Supabase setup, environment
  variables, deploying to Vercel, a post-deploy checklist.

## Where to start

- Setting the app up locally for the first time → the root
  [`README.md`](../README.md).
- Understanding why a request behaves the way it does → start at
  [Architecture](./ARCHITECTURE.md), then follow its links into
  [Agents & tools](./AGENTS_AND_TOOLS.md) or the
  [API reference](./API_REFERENCE.md) as needed.
- Adding a new agent, tool, or department → read
  [Agents & tools](./AGENTS_AND_TOOLS.md) first; nothing there requires new
  code beyond the tool implementation itself (a new agent is a new
  `agents` row — see [Data model](./DATA_MODEL.md#agents)).
- Changing anything in the Colony (`/office`) → read
  [Frontend § The Colony](./FRONTEND.md#the-colony-office) before touching
  `OfficeScene3D.tsx` — it documents real bugs (an invisible-character
  scale bug, a font-fetch trap, a camera-framing bug specific to a radial
  layout) already hit and fixed across four visual passes.
- Deploying or debugging production → [Deployment](./DEPLOYMENT.md).
