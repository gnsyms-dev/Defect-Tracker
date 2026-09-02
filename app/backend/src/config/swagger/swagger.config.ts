import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Environment, EnvironmentVariables } from '../environment/env.types';

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService<EnvironmentVariables, true>,
): void {
  const isProduction =
    configService.get('NODE_ENV', { infer: true }) === Environment.Production;
  if (isProduction) {
    return;
  }

  const documentConfig = new DocumentBuilder()
    .setTitle('Defect Tracker API')
    .setDescription('Quality Inspection Tracker API')
    .setVersion('1.0')
    // Without this, /api/docs can only exercise POST /auth/login -- every other
    // endpoint 401s with no way to supply the token from the Swagger UI.
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addGlobalParameters({
      name: 'Accept-Language',
      in: 'header',
      required: false,
      schema: { type: 'string', default: 'en' },
      description: 'Language for translated responses (e.g. en, fr)',
    })
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup('api/docs', app, document);
}
