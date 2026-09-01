import { AuthUserEntity } from '../../../../domain/entities/auth-user.entity';
import { AuthUserModel } from '../models/auth-user.model';

export class AuthPersistenceMapper {
  static toDomain(_model: AuthUserModel): AuthUserEntity {
    // TODO: map the persistence model to a domain entity
    throw new Error('Not implemented');
  }
}
