import { Controller, Get, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { Public } from '@shared/decorators/public.decorator';
import { PlantsService } from '../domain/services/plants.service';
import { PlantResponseDto } from './dto/plants-response.dto';
import { PlantsApiMapper } from './mapper/plants-api.mapper';

interface HealthCheckData {
  readonly status: 'ok';
}

@ApiTags('plants')
@ApiBearerAuth()
@Controller('plants')
export class PlantsController {
  private readonly logger = new Logger(PlantsController.name);

  constructor(private readonly plantsService: PlantsService) {}

  @Get('health')
  @Public()
  healthCheck(): ApiResponseDto<HealthCheckData> {
    this.logger.debug('Plants health check requested');
    return ApiResponseDto.success('OK', { status: 'ok' });
  }

  // No @Roles(): both roles legitimately need the plant list -- a QA manager to
  // populate the plant filter, a supervisor to render their own plant's name.
  @Get()
  @ApiOperation({ summary: 'List active plants' })
  async list(): Promise<ApiResponseDto<PlantResponseDto[]>> {
    this.logger.debug('Active plant list requested');

    const plants = await this.plantsService.listActive();

    this.logger.debug(`Active plant list returned count=${plants.length}`);

    return ApiResponseDto.success(
      'Plants fetched successfully.',
      PlantsApiMapper.toResponseDtoList(plants),
    );
  }
}
