import { IsBoolean, IsDateString, IsOptional, IsString, Min, MinLength } from "class-validator";

export class RecordTransactionDto {
  @IsString()
  @MinLength(1)
  counterpartyName!: string;

  @IsOptional()
  @IsString()
  counterpartyTin?: string;

  @IsBoolean()
  counterpartyIsCorporate!: boolean;

  @IsBoolean()
  counterpartyIsResident!: boolean;

  @IsString()
  @MinLength(1)
  transactionCategory!: string;

  @Min(0.01)
  grossAmountNgn!: number;

  @IsDateString()
  transactionDate!: string;

  @IsOptional()
  @IsBoolean()
  supplierIsSmallCompany?: boolean;
}
