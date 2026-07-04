import {
  Body,
  Controller,
  Get,
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
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { ProgramQueryDto } from './dto/program-query.dto';
import {
  PaginatedProgramsDto,
  ProgramDetailDto,
} from './dto/program-response.dto';

@ApiTags('programs')
@ApiBearerAuth()
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  @RequirePermissions('programs.read')
  @ApiOperation({ summary: 'List social programs with pagination and filters' })
  @ApiResponse({ status: 200, type: PaginatedProgramsDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: ProgramQueryDto) {
    return this.programsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('programs.read')
  @ApiOperation({ summary: 'Get program detail with operations summary' })
  @ApiResponse({ status: 200, type: ProgramDetailDto })
  @ApiResponse({ status: 404, description: 'Program not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.programsService.findOne(id);
  }

  @Post()
  @RequirePermissions('programs.create')
  @ApiOperation({ summary: 'Create a social program' })
  @ApiResponse({ status: 201, type: ProgramDetailDto })
  @ApiResponse({ status: 409, description: 'code already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  create(
    @Body() dto: CreateProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('programs.update')
  @ApiOperation({ summary: 'Update a social program (code is immutable)' })
  @ApiResponse({ status: 200, type: ProgramDetailDto })
  @ApiResponse({ status: 404, description: 'Program not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programsService.update(id, dto, user.id);
  }
}
