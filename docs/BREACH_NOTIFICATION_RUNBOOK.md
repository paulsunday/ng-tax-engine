# Data Breach Notification Runbook

Status: first real pass at the *regulatory* half of incident response. This is distinct
from `docs/DISASTER_RECOVERY.md`, which covers the *technical* half (restoring data,
rotating credentials) — a technical incident is not automatically a reportable breach, and
a reportable breach is not automatically a technical outage. Not legal advice; involve
counsel for an actual incident, especially to confirm whether NDPC notification is legally
required in the specific facts of the incident.

## What counts as a breach here

Any confirmed or reasonably-suspected incident involving unauthorized access to, disclosure
of, alteration of, or loss of personal data this platform holds — `User` accounts, `Employee`
records, `Customer`/`Supplier` contact details, uploaded `Document`s, or `AuditLog` entries.
Examples: a leaked database credential, a confirmed IDOR/tenant-isolation bypass actually
exploited (not just a theoretical gap caught by testing), a stolen laptop with production
access, a misconfigured backup made publicly accessible.

A caught-and-fixed vulnerability with no evidence of actual exploitation is **not** itself a
reportable breach — but document the finding and the fix date regardless, in case later
evidence changes that assessment.

## NDPA's notification clock

The Nigeria Data Protection Act 2023 follows the now-standard "72 hours from becoming aware"
model for notifying the Nigeria Data Protection Commission (NDPC) of a breach likely to
result in a risk to data subjects, and requires notifying affected data subjects directly
where the risk is high. **Confirm the exact current NDPC notification channel/portal at the
time of an incident** — this is exactly the kind of detail that can change and should not be
hardcoded here as a permanent fact.

## Immediate steps (first hour)

1. **Contain first, investigate second.** If a credential is compromised, rotate it
   immediately (see `docs/DISASTER_RECOVERY.md`'s credential-rotation procedure) — don't wait
   for a full investigation before stopping ongoing exposure.
2. Identify scope: which tables/rows, which organizations (tenants), how many data subjects,
   what categories of data (is any of it sensitive — health, financial account numbers,
   government IDs?).
3. Preserve evidence: `AuditLog` entries around the incident window, Railway access logs,
   the specific request(s) involved if it was an exploited application vulnerability.
4. Start the clock. Note the exact time the incident was *discovered* (not when it
   *happened*) — the 72-hour NDPC window runs from awareness, not occurrence.

## Within 72 hours

5. Decide, with counsel if available, whether this rises to NDPC-notifiable. Default to
   notifying if genuinely unsure and the facts are close — the cost of an unnecessary report
   is far lower than the cost of a missed mandatory one.
6. If notifiable: submit to the NDPC via their current official channel. Record what was
   submitted and when in a dedicated incident file (not committed to this repo — likely
   contains sensitive incident detail).
7. If the risk to data subjects is high (not just "a breach occurred" but "this specific
   person's data is now exposed to real harm"): notify the affected data subjects directly,
   in plain language — what happened, what data, what you're doing about it, what they
   should do (e.g., "change your password").

## After containment

8. Root-cause the incident and fix the underlying issue — don't just rotate the one leaked
   credential if the leak mechanism itself (e.g., a secret in a log file) is still active.
9. Update this runbook if the incident revealed a gap in it.
10. If a password-reset/credential rotation affected users, consider whether an in-app
    notice or forced re-login is warranted (not yet built — see README "known limitations";
    this platform currently has no email provider configured, so any user-facing
    notification today would need to go through the same manual channel documented for
    password-reset emails).

## Who does what (fill in before this is load-bearing)

This runbook does not yet name specific individuals/roles responsible for each step — that
is an organizational decision (who is the incident commander, who has NDPC-submission
authority) outside what this codebase can determine on its own. Fill this section in before
treating this runbook as operationally complete.
