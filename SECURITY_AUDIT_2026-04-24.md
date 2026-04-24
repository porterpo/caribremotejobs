# CaribRemoteJobs Pre-Production Security & Stability Audit
Date: 2026-04-24

## Executive Summary

**Recommendation: DON’T SHIP** until all **Open CRITICAL** findings are resolved and re-verified in staging.

Top 5 Critical risks:
1. Broken authorization on privileged mutation endpoints (jobs/companies/admin).
2. Admin authorization bypass risk from route-level guard placement.
3. IDOR/order takeover pattern from `sessionId` as bearer secret (including enumeration/probing risk).
4. Cross-tenant alert data exposure/deletion.
5. Public order-record exposure via `GET /stripe/session/:id`.

Findings by severity (symmetrical counts are coincidental, not capped):
- **CRITICAL:** 5
- **HIGH:** 5
- **MEDIUM:** 5
- **LOW:** 2

## Launch-Blocking Next Steps (Owners + Dates)

| ID | Severity | Status | Owner | Target date | Required outcome |
|---|---|---|---|---|---|
| C3 | CRITICAL | Open | Backend Lead | 2026-04-29 | Add `clerk_user_id` ownership to `job_orders`, enforce owner checks on all session/order endpoints, and add anti-enumeration controls. |
| C5 | CRITICAL | Open | Backend Lead | 2026-04-29 | Require auth + ownership on `/stripe/session/:id`; return minimal fields only. |
| H2 | HIGH | Open | Platform/DevOps | 2026-04-30 | Deploy distributed rate limiting and edge throttles for abuse-prone endpoints. |
| H3 | HIGH | Open | Platform/DevOps | 2026-04-30 | Replace in-memory resend cooldown with shared store (Redis/Postgres TTL). |
| H4 | HIGH | Open | Backend Lead | 2026-05-01 | Wrap order-consumption flow in transaction + row lock and add idempotency guards. |
| H1 | HIGH | Open | Platform/DevOps | 2026-04-30 | Replace permissive CORS with explicit allowlist for production frontend origins. |

## Detailed Findings

### C1) Broken authorization on job/company mutations
- **Severity:** CRITICAL
- **Category:** Authentication & Authorization / API Security
- **Status:** **Verified Fixed** (route middleware applied)
- **File/Endpoint:** `artifacts/api-server/src/routes/jobs.ts` (`POST /jobs`, `PATCH /jobs/:id`, `DELETE /jobs/:id`), `artifacts/api-server/src/routes/companies.ts` (`POST /companies`, `PATCH /companies/:id`)
- **Issue:** Privileged write endpoints were publicly callable.
- **Real-world risk:** Unauthorized users can publish/edit/delete jobs and alter company records.
- **Fix:** `requireAdmin` added to these endpoints.

### C2) Admin route authorization misconfiguration
- **Severity:** CRITICAL
- **Category:** Authentication & Authorization
- **Status:** **Verified Fixed** (router-level enforcement)
- **File/Endpoint:** `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/admin.ts`
- **Issue:** Admin namespace previously relied on incomplete per-handler protection.
- **Real-world risk:** Any authenticated non-admin could access sensitive admin operations if handler-level guard was missing.
- **Fix:** Enforce `router.use("/admin", requireAuth, requireAdmin)` at mount point.

### C3) Order/session IDOR and ownership model weakness
- **Severity:** CRITICAL
- **Category:** Authentication & Authorization / API Security
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/submit.ts` (`PUT /jobs/update`, `POST /jobs/feature`, `POST /jobs/submit`), `artifacts/api-server/src/routes/stripe.ts` (`GET /stripe/session/:id`), `lib/db/src/schema/job-orders.ts`
- **Issue:** `job_orders` has no owner identity column; `sessionId` acts as a de facto access token.
- **Real-world risk:** Blast radius includes:
  - cross-account order reads if session ids leak via logs, browser history, support channels;
  - probing/enumeration attempts against session endpoint for order discovery and PII exposure;
  - unauthorized edits/feature applications when session id is known.
- **Fix:** Add immutable owner binding (`clerk_user_id`), enforce owner checks (`order.clerkUserId === req.userId`) everywhere, and add anti-enumeration controls (rate limits + generic error responses + telemetry alerts).

### C4) Alerts tenant boundary violation
- **Severity:** CRITICAL
- **Category:** Data Protection & Privacy / Authentication & Authorization
- **Status:** **Fix Applied, Needs Verification**
- **File/Endpoint:** `artifacts/api-server/src/routes/alerts.ts` (`GET /alerts`, `DELETE /alerts/:id`)
- **Issue:** Any authenticated user could read/delete alerts globally.
- **Real-world risk:** Cross-tenant data disclosure (emails/preferences) and unauthorized destructive actions.
- **Fix:** Short-term hardening: admin-only routes. Long-term: add owner identity and per-owner access control.

### C5) Public order data exposure endpoint
- **Severity:** CRITICAL
- **Category:** Data Protection & Privacy / API Security
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/stripe.ts` (`GET /stripe/session/:id`)
- **Issue:** Returns order by session id without auth/ownership check.
- **Real-world risk:** PII leakage and reconnaissance for account takeover/order hijacking paths.
- **Fix:** Require auth, enforce ownership, reduce response to minimally required fields, and add endpoint-specific rate limit.

### H1) Overly permissive CORS with credentials
- **Severity:** HIGH
- **Category:** Secrets & Configuration / API Security
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/app.ts`
- **Issue:** `cors({ credentials: true, origin: true })` reflects arbitrary origins while allowing credentials.
- **Real-world risk:** If cookie/session auth is accepted by browser context, malicious origins can induce credentialed cross-origin calls and broaden CSRF/exfiltration risk.
- **Concrete remediation:**
  - introduce `ALLOWED_ORIGINS` env var and hard fail startup when unset in production;
  - only allow known production UI origins (e.g., `https://caribremotejobs.com`, `https://www.caribremotejobs.com`, plus staging domains);
  - set `credentials: true` only for allowlisted origins.

### H2) Missing global rate limiting / abuse controls
- **Severity:** HIGH
- **Category:** API Security / Operational Readiness
- **Status:** **Open**
- **File/Endpoint:** API-wide
- **Issue:** No centralized IP/user throttle policy.
- **Real-world risk:** brute force, spam, email abuse, analytics flooding, and cost amplification.
- **Fix:** Redis-backed per-route limiters + per-user quotas.
- **Interim mitigation (pre-launch stopgap):** enforce Cloudflare/WAF rules for `/stripe/*`, `/jobs/resend-edit-link`, `/analytics/track`, and email-triggering endpoints with strict IP burst caps.

### H3) In-memory cooldown state is non-distributed
- **Severity:** HIGH
- **Category:** Operational Readiness
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/stripe.ts` (`resendTimestamps` map)
- **Issue:** Cooldowns reset on process restart and do not propagate across replicas.
- **Real-world risk:** attackers bypass cooldown by targetting different instances.
- **Fix:** shared TTL-based limiter store (Redis/Postgres advisory table).

### H4) Transactional integrity gap in order→job flow
- **Severity:** HIGH
- **Category:** Database Integrity / Stability
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/submit.ts`
- **Issue:** Job insert and credit decrement are separate operations without transaction/row lock.
- **Real-world risk (worst-case):**
  - double-spend of credits (`jobsRemaining` decremented inconsistently);
  - duplicate postings from concurrent retries;
  - paid order linked to wrong/inconsistent job state under race.
- **Fix:** DB transaction with `SELECT ... FOR UPDATE` on order row, in-transaction balance checks, and idempotency key enforcement.

### H5) Missing idempotency around checkout/session creation
- **Severity:** HIGH
- **Category:** API Security / Stability
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/stripe.ts`
- **Issue:** Client retries can create duplicate pending order/session objects.
- **Real-world risk:** inconsistent billing/order state and support overhead.
- **Fix:** persist idempotency keys (user + product + time window) and short-circuit duplicates.

### M1) Unauthenticated job update endpoint (historical)
- **Severity:** MEDIUM
- **Category:** Authentication & Authorization
- **Status:** **Verified Fixed**
- **File/Endpoint:** `artifacts/api-server/src/routes/submit.ts` (`PUT /jobs/update`)
- **Issue:** Route previously lacked auth middleware.
- **Real-world risk:** unauthenticated updates with leaked session id.
- **Fix:** `requireAuth` added. Ownership check still required under C3.

### M2) Authentication mechanism audit coverage gap
- **Severity:** MEDIUM
- **Category:** Authentication & Authorization
- **Status:** **Open**
- **File/Endpoint:** cross-cutting (`clerkMiddleware` + protected route usage)
- **Issue:** This pass verified authorization placement on many routes, but did not fully validate token/session validation semantics for every deployment mode and proxy scenario.
- **Real-world risk:** misconfiguration could invalidate assumptions on route protection.
- **Fix:** run dedicated auth-layer review: token verification mode, trusted proxies, header forwarding, session expiration behavior, and negative tests across all protected endpoints.

### M3) Error model may leak operational details via logs
- **Severity:** MEDIUM
- **Category:** Data Protection / Operational Readiness
- **Status:** **Open**
- **File/Endpoint:** multiple (`logger.error({ err }, ...)`)
- **Issue:** raw upstream error objects may include sensitive metadata.
- **Real-world risk:** overexposed internals in central logging sinks.
- **Fix:** standardize error sanitization/redaction before logging.

### M4) Brittle base URL construction
- **Severity:** MEDIUM
- **Category:** Secrets & Configuration / Stability
- **Status:** **Open**
- **File/Endpoint:** `artifacts/api-server/src/routes/stripe.ts`, `artifacts/api-server/src/routes/seeker.ts`
- **Issue:** relies on `REPLIT_DOMAINS` parsing rather than validated canonical app URL.
- **Real-world risk:** broken redirects / environment drift.
- **Fix:** required `APP_BASE_URL` with startup validation.

### M5) Input validation inconsistency
- **Severity:** MEDIUM
- **Category:** Input Validation & Injection
- **Status:** **Open**
- **File/Endpoint:** multiple, including `artifacts/api-server/src/routes/submit.ts`
- **Issue:** mixed manual validation and schema validation creates uneven guardrails.
- **Real-world risk:** inconsistent behavior and latent parser edge-case bugs.
- **Fix:** standardize on zod schemas for all mutation payloads.

### L1) SQL injection posture in inspected routes
- **Severity:** LOW
- **Category:** Input Validation & Injection
- **Status:** **No major issues found**
- **File/Endpoint:** inspected Drizzle/sql-template query paths
- **Issue:** no obvious direct SQL injection vectors observed.
- **Fix:** keep parameterized query discipline.

### L2) Frontend token storage (limited scope)
- **Severity:** LOW
- **Category:** Frontend Security
- **Status:** **No major issues found (backend-focused pass)**
- **File/Endpoint:** N/A
- **Issue:** no immediate token leakage pattern confirmed in reviewed backend code.
- **Fix:** run dedicated frontend CSP/header/storage audit before GA.

## Verified Code Changes in This Audit Cycle

1. Enforced admin at router mount (`/admin`) in `artifacts/api-server/src/routes/index.ts` (`router.use("/admin", requireAuth, requireAdmin)`).
2. Added `requireAdmin` to job mutation endpoints in `artifacts/api-server/src/routes/jobs.ts` (`POST /jobs`, `PATCH /jobs/:id`, `DELETE /jobs/:id`).
3. Added `requireAdmin` to company mutation endpoints in `artifacts/api-server/src/routes/companies.ts` (`POST /companies`, `PATCH /companies/:id`).
4. Restricted alerts list/delete to admin in `artifacts/api-server/src/routes/alerts.ts` (`GET /alerts`, `DELETE /alerts/:id`).
5. Added `requireAuth` to `PUT /jobs/update` in `artifacts/api-server/src/routes/submit.ts`.
6. Previously corrected search+filter composition for jobs list/count/tag-count in `artifacts/api-server/src/routes/jobs.ts` (single combined where path).
