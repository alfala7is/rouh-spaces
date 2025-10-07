import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { CoordinationService } from './coordination.service';
import { MagicLinkGuard } from './guards/magic-link.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { EventsGateway } from '../events.gateway';
import { PrismaService } from '../../prisma.service';
import {
  CreateRunDto,
  CreateRunDtoSchema,
  AddParticipantDto,
  AddParticipantDtoSchema,
  AdvanceStateDto,
  AdvanceStateDtoSchema,
  GenerateLinkDto,
  GenerateLinkDtoSchema,
} from './dto/coordination.dto';

@Controller('coordination')
export class CoordinationController {
  constructor(
    private readonly coordinationService: CoordinationService,
    private readonly eventsGateway: EventsGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Post('runs')
  @UsePipes(new ZodValidationPipe(CreateRunDtoSchema))
  async createRun(@Body() dto: CreateRunDto, @Req() req: any) {
    const spaceId = req.spaceId;
    const userId = req.user?.id;

    if (!spaceId) {
      throw new HttpException('Space ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const run = await this.coordinationService.createRun({
        templateId: dto.templateId,
        spaceId,
        initiatorId: userId,
        participants: dto.participants,
        metadata: dto.metadata,
      });

      return {
        success: true,
        data: run,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to create coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs')
  async listRuns(@Req() req: any) {
    const spaceId = req.spaceId;

    if (!spaceId) {
      throw new HttpException('Space ID is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const runs = await this.coordinationService.getRunsBySpace(spaceId);

      return {
        success: true,
        data: runs,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to list coordination runs',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs/:id')
  async getRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId && !req.participant) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      return {
        success: true,
        data: run,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to get coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/start')
  async startRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const updatedRun = await this.coordinationService.startRun(runId);

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to start coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/pause')
  async pauseRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const updatedRun = await this.coordinationService.pauseRun(runId);

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to pause coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/resume')
  async resumeRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const updatedRun = await this.coordinationService.resumeRun(runId);

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to resume coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/cancel')
  async cancelRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const updatedRun = await this.coordinationService.cancelRun(runId);

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to cancel coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/complete')
  async completeRun(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const updatedRun = await this.coordinationService.completeRun(runId);

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to complete coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('runs/:id')
  async updateRunStatus(
    @Param('id') runId: string,
    @Body() dto: { status: 'active' | 'paused' | 'completed' | 'cancelled'; reason?: string },
    @Req() req: any,
  ) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      let updatedRun;
      switch (dto.status) {
        case 'active':
          updatedRun = await this.coordinationService.resumeRun(runId);
          break;
        case 'paused':
          updatedRun = await this.coordinationService.pauseRun(runId);
          break;
        case 'completed':
          updatedRun = await this.coordinationService.completeRun(runId);
          break;
        case 'cancelled':
          updatedRun = await this.coordinationService.cancelRun(runId);
          break;
        default:
          throw new HttpException(`Invalid status: ${dto.status}`, HttpStatus.BAD_REQUEST);
      }

      return {
        success: true,
        data: updatedRun,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to update run status',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/advance')
  async advanceState(
    @Param('id') runId: string,
    @Body(new ZodValidationPipe(AdvanceStateDtoSchema)) dto: AdvanceStateDto,
    @Req() req: any,
  ) {
    try {
      const participantId = req.participant?.id || dto.participantId;

      if (!participantId) {
        throw new HttpException('Participant ID is required', HttpStatus.BAD_REQUEST);
      }

      const newState = await this.coordinationService.advanceState({
        runId,
        participantId,
        targetStateId: dto.targetStateId,
        slotData: dto.slotData,
        metadata: dto.metadata,
      });

      return {
        success: true,
        data: newState,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to advance state',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/participants')
  async addParticipant(
    @Param('id') runId: string,
    @Body(new ZodValidationPipe(AddParticipantDtoSchema)) dto: AddParticipantDto,
    @Req() req: any,
  ) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const participant = await this.coordinationService.addParticipant({
        runId,
        userId: dto.userId,
        roleId: dto.roleId,
        metadata: dto.metadata,
      });

      return {
        success: true,
        data: participant,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to add participant',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/participants/by-email')
  async addParticipantByEmail(
    @Param('id') runId: string,
    @Body() dto: { email: string; role: string; name?: string },
    @Req() req: any,
  ) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.coordinationService.addParticipantByEmailAndRole(
        runId,
        dto.email,
        dto.role,
        dto.name,
      );

      return {
        success: true,
        data: {
          participant: result.participant,
          magicLink: result.magicLink,
        },
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to add participant by email',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs/:id/participants')
  async getParticipants(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId && !req.participant) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const participants = await this.coordinationService.getParticipants(runId);

      return {
        success: true,
        data: participants,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to get participants',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('runs/:runId/participants/:participantId')
  async removeParticipant(
    @Param('runId') runId: string,
    @Param('participantId') participantId: string,
    @Req() req: any,
  ) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      await this.coordinationService.removeParticipant(runId, participantId);

      return {
        success: true,
        message: 'Participant removed successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to remove participant',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('runs/:id/links')
  async generateMagicLinks(
    @Param('id') runId: string,
    @Body(new ZodValidationPipe(GenerateLinkDtoSchema)) dto: GenerateLinkDto,
    @Req() req: any,
  ) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const links = await this.coordinationService.generateMagicLinks({
        runId,
        roleId: dto.roleId,
        expiresIn: dto.expiresIn,
      });

      return {
        success: true,
        data: links,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to generate magic links',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('runs/:id/states')
  async getRunStates(@Param('id') runId: string, @Req() req: any) {
    try {
      const run = await this.coordinationService.getRunById(runId);

      if (run.spaceId !== req.spaceId && !req.participant) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const states = await this.coordinationService.getRunStates(runId);

      return {
        success: true,
        data: states,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to get run states',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/facilitator/message')
  async handleFacilitatorHttpMessage(
    @Body() messageData: any
  ) {
    const { runId, participantId, from, to, text, messageType, metadata } = messageData;

    console.log(`🎯 Facilitator message for run ${runId}: ${text?.substring(0, 50)}...`);

    // Save message to database
    const message = await this.prisma.runMessage.create({
      data: {
        runId,
        participantId: participantId || null,
        from: from || 'facilitator',
        to: to || null,
        text: text || '',
        messageType: messageType || 'message',
        metadata: metadata || null,
      },
    });

    console.log(`✅ Saved message ${message.id} to database`);

    return { success: true, messageId: message.id };
  }

  @Get('runs/:runId/messages')
  @UseGuards(MagicLinkGuard)
  async getMessages(
    @Param('runId') runId: string,
    @Req() req: any,
    @Query('since') since?: string,
    @Query('participantId') participantId?: string
  ) {
    const where: any = { runId };

    // Filter by participant if provided
    if (participantId) {
      // Get messages where:
      // 1. Sent TO this participant (to field matches)
      // 2. Sent BY this participant (participantId matches)
      // 3. Broadcast messages (to is null)
      where.OR = [
        { to: req.participant?.metadata?.name },
        { participantId },
        { to: null, from: 'facilitator' },
      ];
    }

    // Filter by timestamp if provided
    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const messages = await this.prisma.runMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100, // Limit to prevent overwhelming the client
    });

    return { messages };
  }

  @Post('/participant/message')
  async handleParticipantMessage(
    @Body() messageData: any
  ) {
    const { runId, participantId, text } = messageData;

    console.log(`💬 Participant message for run ${runId} from ${participantId}: ${text?.substring(0, 50)}...`);

    // Emit to run room (facilitator and other participants can receive)
    this.eventsGateway.emitToRun(runId, 'participant:message', messageData);
    console.log(`✅ Emitted participant message to Socket.IO room: run:${runId}`);

    return { success: true };
  }

  @Get('r/:runId')
  async accessRunViaMagicLink(
    @Param('runId') runId: string,
    @Query('token') token: string,
    @Query('role') role: string,
    @Req() req: any,
  ) {
    try {
      let participant: any;

      if (token) {
        participant = await this.coordinationService.validateMagicToken(runId, token);
        if (!participant) {
          throw new HttpException('Invalid or expired magic link', HttpStatus.UNAUTHORIZED);
        }
      } else if (role) {
        participant = await this.coordinationService.resolveMagicLinkRole(runId, role);
        if (!participant) {
          throw new HttpException('Invalid role or run ID', HttpStatus.UNAUTHORIZED);
        }
      } else {
        throw new HttpException('Token or role parameter required', HttpStatus.BAD_REQUEST);
      }

      const run = await this.coordinationService.getRunById(runId);

      return {
        success: true,
        data: {
          run,
          participant: {
            id: participant.id,
            roleId: participant.roleId,
            roleName: participant.role?.name,
            metadata: participant.metadata,
          },
          permissions: this.getParticipantPermissions(participant.roleId, run),
        },
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to access coordination run',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getParticipantPermissions(roleId: string, run: any): any {
    const basePermissions = {
      canView: true,
      canViewParticipants: true,
      canViewStates: true,
    };

    return {
      ...basePermissions,
      canAdvanceState: true,
      canProvideSlotData: true,
    };
  }
}