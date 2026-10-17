import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { ROLES } from "../../common/rbac.constants";

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsIn(Object.values(ROLES))
  roleName!: string;
}
