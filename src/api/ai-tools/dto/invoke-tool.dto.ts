import { IsBoolean, IsIn, IsObject, IsOptional } from "class-validator";
import { AI_TOOL_REGISTRY, AiToolName } from "../ai-tools.constants";

const TOOL_NAMES = Object.keys(AI_TOOL_REGISTRY) as AiToolName[];

export class InvokeToolDto {
  @IsIn(TOOL_NAMES)
  tool!: AiToolName;

  @IsObject()
  @IsOptional()
  params?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  humanAuthorized?: boolean;
}
