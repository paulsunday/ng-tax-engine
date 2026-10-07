import { IsIn, IsISO8601, IsInt, IsOptional, IsString, IsObject, IsNumber } from "class-validator";

const TAX_TYPES = ["CIT", "DEVELOPMENT_LEVY", "VAT", "WHT", "PAYE", "CAPITAL_ALLOWANCE", "TAX_LOSS", "CAPITAL_GAINS_TAX", "STAMP_DUTY", "STATE_LEVY", "GENERAL"];
const JURISDICTIONS = ["NG_FEDERAL", "NG_STATE", "NG_LOCAL", "NG_FEDERAL_AND_STATE"];

export class CreateRuleDto {
  @IsString()
  ruleKey!: string;

  @IsIn(TAX_TYPES)
  taxType!: string;

  @IsIn(JURISDICTIONS)
  jurisdiction!: string;

  @IsString()
  @IsOptional()
  stateCode?: string;

  @IsString()
  description!: string;

  @IsString()
  ruleVersion!: string;

  @IsInt()
  @IsOptional()
  taxYear?: number;

  // Shape depends on the rule (percentage, band table, deadline rule, object...) — see
  // TaxRuleVersion.value in prisma/schema.prisma.
  value!: unknown;

  @IsNumber()
  @IsOptional()
  rateValue?: number;

  @IsObject()
  @IsOptional()
  thresholds?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  allowances?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  deductions?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  calculationMethod?: string;

  @IsObject()
  @IsOptional()
  conditions?: Record<string, unknown>;

  @IsISO8601()
  effectiveFrom!: string;

  @IsISO8601()
  @IsOptional()
  effectiveTo?: string;

  // Source — either sourceId to reuse an existing TaxRuleSource, or the fields to create one.
  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsString()
  @IsOptional()
  sourceTitle?: string;

  @IsString()
  @IsOptional()
  sourceIssuingAuthority?: string;

  @IsInt()
  @IsOptional()
  sourceTier?: number;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  sourceReference!: string;

  @IsString()
  @IsOptional()
  researchNotes?: string;

  @IsString()
  @IsOptional()
  filingFrequency?: string;
}
