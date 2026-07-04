import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  reportType: string;

  @ApiProperty()
  format: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  generatedAt: Date | null;

  @ApiPropertyOptional()
  generatedBy: { id: string; fullName: string } | null;

  @ApiProperty()
  createdAt: Date;
}

export class ReportDetailDto extends ReportListItemDto {
  @ApiPropertyOptional()
  filters: unknown;

  @ApiPropertyOptional()
  filePath: string | null;
}

export class ReportCatalogItemDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: ['AVAILABLE', 'PLANNED'] })
  status: string;

  @ApiProperty()
  requiredPermission: string;
}
