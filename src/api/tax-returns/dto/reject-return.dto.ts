import { IsString, MinLength } from "class-validator";

export class RejectReturnDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
