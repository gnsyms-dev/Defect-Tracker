import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiResponseDto } from './shared/dto/api-response.dto';
import { Public } from './shared/decorators/public.decorator';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  // JwtAuthGuard is registered globally (fail-closed), so this liveness route has
  // to opt out explicitly.
  @Get()
  @Public()
  getHello(): ApiResponseDto<string> {
    this.logger.debug('Liveness probe requested');
    return ApiResponseDto.success('OK', this.appService.getHello());
  }
}
