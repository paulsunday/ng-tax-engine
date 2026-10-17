import { IsIn } from "class-validator";
import { ROLES } from "../../common/rbac.constants";

export class ChangeMemberRoleDto {
  @IsIn(Object.values(ROLES))
  roleName!: string;
}
