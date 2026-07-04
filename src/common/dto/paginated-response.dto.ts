import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 7 })
  totalPages: number;
}

export class PaginatedResponseDto<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponseDto<T> {
  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
