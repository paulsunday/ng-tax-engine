import { IsISO8601, IsObject, IsOptional, IsString } from "class-validator";

export class ResearchRuleDto {
  @IsString()
  researchNotes!: string;
}

export class VerifyRuleDto {
  @IsString()
  @IsOptional()
  researchNotes?: string;

  @IsISO8601()
  @IsOptional()
  verificationDate?: string;

  // Allowed here, not just at creation, because an imported/drafted rule often has a
  // confirmed figure before anyone has written out how it's meant to be applied —
  // verification is the natural point for a reviewer to fill that in.
  @IsString()
  @IsOptional()
  calculationMethod?: string;
}

export class ApproveRuleDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RejectRuleDto {
  @IsString()
  reason!: string;
}

export class RequestRevisionDto {
  @IsString()
  notes!: string;
}

export class ActivateRuleDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RetireRuleDto {
  @IsString()
  reason!: string;
}

export class SupersedeRuleDto {
  @IsString()
  ruleVersion!: string;

  @IsISO8601()
  effectiveFrom!: string;

  value!: unknown;

  @IsString()
  sourceReference!: string;

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsString()
  @IsOptional()
  sourceTitle?: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsObject()
  @IsOptional()
  conditions?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  calculationMethod?: string;

  @IsString()
  @IsOptional()
  researchNotes?: string;
}
