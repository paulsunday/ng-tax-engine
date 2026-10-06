import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateAssetDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsDateString()
  acquisitionDate!: string;

  @Min(0.01)
  costNgn!: number;

  @IsOptional()
  @Min(0)
  salvageValueNgn?: number;

  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @IsBoolean()
  paidImmediately!: boolean;
}
