"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Button, Card, Input } from '@rouh/ui';
import { requestBlueprintChat, type BlueprintMatchSummary, type BlueprintChatResponse } from '@/lib/api';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'action' | 'system';
  content: string;
  timestamp: Date;
  actions?: {
    type: string;
    parameters: any;
    itemId?: string;
    title: string;
  }[];
  actionId?: string;
  blueprintMatches?: BlueprintMatchSummary[];
  suggestedActions?: string[];
  runContext?: BlueprintChatResponse['runContext'];
}

interface AiChatProps {
  spaceId: string;
  onExecuteAction: (itemId: string, actionType: string, parameters: any) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
  coordinationContext?: {
    runId: string;
    participantContext: any;
    currentState: string;
  } | null;
}

export default function AiChat({ spaceId, onExecuteAction, isOpen, onClose, coordinationContext }: AiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      type: 'ai',
      content: coordinationContext
        ? `Hi! I'm helping with this coordination run. Current state: ${coordinationContext.currentState}. How can I assist you?`
        : "Hi! I'm Rouh, your AI assistant. I can help you with actions like ordering food, booking appointments, or contacting services. Just tell me what you need!",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Coordination mode state
  const isCoordinationMode = coordinationContext !== null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);



  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    console.log('AI Chat: Sending message:', inputValue.trim());

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      let response;
      if (isCoordinationMode && coordinationContext?.participantContext) {
        // Handle coordination messages through coordination API with correct payload
        try {
          const { advanceCoordinationState } = await import('../lib/coordination-api');
          response = await advanceCoordinationState(coordinationContext.runId, {
            participantId: coordinationContext.participantContext.id,
            slotData: {
              message: userMessage.content,
              messageType: 'user'
            },
            metadata: { messageContent: userMessage.content }
          });
        } catch (error) {
          console.error('Coordination API error:', error);
          throw error;
        }
      } else {
        response = await requestBlueprintChat(spaceId, {
          message: userMessage.content,
        });
      }

      // Only add assistant message if there's meaningful content
      if (isCoordinationMode) {
        // Only display a user-visible confirmation when the API returns a meaningful message field
        if (response?.message || response?.data?.message) {
          const aiResponse: ChatMessage = {
            id: `ai-${Date.now()}`,
            type: 'ai',
            content: response?.message || response?.data?.message,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, aiResponse]);
        }
        // If no meaningful message, skip adding assistant bubble - rely on CoordinationChat + WebSocket updates
      } else {
        const aiResponse: ChatMessage = {
          id: `ai-${Date.now()}`,
          type: 'ai',
          content:
            response.suggestedResponse?.text ||
            "I'm here to help! What would you like me to assist you with?",
          timestamp: new Date(),
          blueprintMatches: response.suggestedResponse?.blueprintMatches,
          suggestedActions: response.suggestedResponse?.actions || [],
          runContext: response.runContext,
        };
        setMessages(prev => [...prev, aiResponse]);
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);

      let errorContent;
      if (isCoordinationMode) {
        // Use handleCoordinationApiError for coordination mode errors
        const { handleCoordinationApiError } = await import('../lib/coordination-api');
        errorContent = handleCoordinationApiError(error);
      } else {
        errorContent = "I'm sorry, I'm having trouble processing your request right now. Please try again.";
      }

      const errorResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: isCoordinationMode ? 'system' : 'ai',
        content: errorContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = async (action: any) => {
    try {
      await onExecuteAction(action.itemId, action.type, action.parameters);

      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        type: 'system',
        content: `✅ Action started! I've queued your "${action.title.replace(/^[🍵📅🚗📞]\s*/u, '')}" request. You'll see real-time updates in the notifications.`,
        timestamp: new Date(),
        actionId: action.itemId
      };

      setMessages(prev => [...prev, systemMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        type: 'system',
        content: `❌ Sorry, there was an issue starting your action. Please try again.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <div>
              <h3 className="font-semibold">{isCoordinationMode ? 'Coordination Assistant' : 'Rouh AI Assistant'}</h3>
              <p className="text-xs text-gray-500">
                {isCoordinationMode ? `State: ${coordinationContext?.currentState}` : 'Natural language actions'}
              </p>
            </div>
          </div>
          <Button onClick={onClose} variant="outline" className="h-8 w-8 p-0">
            ✕
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'system'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>

                {/* Blueprint Matches */}
                {message.blueprintMatches && message.blueprintMatches.length > 0 && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="font-semibold text-gray-700">Blueprint alignment</div>
                    {message.blueprintMatches.slice(0, 3).map((match, index) => (
                      <div key={`${match.templateId}-${index}`} className="rounded border border-gray-200 bg-white/80 p-3 text-gray-700">
                        <div className="flex items-center justify-between font-medium text-sm text-gray-900">
                          <span>#{index + 1} {match.name}</span>
                          {typeof match.score === 'number' && (
                            <span className="text-xs text-gray-500">score {Math.round(match.score)}</span>
                          )}
                        </div>
                        {match.description && (
                          <p className="mt-1 text-xs text-gray-600">{match.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {match.category && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">{match.category}</span>
                          )}
                          {match.matchedKeywords?.slice(0, 4).map((keyword) => (
                            <span key={keyword} className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Run Context */}
                {message.runContext && (
                  <div className="mt-3 rounded border border-gray-200 bg-white/80 p-3 text-xs text-gray-700">
                    <div className="font-semibold text-gray-800 mb-1">Run context</div>
                    <div className="grid gap-1">
                      <div><span className="font-medium">Status:</span> {message.runContext.status}</div>
                      {message.runContext.currentState && (
                        <div>
                          <span className="font-medium">Current state:</span> {message.runContext.currentState.name}
                        </div>
                      )}
                      {message.runContext.nextStates.length > 0 && (
                        <div>
                          <span className="font-medium">Next:</span> {message.runContext.nextStates.map((state) => state.name).join(', ')}
                        </div>
                      )}
                      {message.runContext.participants.length > 0 && (
                        <div>
                          <span className="font-medium">Participants:</span> {message.runContext.participants.map((p) => p.role).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Suggested follow-up actions */}
                {message.suggestedActions && message.suggestedActions.length > 0 && (
                  <div className="mt-3 text-xs">
                    <div className="font-semibold text-gray-700 mb-1">Suggested follow-ups</div>
                    <div className="flex flex-wrap gap-2">
                      {message.suggestedActions.map((action) => (
                        <span
                          key={action}
                          className="rounded-full bg-gray-200/70 px-3 py-1 text-[11px] text-gray-700"
                        >
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {message.actions && (
                  <div className="mt-3 space-y-2">
                    {message.actions.map((action, idx) => (
                      <Button
                        key={idx}
                        onClick={() => handleExecuteAction(action)}
                        className="w-full text-left justify-start bg-white text-gray-800 border hover:bg-gray-50"
                        size="sm"
                      >
                        {action.title}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm text-gray-600">Rouh is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isCoordinationMode
                ? "Share your thoughts on this coordination..."
                : "Tell me what you need... (e.g., 'Order a latte with oat milk')"
              }
              className="flex-1"
              disabled={isLoading || (isCoordinationMode && !coordinationContext?.participantContext)}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading || (isCoordinationMode && !coordinationContext?.participantContext)}
              className={isCoordinationMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
            >
              Send
            </Button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {isCoordinationMode ? (
              coordinationContext?.participantContext ? (
                `💬 Contributing as ${coordinationContext.participantContext.role} in ${coordinationContext.currentState} state`
              ) : (
                "⚠️ You are viewing this coordination as an observer"
              )
            ) : (
              "💡 Try: 'Order coffee', 'Schedule meeting', 'Book test drive', or 'Contact expert'"
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
