import { UserEntity } from '../../domain/entities/user.entity';
import type { PlantSummary } from '@modules/plants/type/plant-directory.port';
import type { AuthResult } from '../../type/auth-result.interface';
import {
  AuthenticatedUserDto,
  AuthPlantDto,
  LoginResponseDto,
} from '../dto/auth-response.dto';

export class AuthApiMapper {
  static toAuthenticatedUserDto(
    user: UserEntity,
    plant: PlantSummary | null,
  ): AuthenticatedUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      plantId: user.plantId,
      plant: plant ? AuthApiMapper.toPlantDto(plant) : null,
      // Note what is NOT here: passwordHash. The mapper enumerates fields
      // explicitly rather than spreading the entity, so adding a sensitive column
      // to UserEntity cannot silently leak it through this endpoint.
    };
  }

  static toLoginResponseDto(result: AuthResult): LoginResponseDto {
    return {
      accessToken: result.accessToken,
      expiresInSeconds: result.expiresInSeconds,
      user: AuthApiMapper.toAuthenticatedUserDto(result.user, result.plant),
    };
  }

  private static toPlantDto(plant: PlantSummary): AuthPlantDto {
    return { id: plant.id, code: plant.code, name: plant.name };
  }
}
