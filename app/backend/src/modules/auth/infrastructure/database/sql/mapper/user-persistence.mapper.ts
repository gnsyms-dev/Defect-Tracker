import { UserEntity } from '../../../../domain/entities/user.entity';
import type { UserSummary } from '../../../../type/user-directory.port';
import { UserModel } from '../models/user.model';

export class UserPersistenceMapper {
  static toDomain(model: UserModel): UserEntity {
    return new UserEntity(
      model.id,
      model.email,
      model.passwordHash,
      model.fullName,
      model.role,
      model.plantId,
      model.isActive,
      model.lastLoginAt ?? null,
      model.createdAt,
      model.updatedAt,
    );
  }

  static toSummary(model: UserModel): UserSummary {
    return { id: model.id, fullName: model.fullName, role: model.role };
  }
}
