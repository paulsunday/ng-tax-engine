import { IsDateString, IsIn, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateCapitalAssetDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsIn([1, 2, 3])
  assetClass!: 1 | 2 | 3;

  @Min(0.01)
  qualifyingExpenditureNgn!: number;

  @IsDateString()
  acquisitionDate!: string;

  @IsOptional()
  @Min(0)
  businessUsePercent?: number;
}
