import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow up to 50mb payload for syncing
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Enable CORS for local development
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('Thrive Gym API')
    .setDescription('API for syncing gym management data from desktop application to cloud and providing data retrieval for web dashboard')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key for desktop sync authentication',
      },
      'api-key',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for admin authentication (obtained from /api/auth/login)',
      },
      'bearer',
    )
    .addTag('app', 'Application health check')
    .addTag('auth', 'Authentication endpoints')
    .addTag('sync', 'Desktop data synchronization (API Key required)')
    .addTag('members', 'Member management (JWT required)')
    .addTag('services', 'Service management (JWT required)')
    .addTag('attendance', 'Attendance records (JWT required)')
    .addTag('transactions', 'Financial transactions (JWT required)')
    .addTag('dashboard', 'Dashboard analytics (JWT required)')
    .addTag('sms', 'SMS messaging via AfroMessage (JWT required)')
    .addTag('site', 'Public website data (no auth)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const configuredPort = process.env.PORT ? Number(process.env.PORT) : 43123;
  await app.listen(configuredPort);
  const appUrl = await app.getUrl();
  console.log(`Application is running on: ${appUrl}`);
  console.log(`Swagger documentation available at: ${appUrl}/api/docs`);
}
bootstrap();
