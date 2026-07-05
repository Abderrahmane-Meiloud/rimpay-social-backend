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
import { OperatorsService } from './operators.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { UpdateOperatorStatusDto } from './dto/update-operator-status.dto';
import { OperatorQueryDto } from './dto/operator-query.dto';
import {
  OperatorDetailDto,
  PaginatedOperatorsDto,
} from './dto/operator-response.dto';

@ApiTags('operators')
@ApiBearerAuth()
@Controller('operators')
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  @Get()
  @RequirePermissions('operators.read')
  @ApiOperation({ summary: 'List payment/distribution operators with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedOperatorsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: OperatorQueryDto) {
    return this.operatorsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('operators.read')
  @ApiOperation({ summary: 'Get operator detail' })
  @ApiResponse({ status: 200, type: OperatorDetailDto })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.operatorsService.findOne(id);
  }

  @Post()
  @RequirePermissions('operators.create')
  @ApiOperation({ summary: 'Create a payment/distribution operator' })
  @ApiResponse({ status: 201, type: OperatorDetailDto })
  @ApiResponse({ status: 409, description: 'code already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreateOperatorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operatorsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('operators.update')
  @ApiOperation({ summary: 'Update an operator (code is immutable)' })
  @ApiResponse({ status: 200, type: OperatorDetailDto })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operatorsService.update(id, dto, user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('operators.manage_status')
  @ApiOperation({ summary: 'Change operator status (ACTIVE/INACTIVE/SUSPENDED)' })
  @ApiResponse({ status: 200, type: OperatorDetailDto })
  @ApiResponse({ status: 404, description: 'Operator not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatorStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operatorsService.updateStatus(id, dto, user.id);
  }
}
