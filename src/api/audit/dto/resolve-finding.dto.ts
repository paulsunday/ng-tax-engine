import { IsIn, IsString, MinLength } from "class-validator";

export class ResolveFindingDto {
  @IsIn(["RESOLVED", "DISMISSED"])
  status!: "RESOLVED" | "DISMISSED";

  @IsString()
  @MinLength(1)
  resolutionNotes!: string;
}
