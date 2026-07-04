import { ApiProperty } from '@nestjs/swagger';

export class GeneratePaymentsResponseDto {
  @ApiProperty()
  paymentOperationId: string;

  @ApiProperty({
    example: 120,
    description: 'Total INCLUDED assignments found for the operation.',
  })
  totalIncludedAssignments: number;

  @ApiProperty({
    example: 118,
    description: 'Number of new Payment records created in this run.',
  })
  created: number;

  @ApiProperty({
    example: 2,
    description:
      'Assignments whose Payment already existed (idempotent skip / unique-constraint hit).',
  })
  skippedExisting: number;

  @ApiProperty({
    example: 0,
    description:
      'INCLUDED assignments skipped because neither the assignment nor the ' +
      'operation provided a planned amount. No Payment is created with a ' +
      'null/zero/invented amount.',
  })
  skippedMissingAmount: number;
}
