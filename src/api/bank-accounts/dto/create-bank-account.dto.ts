import { IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateBankAccountDto {
  @IsString()
  @MinLength(1)
  accountName!: string;

  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsString()
  @MinLength(1)
  accountNumber!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Min(0)
  openingBalanceNgn?: number;

  @IsOptional()
  @IsString()
  glAccountId?: string;
}
