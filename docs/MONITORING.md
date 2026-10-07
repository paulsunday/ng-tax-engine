# Monitoring & Alerting

Status: honest split between what's actually live today and what still needs an external
account this build cannot create on your behalf (account creation is outside what an AI
agent should do unsupervised — see the "Next step" section).

## What's live today (verified)

- **Health endpoints**: `GET /health` (liveness) and `GET /health/ready` (readiness — checks
  the database is actually reachable, not just that the process is up) exist and have been
  hit directly against production repeatedly during this build
  (`https://api-production-2b6a.up.railway.app/health/ready` → `{"status":"ok","database":"reachable",...}`).
- **Structured request logging**: `RequestLoggingMiddleware`
  (`src/api/common/middleware/request-logging.middleware.ts`) logs every request's
  method/path/status/duration once it finishes, applied globally in `AppModule.configure()`.
  Severity is matched to the response: 5xx → `error`, 4xx → `warn`, everything else → `log`.
  This means "show me every 5xx in the last hour" is a log search in Railway's log viewer
  (`railway logs`), not a guess.
- **NestJS's own unhandled-exception logging**: any exception that isn't a deliberate
  `HttpException` is logged with its stack trace by Nest's built-in exception handler before
  the generic "Internal server error" response is returned to the client — this is framework
  default behaviour, confirmed present, not something added this session.
- **Audit trail**: every state-changing action across the app writes an immutable `AuditLog`
  row (`AuditLogService.record()`), queryable per-organization — this is compliance/forensic
  visibility, distinct from operational monitoring, but worth noting here since it answers
  "who did what" during an incident.
- **Railway platform observability**: CPU/memory/deploy history/logs are available in the
  Railway dashboard for the `api` and `Postgres` services out of the box — this is
  infrastructure Railway provides, not something built in this codebase, but it is real and
  already active for this production deployment.
- **Database PITR health**: `railway postgres pitr status` reports `archiverHealthy` — see
  `docs/DISASTER_RECOVERY.md` for the full verified backup story.

## What is NOT live — the honest gap

**There is no alerting.** Nothing currently pages, emails, or notifies anyone when:
- the API crashes or starts returning 5xx at volume,
- `/health/ready` starts failing,
- the daily compliance-sweep cron (`SchedulerService.runDailyComplianceSweep`) fails entirely
  (per-company failures are isolated and logged, per `docs/DISASTER_RECOVERY.md`'s scheduled-job
  row — but a logged failure that nobody reads is not the same as being alerted),
- disk/document-volume usage approaches its limit,
- a certificate or DNS issue breaks the public endpoint.

Logs exist; nobody is told to look at them.

## Recommended next step (needs a human, not more code)

Closing this gap for real requires an external monitoring/alerting account — this is a
genuine "create an account" action, and that's a decision for you, not something this
session takes unilaterally. Two concrete, low-effort options:

1. **Uptime check** (cheapest, fastest to set up): create a free account with an uptime
   monitor (e.g. Better Stack, UptimeRobot, or Railway's own alerting if/when available on
   your plan tier) and point it at
   `https://api-production-2b6a.up.railway.app/health/ready` on a 1-5 minute interval,
   alerting on non-200 or on a response body where `"status"` isn't `"ok"`. This alone covers
   "the API is down" and "the database is unreachable" — the two most severe failure modes.
2. **Error-rate alerting**: if/when budget allows, forward Railway's logs to a log-aggregation
   service (e.g. Better Stack Logs, Axiom) with an alert rule on a spike of lines matching
   `"ERROR"` from the `RequestLoggingMiddleware`/Nest's own error logs — this covers "the API
   is technically up but failing requests," which an uptime check on `/health/ready` alone
   would miss.

Once either is set up, update this file to move it from "recommended" to "verified," the same
way `docs/DISASTER_RECOVERY.md` only marks a capability **VERIFIED** after it was actually
exercised against production.
