import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class RunPayeDto {
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsInt()
  @Min(2000)
  periodYear!: number;

  @Min(0)
  grossEmolumentNgn!: number;

  @IsOptional()
  @Min(0)
  annualRentNgn?: number;

  @IsOptional()
  @IsBoolean()
  isMinimumWageEarner?: boolean;
}
