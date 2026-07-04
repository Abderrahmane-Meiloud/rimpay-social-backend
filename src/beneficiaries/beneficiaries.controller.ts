import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { BeneficiaryQueryDto } from './dto/beneficiary-query.dto';
import {
  BeneficiaryDetailDto,
  BeneficiaryMutationResponseDto,
  PaginatedBeneficiariesDto,
} from './dto/beneficiary-response.dto';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  @Get()
  @RequirePermissions('beneficiaries.read')
  @ApiOperation({ summary: 'List beneficiaries with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedBeneficiariesDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: BeneficiaryQueryDto) {
    return this.beneficiariesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('beneficiaries.read')
  @ApiOperation({ summary: 'Get full beneficiary details' })
  @ApiResponse({ status: 200, type: BeneficiaryDetailDto })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.beneficiariesService.findOne(id);
  }

  @Post()
  @RequirePermissions('beneficiaries.create')
  @ApiOperation({ summary: 'Create a beneficiary' })
  @ApiResponse({ status: 201, type: BeneficiaryMutationResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error / invalid localityId' })
  @ApiResponse({ status: 409, description: 'registryCode already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreateBeneficiaryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.beneficiariesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('beneficiaries.update')
  @ApiOperation({ summary: 'Update a beneficiary' })
  @ApiResponse({ status: 200, type: BeneficiaryMutationResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error / invalid localityId' })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBeneficiaryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.beneficiariesService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('beneficiaries.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete (deactivate) a beneficiary' })
  @ApiResponse({ status: 200, description: 'Beneficiary deactivated' })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.beneficiariesService.remove(id, user.id);
  }
}
