# Changelog

## Unreleased

### Added — team member invitations

ISP staff (and anyone else) can now be added to an organization through a real
email-invite flow instead of the old no-UI, inviter-sets-a-password shortcut. See
README.md "Team members (invitations)" for the full flow and the security rules behind it.

- New `OrganizationInvitation` table (additive migration
  `prisma/migrations/20261017130000_organization_invitations`) and a new
  `User.passwordSet` column.
- `POST /organizations/me/invitations` (+ `/resend`, `/revoke`), `PATCH
  /organizations/me/members/:membershipId`, `POST
  /organizations/me/members/:membershipId/disable|enable`, `GET
  /organizations/me/members` (now includes pending invitations) — all under the existing
  `org.users.manage` permission.
- `POST /auth/invitations/inspect` and `POST /auth/invitations/accept` — public,
  rate-limited, token travels in the URL fragment.
- New Settings → Team members page (`/settings/team`) and `/accept-invite` page.
- **Security fix**: `JwtStrategy.validate` previously rejected only `DISABLED` memberships,
  not `INVITED` ones — an accepted-but-not-yet-validated distinction that didn't matter
  before this feature existed (no membership was ever born `INVITED`), but would have let
  an unaccepted invitation grant a working session once this feature shipped. Fixed to
  require `status === "ACTIVE"`.
- `POST /organizations/me/members` (the old temporary-password shortcut) is kept, marked
  `@deprecated`, for backward compatibility — the frontend no longer calls it.

### Changed

- `UsersService.exportMyData` now includes the user's own sent/received invitations.
- `UsersService.requestErasure` now revokes the user's own pending (sent) invitations.
