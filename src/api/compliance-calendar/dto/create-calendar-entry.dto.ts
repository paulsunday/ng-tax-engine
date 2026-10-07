import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateCalendarEntryDto {
  @IsString()
  taxReturnId!: string;

  @IsInt()
  @Min(0)
  internalSafetyMarginDays!: number;

  @IsOptional()
  @IsString()
  responsibleUserId?: string;
}
