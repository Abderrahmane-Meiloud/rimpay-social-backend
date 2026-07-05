import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { OperatorsModule } from '../operators/operators.module';

@Module({
  imports: [OperatorsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
