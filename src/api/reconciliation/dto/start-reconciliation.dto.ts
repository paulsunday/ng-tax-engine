import { IsDateString, IsString, Min, MinLength } from "class-validator";

export class StartReconciliationDto {
  @IsString()
  bankAccountId!: string;

  @IsString()
  @MinLength(1)
  periodLabel!: string;

  @IsDateString()
  statementEndDate!: string;

  @Min(0)
  statementBalanceNgn!: number;
}
