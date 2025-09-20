import { Controller, Post, Get, Put, Body, Headers, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name?: string },
    @Req() req: Request
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    return this.authService.register(body, userAgent, ipAddress);
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: Request
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    return this.authService.login(body, userAgent, ipAddress);
  }

  @Post('logout')
  async logout(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return { success: true }; // Already logged out
    }

    await this.authService.logout(token);
    return { success: true };
  }

  @Post('logout-all')
  async logoutAll(@Req() req: Request) {
    const userId = req.userId;
    if (!userId || userId === 'anon') {
      return { success: true };
    }

    await this.authService.logoutAll(userId);
    return { success: true };
  }

  @Get('me')
  async getCurrentUser(@Req() req: Request) {
    const userId = req.userId;
    if (!userId || userId === 'anon') {
      return null;
    }

    return this.authService.getCurrentUser(userId);
  }

  @Put('me')
  async updateUser(
    @Body() body: { name?: string; email?: string },
    @Req() req: Request
  ) {
    const userId = req.userId;
    if (!userId || userId === 'anon') {
      throw new Error('Authentication required');
    }

    return this.authService.updateUser(userId, body);
  }

  @Post('validate')
  async validateSession(@Body() body: { token: string }) {
    return this.authService.validateSession(body.token);
  }
}