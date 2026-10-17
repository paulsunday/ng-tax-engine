import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { EmailModule } from "../email/email.module";
import { MfaService } from "./mfa.service";

@Module({
  imports: [
    PassportModule,
    AuditLogModule,
    EmailModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET, // validated for presence in JwtStrategy's constructor at boot
      // @nestjs/jwt types expiresIn against `ms`'s template-literal string types, which an
      // arbitrary env var can't satisfy statically — cast is safe, `ms` validates at runtime.
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as any },
    }),
  ],
  providers: [AuthService, JwtStrategy, MfaService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
