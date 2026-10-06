import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  stateOfResidenceCode!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  stateOfWorkCode!: string;

  @IsOptional()
  @IsBoolean()
  isResident?: boolean;

  @IsOptional()
  @IsString()
  tin?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
