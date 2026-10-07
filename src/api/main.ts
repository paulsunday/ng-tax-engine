import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

/**
 * CORS is explicit-allowlist-only (brief §41): ALLOWED_ORIGINS is a comma-separated list of
 * exact origins. No origin configured means no browser origin is allowed — same-origin/
 * server-to-server calls (no Origin header) still work, but there is no permissive default.
 */
function parseAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: parseAllowedOrigins(), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
