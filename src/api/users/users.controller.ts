import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../common/rbac.constants";
import { UsersService } from "./users.service";

class SetTaxRuleApproverDto {
  @IsBoolean()
  grant!: boolean;
}

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  async getMine(@CurrentUser() user: JwtPayload) {
    return this.users.getProfile(user.sub);
  }

  @Patch(":userId/tax-rule-approver")
  async setTaxRuleApprover(@CurrentUser() user: JwtPayload, @Param("userId") userId: string, @Body() dto: SetTaxRuleApproverDto) {
    return this.users.setTaxRuleApprover(user.sub, user.isPlatformAdmin, userId, dto.grant);
  }
}
