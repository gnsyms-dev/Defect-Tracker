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
    .setTitle('Hakka API')
    .setDescription('API documentation for the Hakka backend')
    .setVersion('1.0')
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
