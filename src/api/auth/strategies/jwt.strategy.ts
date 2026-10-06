import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "../../common/rbac.constants";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "JWT_SECRET is not set. Refusing to start with a fallback/default secret — set it in the environment " +
          "(brief §30: do not store secrets insecurely, and a guessable default is equally unsafe)."
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Returned value is attached to request.user by passport. Re-fetching the user from
    // the DB on every request (to catch disabled/removed accounts) is deferred to Phase 2+
    // for now; Phase 1 trusts a valid, unexpired signature.
    return payload;
  }
}
