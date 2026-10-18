-- Additive only: one new nullable column + a unique index on it. No drops, no changes to
-- any existing row's data — every pre-existing Customer row gets externalRef = NULL, which
-- is the correct "not synced from any external system" value for it.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "externalRef" TEXT;

-- CreateIndex
-- Postgres treats every NULL as distinct under a unique index, so any number of manually-
-- entered customers (externalRef IS NULL) can coexist per company — this only actually
-- constrains the externally-synced ones.
CREATE UNIQUE INDEX "Customer_companyId_externalRef_key" ON "Customer"("companyId", "externalRef");
