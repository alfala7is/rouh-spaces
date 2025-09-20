"use client";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  ForwardedRef,
} from 'react';
import { apiFetch } from '@/lib/api';
import { Input, Button } from '@rouh/ui';

export type KnowledgeEntry = {
  id: string;
  type: 'fact' | 'behavior' | 'workflow';
  title: string;
  canonicalText: string;
  tags: string[];
  metadata?: any;
  sourceMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentKnowledgeSuggestion = {
  type: 'fact' | 'behavior' | 'workflow';
  title: string;
  canonicalText: string;
  tags?: string[];
};

export type DocumentUploadResult = {
  ok?: boolean;
  filename?: string;
  message?: string;
  document_type?: string;
  key_entities?: Record<string, any>;
  extracted_preview?: string;
  ownerSummary?: string;
  knowledgeSuggestions?: DocumentKnowledgeSuggestion[];
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export type PendingSuggestion = {
  id: string;
  type: 'fact' | 'behavior' | 'workflow';
  title: string;
  text: string;
  confidence?: number;
  sourceMessageId?: string;
  userMessage: Message;
  assistantMessage: Message;
};

type Props = {
  spaceId: string;
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  spaceName: string;
  onKnowledgeCreated: (entry: KnowledgeEntry) => void;
  existingKnowledge?: KnowledgeEntry[];
  suggestions: PendingSuggestion[];
  onSuggestionsChange: (suggestions: PendingSuggestion[]) => void;
  onTrainingStateChange?: (isTraining: boolean) => void;
};

export interface TrainingChatHandle {
  handleDocumentUploaded: (docResult?: DocumentUploadResult) => Promise<void>;
  trainFromKnowledge: () => Promise<void>;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const deriveTitle = (title?: string, fallback?: string) => {
  const base = title?.trim() || fallback?.split(/\n|\./)[0]?.slice(0, 60)?.trim();
  return base && base.length > 0 ? base : 'New entry';
};

const buildFallbackPrinciple = (userMessage: Message) => {
  const trimmed = userMessage.content.trim();
  if (!trimmed) return null;
  return `Always incorporate: ${trimmed}`;
};

const isEcho = (text: string, assistantMessage: Message) => {
  const a = normalize(text);
  const b = normalize(assistantMessage.content);
  if (!a || !b) return false;
  if (b.includes(a)) return true;
  const summaryTokens = a.split(' ');
  if (summaryTokens.length === 0) return false;
  const assistantTokens = new Set(b.split(' '));
  let overlap = 0;
  summaryTokens.forEach((token) => {
    if (assistantTokens.has(token)) overlap += 1;
  });
  return overlap / summaryTokens.length >= 0.8;
};

const TrainingChat = React.forwardRef<TrainingChatHandle, Props>(function TrainingChat(
  {
    spaceId,
    systemPrompt,
    onSystemPromptChange,
    spaceName,
    onKnowledgeCreated,
    existingKnowledge = [],
    suggestions,
    onSuggestionsChange,
    onTrainingStateChange,
  }: Props,
  ref: ForwardedRef<TrainingChatHandle>
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState(systemPrompt);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef(1);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const resetChatState = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    sequenceRef.current = 1;
    onSuggestionsChange([]);
  }, [onSuggestionsChange]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setPromptDraft(systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    if (!suggestions.length) {
      return;
    }

    const filtered = suggestions.filter((suggestion) => {
      const suggestionKey = normalize(suggestion.text);
      return !existingKnowledge.some((entry) => normalize(entry.canonicalText) === suggestionKey);
    });

    if (filtered.length !== suggestions.length) {
      onSuggestionsChange(filtered);
    }
  }, [existingKnowledge, onSuggestionsChange, suggestions]);

  const persistTrainingMessage = useCallback(
    async (role: 'user' | 'assistant', content: string, activeSessionId: string) => {
      if (!content?.trim()) return;
      try {
        await apiFetch(`/spaces/${spaceId}/training/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            role,
            content,
            sequence: sequenceRef.current,
          }),
          spaceId,
        });
        sequenceRef.current += 1;
      } catch (error) {
        console.error('Failed to persist training message:', error);
      }
    },
    [spaceId]
  );

  const startTrainingSession = useCallback(async () => {
    try {
      const response = await apiFetch(`/spaces/${spaceId}/training/start`, {
        method: 'POST',
        spaceId,
      });
      const newSessionId = response.sessionId as string;
      setSessionId(newSessionId);
      sequenceRef.current = 1;
      return newSessionId;
    } catch (error) {
      console.error('Failed to start training session:', error);
      setSessionId(null);
      return null;
    }
  }, [spaceId]);

  const seedGreeting = useCallback(() => {
    const greeting: Message = {
      id: `greeting-${Date.now()}`,
      role: 'assistant',
      content: `Hi! I'm here to help you refine your assistant for ${spaceName}.\n\nShare corrections or new details—I'll suggest knowledge to store, and you can apply updates whenever you're ready.`,
      timestamp: new Date(),
    };
    setMessages([greeting]);
  }, [spaceName]);

  const hydrateExistingTraining = useCallback(async () => {
    setIsHydrating(true);
    resetChatState();

    try {
      const [conversationResponse, promptResponse] = await Promise.all([
        apiFetch(`/spaces/${spaceId}/training/conversations`, {
          method: 'GET',
          spaceId,
        }),
        apiFetch(`/spaces/${spaceId}/training/system-prompt`, {
          method: 'GET',
          spaceId,
        }),
      ]);

      if (promptResponse?.systemPrompt && typeof promptResponse.systemPrompt === 'string') {
        setPromptDraft(promptResponse.systemPrompt);
        if (promptResponse.systemPrompt !== systemPrompt) {
          onSystemPromptChange(promptResponse.systemPrompt);
        }
      } else {
        setPromptDraft(systemPrompt);
      }

      const sessions: Array<{ sessionId: string; messages: any[] }> = Array.isArray(conversationResponse)
        ? conversationResponse
        : [];

      if (sessions.length > 0) {
        const sortByLatest = [...sessions].sort((a, b) => {
          const lastA = a.messages?.[a.messages.length - 1]?.createdAt || 0;
          const lastB = b.messages?.[b.messages.length - 1]?.createdAt || 0;
          return new Date(lastA).getTime() - new Date(lastB).getTime();
        });

        const latest = sortByLatest[sortByLatest.length - 1];
        const userAssistantMessages: Message[] = [];

        latest.messages.forEach((msg: any) => {
          const created = msg.createdAt ? new Date(msg.createdAt) : new Date();
          const baseContent = typeof msg.content === 'string' ? msg.content : '';
          if (!baseContent.trim()) return;

          userAssistantMessages.push({
            id: `${msg.sessionId}-${msg.sequence}`,
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: baseContent,
            timestamp: created,
          });
        });

        if (userAssistantMessages.length > 0) {
          setMessages(userAssistantMessages);
        } else {
          seedGreeting();
        }

        setSessionId(latest.sessionId);
        const maxSequence = latest.messages.reduce((max: number, msg: any) => Math.max(max, msg.sequence || 0), 0);
        sequenceRef.current = maxSequence + 1;
        return;
      }
    } catch (error) {
      console.error('Failed to hydrate training chat:', error);
    }

    seedGreeting();
    const newSessionId = await startTrainingSession();
    if (newSessionId) {
      setSessionId(newSessionId);
    }
  }, [spaceId, systemPrompt, onSystemPromptChange, resetChatState, seedGreeting, startTrainingSession]);

  const analyzeAndSuggest = useCallback(
    async (userMessage: Message, assistantMessage: Message, activeSessionId: string) => {
      try {
        setIsAnalyzing(true);
        const analysisResponse = await apiFetch(`/spaces/${spaceId}/training/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: [
              { role: 'user', content: userMessage.content, timestamp: userMessage.timestamp.toISOString() },
              { role: 'assistant', content: assistantMessage.content, timestamp: assistantMessage.timestamp.toISOString() },
            ],
            sessionId: activeSessionId,
          }),
          spaceId,
        });

        const analysis = analysisResponse?.analysis;
        if (!analysis || !analysis.correction_detected) {
          return;
        }

        let text = (analysis.general_principle || analysis.correct_pattern || analysis.response_template || '').trim();
        if (!text) {
          const fallback = buildFallbackPrinciple(userMessage);
          if (!fallback) return;
          text = fallback;
        }

        if (isEcho(text, assistantMessage)) {
          const fallback = buildFallbackPrinciple(userMessage);
          if (!fallback) return;
          text = fallback;
        }

        const normalizedText = normalize(text);
        if (!normalizedText) {
          return;
        }

        if (existingKnowledge.some((entry) => normalize(entry.canonicalText) === normalizedText)) {
          return;
        }

        const alreadySuggested = suggestions.some((suggestion) => normalize(suggestion.text) === normalizedText);
        if (alreadySuggested) {
          return;
        }

        const type = (analysis.knowledge_type as 'fact' | 'behavior' | 'workflow') || 'fact';
        const newSuggestion: PendingSuggestion = {
          id: `suggestion-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type,
          title: deriveTitle(analysis.knowledge_title, text),
          text,
          confidence: typeof analysis.confidence === 'number' ? analysis.confidence : undefined,
          sourceMessageId: userMessage.id,
          userMessage,
          assistantMessage,
        };

        onSuggestionsChange([newSuggestion, ...suggestions]);
      } catch (error) {
        console.error('Failed to analyze correction:', error);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [existingKnowledge, onSuggestionsChange, spaceId, suggestions]
  );

  const buildDocumentUserMessage = useCallback((docResult?: DocumentUploadResult) => {
    const summary = docResult?.ownerSummary?.trim();
    if (summary) {
      return summary;
    }

    if (docResult?.filename) {
      return `I uploaded ${docResult.filename}. Please read it and capture any important knowledge for the assistant.`;
    }

    return '';
  }, []);

  const persistDocumentKnowledge = useCallback(
    async (docResult: DocumentUploadResult | undefined, sourceMessage: Message | null) => {
      if (!docResult?.knowledgeSuggestions || docResult.knowledgeSuggestions.length === 0) {
        return;
      }

      const savedEntries: KnowledgeEntry[] = [];

      for (const suggestion of docResult.knowledgeSuggestions) {
        const text = suggestion.canonicalText?.trim();
        if (!text) continue;

        const normalizedText = normalize(text);
        if (!normalizedText) continue;

        const alreadyExists =
          existingKnowledge.some((entry) => normalize(entry.canonicalText) === normalizedText) ||
          savedEntries.some((entry) => normalize(entry.canonicalText) === normalizedText);
        if (alreadyExists) {
          continue;
        }

        try {
          const created = (await apiFetch(`/spaces/${spaceId}/knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: suggestion.type,
              title: suggestion.title || deriveTitle(undefined, text),
              canonicalText: text,
              tags: suggestion.tags || undefined,
              sourceMessageId: sourceMessage?.id,
            }),
            spaceId,
          })) as KnowledgeEntry;

          savedEntries.push(created);
          onKnowledgeCreated(created);
        } catch (persistError) {
          console.error('Failed to persist knowledge from document upload:', persistError);
        }
      }

      if (savedEntries.length > 0) {
        const ackMessage: Message = {
          id: `assistant-doc-ack-${Date.now()}`,
          role: 'assistant',
          content: `Captured ${savedEntries.length} knowledge entr${savedEntries.length === 1 ? 'y' : 'ies'} from the uploaded document. You can review them in the knowledge base panel.`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, ackMessage]);
      }
    },
    [existingKnowledge, onKnowledgeCreated, spaceId]
  );

  const requestDocumentReview = useCallback(async (docResult?: DocumentUploadResult) => {
    setIsLoading(true);
    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = await startTrainingSession();
        if (!activeSessionId) {
          throw new Error('No active training session');
        }
      }

      const documentSummary = buildDocumentUserMessage(docResult);
      let documentUserMessage: Message | null = null;

      if (documentSummary) {
        documentUserMessage = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'user',
          content: documentSummary,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, documentUserMessage as Message]);
        await persistTrainingMessage('user', documentSummary, activeSessionId);
      }

      const conversationHistory = (documentUserMessage ? [...messages, documentUserMessage] : [...messages]).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const promptMessage = documentSummary || 'A new document has been uploaded. Confirm the assistant has captured its details.';

      const response = await apiFetch(`/spaces/${spaceId}/training/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptMessage,
          conversationHistory: conversationHistory.slice(-10),
        }),
        spaceId,
      });

      if (response?.response) {
        const aiMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);
        await persistTrainingMessage('assistant', aiMessage.content, activeSessionId);

        const sourceUser = documentUserMessage || [...messages].reverse().find((msg) => msg.role === 'user');
        if (sourceUser) {
          void analyzeAndSuggest(sourceUser, aiMessage, activeSessionId);
        }

        await persistDocumentKnowledge(docResult, documentUserMessage);
      }
    } catch (error: any) {
      console.error('Failed to process document acknowledgment:', error);
      const detail = error?.response?.data?.detail || error?.message || 'Unable to review the new document.';
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `I ran into an issue reviewing the uploaded document: ${detail}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [
    analyzeAndSuggest,
    buildDocumentUserMessage,
    messages,
    persistDocumentKnowledge,
    persistTrainingMessage,
    sessionId,
    spaceId,
    startTrainingSession,
  ]);

  const trainFromKnowledge = useCallback(async () => {
    setIsTraining(true);
    onTrainingStateChange?.(true);
    try {
      const preview = await apiFetch(`/spaces/${spaceId}/knowledge/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: false }),
        spaceId,
      });

      const newPrompt: string | undefined = preview?.systemPrompt;
      if (!newPrompt) {
        alert('Failed to generate prompt from knowledge.');
        return;
      }

      const confirmApply = window.confirm(`New system prompt preview:\n\n${newPrompt}\n\nApply this prompt now?`);
      if (!confirmApply) {
        return;
      }

      await apiFetch(`/spaces/${spaceId}/knowledge/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true }),
        spaceId,
      });

      onSystemPromptChange(newPrompt);
      setPromptDraft(newPrompt);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Knowledge applied. The assistant has been retrained with the latest facts and guidelines.',
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Failed to compile prompt from knowledge:', error);
      alert('Failed to compile prompt from knowledge. Please try again.');
      throw error;
    } finally {
      setIsTraining(false);
      onTrainingStateChange?.(false);
    }
  }, [onSystemPromptChange, onTrainingStateChange, spaceId]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const now = new Date();
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: now,
    };

    setInput('');

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await startTrainingSession();
      if (!activeSessionId) {
        alert('Unable to start a training session. Please try again.');
        return;
      }
    }

    setMessages((prev) => [...prev, userMessage]);
    await persistTrainingMessage('user', userMessage.content, activeSessionId);

    setIsLoading(true);
    try {
      const conversationHistory = messages
        .concat(userMessage)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const response = await apiFetch(`/spaces/${spaceId}/training/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: conversationHistory.slice(-10),
        }),
        spaceId,
      });

      const aiMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      await persistTrainingMessage('assistant', aiMessage.content, activeSessionId);

      void analyzeAndSuggest(userMessage, aiMessage, activeSessionId);
    } catch (error: any) {
      console.error('Failed to process message:', error);
      const errorDetail = error?.response?.data?.detail || error?.message || 'Unknown error';
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `I'm having trouble processing that. Error: ${errorDetail}. Could you try rephrasing or tell me more?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [analyzeAndSuggest, input, messages, persistTrainingMessage, sessionId, spaceId, startTrainingSession]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const saveSystemPrompt = useCallback(async () => {
    try {
      onSystemPromptChange(promptDraft);
      setIsEditingPrompt(false);

      await apiFetch(`/spaces/${spaceId}/system-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: promptDraft,
        }),
        spaceId,
      });
    } catch (error) {
      console.error('Failed to save system prompt:', error);
      alert('Could not save the system prompt. Please try again.');
    }
  }, [onSystemPromptChange, promptDraft, spaceId]);

  useEffect(() => {
    hydrateExistingTraining().finally(() => setIsHydrating(false));
  }, [hydrateExistingTraining]);

  useImperativeHandle(ref, () => ({
    handleDocumentUploaded: requestDocumentReview,
    trainFromKnowledge,
  }));


  return (
    <div className="flex flex-col h-full">
      {isHydrating ? (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-sm text-gray-500">Loading training history…</div>
        </div>
      ) : (
        <>
          <div className="px-6 py-4 bg-gray-50 border-b">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">AI assistant personality</label>
              {!isEditingPrompt ? (
                <button
                  onClick={() => setIsEditingPrompt(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                  type="button"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={saveSystemPrompt}
                    className="text-sm text-green-600 hover:text-green-700"
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setPromptDraft(systemPrompt);
                      setIsEditingPrompt(false);
                    }}
                    className="text-sm text-gray-600 hover:text-gray-700"
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {!isEditingPrompt ? (
              <p className="text-sm text-gray-600 line-clamp-3">
                {systemPrompt || 'Teach by chatting – I’ll capture new knowledge for you to review.'}
              </p>
            ) : (
              <textarea
                value={promptDraft}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPromptDraft(e.target.value)}
                className="w-full h-36 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter system prompt..."
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-2 rounded-lg">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="px-6 py-4 border-t bg-white">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Chat with your assistant or teach it something new..."
                disabled={isLoading}
                className="flex-1"
              />
              {messages.length > 0 && (
                <button
                  onClick={resetChatState}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-md border border-gray-300"
                  type="button"
                  title="Reset chat to test different scenarios"
                >
                  Reset
                </button>
              )}
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                Send
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share facts, policies, workflows, or corrections. I’ll propose knowledge entries automatically.
            </p>
          </div>

          {messages.length > 3 && (
            <div className="px-6 pb-4 bg-white border-t">
              <button
                onClick={() => {
                  seedGreeting();
                  setSessionId(null);
                  sequenceRef.current = 1;
                  void startTrainingSession();
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
                type="button"
              >
                Start new conversation
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default TrainingChat;
