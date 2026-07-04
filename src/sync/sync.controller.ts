import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SyncService } from './sync.service';
import { CreateSyncBatchDto } from './dto/create-sync-batch.dto';
import { SyncBatchQueryDto } from './dto/sync-batch-query.dto';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync/batches')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @RequirePermissions('sync.process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an offline sync batch for processing' })
  submitBatch(
    @Body() dto: CreateSyncBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.syncService.submitBatch(dto, user.id);
  }

  @Get()
  @RequirePermissions('sync.read')
  @ApiOperation({ summary: 'List sync batches with optional filtering' })
  findAll(@Query() query: SyncBatchQueryDto) {
    return this.syncService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('sync.read')
  @ApiOperation({ summary: 'Get a single sync batch with all item results' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.syncService.findOne(id);
  }
}
