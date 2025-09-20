"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageBubble from './MessageBubble';
import SuggestionChips, { Suggestion } from './SuggestionChips';
import ReceiptCard from './ReceiptCard';
import { Input, Button, Card } from '@rouh/ui';
import { apiFetch } from '@/lib/api';
import io from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'receipt';
  content?: string;
  suggestions?: Suggestion[];
  actionId?: string;
  receiptData?: any;
  ts: number;
};


function useLocalStore(key: string, initial: ChatMessage[]) {
  const [val, setVal] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ChatMessage[]) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (error) {
      console.warn('Failed to persist chat messages to localStorage', error);
    }
  }, [key, val]);
  return [val, setVal] as const;
}

type Props = {
  spaceId: string;
  initialMode?: 'live' | 'training';
};

export default function ChatThread({ spaceId, initialMode = 'training' }: Props) {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode') as 'live' | 'training' | null;
  const isOnboarding = searchParams.get('onboarding') === 'true';

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'live' | 'training'>(urlMode || initialMode);
  const [trainingMode, setTrainingMode] = useState<'instruction' | 'conversation'>('instruction');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [trainingFeedback, setTrainingFeedback] = useState<string>('');
  const [sessionPatterns, setSessionPatterns] = useState<Array<{
    pattern: string;
    context: string;
    timestamp: number;
  }>>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);
  const [conversationRole, setConversationRole] = useState<'user' | 'assistant'>('user');
  const [conversationSessionId, setConversationSessionId] = useState<string | null>(null);
  const [conversationSequence, setConversationSequence] = useState(1);
  const [conversationMessages, setConversationMessages] = useState<Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    sequence: number;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    name: string;
    size: number;
    uploadedAt: number;
  }>>([]);
  const [spaceContext, setSpaceContext] = useState<any>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  // Create initial welcome message based on mode and onboarding
  const getWelcomeMessage = () => {
    if (isOnboarding && mode === 'training') {
      return "🎉 Welcome to your new Space! You're now in training mode. Share clear instructions—just like crafting guidelines for a custom GPT—and I'll apply them to every response.";
    }
    return "Hi! I'm your Rouh Space. Tell me what you need—I'll propose options and get it done.";
  };

  const [messages, setMessages] = useLocalStore(
    `rouh.chat.${spaceId}`,
    [
      {
        id: 'welcome',
        role: 'assistant',
        content: getWelcomeMessage(),
        ts: Date.now(),
      },
    ],
  );

  useEffect(() => {
    if (mode !== 'training') {
      setTrainingMode('instruction');
      setConversationRole('user');
      setConversationSessionId(null);
      setConversationSequence(1);
      setConversationMessages([]);
    }
  }, [mode]);

  const loadSystemPrompt = useCallback(async () => {
    try {
      const conversations = await apiFetch(`/spaces/${spaceId}/training/conversations`, {
        spaceId,
      });

      const systemMessages: string[] = [];
      conversations?.forEach((session: any) => {
        session?.messages?.forEach((msg: any) => {
          if (msg?.role === 'system' && typeof msg?.content === 'string') {
            const trimmed = msg.content.trim();
            if (trimmed) {
              systemMessages.push(trimmed);
            }
          }
        });
      });

      const uniqueMessages = Array.from(new Set(systemMessages));
      const promptText = uniqueMessages.join('\n\n');
      const fallbackPrompt = 'You are the assistant for this space. Follow the training instructions below.';
      const finalPrompt = promptText || fallbackPrompt;
      setSystemPrompt(finalPrompt);
      setSystemPromptDraft(finalPrompt);
    } catch (error) {
      console.error('Failed to load system prompt', error);
    }
  }, [spaceId]);

  useEffect(() => {
    setConversationRole('user');
    setConversationSessionId(null);
    setConversationSequence(1);
    setConversationMessages([]);
  }, [trainingMode]);

  useEffect(() => {
    loadSystemPrompt();
    loadSpaceContext();
  }, [loadSystemPrompt]);

  const loadSpaceContext = useCallback(async () => {
    if (isLoadingContext) return;
    setIsLoadingContext(true);
    try {
      const context = await apiFetch(`/spaces/${spaceId}/context`, {
        spaceId,
      });
      setSpaceContext(context);
      console.log('🏢 Space context loaded:', context);
    } catch (error) {
      console.error('Failed to load space context:', error);
      setSpaceContext(null);
    } finally {
      setIsLoadingContext(false);
    }
  }, [spaceId, isLoadingContext]);

  useEffect(() => {
    const onStatus = (data: any) => {
      setMessages((prev) => [
        ...prev,
        { id: `status-${Date.now()}`, role: 'system', content: data.message || data.status, ts: Date.now(), actionId: data.actionId },
      ]);
    };
    const onCompleted = (data: any) => {
      // Show receipt message
      setMessages((prev) => [
        ...prev,
        { id: `receipt-${Date.now()}`, role: 'receipt', ts: Date.now(), actionId: data.actionId, receiptData: data.receiptData },
      ]);
    };
    const onError = (error: any) => {
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: 'system', content: `Connection error: ${error.message || 'Please check your connection'}`, ts: Date.now() },
      ]);
    };

    socket.on('action.status', onStatus);
    socket.on('action.completed', onCompleted);
    socket.on('connect_error', onError);
    socket.on('disconnect', () => {
      setMessages((prev) => [
        ...prev,
        { id: `disconnect-${Date.now()}`, role: 'system', content: 'Disconnected. Trying to reconnect...', ts: Date.now() },
      ]);
    });

    return () => {
      socket.off('action.status', onStatus);
      socket.off('action.completed', onCompleted);
      socket.off('connect_error', onError);
      socket.off('disconnect');
    };
  }, [setMessages]);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const runSuggestion = async (s: Suggestion) => {
    const itemId = `demo-${s.mockItem.type}-${Date.now()}`;
    await apiFetch(`/actions`, {
      spaceId,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, type: s.actionType, parameters: { ...s.parameters, mock_item_data: s.mockItem } }),
    });
  };

  const analyzeTrainingInstruction = async (instruction: string) => {
    setIsAnalyzing(true);
    setTrainingFeedback('🧠 Analyzing instruction...');

    try {
      const payload = [{ role: 'user', content: instruction, timestamp: new Date().toISOString() }];

      const analysisResponse = await apiFetch(`/spaces/${spaceId}/training/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: payload,
        }),
        spaceId,
      });

      if (analysisResponse.success && analysisResponse.analysis) {
        const analysis = analysisResponse.analysis;
        const pattern = analysis.general_principle || analysis.correct_pattern || instruction;
        const context = analysis.scenario_category || 'general';

        setSessionPatterns((prev) => [
          ...prev,
          {
            pattern,
            context,
            timestamp: Date.now(),
          },
        ]);

        const confidence = typeof analysis.confidence === 'number'
          ? `${Math.round(analysis.confidence * 100)}%`
          : 'n/a';

        setMessages((prev) => [
          ...prev,
          {
            id: `training-analysis-${Date.now()}`,
            role: 'assistant',
            content: `✅ Instruction processed (confidence ${confidence}).${pattern ? `\nFocus: ${pattern}` : ''}`,
            ts: Date.now(),
          },
        ]);

        setTrainingFeedback(analysisResponse.saved ? '✅ Instruction saved' : '✅ Instruction analyzed');
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `training-analysis-${Date.now()}`,
            role: 'assistant',
            content: 'Instruction analyzed but no actionable pattern detected.',
            ts: Date.now(),
          },
        ]);
        setTrainingFeedback('⚠️ No new training pattern detected');
      }
    } catch (error) {
      console.error('Failed to analyze training instruction:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `training-analysis-error-${Date.now()}`,
          role: 'assistant',
          content: 'Instruction analysis failed. Please try again.',
          ts: Date.now(),
        },
      ]);
      setTrainingFeedback('❌ Instruction analysis failed');
    } finally {
      await loadSystemPrompt();
      setIsAnalyzing(false);
      setTimeout(() => setTrainingFeedback(''), 3000);
    }
  };

  const ensureConversationSession = async (): Promise<{ sessionId: string; isNew: boolean }> => {
    if (conversationSessionId) {
      return { sessionId: conversationSessionId, isNew: false };
    }

    try {
      const response = await apiFetch(`/spaces/${spaceId}/training/start`, {
        method: 'POST',
        spaceId,
      });

      if (!response?.sessionId) {
        throw new Error('Training session response missing sessionId');
      }

      setConversationSessionId(response.sessionId);
      setConversationSequence(1);
      return { sessionId: response.sessionId as string, isNew: true };
    } catch (error) {
      console.error('Failed to start training session:', error);
      throw error;
    }
  };

  const analyzeConversationSession = async (
    sessionId: string,
    sessionMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string; sequence: number }>,
  ) => {
    if (!sessionMessages || sessionMessages.length < 2) {
      return;
    }

    setIsAnalyzing(true);
    setTrainingFeedback('🧠 Analyzing conversation...');

    try {
      const conversationPayload = sessionMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      const analysisResponse = await apiFetch(`/spaces/${spaceId}/training/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: conversationPayload,
          sessionId,
        }),
        spaceId,
      });

      if (analysisResponse.success && analysisResponse.analysis) {
        const analysis = analysisResponse.analysis;
        const pattern = analysis.general_principle || analysis.correct_pattern || '';
        const context = analysis.scenario_category || 'general';
        const confidence = typeof analysis.confidence === 'number'
          ? `${Math.round(analysis.confidence * 100)}%`
          : 'n/a';

        if (pattern) {
          setSessionPatterns((prev) => [
            ...prev,
            {
              pattern,
              context,
              timestamp: Date.now(),
            },
          ]);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `training-analysis-${Date.now()}`,
            role: 'system',
            content: `🎯 Conversation analyzed (confidence ${confidence}).${pattern ? `\nPattern: ${pattern}` : ''}`,
            ts: Date.now(),
          },
        ]);

        setTrainingFeedback(analysisResponse.saved ? '✅ Training pattern saved' : '✅ Conversation analyzed');
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `training-analysis-${Date.now()}`,
            role: 'system',
            content: 'Conversation analyzed but no actionable pattern detected.',
            ts: Date.now(),
          },
        ]);
        setTrainingFeedback('⚠️ No new training pattern detected');
      }
    } catch (error) {
      console.error('Failed to analyze training conversation:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `training-analysis-error-${Date.now()}`,
          role: 'system',
          content: 'Training analysis failed. Please try again.',
          ts: Date.now(),
        },
      ]);
      setTrainingFeedback('❌ Training analysis failed');
    } finally {
      await loadSystemPrompt();
      setIsAnalyzing(false);
      setTimeout(() => setTrainingFeedback(''), 3000);
    }
  };

  const getContextAwareResponse = async (message: string) => {
    // Simple test request - training examples come from database
    const response = await apiFetch(`/spaces/${spaceId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      spaceId,
    });

    return response;
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput('');

    try {
      if (mode === 'training') {
        if (trainingMode === 'instruction') {
          const timestamp = Date.now();
          const instructionMessage: ChatMessage = {
            id: `training-system-${timestamp}`,
            role: 'system',
            content: text,
            ts: timestamp,
          };
          setMessages((prev) => [...prev, instructionMessage]);

          try {
            const sessionId = `instruction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await apiFetch(`/spaces/${spaceId}/training/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                role: 'system',
                content: text,
                sequence: 1,
              }),
              spaceId,
            });
          } catch (error) {
            console.warn('Failed to persist instruction training message', error);
          }

          await analyzeTrainingInstruction(text);
        } else {
          const { sessionId, isNew } = await ensureConversationSession();
          const sequence = isNew ? 1 : conversationSequence;
          const isoTimestamp = new Date().toISOString();
          const chatTimestamp = Date.now();
          const role = conversationRole;

          await apiFetch(`/spaces/${spaceId}/training/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              role,
              content: text,
              sequence,
            }),
            spaceId,
          });

          const trainingMessage: ChatMessage = {
            id: `training-${role}-${chatTimestamp}`,
            role,
            content: text,
            ts: chatTimestamp,
          };
          setMessages((prev) => [...prev, trainingMessage]);

          const updatedMessages = [
            ...(isNew ? [] : conversationMessages),
            { role, content: text, timestamp: isoTimestamp, sequence },
          ];
          setConversationMessages(updatedMessages);
          setConversationSequence(sequence + 1);

          if (role === 'assistant') {
            await analyzeConversationSession(sessionId, updatedMessages);
          } else {
            setTrainingFeedback('📝 Customer turn captured. Add the assistant reply next.');
          }

          setConversationRole((prev) => (prev === 'user' ? 'assistant' : 'user'));
        }
      } else {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: text,
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        const response = await getContextAwareResponse(text);

        const assistantMessage: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: response.suggestedResponse?.text || "I'm processing your request. Please wait a moment.",
          ts: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to process message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            mode === 'training'
              ? 'I could not process that training input. Please try again.'
              : "I'm sorry, I'm having trouble processing your request right now. Please try again.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    console.log('🚀 Document upload started for:', file.name, 'Mode:', mode);
    setIsUploading(true);
    setUploadFeedback('📎 Uploading document...');

    // Add upload message to chat
    const uploadMessage: ChatMessage = {
      id: `upload-${Date.now()}`,
      role: 'system',
      content: `📎 Uploading "${file.name}"...`,
      ts: Date.now()
    };
    setMessages((prev) => [...prev, uploadMessage]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiFetch(`/spaces/${spaceId}/documents`, {
        method: 'POST',
        body: formData,
        spaceId,
      });

      // Add success message to chat
      const successMessage: ChatMessage = {
        id: `upload-success-${Date.now()}`,
        role: 'system',
        content: `✅ Document "${response.filename}" uploaded successfully! Extracted ${response.extracted_text_length} characters of text. Your Space now has access to this information.`,
        ts: Date.now()
      };
      setMessages((prev) => [...prev, successMessage]);
      setUploadFeedback(`✅ Document uploaded: ${response.filename}`);

      // Track uploaded file
      setUploadedFiles((prev) => [...prev, {
        name: response.filename || file.name,
        size: file.size,
        uploadedAt: Date.now()
      }]);

      setTimeout(() => setUploadFeedback(''), 3000);


    } catch (error: any) {
      console.error('Failed to upload document:', error);
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `upload-error-${Date.now()}`,
        role: 'system',
        content: `❌ Failed to upload "${file.name}": ${error.message || 'Unknown error'}`,
        ts: Date.now()
      };
      setMessages((prev) => [...prev, errorMessage]);
      setUploadFeedback('❌ Upload failed');
      setTimeout(() => setUploadFeedback(''), 3000);
    } finally {
      setIsUploading(false);
    }

    // In training mode, ALWAYS trigger AI acknowledgment (moved outside try-catch to ensure execution)
    if (mode === 'training') {
      console.log('🤖 Training mode detected - triggering AI acknowledgment');
      triggerDocumentAcknowledgment(file);
    }
  };

  // Separate function to handle AI acknowledgment - runs regardless of upload success/failure
  const triggerDocumentAcknowledgment = async (file: File) => {
    console.log('🤖 Starting document acknowledgment for:', file.name);

    // Show AI is processing the document immediately
    const processingTimestamp = Date.now();
    const processingMessage: ChatMessage = {
      id: `processing-${processingTimestamp}`,
      role: 'system',
      content: '🤖 AI is reviewing your document and learning its contents...',
      ts: processingTimestamp
    };
    setMessages((prev) => [...prev, processingMessage]);

    // First, provide immediate acknowledgment
    const immediateMessage: ChatMessage = {
      id: `immediate-ack-${Date.now()}`,
      role: 'assistant',
      content: `I've received your document "${file.name}"! I'm analyzing its contents now and will incorporate this information into my understanding of your business.`,
      ts: Date.now()
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, immediateMessage]);
      console.log('✅ Immediate acknowledgment message added');
    }, 1000);

    // Then wait for indexing and get detailed AI response
    setTimeout(async () => {
      setBusy(true);
      try {
        console.log('🤖 Sending detailed acknowledgment request to AI service');
        const aiResponse = await apiFetch(`/spaces/${spaceId}/training/conversation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `I just received a document called "${file.name}". Please review its contents and tell me what insights you've gathered and how this will help you serve customers better.`,
            conversationHistory: messages.filter(m => m.role !== 'system').map(m => ({
              role: m.role,
              content: m.content
            })).slice(-10),
            spaceContext: spaceContext || {}
          }),
          spaceId,
        });

        console.log('🤖 Detailed AI Response received:', aiResponse);

        // Process the detailed response
        if (aiResponse && aiResponse.response) {
          const detailedMessage: ChatMessage = {
            id: `ai-detailed-${Date.now()}`,
            role: 'assistant',
            content: aiResponse.response,
            ts: Date.now()
          };
          setMessages((prev) => [...prev, detailedMessage]);
          console.log('✅ Detailed AI message added to chat');

          // Check if AI learned something new
          if (aiResponse.prompt_updated) {
            const learningMessage: ChatMessage = {
              id: `learning-update-${Date.now()}`,
              role: 'system',
              content: '💡 I have updated my understanding based on this document and will remember this for future interactions.',
              ts: Date.now()
            };
            setTimeout(() => {
              setMessages((prev) => [...prev, learningMessage]);
              console.log('✅ Learning feedback message added');
            }, 1000);
          }
        } else {
          console.warn('⚠️ Invalid detailed AI response format:', aiResponse);
        }
      } catch (error) {
        console.error('❌ Failed to get detailed AI acknowledgment:', error);
        // Show error but don't add fallback since we already gave immediate acknowledgment
        const errorMessage: ChatMessage = {
          id: `ai-error-${Date.now()}`,
          role: 'system',
          content: `⚠️ I acknowledged your document but had trouble analyzing it in detail. The document has still been added to my knowledge base.`,
          ts: Date.now()
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setBusy(false);
        // Remove the processing message
        setMessages((prev) => prev.filter(m => m.id !== `processing-${processingTimestamp}`));
        console.log('🏁 Document acknowledgment process completed');
      }
    }, 8000); // Wait 8 seconds for indexing
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const saveSystemPrompt = async () => {
    const trimmed = systemPromptDraft.trim();
    if (!trimmed) {
      setTrainingFeedback('⚠️ System prompt cannot be empty');
      setTimeout(() => setTrainingFeedback(''), 3000);
      return;
    }

    setIsSavingSystemPrompt(true);
    try {
      const sessionId = `system_prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await apiFetch(`/spaces/${spaceId}/training/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          role: 'system',
          content: trimmed,
          sequence: 1,
        }),
        spaceId,
      });

      setSystemPrompt(trimmed);
      setTrainingFeedback('✅ System prompt saved');
      await loadSystemPrompt();
    } catch (error) {
      console.error('Failed to save system prompt', error);
      setTrainingFeedback('❌ Failed to save system prompt');
    } finally {
      setIsSavingSystemPrompt(false);
      setTimeout(() => setTrainingFeedback(''), 3000);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (mode === 'training') {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (mode !== 'training') return;

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (file && (file.type === 'application/pdf' ||
                 file.type === 'text/plain' ||
                 file.type.includes('document') ||
                 file.type.includes('image/') ||
                 file.name.endsWith('.txt') ||
                 file.name.endsWith('.pdf') ||
                 file.name.endsWith('.doc') ||
                 file.name.endsWith('.docx') ||
                 file.name.endsWith('.jpg') ||
                 file.name.endsWith('.jpeg') ||
                 file.name.endsWith('.png') ||
                 file.name.endsWith('.gif') ||
                 file.name.endsWith('.webp'))) {
      handleFileUpload(file);
    } else {
      setUploadFeedback('❌ Please upload PDF, DOC, DOCX, TXT, or image files only');
      setTimeout(() => setUploadFeedback(''), 3000);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setSessionPatterns([]);
    setInput('');
    setTrainingFeedback('');
    setUploadFeedback('');
    setUploadedFiles([]);
    setConversationSessionId(null);
    setConversationSequence(1);
    setConversationMessages([]);
    setConversationRole('user');

    // Clear localStorage for this space
    localStorage.removeItem(`chat-${spaceId}`);
    localStorage.removeItem(`training-${spaceId}`);

    // Show reset feedback
    setTrainingFeedback('🔄 Conversation reset');
    setTimeout(() => setTrainingFeedback(''), 2000);
  };

  return (
    <div className="min-h-[80vh] w-full flex flex-col items-center">
      {/* Mode Toggle */}
      <div className="w-full max-w-3xl px-4 py-2 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setMode('live')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  mode === 'live'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                🚀 Live Mode
              </button>
              <button
                onClick={() => setMode('training')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  mode === 'training'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                🧠 Training Mode
              </button>
            </div>

            {mode === 'training' && (
              <div className="flex bg-gray-50 rounded-md p-1 ml-4">
                <button
                  onClick={() => setTrainingMode('instruction')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    trainingMode === 'instruction'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Instructions
                </button>
                <button
                  onClick={() => setTrainingMode('conversation')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    trainingMode === 'conversation'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Conversation
                </button>
              </div>
            )}

            {mode === 'training' && trainingMode === 'conversation' && (
              <div className="flex items-center ml-4 space-x-2">
                <span className="text-xs text-gray-500">Next turn:</span>
                <div className="flex bg-gray-50 rounded-md p-1">
                  <button
                    onClick={() => setConversationRole('user')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      conversationRole === 'user'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Customer
                  </button>
                  <button
                    onClick={() => setConversationRole('assistant')}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      conversationRole === 'assistant'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Assistant
                  </button>
                </div>
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={resetConversation}
              className="ml-4 px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              title="Reset conversation"
            >
              🔄 Reset
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{mode === 'live' ? 'Customer-facing chat' : 'AI training session'}</span>
            {mode === 'training' && sessionPatterns.length > 0 && (
              <span className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full text-xs">
                {sessionPatterns.length} patterns learned
              </span>
            )}
          </div>
      </div>
    </div>

      {mode === 'training' && (
        <div className="w-full max-w-3xl px-4 mt-4">
          <Card className="p-4 bg-yellow-50 border-yellow-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-800">System Prompt</h2>
                  <span className="text-xs text-gray-500">
                    Auto-updated from instructions & conversations
                  </span>
                </div>
                <textarea
                  value={systemPromptDraft}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  className="w-full min-h-[140px] rounded-md border border-yellow-300 bg-white p-3 text-sm text-gray-800 focus:border-yellow-500 focus:outline-none"
                  placeholder="Describe how the assistant should behave..."
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={saveSystemPrompt}
                  disabled={isSavingSystemPrompt}
                  className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60"
                >
                  {isSavingSystemPrompt ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSystemPromptDraft(systemPrompt)}
                >
                  Reset Draft
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="w-full max-w-3xl flex-1 px-4">
        <div
          className={`py-6 relative ${mode === 'training' && isDragOver ? 'bg-yellow-100 border-2 border-dashed border-yellow-400 rounded-lg' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {mode === 'training' && isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-yellow-100 bg-opacity-90 rounded-lg z-10">
              <div className="text-center text-yellow-800">
                <div className="text-4xl mb-2">📎</div>
                <div className="font-medium">Drop your files here</div>
                <div className="text-sm">PDFs, documents, images, or text files</div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id}>
              {m.role === 'receipt' ? (
                <div className="w-full flex justify-start my-2">
                  <ReceiptCard data={m.receiptData || {}} />
                </div>
              ) : (
                <div className={m.id.startsWith('training-') && mode === 'training' ? 'bg-yellow-50 border-l-4 border-yellow-400 pl-4 ml-2 mr-2 py-2 rounded-r' : ''}>
                  <MessageBubble role={m.role}>
                    {m.content}
                    {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                      <SuggestionChips suggestions={m.suggestions} onSelect={runSuggestion} />
                    )}
                  </MessageBubble>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className={`w-full border-t ${mode === 'training' ? 'bg-yellow-50' : 'bg-white'}`}>
        <div className="max-w-3xl mx-auto p-4 flex gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef as any}
              placeholder={
                mode === 'training'
                  ? trainingMode === 'instruction'
                    ? 'Share a training instruction (e.g., "Always thank the guest and add a smiley.")'
                    : conversationRole === 'user'
                      ? 'Customer says... (e.g., "Do you have vegan options?")'
                      : 'Assistant replies... (e.g., "Absolutely! We highlight them with a 🌱 icon.")'
                  : 'Ask me to order, schedule, or contact...'
              }
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) onSend();
              }}
              className={`w-full ${mode === 'training' ? 'border-yellow-300 focus:border-yellow-500' : ''}`}
              disabled={busy}
            />
          </div>
          {mode === 'training' && (
            <>
              <input
                type="file"
                id="file-upload"
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
                onChange={onFileSelect}
                className="hidden"
              />
              <Button
                variant="secondary"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isUploading}
                className="p-2 border-yellow-300 hover:border-yellow-500"
                title="Upload document"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="text-lg">📎</span>
                )}
              </Button>
            </>
          )}
          <Button
            onClick={onSend}
            disabled={busy || !input.trim()}
            className={mode === 'training' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
          >
            {mode === 'training' ? 'Train' : 'Send'}
          </Button>
        </div>
        {mode === 'training' && (
          <div className="max-w-3xl mx-auto px-4 pb-2">
            <div className="text-xs text-yellow-700 space-y-1">
              <div>🧠 <strong>Training modes</strong>:</div>
              <div>• <strong>Instructions</strong> — write GPT-style guidelines (“Always greet with the venue name”, “Use emojis for drinks”).</div>
              <div>• <strong>Conversation</strong> — author example Q&A turns so the assistant sees ideal responses.</div>
              <div>📎 Upload documents or drag & drop PDFs, DOCs, or TXT files to add them to your Space's knowledge base.</div>
            </div>
            {sessionPatterns.length > 0 && (
              <div className="mt-2 text-xs text-yellow-600">
                <strong>Active session patterns:</strong>
                <ul className="mt-1 space-y-1">
                  {sessionPatterns.slice(-3).map((pattern, idx) => (
                    <li key={idx} className="flex items-center">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                      {pattern.pattern}
                    </li>
                  ))}
                  {sessionPatterns.length > 3 && (
                    <li className="text-yellow-500">...and {sessionPatterns.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 text-xs text-green-600">
                <strong>📁 Uploaded files ({uploadedFiles.length}):</strong>
                <ul className="mt-1 space-y-1 max-h-20 overflow-y-auto">
                  {uploadedFiles.slice(-5).map((file, idx) => (
                    <li key={idx} className="flex items-center justify-between">
                      <span className="flex items-center">
                        <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                        <span className="truncate max-w-[200px]">{file.name}</span>
                      </span>
                      <span className="text-green-500 ml-2">
                        {(file.size / 1024).toFixed(1)}KB
                      </span>
                    </li>
                  ))}
                  {uploadedFiles.length > 5 && (
                    <li className="text-green-500">...and {uploadedFiles.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            {(isAnalyzing || trainingFeedback || uploadFeedback) && (
              <div className="mt-2 text-xs">
                {isAnalyzing ? (
                  <div className="flex items-center text-blue-600">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Analyzing training instruction...
                  </div>
                ) : trainingFeedback ? (
                  <div className="text-green-700">{trainingFeedback}</div>
                ) : uploadFeedback ? (
                  <div className="text-blue-700">{uploadFeedback}</div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
