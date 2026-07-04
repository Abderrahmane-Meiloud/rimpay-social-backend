import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AgentsService } from './agents.service';
import { AgentQueryDto } from './dto/agent-query.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateAgentGeographicAssignmentDto } from './dto/create-geographic-assignment.dto';
import { UpdateAgentGeographicAssignmentDto } from './dto/update-geographic-assignment.dto';
import {
  AgentDetailDto,
  GeographicAssignmentDto,
  PaginatedAgentsDto,
} from './dto/agent-response.dto';

@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @RequirePermissions('agents.read')
  @ApiOperation({ summary: 'List agents with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedAgentsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: AgentQueryDto) {
    return this.agentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('agents.read')
  @ApiOperation({ summary: 'Get agent detail' })
  @ApiResponse({ status: 200, type: AgentDetailDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agentsService.findOne(id);
  }

  @Post()
  @RequirePermissions('agents.create')
  @ApiOperation({ summary: 'Create a new agent profile' })
  @ApiResponse({ status: 201, type: AgentDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid userId' })
  @ApiResponse({ status: 409, description: 'employeeCode or userId already in use' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreateAgentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('agents.update')
  @ApiOperation({ summary: 'Update agent (status, phone, employeeCode)' })
  @ApiResponse({ status: 200, type: AgentDetailDto })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'employeeCode already in use' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.update(id, dto, user.id);
  }

  @Post(':id/geographic-assignments')
  @RequirePermissions('agents.assign')
  @ApiOperation({ summary: 'Create a geographic assignment for an agent' })
  @ApiResponse({ status: 201, type: GeographicAssignmentDto })
  @ApiResponse({ status: 400, description: 'Invalid geo scope or missing/multiple geo fields' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'Agent inactive or duplicate active assignment' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  createGeographicAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAgentGeographicAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.createGeographicAssignment(id, dto, user.id);
  }

  @Patch(':id/geographic-assignments/:assignmentId')
  @RequirePermissions('agents.assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a geographic assignment (status, endsAt)' })
  @ApiResponse({ status: 200, type: GeographicAssignmentDto })
  @ApiResponse({ status: 404, description: 'Assignment not found for this agent' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  updateGeographicAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateAgentGeographicAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.updateGeographicAssignment(
      id,
      assignmentId,
      dto,
      user.id,
    );
  }
}
