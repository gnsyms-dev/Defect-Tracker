import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@shared/enums/user-role.enum';

export class AuthPlantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GJ-SUR-01' })
  code: string;

  @ApiProperty({ example: 'Surat Weaving Unit 1' })
  name: string;
}

// One DTO shared by POST /auth/login (nested under `user`) and GET /auth/me
// (returned directly). Duplicating the shape across two endpoints is how response
// contracts drift apart.
export class AuthenticatedUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'supervisor@example.com' })
  email: string;

  @ApiProperty({ example: 'Rakesh Patel' })
  fullName: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role: UserRole;

  @ApiProperty({ format: 'uuid' })
  plantId: string;

  @ApiPropertyOptional({ type: AuthPlantDto, nullable: true })
  plant: AuthPlantDto | null;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({
    description:
      'Access-token lifetime in seconds, so the client can pre-empt an expiry instead of discovering it as a 401 mid-sync.',
    example: 43200,
  })
  expiresInSeconds: number;

  @ApiProperty({ type: AuthenticatedUserDto })
  user: AuthenticatedUserDto;
}
