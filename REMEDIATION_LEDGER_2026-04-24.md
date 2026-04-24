# Remediation Ledger (Phase 0 + 0.5)
Date: 2026-04-24

## Purpose
Authoritative intake artifact for the current remediation cycle.
This ledger is the single source of truth for Phase 1 acceptance criteria.

## Inputs
- Reviewer feedback attached to latest diff iteration.
- Existing audit/remediation artifacts in repository.

## Comment Ledger

| ID | Reviewer Comment (Normalized) | Scope | File Targets | Required Action | Status |
|---|---|---|---|---|---|
| R1 | Phase 3 checks are still ambiguous; define command-level specs with inputs/expected results/pass criteria. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Add explicit verification specs for auth, IDOR, CORS, Stripe session access, jobs search/count regression. | Planned |
| R2 | Phase 2→3 gate too strict; allow incremental verification per cluster while keeping final gate strict. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Update process text to permit per-cluster verification; keep Phase 4+ blocked on unresolved failures. | Planned |
| R3 | Phase 4 owner/date handling underspecified for open CRITICALs #3/#5. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Require named owners + target dates for all open items before Phase 5; ensure C3/C5 explicitly assigned. | Planned |
| R4 | Phase 5 peer review step is soft; define what reviewer validates and what counts as recorded sign-off. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Add structured reviewer gate: matrix completeness + evidence sufficiency + CRITICAL status correctness + explicit record mechanism. | Planned |
| R5 | PR body rules don’t define handling of unverified claims. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Add explicit rule: unsupported claims are labeled “Unverified” and tracked, not silently omitted. | Planned |
| R6 | Phase 0 exit should explicitly state ledger is authoritative input to Phase 1. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Add explicit handoff contract in process section. | Planned |
| R7 | Jobs search/count regression check should be labeled functional (not core security) to avoid confusion. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Clarify check classification and scope. | Planned |
| R8 | New findings discovered during Phase 3 should follow same log/defer rule as Phase 2. | In scope this cycle | `SECURITY_AUDIT_2026-04-24.md` | Extend scope-creep handling policy to Phase 3 discoveries. | Planned |

## Frozen Scope (Phase 0.5)

### In-Scope This Cycle
1. Process-level clarifications and gating improvements requested in R1–R8.
2. Documentation-only updates to ensure execution plan/audit handoff is unambiguous and verifiable.

### Explicitly Out of Scope This Cycle
1. New functional endpoint changes beyond already-applied route guards.
2. Schema migrations (e.g., adding owner columns) and runtime behavior changes not directly requested in this iteration.
3. Infrastructure rollout tasks (Cloudflare/Redis deployment) beyond documenting exact required actions.

## Open/Deferred Items (Not Changed in This Cycle)

| Finding | Reason Deferred | Required Follow-Up |
|---|---|---|
| C3 (Order/session ownership model) | Requires schema + endpoint behavior changes and migration plan. | Backend migration + authz enforcement rollout with regression testing. |
| C5 (Public stripe session exposure) | Depends on ownership model and API contract update. | Implement owner checks + response minimization after C3 foundation. |
| H1/H2/H3/H4/H5 technical remediations | Requires platform/backend implementation beyond documentation pass. | Execute in dedicated remediation sprint with staged verification. |

## Done/Not-Done Criteria Template (Phase 1 Inputs)
For each R-item:
- **Done** when a file/line citation exists proving text change + (where relevant) mapped command/check definition exists.
- **Not done** when wording remains ambiguous, lacks a gate, or has no verifiable evidence reference.

## Gate to Phase 1
- All R1–R8 mapped and accepted in this ledger.
- In-scope vs out-of-scope frozen above.
- Deferred list recorded for reviewer visibility.

---

## Phase 1 Acceptance Criteria (Concrete)

| R-ID | Done Criteria | Evidence Required |
|---|---|---|
| R1 | Each check category has explicit input, expected response, and pass/fail condition. | Updated plan text + command/test spec table. |
| R2 | Plan allows incremental verification per commit cluster; Phase 4+ remains blocked on unresolved failures. | Gate text showing incremental verification and final blocking rule. |
| R3 | Every open finding has named owner + target date, with C3 and C5 explicitly populated. | Audit table with owner/date for all open items. |
| R4 | Reviewer gate defines what is reviewed and what counts as recorded sign-off. | Phase 5 section with explicit checklist + sign-off artifact definition. |
| R5 | PR narrative rule explicitly labels unsupported claims as Unverified. | PR reporting rule section in process artifact. |
| R6 | Phase handoff explicitly states ledger is authoritative input to Phase 1. | Phase 0 exit criteria text. |
| R7 | Jobs search/count check labeled as functional regression guard (non-primary security check). | Check classification note in verification suite. |
| R8 | New findings discovered during Phase 3 follow same log-and-defer process as Phase 2. | Scope-creep rule includes both phases. |

## Verification Specs (Predefined for Phase 3)

| Check | Input | Expected | Pass Condition |
|---|---|---|---|
| Auth guard matrix | Unauth, non-admin, admin requests to privileged routes | `401/403/2xx` per endpoint policy | All persona/route responses match expected matrix. |
| IDOR/session access | User A attempts User B session/order access; invalid/random session IDs | No cross-user data disclosure; non-disclosing error behavior | Zero responses containing other user order data. |
| CORS behavior | Allowlisted origin vs non-allowlisted origin with preflight + credentialed requests | CORS headers only for allowlisted origins; credentials only where intended | Non-allowlisted origin receives no permissive CORS response. |
| Stripe session endpoint | Owner vs non-owner vs unauthenticated access to `/stripe/session/:id` | Owner-only access (if endpoint retained), deny others | Non-owner and unauthenticated are denied with no sensitive payload. |
| Jobs search/count regression | Combined filters + search queries against jobs list/count/tag-count paths | List and count stay logically consistent for same predicate set | No mismatch between returned jobs and total/count outputs. |

## Gate Refinements

- **Incremental verification is allowed** after each commit cluster in Phase 2.
- **Promotion gate remains strict:** no Phase 4/5 if any in-scope check has unresolved ❌ fail.
- ⚠️ warnings only allowed where clearly caused by environment limitations and explicitly documented.

## Peer Review Requirement (Phase 5)

Reviewer must validate all three:
1. Resolution matrix completeness (every in-scope comment mapped).
2. Evidence sufficiency (file/line or command output for each mapped item).
3. Status correctness for CRITICAL findings (Verified Fixed vs Open vs Needs Verification).

Recorded sign-off must be one of:
- explicit written reviewer approval comment on the PR, or
- designated sign-off note attached to the resolution matrix artifact.

## PR Claim Truthfulness Rule

Any PR claim without a linked verification reference is labeled **Unverified** and listed explicitly; it cannot be presented as completed.

## New-Finding Handling Rule (Phase 2 and Phase 3)

If a new issue is discovered during implementation **or verification**:
1. Log it as `new-finding` in deferred list.
2. Do not fix in this cycle unless scope is explicitly re-approved.
3. Assign owner + target date in follow-up backlog.

---

## Phase 0 Execution Snapshot (Latest Diff Intake)

### Intake Source
- Latest user-provided diff bundle titled around `Harden API authz, fix jobs search/count logic, and add security audit + remediation ledger`.
- Instruction: execute Phase 0 only; do not perform code changes before ledger completion.

### Parsed Inline Comments
No explicit inline comment payload (line-level review comments) was included in the latest diff block. The diff provided file-change summaries only.

### Comment Ledger (comment_id → file → line → required action)

| comment_id | file | line | required action | scope classification | reason |
|---|---|---:|---|---|---|
| IC-000 | N/A | N/A | Record that no explicit inline comments were present in latest diff payload. | in-scope-this-cycle | Required to complete accurate Phase 0 intake and avoid inventing reviewer comments. |
| AI-001 | REMEDIATION_LEDGER_2026-04-24.md | N/A | Build/refresh Phase 0 ledger and classify all parsed items as in-scope or deferred. | in-scope-this-cycle | Explicit user instruction for current turn. |

### Explicitly Deferred Items

| comment_id | deferred? | reason |
|---|---|---|
| None | No | No explicit inline comments were supplied to defer. |

### Phase 0 Completion Gate Check
- [x] Parsed latest diff payload for inline comments.
- [x] Built ledger mapping `comment_id → file → line → required action`.
- [x] Classified each parsed item as in-scope or deferred with reason.
- [x] Stopped before any additional implementation/code remediation work.
