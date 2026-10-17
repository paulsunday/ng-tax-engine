import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { IntegrationConnection } from "@prisma/client";
import { IntegrationsService } from "./integrations.service";

/**
 * Authenticates a machine caller (an external system such as the tenant-billing API) by
 * its integration key in `Authorization: Bearer nwb_...`. Deliberately separate from
 * JwtAuthGuard: a key identifies a CONNECTION to one company, never a user, so it can
 * never satisfy a user-facing endpoint.
 */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly integrations: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const key = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    if (!key) throw new UnauthorizedException("Integration key required.");

    const connection = await this.integrations.authenticate(key);
    if (!connection) throw new UnauthorizedException("Invalid or revoked integration key.");
    request.integrationConnection = connection;
    return true;
  }
}

export const CurrentConnection = createParamDecorator((_data: unknown, context: ExecutionContext): IntegrationConnection => {
  return context.switchToHttp().getRequest().integrationConnection;
});
