# NG Tax Engine

A multi-tenant Nigerian accounting / audit / tax-compliance / tax-filing platform, built on
two stacked specifications:

1. A **source-verified tax rules engine** (`src/engine`, `src/rules`, `research/`) — every
   statutory figure (rate, threshold, deadline) traces to a cited, version-controlled
   `RuleRecord`. Nothing is hardcoded; an unapproved or missing rule throws rather than
   silently defaulting (see "Rule governance" below).
2. A **full accounting/audit/tax SaaS application** (`src/api`) built on top of it — NestJS +
   Prisma/PostgreSQL, multi-tenant, with double-entry bookkeeping, bank reconciliation,
   document management + OCR, financial statements, an audit engine, profit/loss scenario
   analysis, tax computation/filing workflow, compliance reminders, and a controlled AI tool
   dispatcher.

## Architecture

```
src/
  engine/, rules/            tax-rules engine core (framework-agnostic)
  accounting/, financial-statements/, scenarios/, audit/, bank-import/, documents/, adapters/, types/
                             framework-agnostic business logic used by the API layer
  api/                       NestJS application — one folder per bounded module
    <module>/<module>.service.ts      business logic (unit-tested against a mocked PrismaService)
    <module>/<module>.controller.ts   HTTP surface
    <module>/<module>.module.ts       DI wiring
    common/                  RBAC constants, guards (Jwt/Permissions/Tenant), decorators
    prisma/                  PrismaService (the only place Prisma is instantiated)
prisma/schema.prisma         full data model (multi-tenant: every row traces to an Organization)
research/                    source regulatory documents + rule_seed_data.json (the live rule source)
tests/                       mirrors src/ — one test file per service/module, unit tests only
```

### Multi-tenancy

`Organization` is the hard tenant boundary. Every service method that touches company data
calls `companies.getOneOrThrow(organizationId, companyId)` first; a company that exists but
belongs to another tenant returns the same "not found" error as one that doesn't exist at
all — existence is never leaked across tenants.

### Rule governance (tax engine)

`RuleRepository.getEffectiveRule()` resolves the one `RuleRecord` that applies to a given
tax type/jurisdiction/date. If no approved rule applies, or the only candidate is still in
`DRAFT_VERIFIED` (i.e. not reviewed), it throws `NoApplicableRuleError` /
`UnverifiedRuleError` instead of guessing. Every caller in the app layer (tax calculation,
scenarios, compliance calendar) catches these and reports `PENDING_RULE_APPROVAL` /
`MISSING_REGULATORY_INFORMATION` to the user rather than fabricating a number. This
governance is never bypassed in application code — see `ruleGovernance.test.ts` and the
integration tests in `tests/api/*.service.test.ts` for the "caught, not thrown" pattern.

`research/rule_seed_data.json` is the live, non-test rule source, loaded via
`JsonRuleRepository`. `withSimulatedDemoApproval()` (test-only) auto-approves draft rules so
engine tests don't need to hand-curate approval state — the real app never calls it.

### Filing

No real NRS/state e-filing API exists publicly, so `FilingService` always produces a manual
filing package via `ManualFilingAdapter` (or `EnuguTaxAuthorityAdapter` where a real adapter
exists) and never marks a return `FILED` on a failed submission attempt. Treat filing as
"prepare the package a human submits," not "submit to government."

### AI tool dispatcher (`src/api/ai-tools`)

**There is no natural-language LLM integration in this codebase** — no LLM API credentials
exist in this environment, and building a fake one would violate the project's own
anti-fabrication principle. What exists instead is `AiToolsService`: a permission-gated
dispatcher that an LLM integration would call as its tool-use backend. It enforces, in code:

- Every tool call is checked against the caller's role permissions (`AI_TOOL_REGISTRY` in
  `ai-tools.constants.ts` maps each tool to a `PermissionKey`).
- Every tool marked `isWriteTool: true` (calculating/filing a return, running an audit,
  generating a scenario, requesting approval) additionally requires `humanAuthorized: true`
  on the request — it is rejected otherwise.
- Every tool is a thin delegation to an already-built, already-tested service. The
  dispatcher contains no business logic of its own, so it cannot invent a transaction, tax
  figure, or filing that the underlying service wouldn't have produced on its own.

### Scheduled jobs (`src/api/scheduler`)

One daily cron (`SchedulerService.runDailyComplianceSweep`, 06:00 server time) iterates every
company across every tenant and calls two already-idempotent per-company operations:
`ComplianceCalendarService.refreshOverdueStatus` and
`NotificationsService.generateComplianceReminders`. A failure for one company is logged and
isolated — it does not stop the sweep for the rest.

### Security hardening

- **Auth**: JWT (`@nestjs/jwt`) + bcrypt (12 rounds). Optional TOTP MFA (`otplib`, pinned to
  the stable `12.x` line — `13.x` is a breaking async/plugin rewrite not worth the added
  complexity for this feature) — see `POST /auth/mfa/setup|enable|disable` and the
  `totpCode` field on `POST /auth/login`.
- **Rate limiting**: `@nestjs/throttler`, global default 100 req/min/IP, tightened to 5
  req/min/IP on every auth endpoint (login/register/MFA) against brute-force/credential
  stuffing.
- **Headers**: `helmet()` applied globally in `main.ts`.
- **CORS**: explicit allowlist only via `ALLOWED_ORIGINS` (comma-separated exact origins) —
  no origin configured means no browser origin is permitted, there is no permissive default.
- **RBAC**: permissions are DB rows (`Permission`/`RolePermission`), not hardcoded — see
  `src/api/common/rbac.constants.ts` for the default role→permission grants and
  `PermissionsGuard` for enforcement.

## Setup

```bash
cp .env.example .env     # fill in DATABASE_URL, JWT_SECRET (required), ALLOWED_ORIGINS, etc.
npm install
npm run prisma:generate
npm run prisma:migrate    # requires a running PostgreSQL instance
npm run seed:rbac         # seeds Role/Permission/RolePermission rows — required before any registration/login
npm run start:api:dev
```

`GET /health` — liveness (process up, no DB check). `GET /health/ready` — readiness (checks
DB connectivity).

## Testing

```bash
npm run lint      # eslint
npx tsc --noEmit  # type-check
npm test          # 358 tests across 53 suites, all unit tests against a mocked PrismaService
npm run build
```

`tests/api/app-module-wiring.test.ts` compiles the entire NestJS DI graph (every module/
controller/service/guard resolves) with `PrismaService` stubbed out, which catches wiring
mistakes (missing providers, circular imports) without needing a live DB.

The application IS deployed against a real, live PostgreSQL instance (Railway), with
point-in-time recovery enabled and a real restore verified — see
`docs/DISASTER_RECOVERY.md`. The unit test suite itself still mocks `PrismaService`
throughout, by design — it is not a substitute for the migration-validation step below.

## CI

`.github/workflows/ci.yml` runs on every PR/push to `master`/`main`: lint, type-check,
`prisma validate`, `prisma migrate deploy` against a real ephemeral Postgres service
container (genuine migration validation, not just a schema syntax check), the full test
suite, the build, and a dependency audit (reporting only at the `critical` threshold — see
"Known limitations" for the tracked moderate/high advisories in dev-only tooling
dependencies). There is no deployment job in this workflow; deployment is a separate,
manual `railway up` step.

## Known limitations / explicitly out of scope

- **No statutory tax rule is APPROVED/ACTIVE yet.** The full governance workflow exists
  (see "Rule governance" above) and 19 researched candidate rules are loaded in production,
  but every one of them still needs a qualified tax professional to run it through
  verify → submit-for-approval → approve → activate. Until that happens, every tax
  calculation correctly reports `PENDING_RULE_APPROVAL`, never a fabricated number.
- **No real LLM integration.** See "AI tool dispatcher" above — the controlled tool layer
  exists; wiring an actual model to call it does not.
- **No real government e-filing API.** Filing always produces a manual package for human
  submission (one state, Enugu, has a purpose-built adapter; everywhere else uses the
  generic manual adapter).
- **Single-organization login.** `AuthService.login` logs into the first active membership
  found; a user belonging to multiple organizations needs an org-switcher endpoint
  (unbuilt) to get a token scoped to a different membership.
- **Document storage** (`FILE_STORAGE_ROOT`) is a single Railway volume mounted on one
  instance — it survives redeploys, but not horizontal scale-out (multiple replicas would
  each see their own empty volume). Swap `LocalFileStorageAdapter` for an S3/Blob-backed
  adapter before running more than one instance.
- **OCR** (`tesseract.js`) runs fully offline/locally; field extraction is deterministic
  regex over the OCR text, never an LLM guess — accuracy is bounded by image quality, not
  tunable via a model.
- **No production frontend exists yet.** Every verification so far (including the
  production deploy) has been via `curl`/CLI against the API directly.
- **38 known npm advisories** (7 moderate, 31 high as of this writing), all in dev-only
  tooling (`jest`/`ts-node-dev`'s transitive deps) or `exceljs`'s `uuid` dependency — none
  reach `critical`, which is why CI's audit step gates at that threshold rather than
  blocking on these. Re-run `npm audit` periodically; `npm audit fix --force` pulls in
  breaking major-version bumps (jest 30, exceljs 3.x) not yet evaluated.
