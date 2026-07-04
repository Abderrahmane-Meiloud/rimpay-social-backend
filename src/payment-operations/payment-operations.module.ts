import { Module } from '@nestjs/common';
import { PaymentOperationsController } from './payment-operations.controller';
import { PaymentOperationsService } from './payment-operations.service';

@Module({
  controllers: [PaymentOperationsController],
  providers: [PaymentOperationsService],
})
export class PaymentOperationsModule {}
