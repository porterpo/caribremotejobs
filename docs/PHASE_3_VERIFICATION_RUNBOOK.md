# Phase 3 Verification Runbook
Date: 2026-04-24
Scope: verify the Phase 2 remediations landed in the `claude/security-audit-phase-2-*` clusters before promoting to Phase 4/5.

This runbook is the executable companion to `Audit Process Framework → Verification Specs (Phase 3)` in `SECURITY_AUDIT_2026-04-24.md`. Each section maps 1:1 to a row in that spec table.

## How to use this runbook

1. Deploy the merged Phase 2 clusters (H1, C3+C5, H4+H5) to a staging environment with a fresh DB and the `0012_add_clerk_user_id_to_job_orders.sql` migration applied.
2. Configure the prerequisites below.
3. Execute each section in order. Each section ends with a **Pass condition**; mark it ✅ or ❌ in the result tally at the bottom.
4. Promotion to Phase 4/5 is blocked while any primary-security-check row is ❌. ⚠️ environment-limited results are allowed only with explicit documentation.

## Prerequisites

Set the following environment variables in your shell before running the commands:

```bash
export API_BASE_URL="https://staging.caribremotejobs.com"     # public API base
export FRONTEND_ORIGIN="https://staging.caribremotejobs.com"  # an allowlisted origin
export EVIL_ORIGIN="https://attacker.example"                 # a non-allowlisted origin
export USER_A_TOKEN="<Clerk session JWT for User A>"
export USER_B_TOKEN="<Clerk session JWT for User B>"
export ADMIN_TOKEN="<Clerk session JWT for an admin user>"
export USER_A_PRICE_ID="<a valid stripe price id, e.g. single posting>"
```

How to get a Clerk session JWT: sign in via the staging frontend, open DevTools → Application → Cookies, copy the `__session` cookie value (or use Clerk's `getToken()` from a script).

All `curl` examples below send the Clerk session as a Bearer token. If your deployment uses cookie-based session auth instead, replace `-H "Authorization: Bearer $TOKEN"` with `-b "__session=$TOKEN"`.

---

## Spec 1 — Auth guard matrix (Primary security check)

Goal: every privileged route returns the expected status for each persona.

### 1a) Unauthenticated → 401 on auth-required routes

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API_BASE_URL/api/stripe/checkout" \
  -H "Content-Type: application/json" \
  -d '{"priceId":"'"$USER_A_PRICE_ID"'","email":"x@example.com"}'
# Expected: 401

curl -s -o /dev/null -w "%{http_code}\n" "$API_BASE_URL/api/stripe/session/cs_test_unauth"
# Expected: 401

curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API_BASE_URL/api/jobs/submit" \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401

curl -s -o /dev/null -w "%{http_code}\n" \
  -X PUT "$API_BASE_URL/api/jobs/update" \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401
```

### 1b) Authenticated non-admin → 403 on admin routes

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API_BASE_URL/api/jobs" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
# Expected: 403

curl -s -o /dev/null -w "%{http_code}\n" \
  "$API_BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $USER_A_TOKEN"
# Expected: 403

curl -s -o /dev/null -w "%{http_code}\n" \
  "$API_BASE_URL/api/alerts" \
  -H "Authorization: Bearer $USER_A_TOKEN"
# Expected: 403
```

### 1c) Admin → 2xx on admin routes

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$API_BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200

curl -s -o /dev/null -w "%{http_code}\n" \
  "$API_BASE_URL/api/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 200
```

**Pass condition:** every cell above matches its expected status. Any 2xx where 401/403 is expected is a hard fail.

---

## Spec 2 — IDOR / session access (Primary security check)

Goal: User A cannot access User B's order through any session-based endpoint, and unknown session IDs return non-disclosing errors.

### Setup

As User A, complete a checkout in staging to create a real `job_orders` row. Capture its `stripe_session_id` (visible in the success URL after Stripe redirect).

```bash
export USER_A_SESSION_ID="<stripe_session_id from User A's checkout>"
```

### 2a) User B reads User A's session → 404

```bash
curl -s -o /tmp/idor.json -w "%{http_code}\n" \
  "$API_BASE_URL/api/stripe/session/$USER_A_SESSION_ID" \
  -H "Authorization: Bearer $USER_B_TOKEN"
# Expected status: 404

cat /tmp/idor.json
# Expected body: {"error":"Order not found"} — no email, no productType, no jobsRemaining echo
```

### 2b) User B mutates User A's order → 404 (no double-spend, no edit)

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API_BASE_URL/api/jobs/submit" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"'"$USER_A_SESSION_ID"'","title":"hostile","companyName":"x","category":"engineering","description":"'"$(printf 'x%.0s' {1..60})"'","applyUrl":"https://x.example"}'
# Expected: 404

curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$API_BASE_URL/api/stripe/resend-confirmation" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"'"$USER_A_SESSION_ID"'"}'
# Expected: 404
```

### 2c) Random/unknown session ID → 404

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$API_BASE_URL/api/stripe/session/cs_test_does_not_exist" \
  -H "Authorization: Bearer $USER_A_TOKEN"
# Expected: 404 — same status as "not yours" above (anti-enumeration)
```

**Pass condition:** all three cases return 404 with `{"error":"Order not found"}` and no User A data leaks in any response body or headers.

---

## Spec 3 — CORS behavior (Primary security check)

Goal: CORS reflective-origin behavior is gone; only allowlisted origins receive permissive headers.

### 3a) Allowlisted origin preflight

```bash
curl -s -i -X OPTIONS "$API_BASE_URL/api/stripe/products" \
  -H "Origin: $FRONTEND_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  | grep -i -E "^access-control-allow-(origin|credentials)"
# Expected:
#   access-control-allow-origin: $FRONTEND_ORIGIN
#   access-control-allow-credentials: true
```

### 3b) Allowlisted origin credentialed GET

```bash
curl -s -i "$API_BASE_URL/api/stripe/products" \
  -H "Origin: $FRONTEND_ORIGIN" \
  | grep -i -E "^access-control-allow-(origin|credentials)"
# Expected: same headers as 3a
```

### 3c) Non-allowlisted origin → no permissive CORS

```bash
curl -s -i -X OPTIONS "$API_BASE_URL/api/stripe/products" \
  -H "Origin: $EVIL_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  | grep -i "^access-control-allow-origin" || echo "(no allow-origin header — ✅)"
# Expected: NO access-control-allow-origin header in response
```

**Pass condition:** allowlisted origins receive `Access-Control-Allow-Origin: <origin>` and `Access-Control-Allow-Credentials: true`; non-allowlisted origins receive neither header.

---

## Spec 4 — Stripe session endpoint (Primary security check)

Goal: only the order owner sees the order; non-owners and unauthenticated callers are denied without payload leakage.

### 4a) Owner → 200 with minimized payload

```bash
curl -s "$API_BASE_URL/api/stripe/session/$USER_A_SESSION_ID" \
  -H "Authorization: Bearer $USER_A_TOKEN" | jq 'keys'
# Expected keys (exact set, no more, no less):
#   ["email","id","jobId","jobsRemaining","productType","status"]
```

If the response includes `stripeSessionId`, `clerkUserId`, `confirmationEmailSentAt`, `jobSubmissionEmailSentAt`, `editLinkResendAt`, or `createdAt`, the response was not minimized — fail.

### 4b) Non-owner authenticated → 404 (covered by Spec 2a)

### 4c) Unauthenticated → 401 (covered by Spec 1a)

**Pass condition:** owner gets the minimized payload only; non-owner/unauthenticated callers receive 404/401 with no order PII in body or headers.

---

## Spec 5 — Jobs search/count regression (Functional regression guard, non-primary security check)

Goal: list and count endpoints return logically consistent results for the same predicate set.

```bash
declare -a PREDICATES=(
  "search=remote"
  "category=engineering"
  "search=remote&category=engineering"
  "search=designer&jobType=full-time"
  "tag=react&search=senior"
)

for q in "${PREDICATES[@]}"; do
  list_count=$(curl -s "$API_BASE_URL/api/jobs?$q" | jq 'length')
  total=$(curl -s "$API_BASE_URL/api/jobs/count?$q" | jq '.count // .total // .')
  echo "predicate: $q | list-page: $list_count | count: $total"
done
```

**Pass condition:** for each predicate, `count` ≥ `list-page` length (count is total across pages, list is one page) and the relationship is monotonically consistent across predicate combinations. No 500s.

---

## Concurrency check (H4 — order-flow transactional integrity)

Goal: concurrent submissions for the same paid order cannot decrement `jobsRemaining` past 0 or insert duplicate jobs.

### Setup

As User A, complete a checkout for a `pack` product (`jobsRemaining = 3` at creation). Capture the resulting `stripe_session_id` and ensure the order has `status = paid` (Stripe webhook completed).

```bash
export PACK_SESSION_ID="<paid pack order's stripe_session_id>"

PAYLOAD='{"sessionId":"'"$PACK_SESSION_ID"'","title":"concurrency test","companyName":"x","category":"engineering","description":"'"$(printf 'x%.0s' {1..60})"'","applyUrl":"https://x.example"}'

# Fire 5 concurrent submits; only 3 should succeed (matches jobsRemaining).
for i in 1 2 3 4 5; do
  curl -s -o /tmp/h4-$i.json -w "%{http_code}\n" \
    -X POST "$API_BASE_URL/api/jobs/submit" \
    -H "Authorization: Bearer $USER_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" &
done
wait

echo "--- statuses ---"
for i in 1 2 3 4 5; do echo "req $i:"; cat /tmp/h4-$i.json; echo; done
```

**Pass condition:** exactly 3 of the 5 requests return 201; the remaining 2 return 403 with `"No job slots remaining on this order."`. Inspecting the DB, `jobs_remaining = 0` and exactly 3 new `jobs` rows were inserted, all linked to the order.

---

## Idempotency check (H5 — checkout dedupe)

Goal: rapid duplicate checkout calls return the same Stripe Session and only one `job_orders` row.

```bash
PAYLOAD='{"priceId":"'"$USER_A_PRICE_ID"'","email":"a@example.com"}'

for i in 1 2 3; do
  curl -s "$API_BASE_URL/api/stripe/checkout" \
    -X POST \
    -H "Authorization: Bearer $USER_A_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" -o /tmp/h5-$i.json &
done
wait

for i in 1 2 3; do
  jq -r '.url // .error' /tmp/h5-$i.json
done | sort -u
```

**Pass condition:** all three responses contain the same `url` (single Stripe Session id). Inspecting the DB, exactly one new `job_orders` row exists for that `clerk_user_id` and price within the 10-minute window.

---

## Result tally template

Fill this table out at end of run. Promotion to Phase 4/5 is blocked while any primary-security-check row is ❌.

| Spec | Classification | Result | Notes |
|---|---|---|---|
| 1 — Auth guard matrix | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| 2 — IDOR / session access | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| 3 — CORS behavior | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| 4 — Stripe session endpoint | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| 5 — Jobs search/count regression | Functional regression guard | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| Concurrency (H4) | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |
| Idempotency (H5) | Primary security check | ☐ ✅ / ☐ ❌ / ☐ ⚠️ | |

Reviewer sign-off (per `Phase 5 Peer Review Checklist` in `SECURITY_AUDIT_2026-04-24.md`): _______________  Date: _______
