import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogActorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;
}

export class AuditLogListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  entityType: string;

  @ApiPropertyOptional()
  entityId: string | null;

  @ApiPropertyOptional()
  source: string;

  @ApiPropertyOptional({ type: AuditLogActorDto })
  actor: AuditLogActorDto | null;

  @ApiPropertyOptional()
  ipAddress: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class AuditLogDetailDto extends AuditLogListItemDto {
  @ApiPropertyOptional()
  oldValues: unknown;

  @ApiPropertyOptional()
  newValues: unknown;

  @ApiPropertyOptional()
  deviceId: string | null;
}
