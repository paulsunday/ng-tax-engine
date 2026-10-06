import { IsDateString } from "class-validator";

export class ComputeTaxDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
