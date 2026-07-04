import {
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
import { PaginatedPaymentsDto } from './dto/payment-response.dto';
import { GeneratePaymentsResponseDto } from './dto/generate-payments-response.dto';

// Payment routes nested under a payment operation. Lives in the Payments
// module and delegates to PaymentsService.
@ApiTags('payments')
@ApiBearerAuth()
@Controller('payment-operations/:id/payments')
export class PaymentOperationPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'List payments for one payment operation' })
  @ApiResponse({ status: 200, type: PaginatedPaymentsDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAllForOperation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.findAllForOperation(id, query);
  }

  @Post('generate')
  @RequirePermissions('operations.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Generate planned PENDING payments for all INCLUDED beneficiaries of an operation',
  })
  @ApiResponse({ status: 201, type: GeneratePaymentsResponseDto })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  @ApiResponse({
    status: 409,
    description: 'Invalid operation status / no INCLUDED beneficiaries',
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.generate(id, user.id);
  }
}
