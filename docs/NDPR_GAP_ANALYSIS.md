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
| 5 | Data breach notification (NDPA requires notifying NDPC within 72 hours of becoming aware, and affected subjects where there's high risk) | **Not implemented** | No breach-detection or notification workflow exists anywhere in the code. **Gap: there is no automated or documented incident-notification procedure.** `docs/DISASTER_RECOVERY.md` covers technical incident response (DB restore, credential rotation) but does not cover the *regulatory* notification obligation — these are two different things and only the technical one exists today. |
| 6 | Data Protection Officer (DPO) designation | **Not applicable to the codebase, open organisational item** | This is an organisational requirement, not a code requirement. Cannot be verified or implemented from this repository — **flagged for the business, not solved by this build.** |
| 7 | Data Protection Impact Assessment (DPIA) for high-risk processing | **Not performed** | Processing payroll/tax data for many data subjects across a multi-tenant SaaS is exactly the kind of processing NDPA contemplates a DPIA for. **Gap: no DPIA document exists.** |
| 8 | Data subject rights — access (right to obtain a copy of one's data) | **Not implemented** | No "export my data" endpoint exists for `User`, `Employee`, `Customer`, or `Supplier` records. `grep` of `src/api/users/` confirms no export method. **Gap: real, user-facing gap.** |
| 9 | Data subject rights — erasure/rectification | **Not implemented** | No account-deletion or data-rectification self-service endpoint exists. Note: even once built, erasure must be reconciled against `AuditLog`'s "no update/delete exposed anywhere" immutability guarantee (`prisma/schema.prisma` comment) and against statutory tax record-retention requirements (Nigerian tax law requires retaining certain records for years) — a genuine, real tension that needs a designed policy (e.g. anonymize rather than hard-delete), not just an endpoint. **Gap: neither the endpoint nor the retention-vs-erasure policy exists yet.** |
| 10 | Data subject rights — portability | **Not implemented** | Same gap as #8 — no structured export exists. |
| 11 | Cross-border data transfer safeguards | **Needs verification** | Railway's hosting region for this deployment was set to `sfo` (US West) during this build (`railway status` output, `region: sfo`) — i.e. **Nigerian personal data is currently processed in a US data centre.** NDPA has cross-border-transfer provisions (adequacy decision / contractual safeguards / consent) that this has not been checked against. **Gap: this is a real, currently-live compliance exposure, not a hypothetical one — flagging explicitly rather than glossing over it.** |
| 12 | Retention policy / data lifecycle | **Not implemented** | No automated retention/deletion job exists for any model. Documents, audit logs, and tax returns accumulate indefinitely. Tax records likely have genuine multi-year statutory retention requirements working in the *opposite* direction (must keep, not must delete) — so this needs a real researched retention schedule per data type, not a generic "delete after N days" script. |
| 13 | Vendor/processor due diligence (Railway, and any future email/SMS provider) | **Not performed** | No data-processing agreement review with Railway was performed as part of this build. |
| 14 | Consent management (where consent, not legal obligation, is the basis) | **Not applicable yet** | No marketing/analytics/non-essential processing exists in the product today that would need consent UI — revisit if any is added. |

## Honest summary

**This platform is not NDPR/NDPA-compliant as a finished state** — it has strong technical
security controls (RBAC, audit logging, encrypted-in-transit, hashed credentials, tenant
isolation) that happen to *also* satisfy several NDPR/NDPA security-of-processing
requirements, but it has **zero of the data-subject-rights, breach-notification, DPIA, and
retention-policy requirements implemented**, and **one currently-live, concrete exposure**:
production data is hosted in a US region, not confirmed against Nigeria's cross-border
transfer rules. None of this was fabricated as "handled" anywhere in prior documentation —
this is the first explicit pass at it.

## Recommended next steps, in order

1. **Decide on data residency** — either confirm (with NDPC guidance / legal counsel) that the
   current US hosting region is compliant with appropriate safeguards, or migrate the Railway
   Postgres + API service to an EU/available Nigeria-adjacent region. This is the single
   highest-priority item because it's a live fact about the running system, not a missing
   feature.
2. Write a real privacy notice and a data retention schedule (per data type, reconciled against
   statutory tax-record retention law) — these are documents, not code, and can be done without
   further engineering.
3. Build the data-subject access/export endpoint (`GET /users/me/export-data` returning the
   user's own `User`/`Employee`/`OrganizationUser` rows as JSON) — bounded scope, clear value.
4. Design (don't just code) the erasure-vs-retention policy before building an erasure endpoint
   — building it first risks either violating tax-retention law or silently not actually
   deleting anything.
5. Write a breach-notification runbook (who to notify, NDPC contact process, 72-hour clock)
   alongside the existing `docs/DISASTER_RECOVERY.md`, which currently only covers the
   technical-recovery half of an incident.
6. Commission a DPIA and DPO designation — organisational steps, outside this codebase's scope.
