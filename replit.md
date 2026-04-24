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
- Frontend: `ClerkProvider` wraps the entire app; home page (`/`) is always public; `/unsubscribe/:token` and `/alerts` and `/seeker-pro` are public (email token flow, open alerts form for non-signed-in, and seeker pricing page); all other routes require auth including `/pricing`, `/post-job`, `/success`, `/jobs`, `/companies`, `/admin`, `/profile`
- Signed-in users at `/` are redirected to `/jobs`; signed-out users see the landing page
- The Navbar shows a user avatar dropdown with profile link and sign-out for authenticated users, and a Sign In button otherwise
- `ProfileOnboardingRedirect` in `App.tsx` fetches `/api/profile/me` on first load; if no profile exists, redirects to `/profile?onboarding=true`
- The navbar `UserMenu` shows the profile `displayName` (with Clerk fallback) using React Query with key `["profile", "me"]`

## Resume Builder

- DB table: `resumes` — fields: id, clerkUserId (unique), summary (text), experience (jsonb), education (jsonb), skills (text[]), updatedAt
- Schema: `lib/db/src/schema/resumes.ts`; exported from `lib/db/src/schema/index.ts`
- Experience entries: `{ id, title, company, startDate, endDate (null=Present), description }`
- Education entries: `{ id, degree, institution, graduationYear }`
- API routes in `artifacts/api-server/src/routes/resume.ts`: GET/POST/PATCH `/api/resume` — all require auth
- Resume page: `artifacts/caribbean-remote/src/pages/resume.tsx` — section-by-section form (summary, experience, education, skills tag input), live preview, print/PDF download via `window.print()`
- React Query key: `["resume", "me"]`
- Job detail page has an "Apply with Resume" button that opens a dialog showing the resume before redirecting to the employer URL; if no resume, prompts the user to create one at /resume

## Job Seeker Profiles

- DB table: `profiles` — fields: id, clerkUserId (unique), displayName, headline, location, bio, linkedIn, website, createdAt, updatedAt
- Schema: `lib/db/src/schema/profiles.ts`; exported from `lib/db/src/schema/index.ts`
- After modifying the profiles schema, run `pnpm --filter @workspace/db run push` then `cd lib/db && pnpm tsc --build` to rebuild declarations
- API routes in `artifacts/api-server/src/routes/profile.ts`: GET/POST/PATCH `/api/profile` — all require auth
- Profile page: `artifacts/caribbean-remote/src/pages/profile.tsx` — form with onboarding vs edit mode; saves via POST (create) or PATCH (update)
- React Query key for profile: `["profile", "me"]` — shared between Navbar and profile page for display name sync

## Seeker Pro Subscription

- DB table: `seeker_subscriptions` — fields: clerkUserId (PK), stripeCustomerId, stripeSubscriptionId, status (none/pending/active/trialing/past_due/cancelled), currentPeriodEnd, createdAt, updatedAt
- Schema: `lib/db/src/schema/seeker-subscriptions.ts`; exported from `lib/db/src/schema/index.ts`
- Stripe product: "Seeker Pro" at $19/month with `metadata.type = "seeker_pro"` — created via `pnpm --filter @workspace/scripts run seed-products`
- API routes (all require auth):
  - `GET /api/seeker/subscription` → returns `{ status, isPro, currentPeriodEnd, applicationCount, applicationLimit }`
  - `POST /api/stripe/seeker-checkout` → creates Stripe Checkout Session (subscription mode) → returns `{ url }`
  - `POST /api/stripe/seeker-portal` → creates Stripe Billing Portal session → returns `{ url }`
- Webhook: `customer.subscription.created/updated/deleted` events in `webhookHandlers.ts` upsert seeker_subscriptions by `clerkUserId` from subscription metadata
- Free limit: 3 applications per week (from `analytics_events` where event=`application_started` and userId=clerkUserId in past 7 days); Pro = unlimited
- Gate: job-detail apply buttons call `checkApplyGate()` before proceeding — shows `upgradeGateOpen` dialog with upgrade CTA if limit reached
- Alerts page: signed-in non-Pro users see upgrade CTA instead of the form; signed-out users see the email subscription form
- Pricing page: `/seeker-pro` (public route) — shows benefits + subscribe card; handles `?success=1` and `?canceled=1` query params
- Navbar UserMenu: shows "PRO" badge next to name for Pro members; shows "Upgrade to Pro" link in dropdown for non-Pro; mobile nav includes "Seeker Pro" link
- React Query key: `["seeker-subscription"]` — shared across Navbar, seeker-pro page, job-detail, and alerts

## Stripe Credentials

- Stripe is configured via direct API keys in Replit Secrets (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`), not the Replit Stripe connector.
- `artifacts/api-server/src/lib/stripeClient.ts` reads these env vars first; if both are present it uses them and skips the connector lookup. Connector code remains as a fallback.
- Account ID cache is keyed by secret key so rotating keys auto-invalidates the cached account.
- To rotate keys: update the secrets in the Secrets tab and restart the `artifacts/api-server: API Server` workflow.
- **Live products** (created via Stripe API on 2026-04-24, all with `metadata.type` set):
  - Single Job Post — $49 (`type=single`)
  - 3-Pack Job Posts — $129 (`type=pack`)
  - Monthly Unlimited — $299/mo (`type=monthly`)
  - Featured Upgrade — $99 (`type=featured`)
  - Seeker Pro — $19/mo (`type=seeker_pro`)

## Email (Titan SMTP)

- Outbound email goes through Titan SMTP (`smtp.titan.email:465`), not Resend or Bluehost.
- `artifacts/api-server/src/lib/resend.ts` uses nodemailer; the exported `getResendClient()` API is preserved so call sites are unchanged.
- Required secrets: `TITAN_SMTP_PASSWORD` (mailbox `hello@caribremotejobs.com`).
- Optional overrides: `TITAN_SMTP_HOST`, `TITAN_SMTP_PORT`, `TITAN_SMTP_USER`, `MAIL_FROM`.
- DNS: SPF includes `spf.titan.email`; DKIM `default._domainkey` is set; DMARC is published.
- Admin test endpoint: `POST /api/admin/test-email` with `{ "to": "addr" }` — gated by `requireAdmin`.
- `sendOrderConfirmation` checks the SMTP send result and throws on failure so checkout/webhook/admin-resend flows surface errors instead of silently succeeding.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
