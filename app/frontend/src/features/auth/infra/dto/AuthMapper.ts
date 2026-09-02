import type {
  AuthenticatedUser,
  UserPlant,
} from '../../application/domain/entities/AuthenticatedUser';
import type { LoginResult } from '../../application/ports/AuthRepository';
import type {
  AuthenticatedUserDto,
  AuthPlantDto,
  LoginResponseDto,
} from './AuthDto';

/**
 * The API DTO and the domain entity happen to be structurally identical today, so
 * this mapper looks like duplication. It is kept anyway, as a conscious cost: it is
 * the single seam that absorbs a server-side rename (plantId -> plant_id, say)
 * without any use-case or component changing. Eight lines is a cheap insurance
 * premium for that.
 */
export class AuthMapper {
  static toDomain(dto: AuthenticatedUserDto): AuthenticatedUser {
    return {
      id: dto.id,
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      plantId: dto.plantId,
      plant: dto.plant ? AuthMapper.toPlant(dto.plant) : null,
    };
  }

  static toLoginResult(dto: LoginResponseDto): LoginResult {
    return {
      user: AuthMapper.toDomain(dto.user),
      accessToken: dto.accessToken,
      expiresInSeconds: dto.expiresInSeconds,
    };
  }

  private static toPlant(dto: AuthPlantDto): UserPlant {
    return { id: dto.id, code: dto.code, name: dto.name };
  }
}
