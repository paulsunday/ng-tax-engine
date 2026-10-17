import { IsEmail } from "class-validator";

export class SsoRequestDto {
  @IsEmail()
  email!: string;
}
