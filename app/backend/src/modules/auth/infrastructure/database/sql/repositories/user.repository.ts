import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { UserEntity } from '../../../../domain/entities/user.entity';
import type { UserRepositoryPort } from '../../../../type/user-repository.port';
import type {
  UserDirectoryPort,
  UserSummary,
} from '../../../../type/user-directory.port';
import { UserPersistenceMapper } from '../mapper/user-persistence.mapper';
import { UserModel } from '../models/user.model';

@Injectable()
export class UserRepository implements UserRepositoryPort, UserDirectoryPort {
  constructor(
    @InjectModel(UserModel)
    private readonly userModel: typeof UserModel,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    // Lower-cased here as well as in the DTO. The users_email_lower_chk constraint
    // guarantees every stored email is already lower-case, so this makes the plain
    // UNIQUE index behave case-insensitively without a functional index.
    const row = await this.userModel.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    return row ? UserPersistenceMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.userModel.findByPk(id);
    return row ? UserPersistenceMapper.toDomain(row) : null;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    await this.userModel.update({ lastLoginAt: at }, { where: { id } });
  }

  async findSummariesByIds(
    ids: readonly string[],
  ): Promise<readonly UserSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.userModel.findAll({
      where: { id: { [Op.in]: [...ids] } },
      attributes: ['id', 'fullName', 'role'],
    });
    return rows.map((row) => UserPersistenceMapper.toSummary(row));
  }
}
