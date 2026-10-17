-- Additive only: new table + indexes, plus one new boolean column on User with a DEFAULT
-- so every existing row is backfilled to `true` (accurate — they all already have a real,
-- user-chosen password) without a separate data-migration pass. No column drops, renames,
-- or changes to any existing row's OTHER data — the prior application version's queries
-- keep working unmodified against this schema.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordSet" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_idx" ON "OrganizationInvitation"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_membershipId_idx" ON "OrganizationInvitation"("membershipId");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_idx" ON "OrganizationInvitation"("email");

-- CreateIndex (partial/unique): at most one LIVE (not yet accepted or revoked) invitation
-- row per membership can exist at a time, enforced at the database level so two concurrent
-- "invite"/"re-invite" requests for the same membership can't both insert a pending row —
-- the application layer also checks this first for a friendly error message, but this index
-- is the actual race-safe guarantee. Deliberately not conditioned on expiresAt: an expired-
-- but-unresolved invitation is resolved by UPDATEing that same row (resend) rather than
-- inserting a second one.
CREATE UNIQUE INDEX "OrganizationInvitation_one_live_per_membership"
    ON "OrganizationInvitation"("membershipId")
    WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
