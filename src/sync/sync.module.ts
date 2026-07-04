import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AnomaliesModule } from '../anomalies/anomalies.module';

@Module({
  imports: [AnomaliesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
