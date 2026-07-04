import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { DevicesService } from './devices.service';
import { DeviceQueryDto } from './dto/device-query.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import {
  DeviceDetailDto,
  PaginatedDevicesDto,
} from './dto/device-response.dto';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @RequirePermissions('devices.read')
  @ApiOperation({ summary: 'List devices with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedDevicesDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: DeviceQueryDto) {
    return this.devicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('devices.read')
  @ApiOperation({ summary: 'Get device detail' })
  @ApiResponse({ status: 200, type: DeviceDetailDto })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.findOne(id);
  }

  @Post()
  @RequirePermissions('devices.manage')
  @ApiOperation({ summary: 'Register a new device for an agent' })
  @ApiResponse({ status: 201, type: DeviceDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid agentId' })
  @ApiResponse({ status: 409, description: 'deviceUid already exists or agent not ACTIVE' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('devices.manage')
  @ApiOperation({ summary: 'Update device (status, agent reassignment, metadata)' })
  @ApiResponse({ status: 200, type: DeviceDetailDto })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 409, description: 'BLOCKED->ACTIVE forbidden or target agent not ACTIVE' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.update(id, dto, user.id);
  }
}
