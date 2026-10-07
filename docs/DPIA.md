# Data Protection Impact Assessment (DPIA)

Status: first draft, written against the actual system as built. **Not a substitute for a
DPIA conducted/signed off by an actual appointed DPO or qualified privacy professional** —
no DPO is appointed yet (see `docs/NDPR_GAP_ANALYSIS.md` §6). This draft exists so that
assessment isn't starting from zero whenever one is appointed, and so the exercise of
actually thinking through the risks happens now rather than being deferred indefinitely.

## 1. Description of processing

**What**: a multi-tenant SaaS platform for Nigerian accounting, bookkeeping, and tax
compliance. Each tenant (`Organization`) manages one or more `Company` records, and within
those: employees (for payroll/PAYE), customers/suppliers (for invoicing/expenses), uploaded
documents (invoices/receipts, processed via OCR), and the resulting tax calculations/returns.

**Who's processed**: platform `User` accounts (the people who log in — company owners,
accountants, staff with assigned roles), and, as data entered *by* those users on behalf of
their own companies: `Employee` records (name, TIN, state of residence — tied to real PAYE
calculations), `Customer`/`Supplier` contact details, and any personal information that
happens to appear inside uploaded documents (e.g., a signature, a bank account number on an
invoice).

**Why**: to calculate and track statutory tax obligations and run basic accounting for
Nigerian companies — a legal-obligation and legitimate-business-interest basis for most of
this processing, not consent-based (consistent with `docs/NDPR_GAP_ANALYSIS.md`'s read).

**Where**: Railway-hosted PostgreSQL + API, currently in Railway's `sfo` (US) region — flagged
as the single highest-priority open item in the NDPR gap analysis.

## 2. Necessity and proportionality

Each category of personal data maps to a specific, stated purpose (payroll data → PAYE
calculation; customer/supplier contact details → invoicing/expense records that are
themselves the basis for VAT/WHT calculations). No category was found, during this pass, to
be collected without a corresponding use — see `docs/NDPR_GAP_ANALYSIS.md` gap #2
("data minimization: likely OK, not independently re-reviewed beyond this pass").

## 3. Risk assessment

| Risk | Likelihood | Impact | Current mitigation | Residual risk |
|---|---|---|---|---|
| Cross-tenant data exposure (one organization seeing another's data) | Low | High | Tenant isolation enforced at the service layer (`CompaniesService.getOneOrThrow` returns an identical "not found" whether a resource doesn't exist or belongs to another org); dedicated IDOR test suite | Low — tested, but any new endpoint that forgets this pattern would reintroduce the risk; no automated linter enforces it |
| Credential compromise (password, JWT, API key) | Medium | High | bcrypt (12 rounds), MFA available, JWT with no fallback secret, rate-limited auth endpoints, a credential-rotation procedure that's been exercised for real | Medium — no alerting exists yet to detect an in-progress credential-stuffing attempt (see `docs/MONITORING.md`) |
| Data exposed via an uploaded document being misclassified/misrouted | Low | Medium | Document access is scoped through the same tenant-isolation check as everything else; MIME/magic-byte validation on upload | Low |
| OCR misreads a document and silently attaches wrong data to a transaction | Low | Medium | Field extraction never fabricates a value — nulls rather than guesses; a human reviews before filing | Low |
| Cross-border transfer risk (US-hosted data about Nigerian data subjects) | **Currently live, not hypothetical** | Medium-High | None yet — disclosed in the Terms & Conditions and NDPR gap analysis rather than hidden | **High** — this is the top action item |
| Data breach with no notification process followed | Low (process exists) | High | `docs/BREACH_NOTIFICATION_RUNBOOK.md` now documents the process, but it has never been drilled/exercised for a real incident, and no specific individual is yet named as responsible | Medium |
| Erasure request conflicting with statutory retention | Low (now resolved) | Medium | `docs/DATA_RETENTION_AND_ERASURE_POLICY.md` — anonymize-in-place approach, implemented and tested | Low |
| No self-service data access/export | N/A (resolved this pass) | — | `GET /users/me/export-data` | — |

## 4. Mitigations already in place (summary)

RBAC + per-request permission checks, tenant isolation (tested), bcrypt password hashing,
optional MFA, rate limiting, explicit CORS allowlist, audit logging of every state-changing
action, file-upload validation, encrypted-in-transit (TLS via Railway's edge), a verified
database point-in-time-recovery capability, and — as of this pass — a data-subject access
endpoint, an anonymize-in-place erasure endpoint, and a breach-notification runbook.

## 5. Outstanding items before this DPIA can be considered complete

1. Resolve the data-residency question (region confirmation or migration).
2. Appoint a DPO (or formally designate a responsible individual) to own this document,
   review it periodically, and sign off on it — a DPIA without an accountable owner is
   analysis, not governance.
3. Get this draft reviewed by someone with NDPA expertise before relying on it to represent
   to a regulator, a customer, or an auditor that a DPIA was "done."
4. Name specific individuals in `docs/BREACH_NOTIFICATION_RUNBOOK.md`'s "who does what"
   section.
