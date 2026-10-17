import { IsOptional, IsString, Length } from "class-validator";

export class SsoExchangeDto {
  @IsString()
  @Length(1, 200)
  code!: string;

  @IsString()
  @IsOptional()
  totpCode?: string;
}
