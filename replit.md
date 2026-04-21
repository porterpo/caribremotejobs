# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (`@clerk/react` frontend, `@clerk/express` backend, proxy via `http-proxy-middleware`)

## Authentication (Clerk)

- Clerk is provisioned and keys are stored as secrets (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`)
- `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PROXY_URL` are injected into the Vite build via `define` in `vite.config.ts`
- The Clerk proxy middleware is at `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`, mounted at `/api/__clerk`
- `clerkMiddleware()` from `@clerk/express` runs after body parsers in `app.ts`
- `requireAuth` middleware is at `artifacts/api-server/src/middlewares/requireAuth.ts` — use it on protected API routes
- Frontend: `ClerkProvider` wraps the entire app; home page (`/`) is always public; `/unsubscribe/:token` is public (email token flow); all other routes require auth including `/pricing`, `/post-job`, `/certify`, `/certify/success`, `/success`, `/jobs`, `/companies`, `/alerts`, `/admin`, `/certified`
- Signed-in users at `/` are redirected to `/jobs`; signed-out users see the landing page
- The Navbar shows a user avatar dropdown with sign-out for authenticated users, and a Sign In button otherwise

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
