import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server!: Server;

  // Store recent messages per run (last 50 messages, kept for 1 hour)
  private runMessages = new Map<string, Array<{event: string, payload: any, timestamp: number}>>();
  private readonly MAX_MESSAGES_PER_RUN = 50;
  private readonly MESSAGE_TTL = 60 * 60 * 1000; // 1 hour

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  emitToSpace(spaceId: string, event: string, payload: any) {
    this.broadcast(event, { spaceId, ...payload });
  }

  emitToRoom(roomId: string, event: string, payload: any) {
    this.server.to(roomId).emit(event, payload);
  }

  emitToRun(runId: string, event: string, payload: any) {
    // Store message for late joiners
    this.storeRunMessage(runId, event, payload);

    // Emit to room
    this.emitToRoom(`run:${runId}`, event, payload);
  }

  private storeRunMessage(runId: string, event: string, payload: any) {
    if (!this.runMessages.has(runId)) {
      this.runMessages.set(runId, []);
    }

    const messages = this.runMessages.get(runId)!;
    messages.push({ event, payload, timestamp: Date.now() });

    // Keep only last N messages
    if (messages.length > this.MAX_MESSAGES_PER_RUN) {
      messages.shift();
    }

    // Clean up old messages
    this.cleanupOldMessages(runId);
  }

  private cleanupOldMessages(runId: string) {
    const messages = this.runMessages.get(runId);
    if (!messages) return;

    const now = Date.now();
    const filtered = messages.filter(m => now - m.timestamp < this.MESSAGE_TTL);

    if (filtered.length === 0) {
      this.runMessages.delete(runId);
    } else {
      this.runMessages.set(runId, filtered);
    }
  }

  private replayRunMessages(clientId: string, runId: string, participantFilter?: string | null) {
    const messages = this.runMessages.get(runId);
    if (!messages || messages.length === 0) {
      console.log(`No messages to replay for run ${runId}`);
      return;
    }

    // Filter messages by participant if filter is provided
    const filteredMessages = participantFilter
      ? messages.filter(({ payload }) => {
          // Check if message is targeted to this participant by participantId or name
          const targetParticipantId = payload?.participantId;
          const targetName = payload?.to?.toLowerCase();

          // Match by participantId directly OR if message is for everyone (no target)
          if (targetParticipantId === participantFilter || !targetParticipantId) {
            return true;
          }

          // Fallback: match by name (Emma/Jake)
          // Extract 'a' or 'b' from 'participant_a' and match with name
          const participantLetter = participantFilter.split('_').pop(); // 'a' or 'b'
          if (participantLetter === 'a' && targetName?.includes('emma')) {
            return true;
          }
          if (participantLetter === 'b' && targetName?.includes('jake')) {
            return true;
          }

          return false;
        })
      : messages;

    if (filteredMessages.length === 0) {
      console.log(`No messages to replay for participant ${participantFilter} in run ${runId}`);
      return;
    }

    console.log(`📼 Replaying ${filteredMessages.length} messages to client ${clientId} for run ${runId} (participant: ${participantFilter || 'all'})`);

    // Send filtered messages to this specific client
    const clientSocket = this.server.sockets.sockets.get(clientId);
    if (clientSocket) {
      filteredMessages.forEach(({ event, payload }) => {
        clientSocket.emit(event, payload);
      });
    }
  }

  emitToRole(runId: string, roleName: string, event: string, payload: any) {
    this.emitToRoom(`run:${runId}:role:${roleName}`, event, payload);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.emitToRoom(`user:${userId}`, event, payload);
  }

  joinRoom(socketId: string, roomId: string) {
    this.server.in(socketId).socketsJoin(roomId);
  }

  leaveRoom(socketId: string, roomId: string) {
    this.server.in(socketId).socketsLeave(roomId);
  }

  joinRunRoom(socketId: string, runId: string) {
    this.joinRoom(socketId, `run:${runId}`);
  }

  joinRoleRoom(socketId: string, runId: string, roleName: string) {
    this.joinRoom(socketId, `run:${runId}:role:${roleName}`);
  }

  leaveRunRoom(socketId: string, runId: string) {
    this.leaveRoom(socketId, `run:${runId}`);
  }

  leaveRoleRoom(socketId: string, runId: string, roleName: string) {
    this.leaveRoom(socketId, `run:${runId}:role:${roleName}`);
  }

  @SubscribeMessage('joinCoordinationRun')
  async handleJoinCoordinationRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string; role?: string; token?: string }
  ) {
    const { runId, role, token } = data;
    console.log(`Socket ${client.id} joining coordination run: ${runId}, role: ${role}`);
    this.joinRunRoom(client.id, runId);

    // Determine participantId from role or token
    let participantId: string | null = null;
    if (role) {
      participantId = `participant_${role.split('_').pop()}`; // Extract 'a' or 'b' from 'participant_a'
    }

    // Replay missed messages to this client (filtered by participant)
    setTimeout(() => {
      this.replayRunMessages(client.id, runId, participantId);
    }, 100);

    // Acknowledge the join
    client.emit('joinedCoordinationRun', { runId, success: true });
  }

  @SubscribeMessage('leaveCoordinationRun')
  handleLeaveCoordinationRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string }
  ) {
    const { runId } = data;
    console.log(`Socket ${client.id} leaving coordination run: ${runId}`);
    this.leaveRunRoom(client.id, runId);

    // Acknowledge the leave
    client.emit('leftCoordinationRun', { runId, success: true });
  }

  @SubscribeMessage('facilitator:message')
  handleFacilitatorMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string; [key: string]: any }
  ) {
    const { runId } = data;
    console.log(`🎯 Facilitator message received! runId: ${runId}, keys: ${Object.keys(data).join(', ')}`);

    // Emit to all participants in the run room
    this.emitToRun(runId, 'facilitator:message', data);
    console.log(`✅ Emitted to room: run:${runId}`);
  }

  afterInit(server: Server) {
    console.log('🎯 Socket.IO Gateway initialized');

    // Listen to ALL events for debugging
    server.on('connection', (socket) => {
      console.log(`🔌 New connection: ${socket.id}`);

      // Log all incoming events
      socket.onAny((event, ...args) => {
        console.log(`📨 Event received: ${event}`, JSON.stringify(args).substring(0, 200));
      });
    });
  }

  handleConnection(client: Socket) {
    console.log(`🔌 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔌 Client disconnected: ${client.id}`);
  }
}

