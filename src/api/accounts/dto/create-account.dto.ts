import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { AccountType } from "@prisma/client";

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  parentAccountId?: string;
}
