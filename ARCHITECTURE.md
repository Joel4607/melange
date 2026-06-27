# Melange — Architecture

A deliberately small, serverless architecture chosen so the codebase stays easy
to read, defend, and ship. Design choices are grounded in the
[System Design Primer](https://github.com/donnemartin/system-design-primer);
each one trades raw scale (which an FYP demo never needs) for simplicity and
fast CI/CD.

## The whole system on one page

```
            Browser (Next.js PWA)
                   │  HTTPS
                   ▼
        Vercel Edge / CDN  ──────────  static assets, cached pages
                   │
                   ▼
   Next.js server components + route handlers   (stateless, serverless)
                   │
                   ▼
              Supabase
   ┌───────────────┬───────────────┬───────────────┐
   │ Postgres + RLS│ Auth (JWT)    │ Realtime       │
   └───────────────┴───────────────┴───────────────┘

   Pure TypeScript algorithm module (matching / trust / fraud / arbitration)
   — no I/O, no framework, unit-tested in isolation. The graded contribution.
```

## Decisions (and the primer concept behind each)

| Decision | Why | Primer concept |
|---|---|---|
| **One managed backend (Supabase)**, no separate services | Postgres + auth + RLS + realtime in one box. A microservice split would be all overhead, no benefit at this scale. | Application layer / Microservices ("don't split until you must") |
| **Serverless, stateless app code** (Vercel functions) | No servers to run; scales to zero, scales out automatically; nothing to babysit for the demo. | Horizontal scaling / stateless web tier |
| **Vercel Edge CDN** serves the PWA | Static shell + cached pages load fast worldwide; the "strong foundation, fast load" you asked for. | Content delivery network (pull CDN) |
| **Postgres (relational)** as the source of truth | Tasks, users, disputes, ledger are relational with money/trust invariants → ACID matters more than web-scale writes. | SQL vs NoSQL / strong consistency |
| **Row-Level Security** instead of app-layer auth checks | One policy in the DB beats a check in every handler — a DB constraint over app code (ponytail rung 4). | Consistency / security at the data layer |
| **Algorithm = pure module, no DB calls** | Testable without infra, easy to explain and defend, swappable behind one matching call. | Design core components / separation of concerns |
| **Indexes on hot queries** (geo lookups, trust, task status) | The only "scaling" an FYP needs: make the few real queries fast. | Database — indexes |
| **Caching = Next.js defaults**, nothing hand-rolled | Static generation + framework cache cover it; a custom cache layer is YAGNI. | Caching (cache only when measured) |

## What we deliberately did NOT build (YAGNI — see `.agents/skills/ponytail`)

Load balancers, message queues, read replicas, sharding, a separate API
gateway, microservices, Redis, a custom cache, ML fraud detection. Each is a
real primer topic — and each is the *wrong* call at this scale. They live in the
report's **"Future Work / how this scales"** section, not in the code. Naming
them there (and why they're deferred) is itself worth marks under the handbook's
Critical-Analysis criterion.

## How this keeps CI/CD fast

- **No infra to provision** — Vercel builds on `git push`; Supabase is already live.
- **Small dependency tree** — fewer installs, faster `npm ci`, faster builds.
- **CI does only what matters**: `lint → typecheck → build` (`.github/workflows/ci.yml`).
- **Pure algorithm module** runs its checks with no DB/network, so tests stay instant.

## How it scales *if it ever had to* (one paragraph for the defense)

The stateless app tier already scales horizontally on Vercel. The first real
bottleneck would be Postgres reads → add a read replica and a cache for hot,
read-heavy queries (candidate lists). Beyond that: a queue to decouple
notifications, then partition by region. None of this is needed for the project;
it's the upgrade path, documented so the boundary is a choice, not an oversight.
