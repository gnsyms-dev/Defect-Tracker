import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { ResponseCode } from '@shared/enums/response-code.enum';
import { AuthService } from '../domain/services/auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto, RegisterDto } from './dto/auth-request.dto';
import { AuthApiMapper } from './mapper/auth-api.mapper';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<ApiResponseDto<AuthResponseDto>> {
    const { user, accessToken } = await this.authService.register(
      registerDto.email,
      registerDto.password,
    );
    return ApiResponseDto.success(
      'Registration successful.',
      AuthApiMapper.toResponseDto(user, accessToken),
      ResponseCode.Created,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<ApiResponseDto<AuthResponseDto>> {
    const { user, accessToken } = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    return ApiResponseDto.success(
      'Login successful.',
      AuthApiMapper.toResponseDto(user, accessToken),
    );
  }
}
