import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../common/rbac.constants";
import { MfaCodeDto } from "./dto/mfa-code.dto";
import { SwitchOrganizationDto } from "./dto/switch-organization.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { RequestPasswordResetDto, ResetPasswordDto } from "./dto/password-reset.dto";

// 5 attempts/minute per IP on every credential-bearing auth endpoint — brute-force and
// credential-stuffing protection (brief §41). Tighter than the app-wide default limit.
const AUTH_THROTTLE = { default: { limit: 5, ttl: seconds(60) } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("mfa/setup")
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  beginMfaSetup(@CurrentUser() user: JwtPayload) {
    return this.authService.beginMfaSetup(user.sub);
  }

  @Post("mfa/enable")
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  confirmMfaSetup(@CurrentUser() user: JwtPayload, @Body() dto: MfaCodeDto) {
    return this.authService.confirmMfaSetup(user.sub, dto.totpCode);
  }

  @Post("mfa/disable")
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  disableMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaCodeDto) {
    return this.authService.disableMfa(user.sub, dto.totpCode);
  }

  @Get("memberships")
  @UseGuards(JwtAuthGuard)
  listMyMemberships(@CurrentUser() user: JwtPayload) {
    return this.authService.listMyMemberships(user.sub);
  }

  @Post("switch-organization")
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  switchOrganization(@CurrentUser() user: JwtPayload, @Body() dto: SwitchOrganizationDto) {
    return this.authService.switchOrganization(user.sub, dto.organizationId);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  async changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
    return { changed: true };
  }

  @Post("request-password-reset")
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post("reset-password")
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { reset: true };
  }
}
