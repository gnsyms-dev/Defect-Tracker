import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SequelizeModuleOptions,
  SequelizeOptionsFactory,
} from '@nestjs/sequelize';
import { EnvironmentVariables } from '../../environment/env.types';

@Injectable()
export class SqlConfigService implements SequelizeOptionsFactory {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  createSequelizeOptions(): SequelizeModuleOptions {
    const isSslEnabled = this.configService.get('DB_SSL', { infer: true });

    return {
      dialect: 'postgres',
      host: this.configService.get('DB_HOST', { infer: true }),
      port: this.configService.get('DB_PORT', { infer: true }),
      username: this.configService.get('DB_USERNAME', { infer: true }),
      password: this.configService.get('DB_PASSWORD', { infer: true }),
      database: this.configService.get('DB_NAME', { infer: true }),
      logging: this.configService.get('DB_LOGGING', { infer: true }),
      autoLoadModels: true,
      synchronize: false,
      dialectOptions: isSslEnabled
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
      pool: {
        max: this.configService.get('DB_POOL_MAX', { infer: true }),
        min: this.configService.get('DB_POOL_MIN', { infer: true }),
        idle: this.configService.get('DB_POOL_IDLE_MS', { infer: true }),
      },
    };
  }
}
