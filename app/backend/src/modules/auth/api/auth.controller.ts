import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { Public } from '@shared/decorators/public.decorator';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { AuthService } from '../domain/services/auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/auth-request.dto';
import {
  AuthenticatedUserDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { AuthApiMapper } from './mapper/auth-api.mapper';

interface HealthCheckData {
  readonly status: 'ok';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('health')
  @Public()
  healthCheck(): ApiResponseDto<HealthCheckData> {
    return ApiResponseDto.success('OK', { status: 'ok' });
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange credentials for an access token',
    description:
      'A wrong email, a wrong password and a deactivated account all return the same 401 message, so this endpoint cannot be used to enumerate accounts.',
  })
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<ApiResponseDto<LoginResponseDto>> {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    return ApiResponseDto.success(
      'Login successful.',
      AuthApiMapper.toLoginResponseDto(result),
    );
  }

  // No @Roles(): any authenticated user may read their own profile.
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Current user',
    description:
      'Lets the client revalidate a session restored from storage and refresh role/plant, which are deliberately not JWT claims.',
  })
  async me(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ApiResponseDto<AuthenticatedUserDto>> {
    const { user, plant } = await this.authService.getAuthenticatedUserView(
      currentUser.id,
    );
    return ApiResponseDto.success(
      'Current user fetched successfully.',
      AuthApiMapper.toAuthenticatedUserDto(user, plant),
    );
  }
}
