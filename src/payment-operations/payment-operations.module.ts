import { Module } from '@nestjs/common';
import { PaymentOperationsController } from './payment-operations.controller';
import { PaymentOperationsService } from './payment-operations.service';
import { OperatorsModule } from '../operators/operators.module';

@Module({
  imports: [OperatorsModule],
  controllers: [PaymentOperationsController],
  providers: [PaymentOperationsService],
})
export class PaymentOperationsModule {}
