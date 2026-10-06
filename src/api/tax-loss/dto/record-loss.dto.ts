import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class RecordLossDto {
  @IsString()
  @MinLength(1)
  tradeOrBusiness!: string;

  @IsInt()
  yearIncurred!: number;

  @Min(0.01)
  originalLossNgn!: number;

  @IsOptional()
  @IsBoolean()
  isDigitalAsset?: boolean;
}
