import { Module } from '@nestjs/common';
import { AnomaliesController } from './anomalies.controller';
import { AnomaliesService } from './anomalies.service';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Module({
  controllers: [AnomaliesController],
  providers: [AnomaliesService, AnomalyDetectionService],
  exports: [AnomalyDetectionService],
})
export class AnomaliesModule {}
