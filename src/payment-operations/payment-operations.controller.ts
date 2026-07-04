import {
  Body,
  Controller,
  Delete,
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
import { PaymentOperationsService } from './payment-operations.service';
import { CreatePaymentOperationDto } from './dto/create-payment-operation.dto';
import { UpdatePaymentOperationDto } from './dto/update-payment-operation.dto';
import { PaymentOperationQueryDto } from './dto/payment-operation-query.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { AssignBeneficiariesDto } from './dto/assign-beneficiaries.dto';
import { AssignedBeneficiariesQueryDto } from './dto/assigned-beneficiaries-query.dto';
import {
  AssignOperationAgentsDto,
  OperationAgentAssignmentResponseDto,
} from './dto/assign-operation-agents.dto';
import {
  AssignmentResponseDto,
  OperationDetailDto,
  PaginatedOperationsDto,
} from './dto/payment-operation-response.dto';

@ApiTags('payment-operations')
@ApiBearerAuth()
@Controller('payment-operations')
export class PaymentOperationsController {
  constructor(
    private readonly paymentOperationsService: PaymentOperationsService,
  ) {}

  @Get()
  @RequirePermissions('operations.read')
  @ApiOperation({ summary: 'List payment operations with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedOperationsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: PaymentOperationQueryDto) {
    return this.paymentOperationsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('operations.read')
  @ApiOperation({ summary: 'Get payment operation detail' })
  @ApiResponse({ status: 200, type: OperationDetailDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentOperationsService.findOne(id);
  }

  @Post()
  @RequirePermissions('operations.create')
  @ApiOperation({ summary: 'Create a payment operation (starts as DRAFT)' })
  @ApiResponse({ status: 201, type: OperationDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid socialProgramId / geographic scope' })
  @ApiResponse({ status: 409, description: 'code already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreatePaymentOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('operations.update')
  @ApiOperation({
    summary: 'Update a payment operation (only while DRAFT or SUSPENDED)',
  })
  @ApiResponse({ status: 200, type: OperationDetailDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 409, description: 'Operation is not editable / invalid scope' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentOperationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.update(id, dto, user.id);
  }

  @Post(':id/transition')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition operation status through the lifecycle' })
  @ApiResponse({ status: 200, type: OperationDetailDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 409, description: 'Invalid status transition' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.transition(id, dto.targetStatus, user.id);
  }

  @Post(':id/open')
  @RequirePermissions('operations.open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a payment operation' })
  @ApiResponse({ status: 200, type: OperationDetailDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({
    status: 409,
    description: 'Invalid status transition / no assigned beneficiaries',
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  open(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.open(id, user.id);
  }

  @Post(':id/close')
  @RequirePermissions('operations.close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a payment operation' })
  @ApiResponse({ status: 200, type: OperationDetailDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 409, description: 'Invalid status transition' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.close(id, user.id);
  }

  @Get(':id/beneficiaries')
  @RequirePermissions('operations.read')
  @ApiOperation({ summary: 'List beneficiaries assigned to an operation' })
  @ApiResponse({ status: 200, description: 'Paginated assigned beneficiaries' })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  listAssignedBeneficiaries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AssignedBeneficiariesQueryDto,
  ) {
    return this.paymentOperationsService.listAssignedBeneficiaries(id, query);
  }

  @Post(':id/beneficiaries')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign beneficiaries to a payment operation' })
  @ApiResponse({ status: 200, type: AssignmentResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or soft-deleted beneficiary' })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 409, description: 'Operation not assignable in its status' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  assignBeneficiaries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignBeneficiariesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.assignBeneficiaries(id, dto, user.id);
  }

  @Delete(':id/beneficiaries/:beneficiaryId')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exclude a beneficiary from an operation (sets status EXCLUDED)',
  })
  @ApiResponse({ status: 200, description: 'Beneficiary excluded from operation' })
  @ApiResponse({ status: 404, description: 'Operation or assignment not found' })
  @ApiResponse({ status: 409, description: 'Operation not assignable in its status' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  excludeBeneficiary(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('beneficiaryId', ParseUUIDPipe) beneficiaryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.excludeBeneficiary(
      id,
      beneficiaryId,
      user.id,
    );
  }

  @Post(':id/beneficiaries/:beneficiaryId/reinclude')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-include an excluded beneficiary in an operation',
  })
  @ApiResponse({ status: 200, description: 'Beneficiary re-included' })
  @ApiResponse({ status: 404, description: 'Operation or assignment not found' })
  @ApiResponse({ status: 409, description: 'Not eligible for re-inclusion' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  reincludeBeneficiary(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('beneficiaryId', ParseUUIDPipe) beneficiaryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.reincludeBeneficiary(
      id,
      beneficiaryId,
      user.id,
    );
  }

  @Post(':id/agents')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign agents to a payment operation' })
  @ApiResponse({ status: 200, type: OperationAgentAssignmentResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or non-ACTIVE agent id(s)' })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({ status: 409, description: 'Operation not in assignable status' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  assignAgents(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOperationAgentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.assignAgents(id, dto, user.id);
  }

  @Delete(':id/agents/:agentId')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove an agent from an operation (sets status REMOVED)',
  })
  @ApiResponse({ status: 200, description: 'Agent removed from operation' })
  @ApiResponse({ status: 404, description: 'Operation or assignment not found' })
  @ApiResponse({ status: 409, description: 'Assignment already REMOVED' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  removeAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentOperationsService.removeAgent(id, agentId, user.id);
  }
}
