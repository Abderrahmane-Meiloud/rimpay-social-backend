import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AnomaliesService } from './anomalies.service';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { ResolveAnomalyDto } from './dto/resolve-anomaly.dto';
import { ReopenAnomalyDto } from './dto/reopen-anomaly.dto';

@ApiTags('Anomalies')
@ApiBearerAuth()
@Controller('anomalies')
export class AnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Get()
  @RequirePermissions('anomalies.read')
  @ApiOperation({ summary: 'List anomalies with optional filtering' })
  findAll(@Query() query: AnomalyQueryDto) {
    return this.anomaliesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('anomalies.read')
  @ApiOperation({ summary: 'Get a single anomaly with related data' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.anomaliesService.findOne(id);
  }

  @Patch(':id/resolve')
  @RequirePermissions('anomalies.resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve an anomaly' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAnomalyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.anomaliesService.resolve(id, dto, user.id);
  }

  @Patch(':id/reopen')
  @RequirePermissions('anomalies.resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a resolved or dismissed anomaly' })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenAnomalyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.anomaliesService.reopen(id, dto, user.id);
  }
}
