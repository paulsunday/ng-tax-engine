import { IsString } from "class-validator";

export class MfaCodeDto {
  @IsString()
  totpCode!: string;
}
