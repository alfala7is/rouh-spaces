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

    // Check for magic link token first (for coordination participants)
    const magicToken = (req.query.token as string) || req.header('x-magic-token');
    if (magicToken) {
      try {
        // Extract runId from path - supports /r/:runId and /coordination/runs/:runId patterns
        const runIdMatch = req.path.match(/\/r\/([a-f0-9-]+)/) || req.path.match(/\/runs\/([a-f0-9-]+)/);
        if (runIdMatch) {
          const runId = runIdMatch[1];
          const participant = await this.prisma.runParticipant.findFirst({
            where: {
              runId,
              magicToken: magicToken,
            },
            include: {
              run: {
                select: {
                  spaceId: true,
                },
              },
              role: true,
            },
          });

          if (participant) {
            // Update last active time
            await this.prisma.runParticipant.update({
              where: { id: participant.id },
              data: { lastActiveAt: new Date() },
            }).catch(() => {}); // Ignore errors

            // Set participant context
            req.participant = {
              id: participant.id,
              runId: participant.runId,
              userId: participant.userId || undefined,
              roleId: participant.roleId,
              metadata: participant.metadata,
            };

            // Set space ID from the run
            if (!req.spaceId && participant.run) {
              req.spaceId = participant.run.spaceId;
            }

            // If participant has a userId, set user context
            if (participant.userId) {
              const user = await this.prisma.user.findUnique({
                where: { id: participant.userId },
                select: {
                  id: true,
                  email: true,
                  name: true,
                  role: true,
                  isActive: true,
                  verified: true,
                },
              });

              if (user) {
                req.userId = user.id;
                req.user = user;
                req.roles = [user.role];
              }
            }

            return next();
          }
        }

        // Clean up old inactive magic tokens periodically
        if (Math.random() < 0.01) { // 1% chance to clean up
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          await this.prisma.runParticipant.updateMany({
            where: {
              lastActiveAt: { lt: oneWeekAgo },
              magicToken: { not: null },
            },
            data: {
              magicToken: null,
            },
          }).catch(() => {}); // Ignore errors
        }
      } catch (error) {
        // Invalid magic token, continue with other auth methods
      }
    }

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

