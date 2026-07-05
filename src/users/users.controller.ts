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
import { UsersService } from './users.service';
import { CreateProgrammeUserDto } from './dto/create-programme-user.dto';
import { CreateOperatorUserDto } from './dto/create-operator-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateProgrammeScopesDto } from './dto/update-programme-scopes.dto';
import { UpdateOperatorScopeDto } from './dto/update-operator-scope.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { PaginatedUsersDto, UserDetailDto } from './dto/user-response.dto';

// Admin-only account management (INSTITUTIONAL-RBAC-3). There is
// deliberately no public/self registration endpoint anywhere in this
// controller — every account is created here, by an ADMIN_TAAZOUR caller,
// never by the account holder themselves.
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List web accounts (ADMIN_TAAZOUR, PROGRAMME, OPERATOR only — never AGENT)' })
  @ApiResponse({ status: 200, type: PaginatedUsersDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get a web account with its roles and scopes' })
  @ApiResponse({ status: 200, type: UserDetailDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOneWebUser(id);
  }

  @Post('programme')
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Create a PROGRAMME account scoped to one or more programmes (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 201, type: UserDetailDto })
  @ApiResponse({ status: 400, description: 'Validation error / unknown socialProgramId' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  createProgrammeUser(
    @Body() dto: CreateProgrammeUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.createProgrammeUser(dto, user.id);
  }

  @Post('operator')
  @RequirePermissions('users.create')
  @ApiOperation({ summary: 'Create an OPERATOR account linked to one ACTIVE operator (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 201, type: UserDetailDto })
  @ApiResponse({ status: 400, description: 'Validation error / unknown operatorId' })
  @ApiResponse({ status: 409, description: 'Email already in use, or operator is not ACTIVE' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  createOperatorUser(
    @Body() dto: CreateOperatorUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.createOperatorUser(dto, user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Activate, deactivate or suspend a web account (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 200, type: UserDetailDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateStatus(id, dto, user.id);
  }

  @Patch(':id/password')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Reset a web account password (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  updatePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updatePassword(id, dto, user.id);
  }

  @Patch(':id/programme-scopes')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Replace the programme scopes of a PROGRAMME account (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 200, type: UserDetailDto })
  @ApiResponse({ status: 400, description: 'Not a PROGRAMME account, or unknown socialProgramId' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  replaceProgrammeScopes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgrammeScopesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.replaceProgrammeScopes(id, dto, user.id);
  }

  @Patch(':id/operator-scope')
  @RequirePermissions('users.update')
  @ApiOperation({ summary: 'Change the linked operator of an OPERATOR account (ADMIN_TAAZOUR only)' })
  @ApiResponse({ status: 200, type: UserDetailDto })
  @ApiResponse({ status: 400, description: 'Not an OPERATOR account, or unknown operatorId' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Target operator is not ACTIVE' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  setOperatorScope(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatorScopeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.setOperatorScope(id, dto, user.id);
  }
}
