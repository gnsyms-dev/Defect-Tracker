import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    @InjectModel(UserModel)
    private readonly userModel: typeof UserModel,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    // Lower-cased here as well as in the DTO. The users_email_lower_chk constraint
    // guarantees every stored email is already lower-case, so this makes the plain
    // UNIQUE index behave case-insensitively without a functional index.
    const normalizedEmail = email.trim().toLowerCase();
    const row = await this.userModel.findOne({
      where: { email: normalizedEmail },
    });

    this.logger.debug(
      `findByEmail email=${normalizedEmail} result=${row ? 'hit' : 'miss'}`,
    );

    return row ? UserPersistenceMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.userModel.findByPk(id);
    this.logger.debug(`findById id=${id} result=${row ? 'hit' : 'miss'}`);
    return row ? UserPersistenceMapper.toDomain(row) : null;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    const [affectedRows] = await this.userModel.update(
      { lastLoginAt: at },
      { where: { id } },
    );
    // Zero affected rows means the user vanished between authentication and this
    // write, which is otherwise entirely silent -- the call returns void.
    this.logger.debug(`touchLastLogin id=${id} affectedRows=${affectedRows}`);
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

    // requested vs found: a gap here is what a missing display name on the list
    // screen looks like from the database side.
    this.logger.debug(
      `findSummariesByIds requested=${ids.length} found=${rows.length}`,
    );

    return rows.map((row) => UserPersistenceMapper.toSummary(row));
  }
}
