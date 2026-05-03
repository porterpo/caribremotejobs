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
| H5 | HIGH | Open | Backend Lead | 2026-05-01 | Persist idempotency keys (user + product + time window) on checkout/session creation; short-circuit duplicates. |

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

## Audit Process Framework

This section consolidates the process specification for the audit lifecycle. The Remediation Ledger (`REMEDIATION_LEDGER_2026-04-24.md`) is the per-cycle intake artifact; this framework section is the canonical process spec for Phases 1–5 going forward.

### Phase Definitions and Handoff Contract (R6)

| Phase | Name | Inputs | Exit Criteria |
|---|---|---|---|
| 0 | Intake | Reviewer comments, prior audit artifacts | Ledger built; every comment classified `in-scope-this-cycle` or `deferred`; scope frozen. |
| 0.5 | Scope Freeze | Phase 0 ledger | `In-Scope This Cycle` and `Explicitly Out of Scope` lists recorded; reviewer-visible deferred list recorded. |
| 1 | Process Hardening | Phase 0 ledger | All R-item Done Criteria met with evidence anchor in this audit doc; Phase 1 Completion Matrix populated. |
| 2 | Remediation | This audit doc + ledger | Each commit cluster lands with verification evidence per Gate Rules. |
| 3 | Verification | Verification Specs (below) | Every primary security check passes; functional regression check passes; new findings logged per New-Finding Handling Rule. |
| 4 | Owner & Date Assignment | Open-finding list | Every open finding has named owner + target date. |
| 5 | Peer Review & Sign-Off | Phases 1–4 evidence | Reviewer validates checklist; sign-off recorded per Phase 5 Peer Review Checklist. |

**Handoff contract (R6):** The Remediation Ledger produced in Phase 0 is the **authoritative input to Phase 1**. Phase 1 cannot begin until the ledger's `Gate to Phase 1` checklist is satisfied. The ledger's `Phase 1 Acceptance Criteria` table defines the Done Criteria that this audit doc must satisfy to exit Phase 1.

### Verification Specs (Phase 3) (R1, R7)

Each row defines the input, expected response, and pass condition for a Phase 3 check. Rows are explicitly classified as **primary security check** or **functional regression guard**. Executable runbook: `docs/PHASE_3_VERIFICATION_RUNBOOK.md` (one section per row, plus concurrency and idempotency checks for H4 and H5).

| Check | Classification | Command/Input | Expected Response | Pass Condition |
|---|---|---|---|---|
| Auth guard matrix | Primary security check | Issue requests as (a) unauthenticated, (b) authenticated non-admin, (c) authenticated admin against every privileged route in `routes/jobs.ts`, `routes/companies.ts`, `routes/admin.ts`, `routes/alerts.ts`, `routes/submit.ts`. | `401` for (a) where auth required; `403` for (b) where admin required; `2xx` for (c) on permitted routes. | Persona × route response matrix matches expected status for every cell; zero policy bypasses. |
| IDOR / session access | Primary security check | User A authenticated; attempts `GET /stripe/session/:id` and `PUT /jobs/update` using a `sessionId` belonging to User B. Also issue requests with random/invalid session IDs. | No cross-user data disclosure; non-disclosing generic error (e.g., `404` for unknown, `403` for foreign-owned). | Zero responses contain another user's order data; error responses do not differentiate between "not found" and "not yours" in a way that enables enumeration. |
| CORS behavior | Primary security check | Preflight (`OPTIONS`) and credentialed requests from (a) allowlisted production origin, (b) allowlisted staging origin, (c) non-allowlisted origin. | Permissive `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` only for (a) and (b); no permissive CORS headers for (c). | Non-allowlisted origin receives no permissive CORS response and credentialed requests are rejected by the browser. |
| Stripe session endpoint | Primary security check | `GET /stripe/session/:id` as (a) owner, (b) authenticated non-owner, (c) unauthenticated. | (a) `2xx` with minimized payload (only fields the UI requires); (b) `403` or `404` with no sensitive payload; (c) `401`. | Non-owner and unauthenticated personas are denied with no order PII in body or headers. |
| Jobs search/count regression | Functional regression guard (non-primary security check) | Combined filter + free-text search queries against `GET /jobs`, `GET /jobs/count`, `GET /jobs/tag-count`. | List length and aggregate counts logically consistent for the same predicate set. | No mismatch between returned jobs and total/count outputs across at least 5 representative predicate combinations. |

### Gate Rules (R2)

- **Incremental verification (Phase 2):** Each commit cluster in Phase 2 lands with its own pass/fail evidence. Reviewers may sign off on a cluster's verification incrementally; later clusters are not blocked by earlier clusters as long as each cluster's own checks pass.
- **Final promotion gate (Phase 4/5):** Promotion to Phase 4 or Phase 5 is **blocked while any in-scope check has an unresolved ❌ failure**. ⚠️ environment-limited results (e.g., a check that cannot be executed because staging is unavailable) are allowed only with explicit documentation of the limitation and a backlog item to re-run the check once the limitation is removed.

### Owner & Date Requirements (Phase 4) (R3)

**Rule:** Every open finding must have a named owner and target date populated before Phase 5 sign-off. The `Launch-Blocking Next Steps` table at the top of this document is the authoritative source. As of this Phase 1 commit, that table covers C3, C5, H1, H2, H3, H4, and H5 (the H5 row was added in Phase 1 to close a coverage gap identified by R3).

Open findings without owner/date assignment block Phase 5 promotion.

### Phase 5 Peer Review Checklist (R4)

A peer reviewer must validate **all three** of the following before Phase 5 sign-off:

1. **Resolution-matrix completeness** — every in-scope reviewer comment from the Phase 0 ledger maps to an entry in this audit doc.
2. **Evidence sufficiency** — each mapped item carries a file/line citation or command output proving the change/check landed.
3. **CRITICAL status correctness** — every CRITICAL finding's status is one of `Verified Fixed`, `Open`, or `Needs Verification`, and the status is supported by the evidence cited.

**Recorded sign-off** must take one of these two forms:

- An explicit written reviewer approval comment on the pull request, **or**
- A designated sign-off note attached to the resolution-matrix artifact (the Phase 1 Completion Matrix below, or the equivalent matrix produced in later phases).

### PR Claim Truthfulness Rule (R5)

Any PR claim without a linked verification reference is labeled **Unverified** and listed explicitly in the PR body; it cannot be presented as completed. Unverified claims are tracked, not silently omitted, and remain Unverified until evidence is attached.

### New-Finding Handling Rule (Phase 2 and Phase 3) (R8)

If a new issue is discovered during implementation **(Phase 2)** or verification **(Phase 3)**:

1. Log it as `new-finding` in the deferred list of the active Remediation Ledger.
2. Do **not** fix it in the current cycle unless scope is explicitly re-approved by the reviewer.
3. Assign owner + target date in the follow-up backlog before the cycle closes.

This rule applies symmetrically to Phase 2 and Phase 3 discoveries; Phase 3 is not a back door for in-cycle scope expansion.

## Phase 1 Completion Matrix

This matrix is the artifact a Phase 5 reviewer scans to validate Phase 1 evidence sufficiency (per Phase 5 Peer Review Checklist item 2). Every R-item from the Phase 0 ledger maps to a concrete anchor in this document.

| R-ID | Done Criteria (from ledger) | Evidence Anchor in This Document | Status |
|---|---|---|---|
| R1 | Each Phase 3 check has explicit input, expected response, and pass/fail condition. | `Audit Process Framework → Verification Specs (Phase 3)` table; every row populates Command/Input, Expected Response, and Pass Condition columns. | ✅ Met |
| R2 | Plan allows incremental verification per commit cluster; Phase 4+ remains blocked on unresolved failures. | `Audit Process Framework → Gate Rules` section; both bullets stated. | ✅ Met |
| R3 | Every open finding has named owner + target date, with C3 and C5 explicitly populated. | `Launch-Blocking Next Steps` table at top of document; C3, C5, H1, H2, H3, H4, H5 all populated. | ✅ Met |
| R4 | Reviewer gate defines what is reviewed and what counts as recorded sign-off. | `Audit Process Framework → Phase 5 Peer Review Checklist`; three validation items + two sign-off forms enumerated. | ✅ Met |
| R5 | PR narrative rule explicitly labels unsupported claims as Unverified. | `Audit Process Framework → PR Claim Truthfulness Rule`. | ✅ Met |
| R6 | Phase handoff explicitly states ledger is authoritative input to Phase 1. | `Audit Process Framework → Phase Definitions and Handoff Contract`; handoff contract paragraph after the phase table. | ✅ Met |
| R7 | Jobs search/count check labeled as functional regression guard (non-primary security check). | `Audit Process Framework → Verification Specs (Phase 3)` table; Classification column on the Jobs search/count row. | ✅ Met |
| R8 | New findings discovered during Phase 3 follow same log-and-defer process as Phase 2. | `Audit Process Framework → New-Finding Handling Rule (Phase 2 and Phase 3)`. | ✅ Met |
