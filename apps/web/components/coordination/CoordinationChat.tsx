"use client";
import React, { useState, useEffect, useRef } from 'react';
import { StateProgressBar } from './StateProgressBar';
import { ParticipantList } from './ParticipantList';
import { CoordinationMessage } from './CoordinationMessage';
import { Button, Input, Card } from '@rouh/ui';
import { useCoordinationSocket } from '../../lib/coordination-socket';
import { getCoordinationStateHistory, sendParticipantMessage, mapStateToEnumPublic } from '../../lib/coordination-api';
import type { CoordinationRunDto, ParticipantContextDto, CoordinationMessageDto } from '../../types/coordination';

interface CoordinationChatProps {
  runData: CoordinationRunDto;
  participantContext: ParticipantContextDto | null;
  magicToken?: string;
}

type CoordinationState = 'Express_Need' | 'Explore_Options' | 'Commit' | 'Evidence' | 'Confirm';

export function CoordinationChat({ runData, participantContext, magicToken }: CoordinationChatProps) {
  const [messages, setMessages] = useState<CoordinationMessageDto[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentState, setCurrentState] = useState<CoordinationState>(runData.currentState as CoordinationState);
  const [participants, setParticipants] = useState(runData.participants || []);
  const [isLoading, setIsLoading] = useState(true);
  const [lastMessageCheck, setLastMessageCheck] = useState<string>(new Date().toISOString());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize WebSocket connection
  const { socket, isConnected } = useCoordinationSocket(runData.id);

  // Load initial state history as messages
  useEffect(() => {
    // Skip loading state history for now - just set loading to false
    setIsLoading(false);
    setMessages([{
      id: `welcome-${Date.now()}`,
      content: 'Welcome to the session! The facilitator will guide you through the conversation.',
      messageType: 'system',
      timestamp: new Date().toISOString(),
      sender: null,
      runId: runData.id,
      metadata: {}
    }]);
  }, [runData.id]);

  // HTTP Polling for messages
  useEffect(() => {
    if (!magicToken && !participantContext) return;

    const fetchMessages = async () => {
      try {
        const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/coordination/runs/${runData.id}/messages`);
        if (lastMessageCheck) {
          url.searchParams.append('since', lastMessageCheck);
        }
        if (participantContext) {
          url.searchParams.append('participantId', participantContext.id);
        }

        const response = await fetch(url.toString(), {
          headers: magicToken ? { 'x-magic-token': magicToken } : {}
        });

        if (!response.ok) {
          console.error('Failed to fetch messages:', response.statusText);
          return;
        }

        const data = await response.json();
        const newMessages = data.messages || [];

        if (newMessages.length > 0) {
          // Convert RunMessage to CoordinationMessageDto
          const convertedMessages = newMessages.map((msg: any) => ({
            id: msg.id,
            runId: msg.runId,
            content: msg.text,
            messageType: msg.from === 'facilitator' ? 'system' : 'message',
            timestamp: msg.createdAt,
            sender: msg.from === 'facilitator' ? { id: 'facilitator', name: 'Facilitator' } : null,
            metadata: msg.metadata || {}
          }));

          setMessages(prev => [...prev, ...convertedMessages]);

          // Update last check time to latest message timestamp
          const latestTimestamp = newMessages[newMessages.length - 1].createdAt;
          setLastMessageCheck(latestTimestamp);
        }
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    };

    // Poll immediately
    fetchMessages();

    // Then poll every 3 seconds
    const interval = setInterval(fetchMessages, 3000);

    return () => clearInterval(interval);
  }, [runData.id, magicToken, participantContext, lastMessageCheck]);

  // Handle real-time coordination events
  useEffect(() => {
    if (!socket) return;

    const handleStateChanged = (data: any) => {
      console.log('Coordination state changed:', data);

      // Convert whatever arrives (ID or object) into the enum before calling setCurrentState
      const rawCurrentState = data.currentStateId || data.newState?.id || data.newState;
      const currentStateEnum = mapStateToEnumPublic(rawCurrentState);
      setCurrentState(currentStateEnum);

      // Convert previous state as well for display
      const rawPreviousState = data.previousStateId || data.previousState;
      const previousStateEnum = rawPreviousState ? mapStateToEnumPublic(rawPreviousState) : null;

      // Format enum to human-friendly labels for display
      const formatStateLabel = (state: string) => state.replace('_', ' ');

      // Add state transition message with human-friendly labels
      const stateMessage: CoordinationMessageDto = {
        id: `state-transition-${Date.now()}`,
        content: previousStateEnum
          ? `State transitioned from ${formatStateLabel(previousStateEnum)} to ${formatStateLabel(currentStateEnum)}`
          : `State set to ${formatStateLabel(currentStateEnum)}`,
        messageType: 'state_transition',
        timestamp: new Date().toISOString(),
        sender: null,
        runId: runData.id,
        metadata: {
          previousState: previousStateEnum,
          newState: currentStateEnum,
          transitionData: data.data
        }
      };
      setMessages(prev => [...prev, stateMessage]);
    };

    const handleParticipantJoined = (data: any) => {
      console.log('Participant joined:', data);
      setParticipants(prev => [...prev, data.participant]);

      // Add participant joined message
      const joinMessage: CoordinationMessageDto = {
        id: `participant-joined-${Date.now()}`,
        content: `${data.participant.email || 'A participant'} joined as ${data.participant.role}`,
        messageType: 'system',
        timestamp: new Date().toISOString(),
        sender: null,
        runId: runData.id,
        metadata: { participant: data.participant }
      };
      setMessages(prev => [...prev, joinMessage]);
    };

    const handleParticipantLeft = (data: any) => {
      console.log('Participant left:', data);
      setParticipants(prev => prev.filter(p => p.id !== data.participantId));

      // Add participant left message
      const leftMessage: CoordinationMessageDto = {
        id: `participant-left-${Date.now()}`,
        content: `A participant left the coordination`,
        messageType: 'system',
        timestamp: new Date().toISOString(),
        sender: null,
        runId: runData.id,
        metadata: { participantId: data.participantId }
      };
      setMessages(prev => [...prev, leftMessage]);
    };

    const handleNewMessage = (message: CoordinationMessageDto) => {
      console.log('New coordination message:', message);
      setMessages(prev => [...prev, message]);
    };

    const handleFacilitatorMessage = (data: any) => {
      console.log('Facilitator message received:', data);

      // Convert facilitator message to CoordinationMessageDto
      const message: CoordinationMessageDto = {
        id: `facilitator-${Date.now()}`,
        runId: data.runId,
        content: data.text || data.content || '',
        messageType: data.type === 'info' ? 'system' : 'message',
        timestamp: data.timestamp || new Date().toISOString(),
        sender: { id: 'facilitator', name: 'Facilitator' },
        metadata: data
      };

      setMessages(prev => [...prev, message]);
    };

    // Subscribe to coordination events (using correct backend event names)
    socket.on('coordination.state.changed', handleStateChanged);
    socket.on('coordination.participant.added', handleParticipantJoined);
    socket.on('coordination.participant.removed', handleParticipantLeft);
    socket.on('facilitator:message', handleFacilitatorMessage);

    return () => {
      socket.off('coordination.state.changed', handleStateChanged);
      socket.off('coordination.participant.added', handleParticipantJoined);
      socket.off('coordination.participant.removed', handleParticipantLeft);
      socket.off('facilitator:message', handleFacilitatorMessage);
    };
  }, [socket, runData.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending messages
  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setInput('');

    try {
      // Create user message
      const userMessage: CoordinationMessageDto = {
        id: `user-${Date.now()}`,
        content: text,
        messageType: 'user',
        timestamp: new Date().toISOString(),
        sender: participantContext,
        runId: runData.id,
        metadata: {}
      };

      // Add message to UI immediately
      setMessages(prev => [...prev, userMessage]);

      // Send message through participant message endpoint
      if (participantContext) {
        await sendParticipantMessage(
          runData.id,
          participantContext.id,
          text,
          magicToken
        );
      }
    } catch (error) {
      console.error('Failed to send message:', error);

      // Add error message
      const errorMessage: CoordinationMessageDto = {
        id: `error-${Date.now()}`,
        content: 'Failed to send message. Please try again.',
        messageType: 'system',
        timestamp: new Date().toISOString(),
        sender: null,
        runId: runData.id,
        metadata: { error: 'send_failed' }
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setBusy(false);
    }
  };

  // Get placeholder text based on current state and role
  const getInputPlaceholder = () => {
    if (!participantContext) {
      return 'Join the coordination...';
    }

    const role = participantContext.role;

    switch (currentState) {
      case 'Express_Need':
        return role === 'requester'
          ? 'Express what you need...'
          : 'Ask questions about the request...';
      case 'Explore_Options':
        return role === 'provider'
          ? 'Share your options and approach...'
          : 'Discuss the proposed options...';
      case 'Commit':
        return role === 'requester'
          ? 'Confirm your commitment to the agreement...'
          : 'Finalize the terms and commitments...';
      case 'Evidence':
        return role === 'provider'
          ? 'Share evidence of completion...'
          : 'Review the provided evidence...';
      case 'Confirm':
        return role === 'requester'
          ? 'Confirm completion and satisfaction...'
          : 'Await final confirmation...';
      default:
        return 'Share your thoughts...';
    }
  };

  // Check if user can send messages
  const canSendMessage = () => {
    if (!participantContext) return false;

    // Check role-specific permissions based on current state
    switch (currentState) {
      case 'Express_Need':
        return participantContext.canExpressNeeds || participantContext.role === 'requester';
      case 'Explore_Options':
        return participantContext.canViewOptions || ['provider', 'requester'].includes(participantContext.role);
      case 'Commit':
        return participantContext.canCommit || ['requester', 'provider'].includes(participantContext.role);
      case 'Evidence':
        return participantContext.canUploadEvidence || participantContext.role === 'provider';
      case 'Confirm':
        return participantContext.canConfirm || participantContext.role === 'requester';
      default:
        return true;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading coordination chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header with coordination info */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Coordination Run
              </h1>
              <p className="text-sm text-gray-600">
                {participantContext ? (
                  <>You are participating as <span className="font-medium">{participantContext.role}</span></>
                ) : (
                  'Observer mode'
                )}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* State progress bar */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <StateProgressBar
            currentState={currentState}
            participantRole={participantContext?.role || null}
            runData={runData}
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex">
        {/* Chat messages area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    Welcome to the coordination! Messages will appear here as the coordination progresses.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <CoordinationMessage
                    key={message.id}
                    message={message}
                    currentUser={participantContext}
                    currentState={currentState}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message input */}
          <div className="border-t bg-white p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={getInputPlaceholder()}
                    disabled={busy || !canSendMessage()}
                    className="w-full"
                  />
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={busy || !input.trim() || !canSendMessage()}
                  className="px-6"
                >
                  {busy ? 'Sending...' : 'Send'}
                </Button>
              </div>

              {!participantContext && (
                <p className="text-sm text-amber-600 mt-2">
                  You are viewing this coordination as an observer. Messages cannot be sent.
                </p>
              )}

              {participantContext && !canSendMessage() && (
                <p className="text-sm text-gray-500 mt-2">
                  Your role cannot send messages in the current coordination state.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Participant sidebar */}
        <div className="w-80 border-l bg-white">
          <ParticipantList
            participants={participants}
            currentUser={participantContext}
            runData={runData}
          />
        </div>
      </div>
    </div>
  );
}