-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('CIT', 'DEVELOPMENT_LEVY', 'VAT', 'WHT', 'PAYE', 'CAPITAL_ALLOWANCE', 'TAX_LOSS', 'CAPITAL_GAINS_TAX', 'STAMP_DUTY', 'STATE_LEVY', 'GENERAL');

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('NG_FEDERAL', 'NG_STATE', 'NG_LOCAL');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'REQUIRES_REVIEW', 'DRAFT_VERIFIED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('VERIFIED_RULE', 'VERIFIED_CALCULATION', 'REQUIRES_REVIEW', 'MISSING_REGULATORY_INFORMATION', 'POTENTIAL_REGULATORY_CHANGE', 'UNSUPPORTED_SCENARIO');

-- CreateEnum
CREATE TYPE "DeadlineBasis" AS ENUM ('FIXED_DATE', 'DAYS_AFTER_PERIOD_END', 'DAYS_AFTER_EVENT', 'FIXED_DAY_OF_FOLLOWING_MONTH', 'ANNUAL', 'QUARTERLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AuthorityVerificationStatus" AS ENUM ('FULLY_RESEARCHED', 'WEBSITE_CONFIRMED', 'LOCATED_SECONDARY_SOURCE_UNVERIFIED');

-- CreateEnum
CREATE TYPE "FilingErrorClass" AS ENUM ('TEMPORARY', 'AUTHENTICATION', 'VALIDATION', 'AUTHORITY_REJECTION', 'NETWORK', 'DUPLICATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'INVOICE', 'EXPENSE', 'PAYMENT', 'ASSET_ACQUISITION', 'DEPRECIATION', 'BANK_IMPORT', 'ADJUSTMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIPT', 'DISBURSEMENT');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "StatementFileFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "StatementImportStatus" AS ENUM ('PENDING_MAPPING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankTransactionMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('INVOICE', 'RECEIPT', 'CONTRACT', 'BANK_STATEMENT', 'PAYROLL', 'ASSET_PURCHASE', 'TAX', 'PAYMENT_EVIDENCE', 'SUPPLIER', 'CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditRunType" AS ENUM ('NORMAL_AUDIT');

-- CreateEnum
CREATE TYPE "AuditRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('DUPLICATE_TRANSACTION', 'MISSING_DOCUMENTATION', 'UNUSUAL_TRANSACTION', 'LARGE_TRANSACTION', 'ROUND_NUMBER_ANOMALY', 'UNRECONCILED_BANK_TRANSACTION', 'TAX_CONSISTENCY', 'PERIOD_CUTOFF', 'REPEATED_VENDOR_OR_CUSTOMER', 'UNBALANCED_LEDGER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'REQUIRES_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('NORMAL', 'PROFIT_SCENARIO', 'LOSS_SCENARIO');

-- CreateEnum
CREATE TYPE "ScenarioAdjustmentApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "OrganizationUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxpayerCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxpayerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "stateCode" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleVersion" (
    "id" TEXT NOT NULL,
    "taxRuleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "conditions" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'REQUIRES_REVIEW',
    "sourceId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "verificationDate" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "supersedesId" TEXT,
    "changeRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleSource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "sourceTier" INTEGER NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "localArchivePath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryChangeRecord" (
    "id" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedBy" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "taxType" "TaxType",
    "summary" TEXT NOT NULL,
    "proposedValue" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,

    CONSTRAINT "RegulatoryChangeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDeadlineRule" (
    "id" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "taxpayerCategoryCode" TEXT,
    "obligationType" TEXT NOT NULL,
    "basis" "DeadlineBasis" NOT NULL,
    "basisValue" JSONB NOT NULL,
    "filingExtendsPayment" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDeadlineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPenaltyRule" (
    "id" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "violationType" TEXT NOT NULL,
    "formula" JSONB NOT NULL,
    "isEstimateOnly" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxPenaltyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInterestRule" (
    "id" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "referenceRate" TEXT NOT NULL,
    "compounding" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInterestRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxTransitionRule" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fromRegime" TEXT NOT NULL,
    "toRegime" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "mapping" JSONB NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxTransitionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateRevenueAuthority" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "authorityName" TEXT NOT NULL,
    "officialWebsite" TEXT,
    "taxpayerPortalUrl" TEXT,
    "taxpayerIdScheme" TEXT,
    "apiAvailable" BOOLEAN,
    "apiDocumentationUrl" TEXT,
    "electronicReceipting" TEXT,
    "approvedPaymentGateways" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableLaws" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationStatus" "AuthorityVerificationStatus" NOT NULL,
    "lastVerified" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "sourceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateRevenueAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rcNumber" TEXT,
    "tin" TEXT,
    "incorporationDate" TIMESTAMP(3) NOT NULL,
    "accountingYearEnd" TEXT NOT NULL,
    "isResident" BOOLEAN NOT NULL DEFAULT true,
    "sector" TEXT,
    "isProfessionalServices" BOOLEAN NOT NULL DEFAULT false,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "headOfficeStateCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "lgaName" TEXT,
    "address" TEXT,
    "businessActivity" TEXT,
    "hasBusinessPremises" BOOLEAN NOT NULL DEFAULT true,
    "registeredWithStateAuthority" BOOLEAN NOT NULL DEFAULT false,
    "stateTaxpayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyClassification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "turnoverNgn" DECIMAL(18,2),
    "fixedAssetsNgn" DECIMAL(18,2),
    "determinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "determinationBasis" TEXT NOT NULL,

    CONSTRAINT "CompanyClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "tin" TEXT,
    "stateOfResidenceCode" TEXT NOT NULL,
    "stateOfWorkCode" TEXT NOT NULL,
    "isResident" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayeCalculation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "grossEmolumentNgn" DECIMAL(18,2) NOT NULL,
    "annualRentNgn" DECIMAL(18,2),
    "reliefAppliedNgn" DECIMAL(18,2) NOT NULL,
    "taxableIncomeNgn" DECIMAL(18,2) NOT NULL,
    "taxPayableNgn" DECIMAL(18,2) NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetClass" INTEGER NOT NULL,
    "qualifyingExpenditureNgn" DECIMAL(18,2) NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "disposalDate" TIMESTAMP(3),
    "disposalProceedsNgn" DECIMAL(18,2),
    "businessUsePercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "inUseAtPeriodEnd" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CapitalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalAllowanceClaim" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "yearOfAssessment" INTEGER NOT NULL,
    "openingResidueNgn" DECIMAL(18,2) NOT NULL,
    "allowanceClaimedNgn" DECIMAL(18,2) NOT NULL,
    "notionalResidueNgn" DECIMAL(18,2) NOT NULL,
    "closingResidueNgn" DECIMAL(18,2) NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalAllowanceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLossEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tradeOrBusiness" TEXT NOT NULL,
    "yearIncurred" INTEGER NOT NULL,
    "originalLossNgn" DECIMAL(18,2) NOT NULL,
    "remainingLossNgn" DECIMAL(18,2) NOT NULL,
    "isDigitalAsset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLossEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLossUtilisation" (
    "id" TEXT NOT NULL,
    "lossEntryId" TEXT NOT NULL,
    "yearUtilised" INTEGER NOT NULL,
    "amountUtilisedNgn" DECIMAL(18,2) NOT NULL,
    "taxReturnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLossUtilisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyTin" TEXT,
    "counterpartyIsCorporate" BOOLEAN NOT NULL,
    "counterpartyIsResident" BOOLEAN NOT NULL,
    "transactionCategory" TEXT NOT NULL,
    "grossAmountNgn" DECIMAL(18,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhtDetermination" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "applicable" BOOLEAN NOT NULL,
    "rateApplied" DECIMAL(6,4),
    "whtAmountNgn" DECIMAL(18,2),
    "netPaymentNgn" DECIMAL(18,2),
    "exemptionReason" TEXT,
    "ruleVersionId" TEXT,
    "explanation" TEXT NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhtDetermination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "taxpayerClassificationSnapshot" JSONB NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "calculationBreakdown" JSONB NOT NULL,
    "taxLiabilityNgn" DECIMAL(18,2) NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submissionReference" TEXT,
    "receiptReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturnRuleUsage" (
    "id" TEXT NOT NULL,
    "taxReturnId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,

    CONSTRAINT "TaxReturnRuleUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingAttempt" (
    "id" TEXT NOT NULL,
    "taxReturnId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "authorityAdapter" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded" BOOLEAN NOT NULL,
    "errorClass" "FilingErrorClass",
    "rawResponse" JSONB,
    "receiptReference" TEXT,

    CONSTRAINT "FilingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "taxReturnId" TEXT NOT NULL,
    "amountNgn" DECIMAL(18,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCalendarEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxReturnId" TEXT,
    "taxType" "TaxType" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "statutoryDeadline" TIMESTAMP(3) NOT NULL,
    "internalDeadline" TIMESTAMP(3),
    "recommendedFilingDate" TIMESTAMP(3),
    "amountNgn" DECIMAL(18,2),
    "responsiblePerson" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'AWAITING_APPROVAL',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "filingStatus" TEXT NOT NULL DEFAULT 'NOT_FILED',
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentAccountId" TEXT,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "source" "JournalEntrySource" NOT NULL,
    "sourceId" TEXT,
    "documentReference" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "reversalOfId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalNgn" DECIMAL(18,2) NOT NULL,
    "vatAmountNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNgn" DECIMAL(18,2) NOT NULL,
    "amountPaidNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitPriceNgn" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "lineTotalNgn" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalNgn" DECIMAL(18,2) NOT NULL,
    "vatAmountNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNgn" DECIMAL(18,2) NOT NULL,
    "amountPaidNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountNgn" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "amountNgn" DECIMAL(18,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "invoiceId" TEXT,
    "expenseId" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "costNgn" DECIMAL(18,2) NOT NULL,
    "salvageValueNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "accumulatedDepreciationNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" TIMESTAMP(3),
    "disposalProceedsNgn" DECIMAL(18,2),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciationEntry" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amountNgn" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDepreciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "openingBalanceNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "glAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileFormat" "StatementFileFormat" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "columnMapping" JSONB,
    "status" "StatementImportStatus" NOT NULL DEFAULT 'PENDING_MAPPING',
    "importedRowCount" INTEGER NOT NULL DEFAULT 0,
    "skippedRowCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "importId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "narration" TEXT NOT NULL,
    "reference" TEXT,
    "debitNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditNgn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceAfterNgn" DECIMAL(18,2),
    "dedupeHash" TEXT NOT NULL,
    "matchStatus" "BankTransactionMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedEntityType" TEXT,
    "matchedEntityId" TEXT,
    "matchConfidence" TEXT,
    "reconciliationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "statementEndDate" TIMESTAMP(3) NOT NULL,
    "statementBalanceNgn" DECIMAL(18,2) NOT NULL,
    "ledgerBalanceNgn" DECIMAL(18,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "ocrExtractedData" JSONB,
    "ocrConfidence" JSONB,
    "inconsistencyFlags" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runType" "AuditRunType" NOT NULL DEFAULT 'NORMAL_AUDIT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "AuditRunStatus" NOT NULL DEFAULT 'RUNNING',
    "runBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scenarioType" "ScenarioType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "accountingProfitNgn" DECIMAL(18,2) NOT NULL,
    "taxableProfitNgn" DECIMAL(18,2) NOT NULL,
    "taxLiabilityNgn" DECIMAL(18,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioAdjustment" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "originalValueNgn" DECIMAL(18,2) NOT NULL,
    "adjustedValueNgn" DECIMAL(18,2) NOT NULL,
    "accountingTreatment" TEXT NOT NULL,
    "taxTreatment" TEXT,
    "confidence" TEXT NOT NULL,
    "approvalStatus" "ScenarioAdjustmentApproval" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUser_organizationId_userId_key" ON "OrganizationUser"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_objectType_objectId_idx" ON "AuditLog"("organizationId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxpayerCategory_code_key" ON "TaxpayerCategory"("code");

-- CreateIndex
CREATE INDEX "TaxRule_taxType_jurisdiction_idx" ON "TaxRule"("taxType", "jurisdiction");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_ruleKey_taxType_jurisdiction_stateCode_key" ON "TaxRule"("ruleKey", "taxType", "jurisdiction", "stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRuleVersion_supersedesId_key" ON "TaxRuleVersion"("supersedesId");

-- CreateIndex
CREATE INDEX "TaxRuleVersion_taxRuleId_effectiveFrom_effectiveTo_idx" ON "TaxRuleVersion"("taxRuleId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "TaxRuleVersion_status_idx" ON "TaxRuleVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StateRevenueAuthority_stateCode_key" ON "StateRevenueAuthority"("stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "Company_rcNumber_key" ON "Company"("rcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tin_key" ON "Company"("tin");

-- CreateIndex
CREATE INDEX "CompanyClassification_companyId_periodStart_idx" ON "CompanyClassification"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX "PayeCalculation_employeeId_periodYear_periodMonth_idx" ON "PayeCalculation"("employeeId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalAllowanceClaim_assetId_yearOfAssessment_key" ON "CapitalAllowanceClaim"("assetId", "yearOfAssessment");

-- CreateIndex
CREATE UNIQUE INDEX "WhtDetermination_transactionId_key" ON "WhtDetermination"("transactionId");

-- CreateIndex
CREATE INDEX "TaxReturn_companyId_taxType_periodStart_idx" ON "TaxReturn"("companyId", "taxType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturnRuleUsage_taxReturnId_ruleVersionId_key" ON "TaxReturnRuleUsage"("taxReturnId", "ruleVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCalendarEntry_taxReturnId_key" ON "ComplianceCalendarEntry"("taxReturnId");

-- CreateIndex
CREATE INDEX "ComplianceCalendarEntry_companyId_statutoryDeadline_idx" ON "ComplianceCalendarEntry"("companyId", "statutoryDeadline");

-- CreateIndex
CREATE INDEX "Account_organizationId_companyId_idx" ON "Account"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_organizationId_companyId_entryDate_idx" ON "JournalEntry"("organizationId", "companyId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "JournalEntry"("source", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_companyId_idx" ON "Customer"("organizationId", "companyId");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_companyId_idx" ON "Supplier"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_journalEntryId_key" ON "Invoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_companyId_status_idx" ON "Invoice"("organizationId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");

-- CreateIndex
CREATE INDEX "Expense_organizationId_companyId_status_idx" ON "Expense"("organizationId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPayment_journalEntryId_key" ON "AccountingPayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "AccountingPayment_organizationId_companyId_idx" ON "AccountingPayment"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_journalEntryId_key" ON "Asset"("journalEntryId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_companyId_idx" ON "Asset"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciationEntry_journalEntryId_key" ON "AssetDepreciationEntry"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciationEntry_assetId_periodYear_periodMonth_key" ON "AssetDepreciationEntry"("assetId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "BankAccount_organizationId_companyId_idx" ON "BankAccount"("organizationId", "companyId");

-- CreateIndex
CREATE INDEX "BankStatementImport_organizationId_companyId_idx" ON "BankStatementImport"("organizationId", "companyId");

-- CreateIndex
CREATE INDEX "BankTransaction_organizationId_companyId_bankAccountId_idx" ON "BankTransaction"("organizationId", "companyId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_dedupeHash_idx" ON "BankTransaction"("dedupeHash");

-- CreateIndex
CREATE INDEX "BankTransaction_matchStatus_idx" ON "BankTransaction"("matchStatus");

-- CreateIndex
CREATE INDEX "Reconciliation_organizationId_companyId_bankAccountId_idx" ON "Reconciliation"("organizationId", "companyId", "bankAccountId");

-- CreateIndex
CREATE INDEX "Document_organizationId_companyId_category_idx" ON "Document"("organizationId", "companyId", "category");

-- CreateIndex
CREATE INDEX "Document_linkedEntityType_linkedEntityId_idx" ON "Document"("linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE INDEX "AuditRun_organizationId_companyId_periodStart_idx" ON "AuditRun"("organizationId", "companyId", "periodStart");

-- CreateIndex
CREATE INDEX "AuditFinding_auditRunId_category_idx" ON "AuditFinding"("auditRunId", "category");

-- CreateIndex
CREATE INDEX "Scenario_organizationId_companyId_scenarioType_periodStart_idx" ON "Scenario"("organizationId", "companyId", "scenarioType", "periodStart");

-- CreateIndex
CREATE INDEX "ScenarioAdjustment_scenarioId_idx" ON "ScenarioAdjustment"("scenarioId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_readAt_idx" ON "Notification"("organizationId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_category_idx" ON "Notification"("companyId", "category");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TaxRuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TaxRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleVersion" ADD CONSTRAINT "TaxRuleVersion_changeRecordId_fkey" FOREIGN KEY ("changeRecordId") REFERENCES "RegulatoryChangeRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeadlineRule" ADD CONSTRAINT "TaxDeadlineRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TaxRuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPenaltyRule" ADD CONSTRAINT "TaxPenaltyRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TaxRuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInterestRule" ADD CONSTRAINT "TaxInterestRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TaxRuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxTransitionRule" ADD CONSTRAINT "TaxTransitionRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TaxRuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClassification" ADD CONSTRAINT "CompanyClassification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClassification" ADD CONSTRAINT "CompanyClassification_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaxpayerCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayeCalculation" ADD CONSTRAINT "PayeCalculation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalAsset" ADD CONSTRAINT "CapitalAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalAllowanceClaim" ADD CONSTRAINT "CapitalAllowanceClaim_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CapitalAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLossEntry" ADD CONSTRAINT "TaxLossEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLossUtilisation" ADD CONSTRAINT "TaxLossUtilisation_lossEntryId_fkey" FOREIGN KEY ("lossEntryId") REFERENCES "TaxLossEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTransaction" ADD CONSTRAINT "BusinessTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhtDetermination" ADD CONSTRAINT "WhtDetermination_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BusinessTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnRuleUsage" ADD CONSTRAINT "TaxReturnRuleUsage_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnRuleUsage" ADD CONSTRAINT "TaxReturnRuleUsage_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TaxRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingAttempt" ADD CONSTRAINT "FilingAttempt_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarEntry" ADD CONSTRAINT "ComplianceCalendarEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarEntry" ADD CONSTRAINT "ComplianceCalendarEntry_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayment" ADD CONSTRAINT "AccountingPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayment" ADD CONSTRAINT "AccountingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayment" ADD CONSTRAINT "AccountingPayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayment" ADD CONSTRAINT "AccountingPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayment" ADD CONSTRAINT "AccountingPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciationEntry" ADD CONSTRAINT "AssetDepreciationEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioAdjustment" ADD CONSTRAINT "ScenarioAdjustment_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

