# NDPR / Nigeria Data Protection Act (NDPA) 2023 — Gap Analysis

Status: honest gap analysis against what is actually implemented in this codebase today,
cross-checked against the live production deployment (Railway, `api-production-2b6a.up.railway.app`).
Nothing below is marked DONE unless it was found in the actual code/config — see the file
reference on each line. This is not legal advice; a qualified NDPR-compliance professional
should review this before the platform is used with real taxpayer/employee personal data.

Nigeria's data-protection regulator is the Nigeria Data Protection Commission (NDPC), and the
governing statute since mid-2023 is the **Nigeria Data Protection Act (NDPA) 2023**, which
superseded the 2019 NDPR (the NDPR's implementation framework/regulation remains persuasive
guidance pending full NDPA subsidiary regulations). Both are referred to together below as
"NDPR/NDPA" since this platform's obligations are materially the same under either.

## What the platform actually holds

Personal data in this system: `User` (email, full name, password hash, MFA secret),
`Employee` (full name, TIN, state of residence — tied to real payroll/PAYE calculations),
`Customer`/`Supplier` contact details, uploaded `Document`s (invoices/receipts, which can
contain third-party names, amounts, bank references), and `AuditLog` (records who did what).
This is a genuine data-controller/data-processor relationship once a real organisation signs
up — this is not a toy dataset once production tenants exist.

## Gap table

| # | NDPR/NDPA requirement | Status | Evidence / gap |
|---|---|---|---|
| 1 | Lawful basis + purpose limitation for processing | **Likely OK, not documented** | Processing (payroll/tax compliance) has an obvious legal-obligation basis under tax law, but there is no written data-processing register or privacy notice anywhere in this repo. **Gap: no `PRIVACY_POLICY.md` or in-app privacy notice exists.** |
| 2 | Data minimization | **Partially OK** | Schema fields map directly to stated purpose (tax/payroll/accounting) — no obviously excessive fields found in `prisma/schema.prisma`. No systematic review was performed beyond this pass. |
| 3 | Security of processing — encryption at rest/in transit | **Partially OK** | TLS is enforced by Railway's edge for all traffic (HTTPS-only `*.up.railway.app`). Passwords are bcrypt-hashed (`src/api/auth/auth.service.ts`), password-reset tokens are SHA-256-hashed before storage, MFA secrets exist but **are stored in plaintext in the `User.mfaSecret` column** — this is standard practice for TOTP (the secret must be readable to verify codes) but should be covered by database-level encryption-at-rest. **Gap: Postgres encryption-at-rest has not been independently confirmed** (Railway's underlying infra likely encrypts disks, but this was not verified against Railway's own documentation/support during this pass — treat as unconfirmed, not assumed). |
| 4 | Access control or restriction of processing | **Done** | RBAC (`src/api/common/rbac.constants.ts`), tenant isolation verified by dedicated IDOR tests (`tests/api/organizations-switch.service.test.ts` / companies isolation tests), audit logging (`AuditLogService`) on every state-changing action. |
| 5 | Data breach notification (NDPA requires notifying NDPC within 72 hours of becoming aware, and affected subjects where there's high risk) | **Documented, not yet drilled** | `docs/BREACH_NOTIFICATION_RUNBOOK.md` now exists — containment steps, the 72-hour clock, when to notify data subjects directly. **Remaining gap: no specific individual is named as responsible, and it has never been exercised against a real or simulated incident.** |
| 6 | Data Protection Officer (DPO) designation | **Not applicable to the codebase, open organisational item** | This is an organisational requirement, not a code requirement. Cannot be verified or implemented from this repository — **flagged for the business, not solved by this build.** |
| 7 | Data Protection Impact Assessment (DPIA) for high-risk processing | **Draft written, not signed off** | `docs/DPIA.md` — a genuine risk assessment against the actual system as built. **Remaining gap: no DPO exists yet to own/sign off on it, and it hasn't been reviewed by anyone with NDPA expertise.** |
| 8 | Data subject rights — access (right to obtain a copy of one's data) | **Done** | `GET /users/me/export-data` (`UsersService.exportMyData`) returns the caller's own profile, organization memberships, and audit-log history. Scoped deliberately to the platform *user's* own data — see the endpoint's docstring for why Employee/Customer/Supplier records are out of scope (those belong to the organization, not this user). |
| 9 | Data subject rights — erasure/rectification | **Done, with a documented policy** | `POST /users/me/request-erasure` anonymizes the account in place (never a hard delete) — see `docs/DATA_RETENTION_AND_ERASURE_POLICY.md` for the full reasoning and what is/isn't covered (tax/business records are explicitly NOT touched by this endpoint, by design). |
| 10 | Data subject rights — portability | **Partially done** | The same export endpoint (#8) returns structured JSON, which satisfies the "machine-readable" part of portability for a user's own account data. No equivalent exists yet for exporting a company's own business records in bulk. |
| 11 | Cross-border data transfer safeguards | **Mitigated, not legally cleared** | Production (API, Postgres, frontend) was migrated 2026-10-17 from `sfo` (US West) to `eu-west` (Amsterdam) — Railway has no African region, so this is the nearest available option, not a true in-Nigeria deployment. Migration was verified: full `pg_dump`/`pg_restore` of the production database with row-count parity confirmed across all tables, document-storage volume content confirmed intact post-move, and live login/API/frontend checks passed against the new region. **This narrows but does not close the gap** — EU hosting still constitutes a cross-border transfer under NDPA and still needs a qualified reviewer to confirm it against NDPA's actual adequacy/safeguard mechanisms (e.g. standard contractual clauses), same as US hosting did. Disclosed in the Terms & Conditions (`frontend/src/app/terms/page.tsx` §4) in the meantime. |
| 12 | Retention policy / data lifecycle | **Policy documented for Users; not yet extended to other models** | `docs/DATA_RETENTION_AND_ERASURE_POLICY.md` resolves the User-erasure case. Documents, audit logs, and tax returns still accumulate indefinitely with no automated lifecycle — a real researched retention schedule per data type (reconciled against statutory tax-record retention law) is still an open item for those models specifically. |
| 13 | Vendor/processor due diligence (Railway, and any future email/SMS provider) | **Not performed** | No data-processing agreement review with Railway was performed as part of this build. |
| 14 | Consent management (where consent, not legal obligation, is the basis) | **Not applicable yet** | No marketing/analytics/non-essential processing exists in the product today that would need consent UI — revisit if any is added. |

## Honest summary (updated 2026-10-07, same day — second pass)

**This platform is still not NDPR/NDPA-compliant as a finished state**, but the gap has
narrowed materially since the first pass. Data-subject access (#8), erasure (#9), a breach
runbook (#5), and a DPIA draft (#7) now all exist and are implemented/documented, not just
flagged as missing. **Update 2026-10-17**: production hosting moved from US (`sfo`) to EU
(`eu-west`) at your direction — see item #11. This is a real mitigation (EU has its own
mature data-protection framework, unlike the prior US hosting with no equivalent review at
all), but it is not the same as legal clearance: NDPA's cross-border rules still apply to EU
hosting, and no qualified NDPA reviewer has signed off on either the old or new arrangement.
DPO appointment and DPIA sign-off also remain organisational steps outside what this codebase
can do on its own.

## Recommended next steps, in order

1. **Get the EU hosting arrangement reviewed against NDPA's actual cross-border mechanisms**
   (adequacy / standard contractual clauses / consent) by a qualified reviewer — the region
   move (item #11) reduced the exposure but did not legally resolve it. A true in-Nigeria
   deployment remains unavailable since Railway has no African region.
2. Appoint a DPO (or formally designate a responsible individual) to review and sign off on
   `docs/DPIA.md`, and to be named in `docs/BREACH_NOTIFICATION_RUNBOOK.md`'s "who does what."
3. Extend the retention policy (`docs/DATA_RETENTION_AND_ERASURE_POLICY.md`) beyond the User
   model to Documents/AuditLog/TaxReturn lifecycle — currently everything else accumulates
   indefinitely with no automated schedule.
4. Build a bulk export for an organization's own business records (Employees/Customers/
   Suppliers/transactions) — the current `GET /users/me/export-data` only covers a platform
   user's own account data, not the broader portability right over business records.
5. Write a real privacy notice (distinct from the Terms & Conditions, though the Terms page
   currently covers the headline points) and get this whole document set reviewed by someone
   with NDPA expertise.
