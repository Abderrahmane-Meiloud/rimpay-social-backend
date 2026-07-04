import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthThrottleGuard } from './guards/auth-throttle.guard';
import type { AuthenticatedUser } from './types/authenticated-user.interface';

const REFRESH_COOKIE = 'rid';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function isSecure(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const { response, rawRefreshToken } = await this.authService.login(
      loginDto,
      meta,
    );
    res.cookie(REFRESH_COOKIE, rawRefreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      secure: isSecure(req),
    });
    return response;
  }

  @Public()
  @Post('refresh')
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many refresh attempts' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refresh(rawToken);
    if (!result) {
      res.clearCookie(REFRESH_COOKIE, { ...REFRESH_COOKIE_OPTIONS, secure: isSecure(req) });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    res.cookie(REFRESH_COOKIE, result.newRawRefreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      secure: isSecure(req),
    });
    return { accessToken: result.accessToken };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user with roles and permissions', type: MeResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  me(@CurrentUser() user: AuthenticatedUser): MeResponseDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
      },
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out and revoke current session' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logout(user.sessionId, user.id);
    res.clearCookie(REFRESH_COOKIE, { ...REFRESH_COOKIE_OPTIONS, secure: isSecure(req) });
    return { message: 'Logged out' };
  }
}
