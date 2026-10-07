import { Equals, IsEmail, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  @MinLength(1)
  organizationName!: string;

  // Must be the literal boolean `true` — a missing field or `false` is rejected by the
  // DTO itself, so there is no code path that creates an organization without an explicit
  // accept. See AuthService.register for where this is actually recorded.
  @Equals(true, { message: "You must accept the Terms & Conditions to register." })
  acceptedTerms!: boolean;
}
