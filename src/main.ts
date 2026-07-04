import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Ensure SIGTERM/SIGINT trigger Nest's own lifecycle shutdown hooks
  // (onModuleDestroy / onApplicationShutdown, e.g. RedisThrottleClient's
  // Redis disconnect) instead of the process exiting abruptly.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  const configService = app.get(ConfigService);

  // Trust the reverse proxy for exactly N hops (set via TRUST_PROXY_HOPS),
  // so req.ip resolves from X-Forwarded-For without trusting arbitrary
  // public headers. Unset means no proxy is trusted (req.ip is the
  // direct socket address). See TRUST_PROXY_HOPS in .env.example.
  const trustProxyHops = configService.get<string>('TRUST_PROXY_HOPS');
  if (trustProxyHops !== undefined) {
    const hops = Number(trustProxyHops);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error(
        `TRUST_PROXY_HOPS must be a non-negative integer, got "${trustProxyHops}".`,
      );
    }
    app.set('trust proxy', hops);
  }

  app.use(cookieParser());

  const frontendUrl = configService.get<string>('FRONTEND_URL');

  app.enableCors({
    origin: [
      frontendUrl,
      'http://localhost:5173',
      'http://localhost:5174',
    ].filter((origin): origin is string => Boolean(origin)),
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RIMPay Social API')
    .setDescription('Backend API for social payments management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
