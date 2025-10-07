"use client";
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import SourcesPanel from './studio/SourcesPanel';
import TrainingChat, {
  TrainingChatHandle,
  KnowledgeEntry,
  DocumentUploadResult,
  PendingSuggestion,
} from './studio/TrainingChat';
import KnowledgePanel from './studio/KnowledgePanel';
import CoordinationPanel from './studio/CoordinationPanel';
import AiChat from './AiChat';
import ChatButton from './ChatButton';

type Props = {
  spaceId: string;
  coordinationContext?: {
    activeTab?: string;
    templateId?: string;
    runId?: string;
  };
};

type SpaceDetails = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isPublic: boolean;
  profile?: {
    businessName?: string;
    bio?: string;
    phone?: string;
    email?: string;
    hours?: string;
  };
};

type CoordinationChatContext = {
  runId: string;
  currentState?: string;
  participant?: {
    id: string;
    role: string;
    userId?: string | null;
  } | null;
};

export default function SpaceStudio({ spaceId, coordinationContext }: Props) {
  const [space, setSpace] = useState<SpaceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [activePanel, setActivePanel] = useState<'sources' | 'training' | 'knowledge' | 'coordination'>(
    coordinationContext?.activeTab === 'coordination' ? 'coordination' : 'training'
  );
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [coordinationChatContext, setCoordinationChatContext] = useState<CoordinationChatContext | null>(null);

  const desktopTrainingChatRef = useRef<TrainingChatHandle | null>(null);
  const mobileTrainingChatRef = useRef<TrainingChatHandle | null>(null);

  const aiChatCoordinationContext = useMemo(() => {
    if (!coordinationChatContext?.participant?.id) {
      return null;
    }

    return {
      runId: coordinationChatContext.runId,
      currentState: coordinationChatContext.currentState || 'Express Need',
      participantContext: {
        id: coordinationChatContext.participant.id,
        role: coordinationChatContext.participant.role,
        userId: coordinationChatContext.participant.userId,
      },
    } as const;
  }, [coordinationChatContext]);

  const handleAiChatExecuteAction = useCallback(
    async (itemId: string, actionType: string, parameters: any) => {
      const payload = {
        itemId: itemId || `chat-${Date.now()}`,
        type: actionType,
        parameters: parameters || {},
      };

      await apiFetch('/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        spaceId,
      });
    },
    [spaceId]
  );

  const handleDocumentUploaded = useCallback(async (docResult?: DocumentUploadResult) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    const targetRef = isDesktop ? desktopTrainingChatRef : mobileTrainingChatRef;

    if (!targetRef.current) {
      return;
    }

    try {
      await targetRef.current.handleDocumentUploaded(docResult);
    } catch (error) {
      console.error('Failed to trigger training review for document upload:', error);
    }
  }, []);

  const loadSpaceDetails = async () => {
    try {
      const spaceData = await apiFetch(`/spaces/${spaceId}`, {
        method: 'GET',
        spaceId,
      });
      setSpace(spaceData);

      let prompt = buildSystemPrompt(spaceData);

      try {
        const promptResponse = await apiFetch(`/spaces/${spaceId}/training/system-prompt`, {
          method: 'GET',
          spaceId,
        });

        if (promptResponse?.systemPrompt && typeof promptResponse.systemPrompt === 'string') {
          prompt = promptResponse.systemPrompt;
        }
      } catch (promptError) {
        console.warn('Failed to load saved system prompt, falling back to template:', promptError);
      }

      setSystemPrompt(prompt);
    } catch (error) {
      console.error('Failed to load space details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadKnowledgeEntries = async () => {
    try {
      const knowledgeEntries = await apiFetch(`/spaces/${spaceId}/knowledge`, {
        method: 'GET',
        spaceId,
      });

      if (Array.isArray(knowledgeEntries)) {
        const parsed = knowledgeEntries as KnowledgeEntry[];
        setKnowledge(
          parsed.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      }
    } catch (error) {
      console.error('Failed to load knowledge entries:', error);
    }
  };

  useEffect(() => {
    loadSpaceDetails();
    loadKnowledgeEntries();
    setCoordinationChatContext(null);
    setIsChatOpen(false);
  }, [spaceId]);

  const handleKnowledgeCreatedEntry = useCallback(
    (entry: KnowledgeEntry) => {
      setKnowledge((prev) => {
        const updated = [entry, ...prev.filter((item) => item.id !== entry.id)];
        return updated.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      void loadKnowledgeEntries();
    },
    [loadKnowledgeEntries]
  );

  const buildSystemPrompt = (spaceData: SpaceDetails): string => {
    const businessName = spaceData.profile?.businessName || spaceData.name;
    const description = spaceData.profile?.bio || spaceData.description || '';
    const category = spaceData.category || 'service';

    const categoryPersonalities: Record<string, string> = {
      'coffee-shop': 'a friendly neighborhood coffee shop',
      'restaurant': 'a welcoming restaurant',
      'food': 'a delicious food establishment',
      'healthcare': 'a caring healthcare provider',
      'education': 'an educational institution',
      'consulting': 'a professional consulting firm',
      'automotive': 'an automotive service center',
    };

    const personality = categoryPersonalities[category] || `a ${category} business`;

    let prompt = `You are the AI assistant for ${businessName}, ${personality}. `;
    prompt += `You know everything about the business and genuinely want to help customers. `;

    if (description) {
      prompt += `\n\nAbout the business: ${description}`;
    }

    if (spaceData.profile?.hours) {
      prompt += `\n\nBusiness hours: ${spaceData.profile.hours}`;
    }

    if (spaceData.profile?.phone || spaceData.profile?.email) {
      prompt += '\n\nContact: ';
      if (spaceData.profile.phone) prompt += `Phone: ${spaceData.profile.phone}`;
      if (spaceData.profile.email) prompt += ` Email: ${spaceData.profile.email}`;
    }

    prompt += '\n\nAlways be helpful, friendly, and professional. Answer questions based on what you know about the business.';

    return prompt;
  };

  const handleSuggestionsChange = useCallback((nextSuggestions: PendingSuggestion[]) => {
    setPendingSuggestions(nextSuggestions);
  }, []);

  const removeSuggestionById = useCallback((id: string) => {
    setPendingSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
  }, []);

  const handleSuggestionDismiss = useCallback((id: string) => {
    removeSuggestionById(id);
  }, [removeSuggestionById]);

  const handleSuggestionAccept = useCallback(
    async (suggestion: PendingSuggestion) => {
      const editedText = window.prompt('Edit before saving (optional):', suggestion.text) ?? suggestion.text;
      const trimmedText = editedText.trim();
      if (!trimmedText) {
        return;
      }

      const title = window.prompt('Title for this entry:', suggestion.title) ?? suggestion.title;

      try {
        const entry = (await apiFetch(`/spaces/${spaceId}/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: suggestion.type,
            title,
            canonicalText: trimmedText,
            sourceMessageId: suggestion.sourceMessageId,
          }),
          spaceId,
        })) as KnowledgeEntry;

        handleKnowledgeCreatedEntry(entry);
        removeSuggestionById(suggestion.id);
      } catch (error) {
        console.error('Failed to save knowledge entry from suggestion:', error);
        alert('Failed to save this knowledge entry. Please try again.');
      }
    },
    [handleKnowledgeCreatedEntry, removeSuggestionById, spaceId]
  );

  const handleKnowledgeEdited = useCallback(
    async (entryId: string, updates: { title: string; canonicalText: string; tags?: string[] }) => {
      try {
        const updated = (await apiFetch(`/spaces/${spaceId}/knowledge/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: updates.title,
            canonicalText: updates.canonicalText,
            tags: updates.tags,
          }),
          spaceId,
        })) as KnowledgeEntry;

        setKnowledge((prev) =>
          prev.map((item) => (item.id === entryId ? { ...item, ...updated } : item))
        );
      } catch (error) {
        console.error('Failed to update knowledge entry:', error);
        alert('Failed to update knowledge entry. Please try again.');
      }
    },
    [spaceId]
  );

  const handleTrainKnowledge = useCallback(async () => {
    const targetRef = desktopTrainingChatRef.current || mobileTrainingChatRef.current;
    if (!targetRef) {
      return;
    }

    setIsTraining(true);
    try {
      await targetRef.trainFromKnowledge();
    } catch (error) {
      // Errors already surfaced inside training chat
    } finally {
      setIsTraining(false);
    }
  }, []);

  const handleKnowledgeDeleted = useCallback(
    async (entryId: string) => {
      try {
        await apiFetch(`/spaces/${spaceId}/knowledge/${entryId}`, {
          method: 'DELETE',
          spaceId,
        });
        setKnowledge((prev) => prev.filter((entry) => entry.id !== entryId));
        void loadKnowledgeEntries();
      } catch (error) {
        console.error('Failed to delete knowledge entry:', error);
        alert('Failed to delete knowledge entry. Please try again.');
      }
    },
    [spaceId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading space...</div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Failed to load space</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile panel selector */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b z-10">
        <div className="flex">
          <button
            onClick={() => setActivePanel('sources')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activePanel === 'sources'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Sources
          </button>
          <button
            onClick={() => setActivePanel('training')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activePanel === 'training'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Training Chat
          </button>
          <button
            onClick={() => setActivePanel('knowledge')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activePanel === 'knowledge'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Knowledge
          </button>
          <button
            onClick={() => setActivePanel('coordination')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activePanel === 'coordination'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            Coordination
          </button>
        </div>
      </div>

      {/* Desktop layout - four panels */}
      <div className="hidden lg:flex flex-1">
        {/* Sources Panel - Left */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
            <p className="text-sm text-gray-500 mt-1">Upload documents to train your AI</p>
          </div>
          <SourcesPanel spaceId={spaceId} onDocumentUploaded={handleDocumentUploaded} />
        </div>

        {/* Training Chat - Middle */}
        <div className="flex-1 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Training Chat</h2>
            <p className="text-sm text-gray-500 mt-1">Chat naturally to train your AI assistant</p>
          </div>
          <TrainingChat
            ref={desktopTrainingChatRef}
            spaceId={spaceId}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            spaceName={space.name}
            onKnowledgeCreated={handleKnowledgeCreatedEntry}
            existingKnowledge={knowledge}
            suggestions={pendingSuggestions}
            onSuggestionsChange={handleSuggestionsChange}
            onTrainingStateChange={setIsTraining}
          />
        </div>

        {/* Knowledge Panel - Third */}
        <div className="w-80 bg-gray-50 flex flex-col border-r border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-white">
            <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
            <p className="text-sm text-gray-500 mt-1">Accepted facts, behaviors, and workflows</p>
          </div>
          <KnowledgePanel
            entries={knowledge}
            onRefresh={loadKnowledgeEntries}
            onDelete={handleKnowledgeDeleted}
            onEdit={handleKnowledgeEdited}
            suggestions={pendingSuggestions}
            onSuggestionAccept={handleSuggestionAccept}
            onSuggestionDismiss={handleSuggestionDismiss}
            onTrain={handleTrainKnowledge}
            isTraining={isTraining}
          />
        </div>

        {/* Coordination Panel - Right */}
        <div className="w-96 bg-white flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Coordination</h2>
            <p className="text-sm text-gray-500 mt-1">Create and manage coordination runs</p>
          </div>
          <CoordinationPanel
            spaceId={spaceId}
            initialTemplateId={coordinationContext?.templateId}
            initialRunId={coordinationContext?.runId}
            onRunContextUpdate={(context) => setCoordinationChatContext(context)}
          />
        </div>
      </div>

      {/* Mobile layout - single panel */}
      <div className="lg:hidden flex-1 pt-12">
        {activePanel === 'sources' && (
          <div className="h-full bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
              <p className="text-sm text-gray-500 mt-1">Upload documents to train your AI</p>
            </div>
            <SourcesPanel spaceId={spaceId} onDocumentUploaded={handleDocumentUploaded} />
          </div>
        )}

        {activePanel === 'training' && (
          <div className="h-full bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Training Chat</h2>
              <p className="text-sm text-gray-500 mt-1">Chat naturally to train your AI</p>
            </div>
            <TrainingChat
              ref={mobileTrainingChatRef}
              spaceId={spaceId}
              systemPrompt={systemPrompt}
              onSystemPromptChange={setSystemPrompt}
              spaceName={space.name}
              onKnowledgeCreated={handleKnowledgeCreatedEntry}
              existingKnowledge={knowledge}
              suggestions={pendingSuggestions}
              onSuggestionsChange={handleSuggestionsChange}
              onTrainingStateChange={setIsTraining}
            />
          </div>
        )}

        {activePanel === 'knowledge' && (
          <div className="h-full bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
              <p className="text-sm text-gray-500 mt-1">Accepted facts, behaviors, and workflows</p>
            </div>
            <KnowledgePanel
              entries={knowledge}
              onRefresh={loadKnowledgeEntries}
              onDelete={handleKnowledgeDeleted}
              onEdit={handleKnowledgeEdited}
              suggestions={pendingSuggestions}
              onSuggestionAccept={handleSuggestionAccept}
              onSuggestionDismiss={handleSuggestionDismiss}
              onTrain={handleTrainKnowledge}
              isTraining={isTraining}
            />
          </div>
        )}

        {activePanel === 'coordination' && (
          <div className="h-full bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Coordination</h2>
              <p className="text-sm text-gray-500 mt-1">Create and manage coordination runs</p>
            </div>
            <CoordinationPanel
              spaceId={spaceId}
              initialTemplateId={coordinationContext?.templateId}
              initialRunId={coordinationContext?.runId}
              onRunContextUpdate={(context) => setCoordinationChatContext(context)}
            />
          </div>
        )}
      </div>
      <ChatButton onClick={() => setIsChatOpen(true)} />
      <AiChat
        spaceId={spaceId}
        onExecuteAction={handleAiChatExecuteAction}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        coordinationContext={aiChatCoordinationContext}
      />
    </div>
  );
}
