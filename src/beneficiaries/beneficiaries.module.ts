import { Module } from '@nestjs/common';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { AnomaliesModule } from '../anomalies/anomalies.module';

@Module({
  imports: [AnomaliesModule],
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
})
export class BeneficiariesModule {}
