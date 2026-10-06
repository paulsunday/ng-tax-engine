import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { ROLES } from "../../common/rbac.constants";

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(10)
  temporaryPassword!: string;

  @IsIn(Object.values(ROLES))
  roleName!: string;
}
