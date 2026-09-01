import { AuthUserEntity } from '../../domain/entities/auth-user.entity';
import { AuthResponseDto } from '../dto/auth-response.dto';

export class AuthApiMapper {
  static toResponseDto(
    _user: AuthUserEntity,
    _accessToken: string,
  ): AuthResponseDto {
    // TODO: map the domain entity + access token to the response DTO
    throw new Error('Not implemented');
  }
}
