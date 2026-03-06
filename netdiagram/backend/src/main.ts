import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ─── CORS: allow any localhost port (dev) ──────────────────────────────────
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Serve built frontend static files ────────────────────────────────────
  // __dirname = backend/dist/ at runtime; frontend/dist is two levels up.
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.useStaticAssets(frontendDist);

  // ─── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  // ─── SPA fallback: serve index.html for any unmatched route ───────────────
  // Added AFTER listen so it sits at the bottom of Express's route stack,
  // below all NestJS API routes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expressApp = app.getHttpAdapter().getInstance();
  const indexFile = path.join(frontendDist, 'index.html');
  expressApp.get('*', (_req: unknown, res: { sendFile: (p: string) => void }) => {
    res.sendFile(indexFile);
  });

  console.log(`🚀 NetDiagram running on http://localhost:${port}`);
  console.log(`   API   → http://localhost:${port}/graph`);
  console.log(`   UI    → http://localhost:${port}/`);
}

bootstrap();
