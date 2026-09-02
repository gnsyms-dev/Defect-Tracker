import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SequelizeModuleOptions,
  SequelizeOptionsFactory,
} from '@nestjs/sequelize';
import { EnvironmentVariables } from '../../environment/env.types';

@Injectable()
export class SqlConfigService implements SequelizeOptionsFactory {
  private readonly logger = new Logger(SqlConfigService.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  createSequelizeOptions(): SequelizeModuleOptions {
    const isSslEnabled = this.configService.get('DB_SSL', { infer: true });
    const host = this.configService.get('DB_HOST', { infer: true });
    const port = this.configService.get('DB_PORT', { infer: true });
    const database = this.configService.get('DB_NAME', { infer: true });
    const poolMax = this.configService.get('DB_POOL_MAX', { infer: true });
    const poolMin = this.configService.get('DB_POOL_MIN', { infer: true });

    // Which database this instance attached to, and nothing more: the username
    // and password are deliberately absent so this line stays safe to ship to a
    // log aggregator.
    this.logger.log(
      `Sequelize configured host=${host}:${port} database=${database} ssl=${isSslEnabled ? 'on' : 'off'} pool=${poolMin}-${poolMax}`,
    );

    return {
      dialect: 'postgres',
      host,
      port,
      username: this.configService.get('DB_USERNAME', { infer: true }),
      password: this.configService.get('DB_PASSWORD', { infer: true }),
      database,
      logging: this.configService.get('DB_LOGGING', { infer: true }),
      autoLoadModels: true,
      synchronize: false,
      dialectOptions: isSslEnabled
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
      pool: {
        max: poolMax,
        min: poolMin,
        idle: this.configService.get('DB_POOL_IDLE_MS', { infer: true }),
      },
    };
  }
}
