import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PaymentSummaryExportService } from './payment-summary-export.service';

@Module({
  imports: [DashboardModule],
  controllers: [ReportsController],
  providers: [ReportsService, PaymentSummaryExportService],
})
export class ReportsModule {}
