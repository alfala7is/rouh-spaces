import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SpaceIdMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Prefer header x-space-id; fallback to query
    const spaceId = (req.header('x-space-id') || (req.query['spaceId'] as string))?.toString();
    if (spaceId) req.spaceId = spaceId;

    // Try to authenticate using Authorization header (Bearer token)
    const authHeader = req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const session = await this.prisma.userSession.findUnique({
          where: { token },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                verified: true,
              },
            },
          },
        });

        if (session && session.expiresAt > new Date() && session.user.isActive) {
          req.userId = session.user.id;
          req.user = session.user;
          req.roles = [session.user.role];
          return next();
        } else if (session && session.expiresAt <= new Date()) {
          // Clean up expired session
          await this.prisma.userSession.delete({
            where: { id: session.id },
          }).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        // Invalid token, continue as anonymous
      }
    }

    // Fallback to header-based authentication (for development/testing)
    const userId = (req.header('x-user-id') || 'anon').toString();
    const roles = (req.header('x-roles') || '').toString().split(',').filter(Boolean);
    req.userId = userId;
    req.roles = roles.length ? roles : ['seeker'];
    next();
  }
}

