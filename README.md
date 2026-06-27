# Melange

Walking skeleton for the Melange errand marketplace: a minimal **Next.js + Supabase** app, deployed to **Vercel** with CI/CD. The goal of this first slice is to prove the end-to-end pipeline (code → CI → deploy → live Supabase connection) before any features are built on top.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + Auth) via `@supabase/ssr`
- **Vercel** for hosting + Git-based CI/CD
- **GitHub Actions** for lint / typecheck / build on every PR

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

The home page shows a live **Supabase connection** status. To also display a row
read from the database, run the demo migration (Supabase SQL editor):

```
supabase/migrations/0001_greetings.sql
```

## Environment variables

| Variable                        | Where        | Notes                              |
| ------------------------------- | ------------ | ---------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server | Project URL                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Anon (public) key                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only  | Privileged; never expose to client |

Set the same variables in the Vercel project (Settings → Environment Variables).

## Scripts

| Command             | Purpose                  |
| ------------------- | ------------------------ |
| `npm run dev`       | Dev server               |
| `npm run build`     | Production build         |
| `npm run lint`      | ESLint                   |
| `npm run typecheck` | TypeScript (no emit)     |

## Deploy (Vercel)

1. Import this repo in Vercel (New Project → import `Joel4607/melange`).
2. Add the env vars above.
3. Vercel builds every push: PRs get preview deployments, `main` is production.
