"use client";
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button, Input, Card } from '@rouh/ui';
import MessageBubble from '../chat/MessageBubble';
import { compileTemplate, CompileTemplateRequest, CompileTemplateResponse } from '../../lib/api';

export interface TemplateCompilerProps {
  spaceId: string;
  onTemplateCompiled?: (template: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

export interface TemplateCompilerRef {
  prefillDescription: (description: string) => void;
}

interface CompilerMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isTyping?: boolean;
  confidence?: number;
}

const TemplateCompiler = forwardRef<TemplateCompilerRef, TemplateCompilerProps>(({
  spaceId,
  onTemplateCompiled,
  onError,
  className = ''
}, ref) => {
  const [input, setInput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [messages, setMessages] = useState<CompilerMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "I'll help you create a coordination template! Describe the process you want to coordinate. For example:\n\n• \"Help customers request cleaning services and track completion\"\n• \"Coordinate group purchases with members voting and payment\"\n• \"Manage event planning with venue booking and catering\"\n\nThe more specific you are, the better template I can create!",
      timestamp: Date.now(),
    }
  ]);
  const [compiledTemplate, setCompiledTemplate] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    prefillDescription: (description: string) => {
      setInput(description);
      // Focus the input after setting the value
      setTimeout(() => {
        inputRef.current?.focus();
        // Position cursor at end of input
        inputRef.current?.setSelectionRange(description.length, description.length);
      }, 50);
    }
  }), []);

  // Template suggestions based on common patterns
  const templateSuggestions = [
    "Coordinate a team meeting with agenda items and action tracking",
    "Manage service requests from customers with provider matching",
    "Organize event planning with vendor coordination and RSVPs",
    "Handle project reviews with stakeholder feedback collection",
    "Facilitate group purchases with member voting and payment",
    "Coordinate content approval workflow with multiple reviewers",
    "Manage booking requests for shared resources or facilities",
    "Organize volunteer coordination for community events"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Filter suggestions based on input
  useEffect(() => {
    if (input.length > 3) {
      const filtered = templateSuggestions.filter(suggestion =>
        suggestion.toLowerCase().includes(input.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 3));
    } else {
      setSuggestions([]);
    }
  }, [input]);

  // Simulate typing delay for better UX
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (input.length > 0) {
      setIsTyping(true);
      timer = setTimeout(() => setIsTyping(false), 1000);
    } else {
      setIsTyping(false);
    }
    return () => clearTimeout(timer);
  }, [input]);

  const addMessage = (message: Omit<CompilerMessage, 'id' | 'timestamp'>) => {
    const newMessage: CompilerMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  };

  const updateMessage = (messageId: string, updates: Partial<CompilerMessage>) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  };

  // Enhanced input validation
  const validateInput = (description: string) => {
    const words = description.split(' ').length;
    const hasParticipants = /\b(customer|client|user|member|participant|team|group|organizer|provider|reviewer|admin)\b/i.test(description);
    const hasAction = /\b(coordinate|manage|track|organize|handle|facilitate|process|review|approve)\b/i.test(description);
    const hasProcess = /\b(request|booking|event|meeting|order|approval|workflow|project)\b/i.test(description);

    const suggestions: string[] = [];
    if (words < 5) suggestions.push("Try to be more descriptive (at least 5 words)");
    if (!hasParticipants) suggestions.push("Include who is involved (customers, team members, etc.)");
    if (!hasAction) suggestions.push("Specify what action to coordinate (manage, track, organize, etc.)");
    if (!hasProcess) suggestions.push("Describe what type of process (requests, bookings, events, etc.)");

    return { valid: suggestions.length === 0, suggestions };
  };

  const handleCompile = async () => {
    const description = input.trim();
    if (!description || isCompiling) return;

    // Enhanced input validation
    const validation = validateInput(description);

    // Add user message
    addMessage({
      role: 'user',
      content: description,
    });

    setInput('');
    setSuggestions([]);

    // Show validation suggestions if input needs improvement
    if (!validation.valid) {
      addMessage({
        role: 'assistant',
        content: `I can work with that, but let me ask a few clarifying questions to make a better template:\n\n${validation.suggestions.map(s => `• ${s}`).join('\n')}\n\nWould you like to provide more details, or shall I proceed with what you've given me?`,
      });
      return;
    }

    setIsCompiling(true);

    // Enhanced loading message with progress stages
    const loadingMessageId = addMessage({
      role: 'assistant',
      content: '🤖 Analyzing your description...\n\n✓ Understanding requirements\n🔄 Designing coordination flow\n⏳ Generating template structure',
      isTyping: true,
    });

    try {
      console.log('[TemplateCompiler] Starting compilation...');

      const request: CompileTemplateRequest = {
        description,
        preview: true, // Always generate preview first
      };

      const response: CompileTemplateResponse = await compileTemplate(spaceId, request);

      console.log('[TemplateCompiler] Compilation response:', response);

      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));

      if (response.valid && response.template) {
        // Success - enhanced success message with more details
        const confidenceText = response.confidence
          ? `(${Math.round(response.confidence * 100)}% confidence)`
          : '';

        const participantCount = response.template.participants?.length || 0;
        const stateCount = response.template.states?.length || 5;

        addMessage({
          role: 'assistant',
          content: `✅ Excellent! I've created "${response.template.name}" ${confidenceText}.\n\n**Template Overview:**\n• ${participantCount} participant role${participantCount !== 1 ? 's' : ''}\n• ${stateCount} coordination states\n• Structured workflow with validation\n\n**Coordination Flow:**\n• **Express**: ${response.template.schemaJson?.express?.description || 'Participants express their needs'}\n• **Explore**: ${response.template.schemaJson?.explore?.description || 'Explore options and negotiate'}\n• **Commit**: ${response.template.schemaJson?.commit?.description || 'Make commitments and agreements'}\n• **Evidence**: ${response.template.schemaJson?.evidence?.description || 'Provide proof of completion'}\n• **Confirm**: ${response.template.schemaJson?.confirm?.description || 'Confirm satisfaction'}\n\nThis looks ready to use! Would you like to see the full preview or make any adjustments?`,
          confidence: response.confidence,
        });

        setCompiledTemplate(response.template);

        // Add follow-up suggestions for refinement
        setTimeout(() => {
          if (!compiledTemplate) { // Avoid duplicate messages
            addMessage({
              role: 'assistant',
              content: `💡 **Next steps:**\n\n• Click "Preview" to see the full template details\n• Say "add more participants" to include additional roles\n• Say "simplify workflow" to reduce complexity\n• Say "add validation rules" for stricter requirements`,
            });
          }
        }, 2000);

        // Notify parent component
        if (onTemplateCompiled) {
          onTemplateCompiled(response.template);
        }

      } else {
        // Enhanced error handling with specific guidance
        const errorMessage = response.errors?.join('\n') || 'Template compilation failed for unknown reasons.';

        addMessage({
          role: 'assistant',
          content: `❌ I had trouble creating a template from that description.\n\n**Issues found:**\n${errorMessage}\n\n**Let's try again with more details:**\n\n1️⃣ **Who's involved?** (customers, staff, managers, etc.)\n2️⃣ **What's the main process?** (booking, approval, ordering, etc.)\n3️⃣ **What information is needed?** (forms, documents, approvals)\n4️⃣ **How should it end?** (delivery, confirmation, completion)\n\nExample: "Help customers book appointments where staff confirm availability, collect requirements, schedule the service, and get final confirmation."`,
        });

        // Add example suggestions
        setTimeout(() => {
          addMessage({
            role: 'assistant',
            content: `💡 **Try one of these examples:**\n\n• "Coordinate customer support tickets with staff assignment and resolution tracking"\n• "Manage team project reviews with stakeholder feedback and approval process"\n• "Handle event registrations with payment processing and confirmation"`,
          });
        }, 1500);

        if (onError) {
          onError(errorMessage);
        }
      }

    } catch (error: any) {
      console.error('[TemplateCompiler] Compilation failed:', error);

      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessageId));

      const errorMessage = error.message || 'An unexpected error occurred during template compilation.';

      addMessage({
        role: 'system',
        content: `⚠️ Template compilation error: ${errorMessage}\n\nThis might be a temporary issue. Please try again or simplify your description.`,
      });

      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRefineTemplate = () => {
    addMessage({
      role: 'assistant',
      content: "I'd be happy to refine the template! What would you like to change? You can:\n\n• Modify the participant roles (who's involved?)\n• Adjust the coordination steps\n• Change what information is collected\n• Update timing and requirements\n\nJust tell me what needs to be different.",
    });

    // Focus input for user response
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleStartOver = () => {
    setMessages([
      {
        id: 'restart',
        role: 'assistant',
        content: "Let's start fresh! Describe the coordination process you'd like to create a template for. What kind of collaboration or workflow do you need to manage?",
        timestamp: Date.now(),
      }
    ]);
    setCompiledTemplate(null);
    setInput('');

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <div className={`flex flex-col h-full max-w-4xl mx-auto ${className}`}>
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              🤖 Template Compiler
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Describe your coordination process and I'll create a structured template
            </p>
          </div>

          {compiledTemplate && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefineTemplate}
                disabled={isCompiling}
              >
                ✏️ Refine
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleStartOver}
                disabled={isCompiling}
              >
                🔄 Start Over
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id}>
              <MessageBubble role={message.role}>
                <div className="whitespace-pre-line">
                  {message.content}
                </div>
                {message.confidence && (
                  <div className="mt-2 text-xs text-gray-500">
                    Confidence: {Math.round(message.confidence * 100)}%
                  </div>
                )}
                {message.isTyping && (
                  <div className="flex items-center mt-2 text-gray-500">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                )}
              </MessageBubble>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Enhanced Input Area with Suggestions */}
      <div className="border-t bg-white px-6 py-4">
        {/* Quick Suggestions */}
        {showSuggestions && suggestions.length === 0 && input.length === 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">💡 Quick Start Suggestions:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {templateSuggestions.slice(0, 4).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setInput(suggestion)}
                  className="text-left p-3 text-sm bg-gray-50 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSuggestions(false)}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700"
            >
              Hide suggestions
            </button>
          </div>
        )}

        {/* Input with Auto-complete */}
        <div className="relative">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                placeholder={isTyping ? "I'm listening..." : "Describe the coordination process you want to create..."}
                value={input}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCompile();
                  }
                  if (e.key === 'Escape') {
                    setInput('');
                    setSuggestions([]);
                  }
                }}
                className={`w-full transition-colors ${
                  isTyping ? 'ring-2 ring-blue-200' : ''
                } ${input.length > 0 && validateInput(input).suggestions.length > 0 ? 'ring-1 ring-yellow-300' : ''}`}
                disabled={isCompiling}
              />

              {/* Real-time Suggestions Dropdown */}
              {suggestions.length > 0 && input.length > 3 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2 text-xs text-gray-600 border-b">
                    Press Tab or click to use a suggestion:
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setInput(suggestion);
                        setSuggestions([]);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-left p-3 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-b-0"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Validation Indicator */}
              {input.length > 0 && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  {validateInput(input).valid ? (
                    <span className="text-green-500 text-sm">✓</span>
                  ) : (
                    <span className="text-yellow-500 text-sm">⚡</span>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleCompile}
              disabled={!input.trim() || isCompiling}
              className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
            >
              {isCompiling ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Compiling...
                </div>
              ) : (
                '🚀 Compile'
              )}
            </Button>
          </div>
        </div>

        {/* Enhanced Tips and Validation Feedback */}
        <div className="mt-3 space-y-2">
          {input.length > 0 && !validateInput(input).valid && (
            <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
              <p className="font-medium">💡 To create a better template, try to include:</p>
              <ul className="mt-1 space-y-1">
                {validateInput(input).suggestions.map((suggestion, index) => (
                  <li key={index} className="text-xs">• {suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <strong>Pro tip:</strong> Mention participants, actions, and outcomes.
              <button
                onClick={() => setShowSuggestions(true)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                Show examples
              </button>
            </div>
            <div className="text-xs text-gray-400">
              Press Enter to compile • Esc to clear
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TemplateCompiler.displayName = 'TemplateCompiler';

export default TemplateCompiler;