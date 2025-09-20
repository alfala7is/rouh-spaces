"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Button, Card, Input } from '@rouh/ui';
import { apiFetch } from '@/lib/api';

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
}

interface AiChatProps {
  spaceId: string;
  items: any[];
  onExecuteAction: (itemId: string, actionType: string, parameters: any) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export default function AiChat({ spaceId, items, onExecuteAction, isOpen, onClose }: AiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      type: 'ai',
      content: "Hi! I'm Rouh, your AI assistant. I can help you with actions like ordering food, booking appointments, or contacting services. Just tell me what you need!",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      // Call the API to get AI response
      const response = await apiFetch(`/spaces/${spaceId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
        spaceId,
      });

      const aiResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: response.suggestedResponse?.text || "I'm here to help! What would you like me to assist you with?",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Failed to get AI response:', error);

      const errorResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again.",
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
              <h3 className="font-semibold">Rouh AI Assistant</h3>
              <p className="text-xs text-gray-500">Natural language actions</p>
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
              placeholder="Tell me what you need... (e.g., 'Order a latte with oat milk')"
              className="flex-1"
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Send
            </Button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            💡 Try: "Order coffee", "Schedule meeting", "Book test drive", or "Contact expert"
          </div>
        </div>
      </Card>
    </div>
  );
}
