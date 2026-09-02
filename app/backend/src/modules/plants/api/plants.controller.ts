import { Controller, Get } from '@nestjs/common';
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
  constructor(private readonly plantsService: PlantsService) {}

  @Get('health')
  @Public()
  healthCheck(): ApiResponseDto<HealthCheckData> {
    return ApiResponseDto.success('OK', { status: 'ok' });
  }

  // No @Roles(): both roles legitimately need the plant list -- a QA manager to
  // populate the plant filter, a supervisor to render their own plant's name.
  @Get()
  @ApiOperation({ summary: 'List active plants' })
  async list(): Promise<ApiResponseDto<PlantResponseDto[]>> {
    const plants = await this.plantsService.listActive();
    return ApiResponseDto.success(
      'Plants fetched successfully.',
      PlantsApiMapper.toResponseDtoList(plants),
    );
  }
}
