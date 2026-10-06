import { IsOptional, IsString, Min } from "class-validator";

export class RecordTaxPaymentDto {
  @Min(0.01)
  amountNgn!: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;
}
