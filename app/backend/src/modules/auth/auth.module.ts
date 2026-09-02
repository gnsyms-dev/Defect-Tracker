import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { SequelizeModule } from '@nestjs/sequelize';
import { EnvironmentVariables } from '@config/environment/env.types';
import { RolesGuard } from '@shared/guards/roles.guard';
import { PlantsModule } from '@modules/plants/plants.module';
import { AuthController } from './api/auth.controller';
import { JwtAuthGuard } from './api/guards/jwt-auth.guard';
import { AuthService } from './domain/services/auth.service';
import { UserModel } from './infrastructure/database/sql/models/user.model';
import { UserRepository } from './infrastructure/database/sql/repositories/user.repository';
import { BcryptPasswordHasher } from './infrastructure/security/bcrypt-password-hasher';
import { JwtTokenIssuer } from './infrastructure/security/jwt-token-issuer';
import { PASSWORD_HASHER } from './type/password-hasher.port';
import { TOKEN_ISSUER } from './type/token-issuer.port';
import { USER_DIRECTORY } from './type/user-directory.port';
import { USER_REPOSITORY } from './type/user-repository.port';

@Module({
  imports: [
    SequelizeModule.forFeature([UserModel]),
    // /auth/me returns the user's plant name, and a supervisor cannot be expected
    // to call GET /plants just to render their own header.
    PlantsModule,
    // Registered here rather than in a src/config/jwt/ folder: unlike cors or
    // database config, this is consumed by exactly one module, so it fails the
    // "shared infrastructure" test that would justify promoting it.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: USER_REPOSITORY, useClass: UserRepository },
    // UserRepository implements both ports; useExisting aliases the same singleton.
    { provide: USER_DIRECTORY, useExisting: USER_REPOSITORY },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },

    // Global, and ORDER MATTERS: Nest applies APP_GUARDs in registration order, so
    // JwtAuthGuard must populate request.user before RolesGuard reads its role.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // Only the narrow directory port is exported -- never AuthService (it can issue
  // tokens) and never the user repository (its entity carries passwordHash).
  exports: [USER_DIRECTORY],
})
export class AuthModule {}
