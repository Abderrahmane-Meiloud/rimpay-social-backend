import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SocialProgramStatus } from '../../../generated/prisma/client';

export class ProgramListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'PNS-2026' })
  code: string;

  @ApiProperty({ example: 'Programme National de Solidarité' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  type?: string | null;

  @ApiProperty({ enum: SocialProgramStatus })
  status: SocialProgramStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate: Date | null;

  @ApiPropertyOptional({ nullable: true })
  endDate: Date | null;

  @ApiProperty({ example: 3 })
  operationsCount: number;
}

export class OperationsStatusSummaryDto {
  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({
    description: 'Operation counts keyed by operation status.',
    example: { DRAFT: 2, OPEN: 1, CLOSED: 2 },
  })
  byStatus: Record<string, number>;
}

export class ProgramDetailDto extends ProgramListItemDto {
  @ApiPropertyOptional({ nullable: true })
  institution?: string | null;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '15000000.00' })
  budgetAmount: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: OperationsStatusSummaryDto })
  operationsSummary: OperationsStatusSummaryDto;
}

export class PaginatedProgramsDto {
  @ApiProperty({ type: [ProgramListItemDto] })
  data: ProgramListItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
