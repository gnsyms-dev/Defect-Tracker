import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthController } from './api/auth.controller';
import { AUTH_REPOSITORY } from './type/auth-repository.port';
import { AuthService } from './domain/services/auth.service';
import { AuthUserModel } from './infrastructure/database/sql/models/auth-user.model';
import { AuthRepository } from './infrastructure/database/sql/repositories/auth.repository';

@Module({
  imports: [SequelizeModule.forFeature([AuthUserModel])],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: AUTH_REPOSITORY, useClass: AuthRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
