# Disaster Recovery Runbook

Status: database backup/restore verified live against production on 2026-10-07. Everything
below marked **VERIFIED** was actually exercised, not just configured and assumed to work.

## Database backups (Railway Postgres point-in-time recovery)

**VERIFIED 2026-10-07**: PITR enabled on the production Postgres service, confirmed healthy
(`archiverHealthy: true`, continuous WAL archiving active), and a real restore was performed
into a disposable new service, then the restored data was queried directly and found to
exactly match production (19 `TaxRule`/`TaxRuleVersion` rows, correct status breakdown).
The disposable service was deleted immediately after verification.

- **Mechanism**: continuous WAL (write-ahead log) archiving to object storage, not discrete
  nightly dumps — any point in time within the retention window can be restored to, not just
  fixed snapshot times.
- **Recovery Point Objective (RPO)**: near-zero — observed WAL archiving cadence is on the
  order of seconds to low minutes (`archiverLastArchivedAt` tracked a few minutes behind
  real time during verification). Worst-case data loss in a hard crash is whatever WAL hasn't
  been archived yet — typically under a minute.
- **Recovery Time Objective (RTO)**: ~5 minutes observed, end to end, for a full restore into
  a brand-new service (trigger restore → new Postgres instance running → data verified).
  Cutting the application over to a restored instance (updating `DATABASE_URL` and
  redeploying `api`) adds a few more minutes on top — budget **10-15 minutes RTO** for a full
  incident response, not just the raw restore step.
- **Retention**: governed by Railway's PITR window on the current plan tier — not
  independently confirmed beyond "restoring ~5 minutes back succeeded." Treat the exact
  retention ceiling as unverified until tested against an older timestamp.
- **Known limitation**: on-demand named backups (`railway postgres pitr backup create`) and
  custom automatic schedules (`railway postgres pitr schedule set --daily --weekly`) both
  returned `OAUTH_INSUFFICIENT_GRANT` — this looks like a plan-tier gate, not something
  fixable from the CLI. Continuous PITR restore (the core capability) works regardless and
  is what was verified above. Revisit discrete scheduled backups if the plan is upgraded.

### Restore procedure (verified steps)

1. Confirm PITR is healthy: `railway postgres pitr status -s Postgres --json` — check
   `live.archiverHealthy: true` and note `live.maxRestoreTime`.
2. Restore to a new, separate service (never restores in-place, so production stays
   untouched during the test/decision window):
   `railway postgres pitr restore --at "<RFC3339 timestamp or relative offset like 30m>" --new-service-name <name> -s Postgres -y`
3. Wait for the new service's deployment to reach `RUNNING`/`SUCCESS`
   (`railway status --json`).
4. Verify the restored data directly:
   `railway ssh -i ~/.ssh/railway_key -s <restored-service-name> -- "psql -U postgres -d railway -c '<verification query>'"`
5. To actually recover (not just test): point `api`'s `DATABASE_URL` at the restored
   instance's internal hostname, redeploy `api`, confirm `/health/ready`. Decommission the
   old (corrupted) Postgres service once the cutover is confirmed stable.
6. Delete any disposable restore-test service once verification is done — it's a full
   running Postgres instance and will otherwise sit there accumulating cost.

## Credential rotation log

- `JWT_SECRET`: rotated 2026-10-07 (original value had appeared in this session's tool
  output).
- Postgres superuser password: rotated 2026-10-07 via `ALTER ROLE postgres WITH PASSWORD`
  against the live instance (the original value had also appeared in tool output earlier in
  this build). `api`'s `DATABASE_URL` is a Railway reference variable
  (`${{Postgres.DATABASE_URL}}`), so it picked up the new password automatically — but the
  running `api` container still needed an explicit redeploy to actually reconnect with it;
  changing the variable alone does not restart the process holding the old credential in
  memory.

## Other failure scenarios (documented, not yet individually drilled)

| Scenario | Procedure |
|---|---|
| Bad migration deployed | `prisma migrate resolve --rolled-back <name>` against production (via a temporary one-line addition to the `start` script, deployed, then immediately reverted — see commit `9b925ac`/`5f1ddf7` for the exact pattern used when this happened for real during this build), fix the migration SQL, redeploy. |
| Accidental data deletion | Restore procedure above, targeting a timestamp before the deletion. |
| Credential compromise | Rotate the specific credential (JWT_SECRET via `railway variable set`, DB password via `ALTER ROLE` + variable update + `api` redeploy), audit `AuditLog`/`TaxRuleChangeHistory` for actions taken with the compromised credential. |
| API failure (crash loop) | `railway logs --json` to find the root cause (the migration-ordering bug hit during this build is a real example — confirmed via Postgres server logs, not just Prisma's generic error). `railway redeploy` once fixed. |
| Frontend failure | Not applicable yet — no frontend exists. |
| Storage failure (document volume) | The `/data/documents` Railway volume is single-region, single-copy. No tested recovery procedure exists for volume loss — this is an open gap, not yet a drilled capability. |
| Payment/filing failure | By design, payment and filing are separate facts from calculation (see `PaymentsService`/`FilingService`) — a failure in one never corrupts the other. `FilingAttempt`/`Payment` rows record every attempt, succeeded or not, for manual reconciliation. |
| Duplicate webhook / duplicate scheduled job | `SchedulerService.runDailyComplianceSweep` isolates per-company failures and is safe to re-run (the underlying `refreshOverdueStatus`/`generateComplianceReminders` operations are idempotent). No webhook receivers exist yet in this system, so there is nothing to drill here — revisit when one is added. |
