/**
 * One-time (re-runnable, idempotent) import of research/rule_seed_data.json into the real
 * TaxRule/TaxRuleVersion/TaxRuleSource tables that PrismaRuleRepository actually reads from.
 *
 * This is the "AI may assist research" half of the production-readiness mandate §1 — it
 * imports the already-researched candidate rules at whatever status the JSON already
 * claims (RESEARCHED or VERIFIED), NEVER higher. It never creates a PENDING_APPROVAL,
 * APPROVED, or ACTIVE row — a qualified tax professional must do every one of those
 * transitions themselves through the tax-rule-governance API after this import. Every
 * imported row is attributed to a clearly-labelled system account, never a real person's
 * name, so nobody can later mistake an import for a human verification.
 *
 * Run with `npm run import:rule-seed-data`.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const SYSTEM_IMPORTER_EMAIL = "system-import@internal.invalid";

interface SeedFileRule {
  id: string;
  tax_type: string;
  jurisdiction: string;
  rule_key: string;
  description: string;
  value: unknown;
  value_type: string;
  conditions?: Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
  source_document: string | null;
  source_url: string | null;
  source_reference: string | null;
  rule_version: string;
  status: string;
  verification_date: string | null;
  verified_by: string | null;
}

function toPrismaJurisdiction(j: string): "NG_FEDERAL" | "NG_STATE" | "NG_LOCAL" | "NG_FEDERAL_AND_STATE" {
  switch (j) {
    case "NG-FEDERAL":
      return "NG_FEDERAL";
    case "NG-STATE":
      return "NG_STATE";
    case "NG-LOCAL":
      return "NG_LOCAL";
    case "NG-FEDERAL_AND_STATE":
      return "NG_FEDERAL_AND_STATE";
    default:
      throw new Error(`Unrecognised jurisdiction string in seed data: "${j}"`);
  }
}

async function main() {
  const importer = await prisma.user.upsert({
    where: { email: SYSTEM_IMPORTER_EMAIL },
    update: {},
    create: {
      email: SYSTEM_IMPORTER_EMAIL,
      // Never a usable login — this account exists only to attribute automated imports in
      // TaxRuleChangeHistory/TaxRuleVersion.verifiedBy, so a real approver's own name is
      // never confused with a machine-run import. See JsonRuleRepository's demo-approval
      // label for the same "make the non-human origin impossible to miss" principle.
      passwordHash: "NOT_A_REAL_ACCOUNT_NO_LOGIN_POSSIBLE",
      fullName: "SYSTEM — automated rule-seed import (NOT a tax professional)",
      isActive: false,
      isPlatformAdmin: false,
      isTaxRuleApprover: false,
    },
  });

  const filePath = path.join(process.cwd(), "research", "rule_seed_data.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: { rules: SeedFileRule[] } = JSON.parse(raw);

  let created = 0;
  let skipped = 0;

  for (const rule of parsed.rules) {
    if (rule.status !== "RESEARCHED" && rule.status !== "VERIFIED") {
      throw new Error(
        `Refusing to import rule "${rule.id}" with status "${rule.status}" — this importer may only ` +
          `create RESEARCHED or VERIFIED rows; every later transition must happen through the ` +
          `tax-rule-governance API, performed by an authorised human.`
      );
    }

    const taxType = rule.tax_type as any;
    const jurisdiction = toPrismaJurisdiction(rule.jurisdiction);

    // Prisma's compound-unique `where` rejects a literal null for a nullable key field —
    // every seed rule here is federal/non-state-specific (stateCode always null), so this
    // is always the findFirst+create path, never the upsert-by-compound-key one.
    let taxRule = await prisma.taxRule.findFirst({ where: { ruleKey: rule.rule_key, taxType, jurisdiction, stateCode: null } });
    if (!taxRule) {
      taxRule = await prisma.taxRule.create({ data: { ruleKey: rule.rule_key, taxType, jurisdiction, description: rule.description } });
    }

    const existingVersion = await prisma.taxRuleVersion.findFirst({
      where: { taxRuleId: taxRule.id, ruleVersion: rule.rule_version },
    });
    if (existingVersion) {
      skipped++;
      continue;
    }

    if (!rule.source_document || !rule.source_url) {
      throw new Error(`Rule "${rule.id}" has no source_document/source_url — refusing to import a rule with no cited source.`);
    }
    const source = await prisma.taxRuleSource.upsert({
      where: { id: `seed:${rule.source_document}` },
      update: {},
      create: {
        id: `seed:${rule.source_document}`,
        title: rule.source_document,
        issuingAuthority: "See source_url",
        sourceTier: 1,
        url: rule.source_url,
      },
    });

    await prisma.taxRuleVersion.create({
      data: {
        taxRuleId: taxRule.id,
        ruleVersion: rule.rule_version,
        value: rule.value as any,
        conditions: rule.conditions as any,
        effectiveFrom: new Date(rule.effective_from),
        effectiveTo: rule.effective_to ? new Date(rule.effective_to) : null,
        status: rule.status as any,
        confidence: rule.status === "VERIFIED" ? "VERIFIED_RULE" : "REQUIRES_REVIEW",
        sourceId: source.id,
        sourceReference: rule.source_reference ?? "",
        researchNotes: `Imported from research/rule_seed_data.json (id: ${rule.id}).`,
        verifiedBy: rule.status === "VERIFIED" ? rule.verified_by : null,
        verificationDate: rule.status === "VERIFIED" && rule.verification_date ? new Date(rule.verification_date) : null,
      },
    });
    created++;
  }

  console.log(`Imported ${created} new rule version(s), skipped ${skipped} already-imported rule version(s).`);
  console.log(
    `None of these are PENDING_APPROVAL, APPROVED, or ACTIVE — a qualified tax professional must take each one ` +
      `through verify -> submit-for-approval -> approve -> activate via the tax-rule-governance API.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
