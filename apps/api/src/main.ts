import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import * as cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { execSync } from 'node:child_process';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 200,
      standardHeaders: true,
      legacyHeaders: false,
    }) as any,
  );

  const port = Number(process.env.API_PORT || 3001);
  try {
    execSync('pnpm prisma migrate deploy', { stdio: 'inherit', cwd: process.cwd() });
    execSync('pnpm prisma generate', { stdio: 'inherit', cwd: process.cwd() });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Prisma migrate/generate skipped:', (e as any).message);
  }
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
