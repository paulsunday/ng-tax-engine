import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class InspectInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  // Only required when the invitee's account has no password set yet
  // (AuthService.acceptInvitation enforces this — it depends on server-side state the DTO
  // itself can't see). Existing accounts ignore a password if one is sent.
  @IsOptional()
  @IsString()
  @MinLength(10)
  password?: string;

  // Lets a brand-new invitee correct the full name the inviter typed for them. Existing
  // accounts keep their current name — this is never applied to them.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;
}
