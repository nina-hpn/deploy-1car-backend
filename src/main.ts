import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth-guard';
import { UserService } from './api/user/services/user.service';
import { AuthService } from './api/auth/services/auth.service';

async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const config: ConfigService = app.get(ConfigService);
  const port: number = config.get<number>('PORT') || 8080;
  app.enableCors();
  app.useGlobalGuards(
    new JwtAuthGuard(
      app.get(Reflector),
      app.get(UserService),
      app.get(AuthService),
    ),
  );
  console.log(port);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('1Car APIs')
    .setDescription('The 1Car API description')
    .setVersion('0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'access_token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  await app.listen(port, () => {
    console.log('[WEB]', config.get<string>('BASE_URL'));
  });
}
bootstrap();
