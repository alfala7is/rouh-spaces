import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { CoordinationService } from '../coordination.service';

@Injectable()
export class MagicLinkGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private coordinationService: CoordinationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const runId = request.params.runId;
    const token = request.query.token || request.headers['x-magic-token'];

    if (!runId || !token) {
      throw new UnauthorizedException('Magic link token required');
    }

    try {
      const participant = await this.validateAndResolveToken(runId, token);

      if (!participant) {
        throw new UnauthorizedException('Invalid or expired magic link');
      }

      const run = await this.prisma.coordinationRun.findUnique({
        where: { id: runId },
        include: { space: true },
      });

      if (!run) {
        throw new UnauthorizedException('Coordination run not found');
      }

      request.participant = {
        id: participant.id,
        runId: participant.runId,
        userId: participant.userId,
        roleId: participant.roleId,
        roleName: participant.role?.name,
        metadata: participant.metadata,
      };

      request.spaceId = run.spaceId;
      request.coordinationRun = run;

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to validate magic link');
    }
  }

  private async validateAndResolveToken(runId: string, token: string) {
    const participant = await this.prisma.runParticipant.findFirst({
      where: {
        runId,
        magicToken: token,
      },
      include: { role: true }
    });

    if (!participant) {
      return null;
    }

    await this.prisma.runParticipant.update({
      where: { id: participant.id },
      data: {
        lastActiveAt: new Date(),
      },
    });

    return participant;
  }
}