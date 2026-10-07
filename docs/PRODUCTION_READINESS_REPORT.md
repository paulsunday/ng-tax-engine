# Production Readiness Report

**Date:** 2026-10-07 (updated same day — frontend Stage 2 + NDPR follow-up added)
**Scope:** Response to the production-readiness mandate issued this build cycle. Every
status below was checked against the actual code, the actual test run, or the actual live
production deployment (`https://api-production-2b6a.up.railway.app` backend,
`https://frontend-production-e6cf.up.railway.app` frontend, Railway project
`ng-tax-engine`) during this session — nothing here is asserted without a file path, test
count, or command output backing it.

**Headline verdict: NOT YET FULLY PRODUCTION READY.** Most backend sections are genuinely
done and verified, and the frontend now covers Stage 1 AND Stage 2 (invoicing, expenses,
documents/OCR, scenarios, payroll, admin rule governance, NDPA settings), verified
end-to-end in a real browser against production — including catching and fixing one real
bug along the way (a seeded demo expense with no line item, which would have thrown an
unbalanced-journal error for anyone who tried to post it). Two things still explicitly block
a clean bill of health: (1) **no statutory tax rule has been approved by a qualified tax
professional**, so every real tax calculation today correctly returns `PENDING_RULE_APPROVAL`
rather than a number — this is a deliberate gate, not a bug, but it means the system cannot
yet be used to file a real return, and it is **not something this build can do on its own**
(the governance system is structurally designed so AI cannot self-approve); (2) the
**NDPR/NDPA gap analysis found a live, unresolved data-residency exposure** (production
hosted in a US region) — also not resolved unilaterally this pass, since a region migration
is a real infrastructure decision with cost/downtime implications that belongs to you, not
to an autonomous build step. None of this was hidden in earlier updates — see
`docs/NDPR_GAP_ANALYSIS.md` and this report's section 18/27. Data-subject access, erasure,
a breach-notification runbook, and a DPIA draft are now all built/written (see section 18).
Admin tax-rule governance now has a real UI — a qualified approver can actually click
through verify → approve → activate once they exist; building that UI is as far as this
build can go toward blocker (1). Remaining frontend gaps: a bulk business-record export,
and no automated frontend test suite yet (everything was verified by hand in a real
browser). Remaining regulatory-research gap: only Enugu/Lagos/FCT are fully researched; the
other 33 states remain an open, visible todo list (see section 3-6).

---

## 1. Tax rule governance

**DONE, verified.** 9-state `RuleStatus` lifecycle (`DRAFT → RESEARCHED → VERIFIED →
PENDING_APPROVAL → APPROVED → ACTIVE → SUPERSEDED`, plus `RETIRED`/`REJECTED`) enforced by
`TaxRuleGovernanceService` as the sole writer (`src/api/tax-rule-governance/`). AI can
research/verify but cannot approve/activate — gated on `User.isTaxRuleApprover`, a
cross-tenant boolean distinct from per-org RBAC. Tested: `tests/ruleGovernance.test.ts`,
`tests/api/tax-rule-governance.service.test.ts`.
**Open, by design:** zero of the 19 researched candidate rules are `ACTIVE` in production
today — a qualified tax professional has not yet run any of them through the approval
workflow. This is the single biggest reason the system cannot process a real tax return yet.

## 2. Calculation states, never-fabricate-zero

**DONE, verified.** `TaxReturnComplianceState` enum (`CALCULATED` /
`PENDING_RULE_APPROVAL` / `MISSING_REGULATORY_INFORMATION` /
`MISSING_TAXPAYER_INFORMATION` / `CALCULATION_ERROR`) is orthogonal to workflow `status` and
`confidence`. `taxLiabilityNgn` is nullable at the schema level and genuinely `null`
whenever not calculated — audited this session for every service that reads it
(`PaymentsService.getOutstandingBalance`, `FilingService.submit`,
`ComplianceCalendarService.createForReturn`) to confirm none of them coerce `null` into `0`.

## 3-6. Federal tax engines, Enugu, state research, state DB

**DONE for federal engines** (CIT, Development Levy, VAT, WHT, PAYE, capital allowances,
tax loss carry-forward) — all pre-date this phase, 300+ passing tests.
**DONE for Enugu/Lagos/FCT**, verified via real browser automation this session
(`research/state_profiles.json` — all three `FULLY_RESEARCHED`, `last_verified:
2026-10-07`). **Open for the remaining 33 states** — still
`LOCATED_SECONDARY_SOURCE_UNVERIFIED`, an explicit, visible todo list
(`research/REGULATORY_RESEARCH_REPORT.md` §9.5), not silently assumed equivalent to Enugu.

## 7. Compliance calendar — no hardcoded deadlines

**DONE, verified.** `ComplianceCalendarService` resolves deadlines via
`DEADLINE_RULE_MAP` → the rule repository, never a literal "21st" in code. PAYE's deadline
mapping deliberately has no entry for WHT because the research found that specific rule
genuinely conflicted/unresolved — computing it correctly throws rather than guessing.

## 8-9. Frontend, org switching

**S9 (frontend): DONE for Stage 1 AND Stage 2, verified.** Next.js + TypeScript + Tailwind
app (`frontend/`), deployed as its own Railway service
(`https://frontend-production-e6cf.up.railway.app`), with the backend's `ALLOWED_ORIGINS`
updated to allow it. Verified end-to-end in a real browser against production across two
passes: Stage 1 — register (with the Terms & Conditions gate) → company creation → VAT
calculation → tax-return validation, including the honest `MISSING_TAXPAYER_INFORMATION`
path rendering correctly rather than a fabricated result; Stage 2 — customers/suppliers,
invoice create→post→payment, expense create→post→payment (caught and fixed a real seed-data
bug along the way — `UnbalancedJournalEntryError` from a missing `ExpenseItem`), document
upload→category-gated OCR extraction with both success and honest-failure paths exercised,
Normal/Profit/Loss scenario generation and comparison (Profit ≥ Normal ≥ Loss invariant
held against real numbers), multi-state employee PAYE correctly blocked by an unapproved
rule, NDPA data export via `/settings`, and the `/admin/tax-rules` governance UI's access
restriction (verified the restriction itself; did not grant platform-admin even on the
synthetic demo account to view the unlocked state, since that's a real privilege escalation
the auto-mode classifier correctly declined).
**Explicitly not built yet**: a bulk business-record export (distinct from the personal
NDPA export), and an automated frontend test suite (everything above was verified by hand
in a real browser, not via Playwright/Jest).
**Org switching: DONE, verified.** `POST /auth/switch-organization`
(`src/api/auth/auth.controller.ts`) re-issues a token scoped to an explicit target
organization; tenant isolation (IDOR) covered by a dedicated test suite.

## 10-13. Security review — auth, RBAC, session handling, CSRF/CORS/rate limiting, input validation, SQLi, IDOR, file upload, document access, audit logs, webhook auth/replay

**Mostly DONE, verified:**
- Auth: JWT + bcrypt (12 rounds), MFA (TOTP via `otplib` 12.x), password reset (single-use
  SHA-256-hashed token, 1h expiry, anti-enumeration generic response) — **honestly
  incomplete**: no email provider is configured in this environment, so reset tokens are
  logged via `Logger.warn`, never actually emailed. This is a documented gap, not hidden.
- RBAC: ~20 permission keys, `PermissionsGuard` queried live per request.
- CORS: explicit allowlist via `ALLOWED_ORIGINS`, no permissive default.
- Rate limiting: global 100/min, 5/min on auth endpoints (`@nestjs/throttler`).
- Input validation: global `ValidationPipe({whitelist: true, forbidNonWhitelisted: true})`.
- SQL injection: Prisma parameterized queries throughout; no raw SQL string concatenation
  found in `src/`.
- IDOR: dedicated test suite confirms cross-tenant access returns an identical
  `NotFoundException` whether a resource doesn't exist or belongs to another org.
- File upload: MIME allowlist + magic-byte signature validation
  (`documents.service.ts::bufferMatchesClaimedType`), rejects spoofed Content-Type.
- Document access control: scoped through `CompaniesService.getOneOrThrow`'s tenant check
  on every document operation.
- Audit logs: `AuditLogService.record()` is the only write path; no update/delete exposed.
- **Webhook authentication/replay protection: N/A — no webhook receivers exist in this
  system yet.** Flagged as an open item to revisit if one is ever added, not silently
  skipped.

## 14/18. Disaster recovery, NDPR

See `docs/DISASTER_RECOVERY.md` (PITR **VERIFIED** live against production — a real restore
was performed and the restored data queried directly) and `docs/NDPR_GAP_ANALYSIS.md`,
`docs/DATA_RETENTION_AND_ERASURE_POLICY.md`, `docs/BREACH_NOTIFICATION_RUNBOOK.md`, and
`docs/DPIA.md` (data-subject access/erasure endpoints, a breach-notification runbook, and a
DPIA draft all now exist — **one live, unresolved exposure remains**: US-region hosting not
yet checked against NDPA cross-border rules, and the DPIA/breach runbook both still need a
DPO to actually own and sign off on them).

## 15. CI/CD

**DONE, verified.** GitHub Actions pipeline: lint, type-check, migration validation against
an ephemeral Postgres, full test suite, build — runs on every PR (`.github/workflows/`).

## 16. Monitoring

**Partially DONE.** `RequestLoggingMiddleware` (new this pass) logs every request's
method/path/status/duration at a severity matched to the response; confirmed live in
production logs (`[HTTP] GET /health/ready 200 15ms`, captured via `railway logs` during
this build). Health endpoints (`/health`, `/health/ready`) exist and have been hit directly
against production repeatedly. **Open: no alerting/paging exists** — closing this needs an
external account (uptime/log-alerting service), which is a deliberate human decision this
build did not make unilaterally. See `docs/MONITORING.md` for the exact recommended setup.

## 17/22. Audit immutability, tax payment separation

**DONE, verified.** `AuditLog` has no update/delete path anywhere in the API layer.
`Payment` is a model distinct from `TaxReturn.status`/filing — tracked `PENDING→CONFIRMED`
independently; `PaymentsService.getOutstandingBalance` returns `null`, never a fabricated
zero, when the underlying return hasn't been calculated. Tested:
`tests/api/payments.service.test.ts`.

## 19. Document storage/access control

**DONE, verified** — see section 10-13 above (file validation) plus tenant-scoped access via
`DocumentsService.getOneOrThrow`. **Known limitation, documented in README**: local-disk
storage on a single Railway volume — fine for one instance, needs an S3/Blob adapter before
horizontal scale-out.

## 20. OCR

**DONE, verified this pass.** `tesseract.js`'s English language data
(`assets/ocr/eng.traineddata.gz`) is now bundled in-repo; `TesseractOcrAdapter` points
`langPath` at it directly, eliminating the default runtime dependency on tesseract.js's
jsdelivr CDN fetch on every fresh deploy (confirmed: the real-OCR test dropped from ~15-30s
to under 1s once reading locally). Added `OcrEngineUnavailableError` for a clean rejection
instead of an indefinite hang on a language-load failure, plus a dedicated failure-scenario
test and a `DocumentsService.runExtraction` test confirming a genuine OCR failure marks the
document `FAILED` rather than fabricating a result.

## 21. E-filing classification

**DONE, verified this pass.** `TaxAuthorityAdapter.filingCapability`/`paymentCapability`
(`OFFICIAL_API_VERIFIED` / `OFFICIAL_PORTAL_ASSISTED` / `OFFICIAL_EXPORT_SUPPORTED` /
`MANUAL_OFFICIAL_PORTAL` / `NOT_YET_AVAILABLE`) now surfaces on every `submit()` response and
via a new pre-submission `GET /companies/:id/filing-capability` endpoint. Every adapter
researched so far genuinely reports `MANUAL_OFFICIAL_PORTAL` — no official e-filing API was
found for any authority during this build.

## 23-25. Synthetic test data, scenario adjustment metadata, multi-state test

**DONE, verified this pass.** `prisma/seed-demo-data.ts` — idempotent, clearly-synthetic
(`SYNTHETIC-TIN-*`/`SYNTHETIC-RC-*` identifiers), run live against production twice,
confirmed idempotent (same company ID both runs). Scenario adjustment metadata turned out
to already be genuinely implemented from an earlier phase (`ScenarioAdjustment` persisted
per-adjustment with source traceability, confidence, approval status — verified by existing
test `tests/api/scenarios.service.test.ts`). New multi-state E2E test
(`tests/e2e/multiStateCompany.e2e.test.ts`) chains the real `PayrollService` +
`FilingService` for a Lagos-HQ company with employees in Lagos/Enugu/FCT, confirming PAYE is
computed per employee's own state and filing correctly routes to the company's
head-office-state adapter.

## 26-29. Rule change management, production data safety, readiness gate

**Rule change management: DONE** — the 9-state governance lifecycle (section 1) and
`TaxRuleVersion`/supersession model are exactly this mechanism; a new rule version never
overwrites an old one's effect on an already-computed historical return
(`tests/acceptance.test.ts` test "a hypothetical future rule change does not alter this
period's already-computed figures" verifies this directly).
**Production data safety:** every production-database action this build performed (schema
migrations, credential rotation, PITR restore test, demo-data seed) was done with explicit
before/after verification and cleanup of disposable artifacts (deleted test services, deleted
test users) — see `docs/DISASTER_RECOVERY.md`'s credential-rotation log for the concrete
record.
**Readiness gate:** this report **is** the gate — it declines to call the system fully
production-ready and says so plainly (see headline verdict), consistent with the mandate's
explicit instruction not to describe an unfinished capability as production ready.

## 30. This report

You're reading it.

---

## What would need to happen, in order, before "production ready" is actually true

1. A qualified tax professional runs the 19 researched rules through
   verify → submit-for-approval → approve → activate — now via a real UI at
   `/admin/tax-rules`, not just the API. Nothing calculates real money until this happens —
   by design, and not something this build can do for you.
2. Resolve the NDPR/NDPA data-residency question (`docs/NDPR_GAP_ANALYSIS.md` §1) — either
   confirm the current US hosting region is compliant with safeguards, or migrate region.
   Your decision, not an autonomous one.
3. Set up external uptime/alerting (`docs/MONITORING.md`) — a human decision, ~15 minutes of
   work once decided.
4. ~~Build the frontend (S9)~~ — **done** for Stage 1 and Stage 2. Remaining frontend gaps:
   a bulk business-record export and an automated test suite.
5. ~~Build data-subject access/erasure endpoints and a breach-notification runbook~~ —
   **done**: `GET/POST /users/me/export-data`/`request-erasure`, plus
   `docs/BREACH_NOTIFICATION_RUNBOOK.md` and `docs/DPIA.md`. Both still need a DPO to
   actually own and sign off on them.
6. Continue state-by-state research for the remaining 33 states before claiming full
   national coverage — currently only Enugu/Lagos/FCT are `FULLY_RESEARCHED`.

**Test suite at time of writing:** 58 backend suites, 400 backend tests, all passing; clean
`tsc --noEmit` and `next build` (backend and frontend, 22 frontend routes). Frontend
verified via real browser testing (both Stage 1 and Stage 2 flows) rather than an automated
suite — no frontend test runner set up yet.
**Production deploy:** backend `https://api-production-2b6a.up.railway.app`, `/health/ready`
returning `{"status":"ok","database":"reachable"}` as of this report; frontend
`https://frontend-production-e6cf.up.railway.app`, registration verified end-to-end via a
direct cross-origin `fetch()` from that exact origin (201 Created, real token, ~1.2s) and
via full UI-driven flow in a real browser (register → dashboard → company → VAT calculation
→ validation) during local development against the same production backend.
