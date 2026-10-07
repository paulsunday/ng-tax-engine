-- AlterTable
ALTER TABLE "ComplianceCalendarEntry" DROP COLUMN "responsiblePerson",
ADD COLUMN     "jurisdiction" TEXT,
ADD COLUMN     "responsibleUserId" TEXT,
ADD COLUMN     "ruleVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarEntry" ADD CONSTRAINT "ComplianceCalendarEntry_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarEntry" ADD CONSTRAINT "ComplianceCalendarEntry_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

