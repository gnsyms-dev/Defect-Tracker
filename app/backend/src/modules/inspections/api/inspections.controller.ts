import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { PaginatedDto } from '@shared/dto/paginated.dto';
import { Public } from '@shared/decorators/public.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { UserRole } from '@shared/enums/user-role.enum';
import { ResponseCode } from '@shared/enums/response-code.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { CurrentUser } from '@modules/auth/api/decorators/current-user.decorator';
import { InspectionsService } from '../domain/services/inspections.service';
import {
  CreateInspectionDto,
  InspectionFilterDto,
  ListInspectionsQueryDto,
  ResolveInspectionDto,
} from './dto/inspections-request.dto';
import {
  InspectionResponseDto,
  InspectionSummaryResponseDto,
} from './dto/inspections-response.dto';
import { InspectionsApiMapper } from './mapper/inspections-api.mapper';

interface HealthCheckData {
  readonly status: 'ok';
}

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get('health')
  @Public()
  healthCheck(): ApiResponseDto<HealthCheckData> {
    return ApiResponseDto.success('OK', { status: 'ok' });
  }

  @Post()
  @Roles(UserRole.Supervisor)
  @ApiOperation({
    summary: 'Log an inspection (idempotent)',
    description:
      'Returns 201 on a genuine insert and 200 when clientUuid has already been stored, with an IDENTICAL body either way. That lets the offline outbox treat every 2xx the same instead of special-casing a conflict as success.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInspectionDto,
    // passthrough so the envelope is still returned by Nest; we only need to set
    // the status code, which is what generic client retry layers, proxies and
    // telemetry actually observe. An "always 200 + wasCreated flag" design would
    // hide the distinction from all three.
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponseDto<InspectionResponseDto>> {
    const { item, wasCreated } = await this.inspectionsService.log(user, {
      clientUuid: dto.clientUuid,
      inspectionDate: dto.inspectionDate,
      machineLineId: dto.machineLineId,
      defectType: dto.defectType,
      severity: dto.severity,
      remarks: dto.remarks?.trim() ? dto.remarks.trim() : null,
      loggedAt: new Date(dto.loggedAt),
      plantId: dto.plantId,
    });

    res.status(wasCreated ? 201 : 200);

    return ApiResponseDto.success(
      wasCreated
        ? 'Inspection logged successfully.'
        : 'Inspection already recorded.',
      InspectionsApiMapper.toResponseDto(item),
      wasCreated ? ResponseCode.Created : ResponseCode.Ok,
    );
  }

  // DECLARATION ORDER MATTERS: this must come before @Get(':id'). Nest matches in
  // declaration order, so with :id first, "summary" would be captured as an id and
  // ParseUUIDPipe would 400 every summary request.
  @Get('summary')
  @Roles(UserRole.Supervisor, UserRole.QaManager)
  @ApiOperation({
    summary: 'Open/resolved counts by severity',
    description:
      'Accepts the same filters as the list and is computed by the same WHERE builder, so the numbers can never disagree with the table above them. A supervisor sees only their own; a QA manager sees every plant.',
  })
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InspectionFilterDto,
  ): Promise<ApiResponseDto<InspectionSummaryResponseDto>> {
    const summary = await this.inspectionsService.summarize(user, {
      severities: query.severity,
      status: query.status,
      defectTypes: query.defectType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      plantId: query.plantId,
      machineLineId: query.machineLineId,
    });

    return ApiResponseDto.success(
      'Summary fetched successfully.',
      InspectionsApiMapper.toSummaryResponseDto(summary),
    );
  }

  @Get()
  @Roles(UserRole.Supervisor, UserRole.QaManager)
  @ApiOperation({
    summary: 'List inspections',
    description:
      'Scoping is applied in the service from the authenticated user, never from query input: a supervisor sees only rows they logged, whatever they pass.',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInspectionsQueryDto,
  ): Promise<ApiResponseDto<PaginatedDto<InspectionResponseDto>>> {
    const page = await this.inspectionsService.list(
      user,
      {
        severities: query.severity,
        status: query.status,
        defectTypes: query.defectType,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        plantId: query.plantId,
        machineLineId: query.machineLineId,
      },
      { field: query.sortBy, direction: query.sortDir },
      { page: query.page, limit: query.limit },
    );

    return ApiResponseDto.success(
      'Inspections fetched successfully.',
      PaginatedDto.of(
        InspectionsApiMapper.toResponseDtoList(page.items),
        page.total,
        query.page,
        query.limit,
      ),
    );
  }

  @Get(':id')
  @Roles(UserRole.Supervisor, UserRole.QaManager)
  @ApiOperation({
    summary: 'Get one inspection',
    description:
      "Returns 404 -- not 403 -- for a row outside the caller's scope, so the response cannot be used to confirm that it exists.",
  })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponseDto<InspectionResponseDto>> {
    const item = await this.inspectionsService.getById(user, id);
    return ApiResponseDto.success(
      'Inspection fetched successfully.',
      InspectionsApiMapper.toResponseDto(item),
    );
  }

  @Patch(':id/resolve')
  @Roles(UserRole.QaManager)
  @ApiOperation({
    summary: 'Resolve an inspection',
    description:
      'A state transition with its own preconditions, not a general update. 409 if it is already resolved -- unlike create, a repeated resolve is a genuine conflict rather than an offline replay, because only creates are queued.',
  })
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveInspectionDto,
  ): Promise<ApiResponseDto<InspectionResponseDto>> {
    const item = await this.inspectionsService.resolve(
      user,
      id,
      dto.resolutionNote,
    );
    return ApiResponseDto.success(
      'Inspection resolved successfully.',
      InspectionsApiMapper.toResponseDto(item),
    );
  }
}
