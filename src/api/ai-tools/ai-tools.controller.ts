import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../common/rbac.constants";
import { AiToolsService } from "./ai-tools.service";
import { AI_TOOL_REGISTRY } from "./ai-tools.constants";
import { InvokeToolDto } from "./dto/invoke-tool.dto";

@Controller("companies/:companyId/ai-tools")
@UseGuards(JwtAuthGuard)
export class AiToolsController {
  constructor(private readonly aiTools: AiToolsService) {}

  @Get()
  listTools() {
    return Object.values(AI_TOOL_REGISTRY);
  }

  @Post("invoke")
  invoke(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: InvokeToolDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.aiTools.invoke(user, { tool: dto.tool, companyId, params: dto.params ?? {}, humanAuthorized: dto.humanAuthorized });
  }
}
