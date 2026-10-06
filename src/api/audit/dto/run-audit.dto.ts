import { IsDateString } from "class-validator";

export class RunAuditDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
