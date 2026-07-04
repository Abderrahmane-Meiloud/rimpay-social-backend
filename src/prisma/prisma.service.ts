import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private shutdownPromise: Promise<void> | null = null;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy() {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    this.shutdownPromise = this.shutdown();
    return this.shutdownPromise;
  }

  private async shutdown(): Promise<void> {
    let disconnectError: unknown = null;
    try {
      await this.$disconnect();
    } catch (error) {
      disconnectError = error;
      this.logger.error('Prisma disconnect failed', error);
    } finally {
      try {
        await this.pool.end();
      } catch (poolError) {
        this.logger.error('Pool shutdown failed', poolError);
        if (!disconnectError) {
          disconnectError = poolError;
        }
      }
    }
    this.logger.log('Disconnected from the database');
    if (disconnectError) {
      throw disconnectError;
    }
  }
}
