import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentOperationPaymentsController } from './payment-operation-payments.controller';
import { PaymentsService } from './payments.service';
import { AnomaliesModule } from '../anomalies/anomalies.module';

@Module({
  imports: [AnomaliesModule],
  controllers: [PaymentsController, PaymentOperationPaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
