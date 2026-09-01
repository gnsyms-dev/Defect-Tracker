import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuthUserEntity } from '../../../../domain/entities/auth-user.entity';
import {
  AuthRepositoryPort,
  CreateAuthUserData,
} from '../../../../type/auth-repository.port';
import { AuthUserModel } from '../models/auth-user.model';

@Injectable()
export class AuthRepository implements AuthRepositoryPort {
  constructor(
    @InjectModel(AuthUserModel)
    private readonly authUserModel: typeof AuthUserModel,
  ) {}

  async findByEmail(_email: string): Promise<AuthUserEntity | null> {
    // TODO: implement lookup by email
    throw new Error('Not implemented');
  }

  async create(_data: CreateAuthUserData): Promise<AuthUserEntity> {
    // TODO: implement persistence of a new auth user
    throw new Error('Not implemented');
  }
}
