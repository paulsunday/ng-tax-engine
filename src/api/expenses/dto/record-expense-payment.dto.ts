import { IsDateString, IsOptional, IsString, Min } from "class-validator";

export class RecordExpensePaymentDto {
  @Min(0.01)
  amountNgn!: number;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
