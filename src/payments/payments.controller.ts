import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { PaymentsService } from './payments.service';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { ValidatePaymentDto } from './dto/validate-payment.dto';
import { ValidationResponseDto } from './dto/validation-response.dto';
import {
  PaginatedPaymentsDto,
  PaymentDetailDto,
} from './dto/payment-response.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'List payments with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedPaymentsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(
    @Query() query: PaymentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'Get payment detail' })
  @ApiResponse({ status: 200, type: PaymentDetailDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.findOne(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions('payments.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a payment (sets status CANCELLED)' })
  @ApiResponse({ status: 200, type: PaymentDetailDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({
    status: 409,
    description: 'Payment already paid / already cancelled / invalid transition',
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.cancel(id, dto, user);
  }

  @Post(':id/validate')
  @RequirePermissions('payments.validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate a payment in the field',
    description:
      'Confirms that a beneficiary has received a payment. ' +
      'The authenticated user must be the user linked to the agent (agent.userId === currentUser.id). ' +
      'Idempotent: repeating the same idempotencyKey returns the original result without creating duplicates.',
  })
  @ApiResponse({ status: 200, type: ValidationResponseDto })
  @ApiResponse({ status: 404, description: 'Payment / agent / device not found' })
  @ApiResponse({
    status: 409,
    description:
      'Payment already PAID / CANCELLED / invalid status / operation not open / beneficiary not included / agent/device not active',
  })
  @ApiForbiddenResponse({
    description:
      'Insufficient permissions, agent.userId mismatch, agent not assigned to operation, or device not owned by agent',
  })
  validatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.validatePayment(id, dto, user.id);
  }
}
