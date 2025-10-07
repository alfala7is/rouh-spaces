"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button, Card } from '@rouh/ui';
import MessageBubble from '../chat/MessageBubble';
import BlueprintDesignerGraph, { DesignerGraph } from './BlueprintDesignerGraph';
import {
  requestDesignerTurn,
  DesignerTurnResponse,
  DesignerTurnPayload,
  listDesignerSessions,
  createDesignerSession,
  getDesignerSession,
  updateDesignerSession,
  deleteDesignerSession,
  DesignerSessionSummary,
  DesignerSessionDetail,
} from '@/lib/api';

export interface DesignerIdentity {
  id: string;
  name: string;
  persona?: string;
  description?: string;
}

export interface DesignerState {
  id: string;
  name: string;
  category?: string;
  description?: string;
}

export interface DesignerGuardrail {
  id: string;
  rule: string;
  trigger?: string;
}

export interface DesignerSignal {
  id: string;
  name: string;
  type?: string;
  description?: string;
}

export interface DesignerAutomation {
  id: string;
  name: string;
  mode?: 'suggest' | 'assist' | 'auto';
  description?: string;
}

export interface DesignerNotes {
  goal?: string;
  identities?: DesignerIdentity[];
  states?: DesignerState[];
  guardrails?: DesignerGuardrail[];
  signals?: DesignerSignal[];
  automations?: DesignerAutomation[];
  success?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface BlueprintDesignerResult {
  notes: DesignerNotes;
  summary: string;
  description: string;
  graph: DesignerGraph;
  ready: boolean;
  followUps: string[];
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface BlueprintDesignerProps {
  spaceId: string;
  templateId?: string | null;
  defaultResult?: BlueprintDesignerResult | null;
  onSnapshot?: (result: BlueprintDesignerResult) => void;
  onComplete: (result: BlueprintDesignerResult) => void;
  onCancel: () => void;
  onSessionChange?: (sessionId: string | null, session?: DesignerSessionSummary | DesignerSessionDetail) => void;
}

const emptyGraph: DesignerGraph = { nodes: [], edges: [] };

function normaliseGraph(graph?: DesignerTurnResponse['graph']): DesignerGraph {
  if (!graph) return emptyGraph;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter(Boolean) : [];
  const edges = Array.isArray(graph.edges) ? graph.edges.filter(Boolean) : [];
  return { nodes, edges };
}

function toResult(response: DesignerTurnResponse, previous?: BlueprintDesignerResult): BlueprintDesignerResult {
  const notes = (response.notes || {}) as DesignerNotes;
  const summary = response.summary || notes.summary || notes.goal || previous?.summary || '';
  const description = summary || previous?.description || '';
  const graph = normaliseGraph(response.graph || previous?.graph);
  return {
    notes,
    summary,
    description,
    graph,
    ready: Boolean(response.ready),
    followUps: Array.isArray(response.followUps) ? response.followUps : [],
  };
}

function buildPayload(
  history: ConversationMessage[],
  notes?: DesignerNotes,
  graph?: DesignerGraph,
  sessionId?: string | null,
): DesignerTurnPayload {
  return {
    sessionId: sessionId ?? undefined,
    history: history.map((message) => ({ role: message.role, content: message.content })),
    notes,
    graph,
  };
}

export default function BlueprintDesigner({
  spaceId,
  templateId,
  defaultResult,
  onSnapshot,
  onComplete,
  onCancel,
  onSessionChange,
}: BlueprintDesignerProps) {
  const defaultWelcome = 'Let’s design this coordination blueprint. Tell me the outcome you want and who needs to be involved, and I’ll shape roles, stages, and guardrails for you.';
  const [messages, setMessages] = useState<ConversationMessage[]>(() => [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: defaultWelcome,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [designerState, setDesignerState] = useState<BlueprintDesignerResult | null>(defaultResult || null);
  const [error, setError] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<DesignerSessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isPersistingSession, setIsPersistingSession] = useState(false);
  const [isLoadingSessionDetail, setIsLoadingSessionDetail] = useState(false);

  const graph = designerState?.graph ?? emptyGraph;
  const followUps = designerState?.followUps ?? [];

  const toMessagesFromHistory = (history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    if (!history?.length) {
      return [
        {
          id: `assistant-welcome-${Date.now()}`,
          role: 'assistant' as const,
          content: defaultWelcome,
        },
      ];
    }

    return history.map((entry, index) => ({
      id: `history-${index}`,
      role: entry.role,
      content: entry.content,
    }));
  };

  const toSessionSummary = (session: DesignerSessionSummary | DesignerSessionDetail): DesignerSessionSummary => ({
    id: session.id,
    spaceId: session.spaceId,
    templateId: session.templateId ?? null,
    title: session.title ?? null,
    status: session.status,
    summary: session.summary ?? null,
    ready: session.ready,
    lastReply: 'lastReply' in session ? session.lastReply ?? null : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });

  const formatSessionLabel = useCallback((session: DesignerSessionSummary) => {
    if (session.title && session.title.trim().length > 0) {
      return session.title;
    }
    if (session.summary && session.summary.trim().length > 0) {
      return session.summary.length > 80 ? `${session.summary.slice(0, 77)}…` : session.summary;
    }
    if (session.lastReply && session.lastReply.trim().length > 0) {
      return session.lastReply.length > 80 ? `${session.lastReply.slice(0, 77)}…` : session.lastReply;
    }
    return `Session ${new Date(session.updatedAt).toLocaleString()}`;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (defaultResult) {
      setDesignerState(defaultResult);
    }
  }, [defaultResult]);

  useEffect(() => {
    let cancelled = false;
    const loadSessions = async () => {
      try {
        setIsLoadingSessions(true);
        const data = await listDesignerSessions(spaceId, templateId ? { templateId } : undefined);
        if (!cancelled) {
          setSessions(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load designer sessions.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
        }
      }
    };

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, [spaceId, templateId]);

  const resetToNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([
      {
        id: `assistant-welcome-${Date.now()}`,
        role: 'assistant',
        content: defaultWelcome,
      },
    ]);
    const fallbackState: BlueprintDesignerResult = defaultResult ?? {
      notes: {},
      summary: '',
      description: '',
      graph: emptyGraph,
      ready: false,
      followUps: [],
    };
    setDesignerState(fallbackState);
    setError('');
    onSnapshot?.(fallbackState);
    onSessionChange?.(null);
  }, [defaultResult, onSessionChange, onSnapshot]);

  const applySessionDetail = useCallback(
    (session: DesignerSessionDetail) => {
      const nextState: BlueprintDesignerResult = {
        notes: (session.notes as DesignerNotes) || {},
        summary: session.summary || '',
        description: session.summary || '',
        graph: normaliseGraph(session.graph as any),
        ready: session.ready,
        followUps: Array.isArray(session.followUps) ? session.followUps : [],
      };

      setDesignerState(nextState);
      const historyMessages = toMessagesFromHistory(Array.isArray(session.history) ? session.history : []);
      setMessages(historyMessages);
      onSnapshot?.(nextState);
    },
    [onSnapshot]
  );

  const loadSessionDetail = useCallback(
    async (targetId: string) => {
      setIsLoadingSessionDetail(true);
      try {
        const detail = await getDesignerSession(spaceId, targetId);
        setSessionId(detail.id);
        applySessionDetail(detail);
        setSessions((prev) => {
          const summary = toSessionSummary(detail);
          return [summary, ...prev.filter((item) => item.id !== summary.id)];
        });
        setError('');
        onSessionChange?.(detail.id, detail);
      } catch (err: any) {
        setError(err?.message || 'Failed to load designer session.');
      } finally {
        setIsLoadingSessionDetail(false);
      }
    },
    [applySessionDetail, onSessionChange, spaceId]
  );

  const ensureSession = useCallback(
    async (firstUserMessage: string) => {
      if (sessionId) {
        return sessionId;
      }

      try {
        setIsPersistingSession(true);
        const created = await createDesignerSession(spaceId, {
          templateId: templateId ?? undefined,
          title: firstUserMessage?.slice(0, 80) || `Session ${new Date().toLocaleString()}`,
          notes: designerState?.notes ?? {},
          graph: designerState?.graph ?? {},
          history: [],
          followUps,
          summary: designerState?.summary,
          ready: designerState?.ready ?? false,
        });
        setSessionId(created.id);
        setSessions((prev) => [toSessionSummary(created), ...prev.filter((s) => s.id !== created.id)]);
        onSessionChange?.(created.id, created);
        return created.id;
      } catch (err: any) {
        setError(err?.message || 'Failed to create designer session.');
        throw err;
      } finally {
        setIsPersistingSession(false);
      }
    },
    [designerState, followUps, onSessionChange, sessionId, spaceId, templateId]
  );

  const persistSession = useCallback(
    async (
      targetSessionId: string,
      nextState: BlueprintDesignerResult,
      messageList: ConversationMessage[],
      lastAssistantReply?: string,
      statusOverride?: string,
    ) => {
      try {
        setIsPersistingSession(true);
        const updated = await updateDesignerSession(spaceId, targetSessionId, {
          summary: nextState.summary,
          ready: nextState.ready,
          notes: nextState.notes,
          graph: nextState.graph,
          followUps: nextState.followUps,
          history: messageList.map(({ role, content }) => ({ role, content })),
          lastReply: lastAssistantReply,
          status: statusOverride ?? (nextState.ready ? 'ready' : 'draft'),
        });

        setSessions((prev) => {
          const summary = toSessionSummary(updated);
          return [summary, ...prev.filter((item) => item.id !== summary.id)];
        });
        onSessionChange?.(targetSessionId, updated);
      } catch (err: any) {
        setError(err?.message || 'Failed to save designer session.');
      } finally {
        setIsPersistingSession(false);
      }
    },
    [onSessionChange, spaceId]
  );

  const handleSessionSelect = useCallback(
    (value: string) => {
      if (value === '__loading') {
        return;
      }
      if (!value) {
        resetToNewSession();
        return;
      }
      void loadSessionDetail(value);
    },
    [loadSessionDetail, resetToNewSession]
  );

  const handleDeleteSession = useCallback(
    async (targetId: string) => {
      try {
        setIsPersistingSession(true);
        await deleteDesignerSession(spaceId, targetId);
        setSessions((prev) => prev.filter((item) => item.id !== targetId));
        if (sessionId === targetId) {
          resetToNewSession();
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to delete designer session.');
      } finally {
        setIsPersistingSession(false);
      }
    },
    [resetToNewSession, sessionId, spaceId]
  );

  const handleSend = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    const previousMessages = messages;

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    setInputValue('');
    setIsLoading(true);
    setError('');

    try {
      const history = [...messages, userMessage];
      setMessages(history);

      const activeSessionId = await ensureSession(trimmed);

      const response = await requestDesignerTurn(
        spaceId,
        buildPayload(history, designerState?.notes, graph, activeSessionId)
      );

      const assistantMessage: ConversationMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
      };
      const updatedMessages = [...history, assistantMessage];
      setMessages(updatedMessages);
      const result = toResult(response, designerState || undefined);
      setDesignerState(result);
      onSnapshot?.(result);

      if (activeSessionId) {
        await persistSession(activeSessionId, result, updatedMessages, assistantMessage.content);
      }
    } catch (err: any) {
      console.error('Designer turn failed:', err);
      const friendlyMessage = (() => {
        if (err?.code === 'TIMEOUT') {
          return 'Designer service timed out. Make sure the AI backend is running and try again.';
        }
        if (err?.code === 'NETWORK_ERROR') {
          return 'Unable to reach the designer service. Check your connection or backend status.';
        }
        if (typeof err?.message === 'string' && err.message.trim().length > 0) {
          return err.message;
        }
        return 'Designer service failed to respond. Please try again.';
      })();
      setError(friendlyMessage);
      setMessages([
        ...previousMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'I ran into a problem processing that. Could you try rephrasing or resend in a moment?',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    handleSend(inputValue);
  };

  const readyToContinue = designerState?.ready ?? false;

  const highlightList = useMemo(() => {
    const notes = designerState?.notes;
    if (!notes) return [];

    const entries: Array<{ label: string; value: string }> = [];

    if (notes.goal) {
      entries.push({ label: 'Goal', value: String(notes.goal) });
    }
    if (notes.identities?.length) {
      entries.push({
        label: 'Identities',
        value: notes.identities.map((identity) => `${identity.name}${identity.persona ? ` (${identity.persona})` : ''}`).join(', '),
      });
    }
    if (notes.states?.length) {
      entries.push({
        label: 'States',
        value: notes.states.map((state) => state.name).join(' → '),
      });
    }
    if (notes.success) {
      entries.push({ label: 'Success', value: String(notes.success) });
    }
    if (notes.guardrails?.length) {
      entries.push({
        label: 'Guardrails',
        value: notes.guardrails.map((g) => g.rule).join(' • '),
      });
    }

    return entries;
  }, [designerState?.notes]);

  const handleQuickFollowUp = (followUp: string) => {
    setInputValue(followUp);
    handleSend(followUp);
  };

  const handleContinue = () => {
    if (!designerState) return;
    if (sessionId) {
      const lastAssistantReply = [...messages].reverse().find((message) => message.role === 'assistant')?.content;
      void persistSession(sessionId, designerState, messages, lastAssistantReply, designerState.ready ? 'ready' : undefined);
    }
    onComplete(designerState);
  };

  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(560px,1fr)_380px] xl:items-start">
      <Card className="flex flex-col h-full w-full border border-gray-200/80 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Blueprint Designer</h2>
            <p className="text-xs text-gray-500">
              Describe your coordination in plain language. The AI will translate it into a working blueprint.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Session</span>
              <select
                className="mt-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={sessionId ?? ''}
                onChange={(event) => handleSessionSelect(event.target.value)}
                disabled={isLoading || isLoadingSessions || isLoadingSessionDetail || isPersistingSession}
              >
                <option value="">Start new session</option>
                {isLoadingSessions ? (
                  <option value="__loading" disabled>
                    Loading sessions…
                  </option>
                ) : (
                  sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatSessionLabel(session)}
                    </option>
                  ))
                )}
              </select>
            </div>
            {sessionId && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => handleDeleteSession(sessionId)}
                disabled={isLoading || isPersistingSession || isLoadingSessionDetail}
              >
                Delete
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50 space-y-2">
          {messages.map((message) => (
            <MessageBubble key={message.id} role={message.role}>
              {message.content}
            </MessageBubble>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-3 space-y-2">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={isLoading ? 'Let me process that...' : 'Tell me more about the coordination you want to design...'}
            rows={3}
            disabled={isLoading || isPersistingSession || isLoadingSessionDetail}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100"
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {followUps.map((followUp) => (
                <Button
                  key={followUp}
                  variant="secondary"
                  size="xs"
                  onClick={() => handleQuickFollowUp(followUp)}
                  disabled={isLoading}
                >
                  {followUp}
                </Button>
              ))}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || isPersistingSession || !inputValue.trim()}
              className="px-4"
            >
              {isLoading ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4 w-full">
        <Card className="border border-gray-200/80 shadow-sm w-full">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Live Summary</h3>
            <p className="text-xs text-gray-500">These notes update automatically as the conversation progresses.</p>
          </div>
          <div className="px-4 py-3 space-y-3 text-sm text-gray-700">
            {designerState?.summary ? (
              <p className="leading-relaxed whitespace-pre-wrap">{designerState.summary}</p>
            ) : (
              <p className="text-gray-400">Start describing your coordination to populate the summary.</p>
            )}

            {highlightList.length > 0 && (
              <div className="space-y-2 text-xs">
                {highlightList.map((item) => (
                  <div key={item.label} className="bg-gray-100 rounded-md px-3 py-2">
                    <p className="font-semibold text-gray-700 uppercase tracking-wide text-[10px]">{item.label}</p>
                    <p className="text-gray-600 mt-1 whitespace-pre-wrap">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <BlueprintDesignerGraph graph={graph} />

        <Card className="border border-gray-200/80 shadow-sm w-full">
          <div className="px-4 py-4 space-y-3">
            <Button
              onClick={handleContinue}
              disabled={!readyToContinue}
              className="w-full"
            >
              {readyToContinue ? 'Continue to Drafting' : 'Keep designing – need goal, actors, states, and success'}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              The blueprint designer marks a conversation as ready once the goal, participants, key stages, and success signals are captured.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
