-- AlterEnum
ALTER TYPE "Jurisdiction" ADD VALUE 'NG_FEDERAL_AND_STATE';

-- AlterEnum
BEGIN;
CREATE TYPE "RuleStatus_new" AS ENUM ('DRAFT', 'RESEARCHED', 'VERIFIED', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'RETIRED', 'REJECTED');
ALTER TABLE "TaxRuleVersion" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TaxDeadlineRule" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TaxPenaltyRule" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TaxInterestRule" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TaxRuleVersion" ALTER COLUMN "status" TYPE "RuleStatus_new" USING ("status"::text::"RuleStatus_new");
-- NOTE: TaxRuleChangeHistory does not exist yet at this point in the script (it is created
-- further down, after this enum swap) — the generated diff incorrectly tried to ALTER a
-- column on it here. It's created below using the final "RuleStatus" type name directly,
-- so no ALTER is needed for it at all; removed.
ALTER TABLE "TaxDeadlineRule" ALTER COLUMN "status" TYPE "RuleStatus_new" USING ("status"::text::"RuleStatus_new");
ALTER TABLE "TaxPenaltyRule" ALTER COLUMN "status" TYPE "RuleStatus_new" USING ("status"::text::"RuleStatus_new");
ALTER TABLE "TaxInterestRule" ALTER COLUMN "status" TYPE "RuleStatus_new" USING ("status"::text::"RuleStatus_new");
ALTER TYPE "RuleStatus" RENAME TO "RuleStatus_old";
ALTER TYPE "RuleStatus_new" RENAME TO "RuleStatus";
DROP TYPE "RuleStatus_old";
ALTER TABLE "TaxRuleVersion" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "TaxDeadlineRule" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "TaxPenaltyRule" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "TaxInterestRule" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTaxRuleApprover" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TaxRuleVersion" ADD COLUMN     "allowances" JSONB,
ADD COLUMN     "calculationMethod" TEXT,
ADD COLUMN     "deductions" JSONB,
ADD COLUMN     "filingDeadlineRuleId" TEXT,
ADD COLUMN     "filingFrequency" TEXT,
ADD COLUMN     "paymentDeadlineRuleId" TEXT,
ADD COLUMN     "rateValue" DECIMAL(14,6),
ADD COLUMN     "researchNotes" TEXT,
ADD COLUMN     "taxYear" INTEGER,
ADD COLUMN     "thresholds" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "TaxRuleReview" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleApproval" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleChangeHistory" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "previousStatus" "RuleStatus",
    "newStatus" "RuleStatus",
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleActivationEvent" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "activatedById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "TaxRuleActivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxRuleReview_ruleVersionId_idx" ON "TaxRuleReview"("ruleVersionId");

-- CreateIndex
CREATE INDEX "TaxRuleApproval_ruleVersionId_idx" ON "TaxRuleApproval"("ruleVersionId");

-- CreateIndex
CREATE INDEX "TaxRuleChangeHistory_ruleVersionId_createdAt_idx" ON "TaxRuleChangeHistory"("ruleVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "TaxRuleActivationEvent_ruleVersionId_idx" ON "TaxRuleActivationEvent"("ruleVersionId");

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_filingDeadlineRuleId_fkey" FOREIGN KEY ("filingDeadlineRuleId") REFERENCES "TaxDeadlineRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_paymentDeadlineRuleId_fkey" FOREIGN KEY ("paymentDeadlineRuleId") REFERENCES "TaxDeadlineRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleReview" ADD CONSTRAINT "TaxRuleReview_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleReview" ADD CONSTRAINT "TaxRuleReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleApproval" ADD CONSTRAINT "TaxRuleApproval_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleApproval" ADD CONSTRAINT "TaxRuleApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleChangeHistory" ADD CONSTRAINT "TaxRuleChangeHistory_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleChangeHistory" ADD CONSTRAINT "TaxRuleChangeHistory_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleActivationEvent" ADD CONSTRAINT "TaxRuleActivationEvent_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleActivationEvent" ADD CONSTRAINT "TaxRuleActivationEvent_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

