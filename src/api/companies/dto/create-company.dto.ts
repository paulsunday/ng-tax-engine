import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  rcNumber?: string;

  @IsOptional()
  @IsString()
  tin?: string;

  @IsDateString()
  incorporationDate!: string;

  @Matches(/^\d{2}-\d{2}$/, { message: "accountingYearEnd must be in MM-DD format" })
  accountingYearEnd!: string;

  @IsOptional()
  @IsBoolean()
  isResident?: boolean;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsBoolean()
  isProfessionalServices?: boolean;

  @IsOptional()
  @IsBoolean()
  vatRegistered?: boolean;

  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "headOfficeStateCode must be a 2-letter code, e.g. EN, LA, FC" })
  headOfficeStateCode!: string;
}
