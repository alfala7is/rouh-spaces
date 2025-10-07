import { useEffect, useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_URL } from './api';

interface CoordinationSocketOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  maxReconnectionAttempts?: number;
}

interface CoordinationSocketEvents {
  'coordination.state.changed': (data: {
    runId: string;
    previousState: string;
    newState: string;
    data?: any;
    timestamp: string;
  }) => void;
  'coordination.participant.added': (data: {
    runId: string;
    participant: any;
    timestamp: string;
  }) => void;
  'coordination.participant.removed': (data: {
    runId: string;
    participantId: string;
    timestamp: string;
  }) => void;
  'coordination.message': (message: any) => void;
  'coordination.evidence.uploaded': (data: {
    runId: string;
    evidence: any;
    uploadedBy: string;
    timestamp: string;
  }) => void;
  'coordination.commitment.made': (data: {
    runId: string;
    commitment: any;
    madeBy: string;
    timestamp: string;
  }) => void;
  'coordination.completed': (data: {
    runId: string;
    completedBy: string;
    timestamp: string;
    rating?: number;
  }) => void;
  'coordination.error': (error: {
    runId: string;
    message: string;
    code?: string;
  }) => void;
}

/**
 * Custom hook for managing coordination WebSocket connections
 */
export function useCoordinationSocket(
  runId: string,
  options: CoordinationSocketOptions = {}
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const {
    autoConnect = true,
    reconnection = true,
    reconnectionDelay = 2000,
    maxReconnectionAttempts = 5
  } = options;

  useEffect(() => {
    if (!runId || !autoConnect) return;

    console.log('🔌 Initializing coordination socket for run:', runId);

    // Create socket connection
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection,
      reconnectionDelay,
      timeout: 10000,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('✅ Coordination socket connected');
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;

      // Join the coordination run room - pass participantId if available from URL
      const urlParams = new URLSearchParams(window.location.search);
      const role = urlParams.get('role');
      const token = urlParams.get('token');

      newSocket.emit('joinCoordinationRun', { runId, role, token });
      console.log('🏠 Joined coordination run room:', runId, 'as role:', role);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Coordination socket disconnected:', reason);
      setIsConnected(false);

      if (reason === 'io server disconnect') {
        // Server-initiated disconnect, attempt to reconnect
        console.log('🔄 Server disconnected, attempting to reconnect...');
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('🚫 Coordination socket connection error:', error);
      setConnectionError(`Connection failed: ${error.message}`);
      reconnectAttemptsRef.current++;

      if (reconnectAttemptsRef.current >= maxReconnectionAttempts) {
        console.error('🛑 Max reconnection attempts reached, giving up');
        setConnectionError('Unable to connect after multiple attempts');
        newSocket.disconnect();
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Coordination socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttemptsRef.current = 0;
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('🔄❌ Coordination socket reconnection failed:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('🔄🛑 Coordination socket reconnection failed permanently');
      setConnectionError('Failed to reconnect to server');
    });

    // Coordination-specific error handling
    newSocket.on('coordination.error', (error) => {
      console.error('🚨 Coordination error:', error);
      setConnectionError(`Coordination error: ${error.message}`);
    });

    // Listen for space-scoped coordination events as fallback
    newSocket.on('coordination.state.changed', (data) => {
      // Filter to only process events for this runId
      if (data.runId === runId) {
        console.log('📡 Received space-scoped state change:', data);
      }
    });

    newSocket.on('coordination.participant.added', (data) => {
      // Filter to only process events for this runId
      if (data.runId === runId) {
        console.log('📡 Received space-scoped participant added:', data);
      }
    });

    newSocket.on('coordination.participant.removed', (data) => {
      // Filter to only process events for this runId
      if (data.runId === runId) {
        console.log('📡 Received space-scoped participant removed:', data);
      }
    });

    setSocket(newSocket);

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up coordination socket');
      if (newSocket.connected) {
        newSocket.emit('leaveCoordinationRun', { runId });
      }
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setConnectionError(null);
    };
  }, [runId, autoConnect, reconnection, reconnectionDelay, maxReconnectionAttempts]);

  // Helper functions for emitting coordination events
  const emitCoordinationEvent = (event: string, data: any) => {
    if (!socket || !socket.connected) {
      console.warn('⚠️ Cannot emit event, socket not connected:', event);
      return false;
    }

    console.log('📤 Emitting coordination event:', event, data);
    socket.emit(event, { runId, ...data });
    return true;
  };

  const joinCoordinationRun = () => {
    return emitCoordinationEvent('joinCoordinationRun', {});
  };

  const leaveCoordinationRun = () => {
    return emitCoordinationEvent('leaveCoordinationRun', {});
  };

  const sendCoordinationMessage = (message: any) => {
    return emitCoordinationEvent('coordination.sendMessage', { message });
  };

  const advanceCoordinationState = (stateData: any) => {
    return emitCoordinationEvent('coordination.advanceState', { stateData });
  };

  const uploadCoordinationEvidence = (evidence: any) => {
    return emitCoordinationEvent('coordination.uploadEvidence', { evidence });
  };

  const makeCoordinationCommitment = (commitment: any) => {
    return emitCoordinationEvent('coordination.makeCommitment', { commitment });
  };

  const confirmCoordinationCompletion = (completion: any) => {
    return emitCoordinationEvent('coordination.confirmCompletion', { completion });
  };

  return {
    socket,
    isConnected,
    connectionError,
    // Helper functions
    emitCoordinationEvent,
    joinCoordinationRun,
    leaveCoordinationRun,
    sendCoordinationMessage,
    advanceCoordinationState,
    uploadCoordinationEvidence,
    makeCoordinationCommitment,
    confirmCoordinationCompletion,
  };
}

/**
 * Hook for listening to specific coordination events
 */
export function useCoordinationEventListener<T extends keyof CoordinationSocketEvents>(
  socket: Socket | null,
  event: T,
  handler: CoordinationSocketEvents[T]
) {
  useEffect(() => {
    if (!socket) return;

    console.log('👂 Setting up coordination event listener:', event);
    socket.on(event, handler as any);

    return () => {
      console.log('🔇 Removing coordination event listener:', event);
      socket.off(event, handler as any);
    };
  }, [socket, event, handler]);
}

/**
 * Utility function to create a coordination socket without the hook
 * Useful for one-off connections or server-side usage
 */
export function createCoordinationSocket(
  runId: string,
  options: CoordinationSocketOptions = {}
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      ...options,
    });

    socket.on('connect', () => {
      console.log('✅ Coordination socket connected (standalone)');
      socket.emit('joinCoordinationRun', { runId });
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error('🚫 Coordination socket connection error (standalone):', error);
      reject(error);
    });

    // Set timeout for connection
    setTimeout(() => {
      if (!socket.connected) {
        socket.disconnect();
        reject(new Error('Connection timeout'));
      }
    }, 10000);
  });
}

/**
 * Utility to emit coordination events with error handling
 */
export function emitCoordinationEventSafely(
  socket: Socket | null,
  event: string,
  data: any,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      reject(new Error(`Event ${event} timed out after ${timeout}ms`));
    }, timeout);

    // Emit with acknowledgment
    socket.emit(event, data, (response: any) => {
      clearTimeout(timeoutId);

      if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Types for coordination socket events
 */
export type { CoordinationSocketEvents, CoordinationSocketOptions };