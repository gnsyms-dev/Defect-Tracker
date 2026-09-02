import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('health')
  @Public()
  healthCheck(): ApiResponseDto<HealthCheckData> {
    this.logger.debug('Auth health check requested');
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
    // The email is masked by the logger's own sanitizer before it is written,
    // and the password never reaches a log line at any level.
    this.logger.log(`Login requested email=${loginDto.email}`);

    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );

    this.logger.log(
      `Login response issued userId=${result.user.id} expiresInSeconds=${result.expiresInSeconds}`,
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
    this.logger.debug(`Current user requested userId=${currentUser.id}`);

    const { user, plant } = await this.authService.getAuthenticatedUserView(
      currentUser.id,
    );

    this.logger.debug(
      `Current user resolved userId=${user.id} role=${user.role} plant=${plant?.code ?? 'unknown'}`,
    );

    return ApiResponseDto.success(
      'Current user fetched successfully.',
      AuthApiMapper.toAuthenticatedUserDto(user, plant),
    );
  }
}
