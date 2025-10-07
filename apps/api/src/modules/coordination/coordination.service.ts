import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EventsGateway } from '../events.gateway';
import { ActionsService } from '../actions/actions.service';
import { AuthService } from '../auth/auth.service';
import { CoordinationEngine } from './coordination.engine';
import * as crypto from 'crypto';
import {
  CoordinationRun,
  RunParticipant,
  RunState,
  CoordinationTemplate,
  TemplateState,
  TemplateRole,
  Prisma,
} from '@prisma/client';

type ParticipantWithRole = RunParticipant & {
  role: TemplateRole | null;
};

interface CreateRunParams {
  templateId: string;
  spaceId: string;
  initiatorId?: string;
  participants?: {
    userId?: string;
    roleId: string;
    metadata?: any;
  }[];
  metadata?: any;
}

interface AddParticipantParams {
  runId: string;
  userId?: string;
  roleId: string;
  metadata?: any;
}

interface AdvanceStateParams {
  runId: string;
  participantId: string;
  targetStateId?: string;
  slotData?: any;
  metadata?: any;
}

interface GenerateMagicLinkParams {
  runId: string;
  roleId?: string;
  expiresIn?: number;
}

@Injectable()
export class CoordinationService {
  private readonly logger = new Logger(CoordinationService.name);

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private actionsService: ActionsService,
    private authService: AuthService,
    private coordinationEngine: CoordinationEngine,
  ) {}

  async createRun(params: CreateRunParams): Promise<CoordinationRun> {
    const { templateId, spaceId, initiatorId, participants = [], metadata } = params;

    const template = await this.prisma.coordinationTemplate.findUnique({
      where: { id: templateId },
      include: {
        states: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return await this.prisma.$transaction(async (tx) => {
      const initialStateConfig = template.states[0];
      if (!initialStateConfig) {
        throw new BadRequestException('Template has no initial state');
      }

      const run = await tx.coordinationRun.create({
        data: {
          templateId,
          spaceId,
          initiatorId: initiatorId || '',
          status: 'active',
          currentStateId: initialStateConfig.id,
          metadata: metadata || {},
        },
      });

      const initialRunState = await tx.runState.create({
        data: {
          runId: run.id,
          stateId: initialStateConfig.id,
          slotData: {},
          metadata: {},
        },
      });

      const runParticipants = await Promise.all(
        participants.map(async (p) => {
          const magicToken = this.generateMagicToken();
          return await tx.runParticipant.create({
            data: {
              runId: run.id,
              userId: p.userId,
              roleId: p.roleId,
              magicToken,
              metadata: p.metadata || {},
            },
          });
        })
      );

      await this.actionsService.create(
        spaceId,
        initiatorId,
        {
          type: 'contact',
          parameters: {
            actionType: 'coordination.run.created',
            runId: run.id,
            templateId,
            participantCount: participants.length,
          },
          coordinationRunId: run.id,
        }
      );

      this.eventsGateway.emitToSpace(spaceId, 'coordination.run.created', {
        runId: run.id,
        templateId,
        participants: runParticipants.length,
      });

      return run;
    });
  }

  async startRun(runId: string): Promise<CoordinationRun> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: { currentState: true },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== 'active') {
      throw new BadRequestException(`Run is already ${run.status}`);
    }

    const updatedRun = await this.prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: 'active',
        startedAt: new Date(),
      },
    });

    await this.actionsService.create(
      run.spaceId,
      undefined,
      {
        type: 'contact',
        parameters: {
          actionType: 'coordination.run.started',
          runId,
        },
        coordinationRunId: runId,
      }
    );

    this.eventsGateway.emitToSpace(run.spaceId, 'coordination.run.started', { runId });
    this.emitToRun(runId, 'coordination.state.changed', {
      runId,
      status: 'active',
      currentState: run.currentState,
    });

    return updatedRun;
  }

  async pauseRun(runId: string): Promise<CoordinationRun> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== 'active') {
      throw new BadRequestException(`Run cannot be paused from ${run.status} state`);
    }

    const currentMetadata = run.metadata as any || {};
    const updatedRun = await this.prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: 'paused',
        metadata: {
          ...currentMetadata,
          pausedAt: new Date()
        }
      },
    });

    await this.actionsService.create(
      run.spaceId,
      undefined,
      {
        type: 'submit',
        parameters: {
          actionType: 'coordination.run.paused',
          runId,
        },
        coordinationRunId: runId,
      }
    );

    this.eventsGateway.emitToSpace(run.spaceId, 'coordination.run.paused', { runId });
    this.emitToRun(runId, 'coordination.run.paused', {
      runId,
      status: 'paused'
    });

    return updatedRun;
  }

  async resumeRun(runId: string): Promise<CoordinationRun> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== 'paused') {
      throw new BadRequestException(`Run cannot be resumed from ${run.status} state`);
    }

    const currentMetadata = run.metadata as any || {};
    const { pausedAt, ...restMetadata } = currentMetadata;

    const updatedRun = await this.prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: 'active',
        metadata: restMetadata
      },
    });

    await this.actionsService.create(
      run.spaceId,
      undefined,
      {
        type: 'submit',
        parameters: {
          actionType: 'coordination.run.resumed',
          runId,
        },
        coordinationRunId: runId,
      }
    );

    this.eventsGateway.emitToSpace(run.spaceId, 'coordination.run.resumed', { runId });
    this.emitToRun(runId, 'coordination.run.resumed', {
      runId,
      status: 'active'
    });

    return updatedRun;
  }

  async cancelRun(runId: string): Promise<CoordinationRun> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status === 'completed' || run.status === 'cancelled') {
      throw new BadRequestException(`Run is already ${run.status}`);
    }

    const updatedRun = await this.prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    await this.actionsService.create(
      run.spaceId,
      undefined,
      {
        type: 'contact',
        parameters: {
          actionType: 'coordination.run.cancelled',
          runId,
        },
        coordinationRunId: runId,
      }
    );

    this.emitToRun(runId, 'coordination.run.cancelled', { runId });

    return updatedRun;
  }

  async completeRun(runId: string): Promise<CoordinationRun> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    if (run.status !== 'active' && run.status !== 'paused') {
      throw new BadRequestException(`Run cannot be completed from ${run.status} state`);
    }

    const updatedRun = await this.prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    await this.actionsService.create(
      run.spaceId,
      undefined,
      {
        type: 'contact',
        parameters: {
          actionType: 'coordination.run.completed',
          runId,
        },
        coordinationRunId: runId,
      }
    );

    this.emitToRun(runId, 'coordination.run.completed', { runId });

    return updatedRun;
  }

  async addParticipant(params: AddParticipantParams): Promise<ParticipantWithRole> {
    const { runId, userId, roleId, metadata } = params;

    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const magicToken = this.generateMagicToken();

    const participant = await this.prisma.runParticipant.create({
      data: {
        runId,
        userId,
        roleId,
        magicToken,
        metadata: metadata || {},
      },
      include: { role: true }
    });

    await this.actionsService.create(
      run.spaceId,
      userId,
      {
        type: 'contact',
        parameters: {
          actionType: 'coordination.participant.added',
          runId,
          participantId: participant.id,
          roleId,
        },
        coordinationRunId: runId,
      }
    );

    this.emitToRun(runId, 'coordination.participant.added', {
      runId,
      participant,
    });

    return participant;
  }

  async removeParticipant(runId: string, participantId: string): Promise<void> {
    const participant = await this.prisma.runParticipant.findFirst({
      where: { id: participantId, runId },
      include: { run: true },
    });

    if (!participant) {
      throw new NotFoundException(`Participant ${participantId} not found in run ${runId}`);
    }

    await this.prisma.runParticipant.delete({
      where: { id: participantId },
    });

    await this.actionsService.create(
      participant.run.spaceId,
      undefined,
      {
        type: 'contact',
        parameters: {
          actionType: 'coordination.participant.removed',
          runId,
          participantId,
        },
        coordinationRunId: runId,
      }
    );

    this.emitToRun(runId, 'coordination.participant.removed', {
      runId,
      participantId,
    });
  }

  async advanceState(params: AdvanceStateParams): Promise<RunState> {
    const { runId, participantId, targetStateId, slotData, metadata } = params;

    return await this.prisma.$transaction(async (tx) => {
      const run = await tx.coordinationRun.findUnique({
        where: { id: runId },
        include: {
          currentState: true,
          template: {
            include: {
              states: { orderBy: { sequence: 'asc' } },
              roles: true
            }
          }
        },
      });

      if (!run) {
        throw new NotFoundException(`Run ${runId} not found`);
      }

      if (run.status !== 'active') {
        throw new BadRequestException(`Run is ${run.status}, cannot advance state`);
      }

      const participant = await tx.runParticipant.findFirst({
        where: { id: participantId, runId },
        include: { role: true }
      });

      if (!participant) {
        throw new NotFoundException(`Participant ${participantId} not found`);
      }

      if (!run.currentState) {
        throw new BadRequestException('Run has no current state');
      }

      const validationResult = await this.coordinationEngine.validateStateTransition({
        run: {
          ...run,
          currentState: run.currentState
        },
        participant,
        currentState: run.currentState,
        targetStateId,
        slotData,
      });

      if (!validationResult.isValid) {
        throw new BadRequestException(validationResult.error || 'Invalid state transition');
      }

      const nextState = validationResult.nextState;
      if (!nextState) {
        throw new BadRequestException('No valid next state found');
      }
      const newRunState = await tx.runState.create({
        data: {
          runId,
          stateId: nextState.id,
          slotData: slotData || {},
          metadata: metadata || {},
          actorId: participant.userId,
        },
      });

      await tx.coordinationRun.update({
        where: { id: runId },
        data: { currentStateId: nextState.id },
      });

      const previousRunState = await tx.runState.findFirst({
        where: {
          runId,
          stateId: run.currentStateId || '',
        },
      });

      if (previousRunState) {
        await tx.runState.update({
          where: { id: previousRunState.id },
          data: { exitedAt: new Date() },
        });
      }

      const action = await this.actionsService.create(
        run.spaceId,
        participant.userId || undefined,
        {
          type: 'submit',
          parameters: {
            actionType: 'coordination.state.advanced',
            runId,
            fromStateId: run.currentStateId,
            toStateId: nextState.id,
            participantId,
            roleId: participant.roleId,
            slotData,
          },
          coordinationRunId: runId,
        }
      );

      this.eventsGateway.emitToSpace(run.spaceId, 'coordination.state.changed', {
        runId,
        newState: nextState,
        action,
        participant: {
          id: participant.id,
          roleId: participant.roleId,
          roleName: participant.role?.name,
        },
      });

      this.emitToRun(runId, 'coordination.state.changed', {
        runId,
        previousStateId: run.currentStateId,
        currentStateId: nextState.id,
        participant: {
          id: participant.id,
          roleId: participant.roleId,
          roleName: participant.role?.name,
        },
      });

      return newRunState;
    });
  }

  async generateMagicLinks(params: GenerateMagicLinkParams): Promise<{ roleId: string; link: string }[]> {
    const { runId, roleId, expiresIn = 7 * 24 * 60 * 60 * 1000 } = params;

    const participants = await this.prisma.runParticipant.findMany({
      where: {
        runId,
        ...(roleId ? { roleId } : {}),
      },
      include: {
        role: true,
      },
    });

    const links = await Promise.all(
      participants.map(async (participant) => {
        const newToken = this.generateMagicToken();

        await this.prisma.runParticipant.update({
          where: { id: participant.id },
          data: {
            magicToken: newToken,
            lastActiveAt: new Date(),
          },
        });

        return {
          roleId: participant.roleId,
          link: `/r/${runId}?token=${newToken}`,
        };
      })
    );

    return links;
  }

  async resolveMagicLinkRole(runId: string, roleName: string): Promise<ParticipantWithRole | null> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: {
        template: {
          include: {
            roles: true,
          },
        },
      },
    });

    if (!run) {
      return null;
    }

    const role = run.template.roles.find(r => r.name === roleName);
    if (!role) {
      return null;
    }

    let participant = await this.prisma.runParticipant.findFirst({
      where: {
        runId,
        roleId: role.id,
      },
      include: { role: true }
    });

    if (!participant) {
      const magicToken = this.generateMagicToken();
      participant = await this.prisma.runParticipant.create({
        data: {
          runId,
          roleId: role.id,
          magicToken,
          metadata: {},
        },
        include: { role: true }
      });
    }

    await this.prisma.runParticipant.update({
      where: { id: participant.id },
      data: { lastActiveAt: new Date() },
    });

    return participant;
  }

  async validateMagicToken(runId: string, token: string): Promise<ParticipantWithRole | null> {
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
      data: { lastActiveAt: new Date() },
    });

    return participant;
  }

  async getRunById(runId: string): Promise<any> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: {
        currentState: true,
        template: {
          include: {
            states: true,
            roles: true,
          },
        },
        participants: {
          include: {
            role: true,
          },
        },
        states: {
          include: {
            state: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    return run;
  }

  async getRunsBySpace(spaceId: string): Promise<any[]> {
    return await this.prisma.coordinationRun.findMany({
      where: { spaceId },
      include: {
        currentState: true,
        template: true,
        participants: { include: { role: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // ============================================================================
  // SPACE INTEGRATION METHODS
  // ============================================================================

  /**
   * Creates a run from template with space context and streamlined participant setup
   */
  async createRunFromTemplate(
    spaceId: string,
    templateId: string,
    participants: Array<{ email: string; role: string; name?: string }>,
    metadata?: { name?: string; description?: string; [key: string]: any }
  ): Promise<{ run: CoordinationRun; participants: any[]; magicLinks: Record<string, string> }> {
    const template = await this.prisma.coordinationTemplate.findUnique({
      where: { id: templateId },
      include: {
        states: { orderBy: { sequence: 'asc' } },
        roles: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // Create the run
      const initialStateConfig = template.states[0];
      if (!initialStateConfig) {
        throw new BadRequestException('Template has no initial state');
      }

      const run = await tx.coordinationRun.create({
        data: {
          templateId,
          spaceId,
          initiatorId: '', // Will be set by the calling context
          status: 'active',
          currentStateId: initialStateConfig.id,
          metadata: {
            name: metadata?.name || `${template.name} - ${new Date().toLocaleDateString()}`,
            description: metadata?.description,
            ...metadata,
          },
        },
      });

      // Create initial run state
      await tx.runState.create({
        data: {
          runId: run.id,
          stateId: initialStateConfig.id,
          slotData: {},
          metadata: {},
        },
      });

      // Create participants with magic links
      const runParticipants = [];
      const magicLinks: Record<string, string> = {};

      for (const participantData of participants) {
        // Find the role by name
        const role = template.roles.find(r => r.name.toLowerCase() === participantData.role.toLowerCase());
        if (!role) {
          throw new BadRequestException(`Role ${participantData.role} not found in template`);
        }

        const magicToken = this.generateMagicToken();
        const participant = await tx.runParticipant.create({
          data: {
            runId: run.id,
            roleId: role.id,
            magicToken,
            metadata: {
              email: participantData.email,
              name: participantData.name,
            },
          },
          include: { role: true },
        });

        runParticipants.push(participant);
        magicLinks[participantData.email] = this.buildMagicLink(run.id, magicToken);
      }

      // Create action record
      await this.actionsService.create(
        spaceId,
        '', // initiatorId will be set by calling context
        {
          type: 'contact',
          parameters: {
            actionType: 'coordination.run.created',
            runId: run.id,
            templateId,
            templateName: template.name,
            participantCount: participants.length,
          },
          coordinationRunId: run.id,
        }
      );

      // Emit events
      this.eventsGateway.emitToSpace(spaceId, 'coordination.run.created', {
        runId: run.id,
        templateId,
        templateName: template.name,
        participants: runParticipants.length,
      });

      return { run, participants: runParticipants, magicLinks };
    });
  }

  /**
   * Gets active runs for a space with filtering options
   */
  async getActiveRunsForSpace(
    spaceId: string,
    filters?: {
      status?: 'active' | 'paused' | 'completed' | 'cancelled';
      templateId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<any[]> {
    const where: Prisma.CoordinationRunWhereInput = { spaceId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.templateId) {
      where.templateId = filters.templateId;
    }

    return await this.prisma.coordinationRun.findMany({
      where,
      include: {
        currentState: true,
        template: true,
        participants: {
          include: { role: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  }

  /**
   * Gets space coordination statistics
   */
  async getSpaceCoordinationStats(spaceId: string): Promise<{
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    averageCompletionTime: number;
    participantCount: number;
    templateUsage: Record<string, number>;
  }> {
    const [totalRuns, activeRuns, completedRuns, templateUsage] = await Promise.all([
      this.prisma.coordinationRun.count({ where: { spaceId } }),
      this.prisma.coordinationRun.count({ where: { spaceId, status: 'active' } }),
      this.prisma.coordinationRun.count({ where: { spaceId, status: 'completed' } }),
      this.prisma.coordinationRun.groupBy({
        by: ['templateId'],
        where: { spaceId },
        _count: { id: true },
      }),
    ]);

    const participantCount = await this.prisma.runParticipant.count({
      where: { run: { spaceId } },
    });

    // Calculate average completion time
    const completedRunsWithTimes = await this.prisma.coordinationRun.findMany({
      where: {
        spaceId,
        status: 'completed',
        completedAt: { not: null },
        startedAt: { not: null as any },
      },
      select: { startedAt: true, completedAt: true },
    });

    const averageCompletionTime = completedRunsWithTimes.length > 0
      ? completedRunsWithTimes.reduce((sum, run) => {
          const duration = new Date(run.completedAt!).getTime() - new Date(run.startedAt!).getTime();
          return sum + duration;
        }, 0) / completedRunsWithTimes.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    const templateUsageMap = templateUsage.reduce((acc, item) => {
      acc[item.templateId] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRuns,
      activeRuns,
      completedRuns,
      averageCompletionTime,
      participantCount,
      templateUsage: templateUsageMap,
    };
  }

  /**
   * Archives completed runs older than specified date
   */
  async archiveCompletedRuns(spaceId: string, olderThan?: Date): Promise<number> {
    const archiveDate = olderThan || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days

    const result = await this.prisma.coordinationRun.updateMany({
      where: {
        spaceId,
        status: 'completed',
        completedAt: { lt: archiveDate },
      },
      data: {
        metadata: {
          archived: true,
          archivedAt: new Date(),
        },
      },
    });

    this.logger.log(`Archived ${result.count} completed runs for space ${spaceId}`);
    return result.count;
  }

  /**
   * Invites space members to a coordination run
   */
  async inviteSpaceMembersToRun(
    runId: string,
    memberIds: string[],
    roleAssignments: Record<string, string>
  ): Promise<Array<{ participant: any; magicLink: string }>> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: { template: { include: { roles: true } } },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const results: Array<{ participant: any; magicLink: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const memberId of memberIds) {
        const roleId = roleAssignments[memberId];
        if (!roleId) continue;

        // Verify role exists in template
        const role = run.template.roles.find(r => r.id === roleId);
        if (!role) {
          throw new BadRequestException(`Role ${roleId} not found in template`);
        }

        const magicToken = this.generateMagicToken();
        const participant = await tx.runParticipant.create({
          data: {
            runId,
            userId: memberId,
            roleId,
            magicToken,
            metadata: {},
          },
          include: { role: true },
        });

        results.push({
          participant,
          magicLink: this.buildMagicLink(runId, magicToken),
        });
      }
    });

    // Emit event
    this.eventsGateway.emitToSpace(run.spaceId, 'coordination.participants.added', {
      runId,
      participantCount: results.length,
    });

    return results;
  }

  /**
   * Generates role links for a space coordination run
   */
  async generateRoleLinksForSpace(
    spaceId: string,
    runId: string,
    roles: string[],
    expiresIn?: number
  ): Promise<Record<string, string>> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId, spaceId },
      include: { participants: { include: { role: true } } },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found in space ${spaceId}`);
    }

    const links: Record<string, string> = {};

    for (const roleName of roles) {
      const participant = run.participants.find(p => p.role?.name === roleName);
      if (participant && participant.magicToken) {
        links[roleName] = this.buildMagicLink(runId, participant.magicToken);
      }
    }

    return links;
  }

  /**
   * Refreshes expired magic links for a run
   */
  async refreshExpiredLinks(runId: string): Promise<Array<{ participantId: string; magicLink: string }>> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const expiredParticipants = await this.prisma.runParticipant.findMany({
      where: {
        runId,
        OR: [
          { lastActiveAt: { lt: oneWeekAgo } },
          { magicToken: null },
        ],
      },
    });

    const results: Array<{ participantId: string; magicLink: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const participant of expiredParticipants) {
        const newToken = this.generateMagicToken();
        await tx.runParticipant.update({
          where: { id: participant.id },
          data: { magicToken: newToken },
        });

        results.push({
          participantId: participant.id,
          magicLink: this.buildMagicLink(runId, newToken),
        });
      }
    });

    this.logger.log(`Refreshed ${results.length} expired links for run ${runId}`);
    return results;
  }

  /**
   * Emits coordination events to a space
   */
  async emitToSpaceCoordination(spaceId: string, event: string, data: any): Promise<void> {
    this.eventsGateway.emitToSpace(spaceId, event, data);
  }

  /**
   * Subscribes a space to coordination events
   */
  async subscribeSpaceToCoordinationEvents(spaceId: string): Promise<void> {
    // This would be handled by the WebSocket gateway
    this.eventsGateway.emitToSpace(spaceId, 'coordination.subscription.active', {
      spaceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcasts run status changes to space
   */
  async broadcastRunStatusToSpace(spaceId: string, runId: string, status: string): Promise<void> {
    this.eventsGateway.emitToSpace(spaceId, 'coordination.run.status.changed', {
      runId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Maps space context to run data
   */
  mapSpaceContextToRun(spaceId: string, runData: any): any {
    return {
      ...runData,
      spaceContext: {
        spaceId,
        spaceName: runData.space?.name,
        permissions: runData.spacePermissions || {},
      },
    };
  }

  /**
   * Validates space permissions for coordination operations
   */
  async validateSpacePermissions(
    spaceId: string,
    userId: string,
    operation: string
  ): Promise<boolean> {
    // This would integrate with your space permission system
    // For now, return true for basic implementation
    return true;
  }

  /**
   * Gets space-specific coordination settings
   */
  async getSpaceCoordinationSettings(spaceId: string): Promise<{
    maxActiveRuns: number;
    defaultExpirationHours: number;
    allowGuestParticipants: boolean;
    autoArchiveDays: number;
  }> {
    // This could be stored in space metadata or a separate settings table
    return {
      maxActiveRuns: 10,
      defaultExpirationHours: 24,
      allowGuestParticipants: true,
      autoArchiveDays: 90,
    };
  }

  /**
   * Builds a magic link URL
   */
  private buildMagicLink(runId: string, magicToken: string): string {
    // This should match your frontend route structure
    return `${process.env.FRONTEND_URL || 'http://localhost:3000'}/r/${runId}?token=${magicToken}`;
  }

  async getParticipants(runId: string): Promise<ParticipantWithRole[]> {
    return await this.prisma.runParticipant.findMany({
      where: { runId },
      include: { role: true },
      orderBy: { joinedAt: 'asc' },
    }) as ParticipantWithRole[];
  }

  async getRunStates(runId: string): Promise<RunState[]> {
    return await this.prisma.runState.findMany({
      where: { runId },
      orderBy: { enteredAt: 'asc' },
    });
  }

  async cleanupExpiredTokens(): Promise<number> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.runParticipant.updateMany({
      where: {
        lastActiveAt: { lt: oneWeekAgo },
        magicToken: { not: null },
      },
      data: {
        magicToken: null,
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired magic tokens`);
    return result.count;
  }

  /**
   * Adds a participant by email and role name (for guest invitations)
   */
  async addParticipantByEmailAndRole(
    runId: string,
    email: string,
    roleName: string,
    name?: string
  ): Promise<{ participant: ParticipantWithRole; magicLink: string }> {
    const run = await this.prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: {
        template: {
          include: {
            roles: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    // Find the role by name
    const role = run.template.roles.find(r => r.name === roleName);
    if (!role) {
      throw new BadRequestException(`Role '${roleName}' not found in template`);
    }

    const magicToken = this.generateMagicToken();
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const participant = await this.prisma.runParticipant.create({
      data: {
        runId,
        roleId: role.id,
        magicToken,
        metadata: { email, name },
      },
      include: {
        role: true,
      },
    });

    const magicLink = `${baseUrl}/r/${runId}?token=${magicToken}`;

    this.emitToRun(runId, 'coordination.participant.added', {
      runId,
      participant: {
        id: participant.id,
        roleId: participant.roleId,
        roleName: participant.role?.name,
        email,
      },
    });

    return { participant, magicLink };
  }

  private generateMagicToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private emitToRun(runId: string, event: string, payload: any): void {
    this.eventsGateway.emitToRoom(`run:${runId}`, event, payload);
  }

  async emitToRole(runId: string, roleId: string, event: string, payload: any): Promise<void> {
    const participants = await this.prisma.runParticipant.findMany({
      where: { runId, roleId },
    });

    participants.forEach((participant) => {
      if (participant.userId) {
        this.eventsGateway.emitToUser(participant.userId, event, payload);
      }
    });
  }
}