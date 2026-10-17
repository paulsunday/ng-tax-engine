# Data Retention & Erasure Policy

Status: first real policy pass, written to unblock building an erasure endpoint honestly
rather than guessing. **Not legal advice** — the specific retention periods below are
general, well-known Nigerian recordkeeping anchors, not independently re-verified against
primary sources the way `research/REGULATORY_RESEARCH_REPORT.md` verifies tax rates. Have
counsel confirm exact periods before relying on this for a real compliance decision.

## The core tension this policy resolves

NDPA/NDPR gives a data subject a right to erasure. Nigerian company and tax law requires
certain records to be *kept*, not deleted, for a period of years (the Companies and Allied
Matters Act 2020 s.377 is the general anchor most Nigerian businesses cite for 6-year
accounting-record retention; tax-specific retention expectations under FIRS/NRS practice
are generally understood to run on a similar multi-year horizon). An erasure endpoint that
simply `DELETE`s a row would either violate retention law (if it touches tax/audit records)
or silently break the audit trail's own immutability guarantee (`AuditLog` has no
update/delete path anywhere in this codebase, by design).

**Resolution: anonymize-in-place, never hard-delete.** This is the same approach most real
SaaS platforms take for this exact conflict.

## What erasure actually does (`UsersService.requestErasure`)

| Data | On erasure |
|---|---|
| `User.fullName`, `User.email` | Overwritten with a non-identifying placeholder |
| `User.passwordHash`, `User.mfaSecret` | Scrubbed (also makes the credential permanently unusable) |
| `User.isActive` | Set `false` — login is already blocked for inactive users (`AuthService.login`) |
| `User.erasedAt` | Set to the erasure timestamp — proof of *when* the right was exercised |
| `AuditLog` rows referencing this user | **Untouched.** They only ever stored a `userId` foreign key, never the person's name/email directly — the audit trail survives, but no longer resolves to identifying information once the `User` row itself is anonymized |
| `OrganizationUser` membership rows | **Untouched** — membership history (which org, which role, when) is organizational record-keeping, not personal data about the individual beyond the already-anonymized user reference |
| `OrganizationInvitation` rows the user **sent** (as an inviter) | Revoked (`revokedAt` set) if still pending — `OrganizationsService.revokeInvitationsSentBy`, called from `requestErasure`. A pending invite tied to an erased inviter shouldn't stay silently acceptable. |
| `OrganizationInvitation` rows **addressed to** the user (as an invitee) | **Untouched by erasure** — same reasoning as membership rows: the `email`/`roleId`/dates on an invitation row are organizational record-keeping (who was invited, when, by whom), not personal data requiring scrubbing once the `User` row itself is anonymized. A pending invite to an erased email will simply fail at accept-time (`acceptInvitation` already refuses `erasedAt`-set accounts). |
| Any `Employee`/`Customer`/`Supplier` records | **Out of scope entirely.** Those aren't `User` accounts — they're business records a company (the data controller) maintains about third parties. A request to erase an employee's or customer's data must go to the organization that entered that data, not this endpoint. |

Retention of `OrganizationInvitation` rows themselves: expired/revoked/accepted rows are
kept indefinitely alongside the membership they belong to, on the same reasoning as
`AuditLog` and membership history above — they're a record of an organizational decision
(who was invited, by whom, when, and what happened), not a standalone personal-data store
that needs its own TTL. `NDPA export` (`UsersService.exportMyData` via
`OrganizationsService.listInvitationsForExport`) surfaces a user's own sent/received
invitations so the right of access covers them too.

## What this policy does NOT yet cover

- **Tax returns, financial statements, business transactions**: retained in full — these are
  the organization's statutory records, not the erasing user's personal data, and this
  endpoint makes no attempt to touch them.
- **Re-registration after erasure**: not handled — an erased email is permanently replaced,
  so the original address could theoretically be used to register a new account. This is an
  acceptable, deliberate trade-off (erasure should be hard to casually reverse) but is worth
  revisiting if abuse is observed.
- **Downstream backups**: Railway's PITR backup window (see `docs/DISASTER_RECOVERY.md`)
  will still contain the pre-erasure row until that backup window rolls off. This is
  disclosed here rather than silently ignored — a genuinely erased record can still be
  recovered from a backup taken before the erasure for the duration of the retention window.

## Process

1. A user calls `POST /users/me/request-erasure` (self-service, authenticated — no
   organization-admin approval needed, since this only affects the caller's own account).
2. The endpoint is idempotent — calling it twice does not error or re-log.
3. Every erasure is recorded as an `ERASURE_REQUESTED` audit-log action before the
   personal fields are gone, so "this account was erased, and when" remains answerable.
