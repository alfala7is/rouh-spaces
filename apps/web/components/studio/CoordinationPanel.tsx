"use client";
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getSpaceCoordinationTemplates,
  getSpaceCoordinationRuns,
  getCoordinationRun,
  handleCoordinationApiError
} from '@/lib/coordination-api';
import type { CoordinationRunDto } from '@/types/coordination';
import TemplateSelector from '../coordination/TemplateSelector';
import RunCreationModal from '../coordination/RunCreationModal';
import ActiveRunsList from '../coordination/ActiveRunsList';
import MagicLinkManager from '../coordination/MagicLinkManager';
import { requestBlueprintChat, type BlueprintChatResponse } from '@/lib/api';

interface Props {
  spaceId: string;
  initialTemplateId?: string;
  initialRunId?: string;
  onRunContextUpdate?: (context: {
    runId: string;
    currentState?: string;
    participant?: {
      id: string;
      role: string;
      userId?: string | null;
    } | null;
  }) => void;
}

interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  usageCount?: number;
}

interface SpaceCoordinationRun extends CoordinationRunDto {
  templateId: string;
  templateName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

const CoordinationPanel: React.FC<Props> = ({
  spaceId,
  initialTemplateId,
  initialRunId,
  onRunContextUpdate,
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeRuns, setActiveRuns] = useState<SpaceCoordinationRun[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showRunCreationModal, setShowRunCreationModal] = useState(false);
  const [showMagicLinkManager, setShowMagicLinkManager] = useState(false);
  const [selectedRunForLinks, setSelectedRunForLinks] = useState<SpaceCoordinationRun | null>(null);
  const [loading, setLoading] = useState({
    templates: false,
    runs: false,
    creating: false
  });
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<BlueprintChatResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightGeneratedAt, setInsightGeneratedAt] = useState<Date | null>(null);

  const formatRelativeTime = useCallback((date: Date) => {
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60_000) return 'just now';
    const diffMinutes = Math.round(diffMs / 60_000);
    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }, []);

  const buildInsightPrompt = useCallback(() => {
    if (!templates.length) {
      return 'List any coordination blueprints available in this space and suggest which one fits a leaking sink repair scenario.';
    }

    const templateSummary = templates
      .slice(0, 3)
      .map((template) => `${template.name}: ${template.description}`)
      .join(' | ');

    const runSummary = activeRuns.length
      ? `Active runs include ${activeRuns
          .slice(0, 2)
          .map((run) => `${run.templateName} (${run.status})`)
          .join(', ')}.`
      : 'There are no active runs yet.';

    return `Given these coordination blueprints — ${templateSummary} — recommend the best match and the next actions to advance. ${runSummary}`;
  }, [activeRuns, templates]);

  // Load templates for this space
  const loadTemplates = useCallback(async () => {
    setLoading(prev => ({ ...prev, templates: true }));
    setError(null);
    try {
      const templates = await getSpaceCoordinationTemplates(spaceId, {
        isActive: true,
        withUsageStats: true
      });
      setTemplates(templates || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates. Please refresh to try again.');
    } finally {
      setLoading(prev => ({ ...prev, templates: false }));
    }
  }, [spaceId]);

  // Load active coordination runs for this space
  const loadActiveRuns = useCallback(async () => {
    setLoading(prev => ({ ...prev, runs: true }));
    try {
      const runs = await getSpaceCoordinationRuns(spaceId, {
        status: 'active',
        limit: 50
      });
      setActiveRuns(runs || []);
    } catch (err: any) {
      console.error('Failed to load coordination runs:', err);
      // Don't show error for runs - they might not exist yet
    } finally {
      setLoading(prev => ({ ...prev, runs: false }));
    }
  }, [spaceId]);

  useEffect(() => {
    loadTemplates();
    loadActiveRuns();
  }, [loadTemplates, loadActiveRuns]);

  // Handle initial template selection from URL
  useEffect(() => {
    if (initialTemplateId && templates.length > 0) {
      const template = templates.find(t => t.id === initialTemplateId);
      if (template) {
        handleTemplateSelect(template);
      }
    }
  }, [initialTemplateId, templates]);

  // Handle initial run focus from URL
  useEffect(() => {
    if (initialRunId && activeRuns.length > 0) {
      const run = activeRuns.find(r => r.id === initialRunId);
      if (run) {
        handleShowMagicLinks(run);
      }
    }
  }, [initialRunId, activeRuns]);

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setShowRunCreationModal(true);
  };

  const handleRunCreated = (newRun: SpaceCoordinationRun) => {
    setActiveRuns(prev => [newRun, ...prev]);
    setShowRunCreationModal(false);
    setSelectedTemplate(null);
  };

  const handleRunStatusChange = (runId: string, status: SpaceCoordinationRun['status']) => {
    setActiveRuns(prev =>
      prev.map(run =>
        run.id === runId ? { ...run, status } : run
      )
    );
  };

  const handleShowMagicLinks = async (run: SpaceCoordinationRun) => {
    try {
      // Ensure the run has full participant details
      let enrichedRun = run;
      if (!run.participants || run.participants.length === 0) {
        const fullRun = await getCoordinationRun(run.id);
        enrichedRun = { ...run, participants: fullRun.participants };
      }
      setSelectedRunForLinks(enrichedRun);
      setShowMagicLinkManager(true);
    } catch (err: any) {
      console.error('Failed to load run details:', err);
      setError(handleCoordinationApiError(err));
    }
  };

  const handleRefresh = () => {
    loadTemplates();
    loadActiveRuns();
  };

  const handleRequestInsight = async () => {
    setInsightLoading(true);
    setError(null);
    try {
      const message = buildInsightPrompt();
      const prioritizedRun = activeRuns.find((run) => run.status === 'active') || activeRuns[0] || null;
      const payload: Parameters<typeof requestBlueprintChat>[1] = {
        message,
      };

      if (prioritizedRun) {
        payload.runId = prioritizedRun.id;
      }

      if (!prioritizedRun && templates.length === 1) {
        payload.templateId = templates[0]?.id;
      }

      const response = await requestBlueprintChat(spaceId, payload);
      setInsight(response);
      setInsightGeneratedAt(new Date());

      if (response.runContext && onRunContextUpdate) {
        const firstParticipant = response.runContext.participants[0] || null;
        onRunContextUpdate({
          runId: response.runContext.runId,
          currentState: response.runContext.currentState?.name,
          participant: firstParticipant
            ? {
                id: firstParticipant.id,
                role: firstParticipant.role,
                userId: firstParticipant.userId,
              }
            : null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch blueprint insight:', err);
      setError('Unable to generate blueprint insight. Please try again.');
    } finally {
      setInsightLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header Actions */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Quick Actions</h3>
          <button
            onClick={handleRefresh}
            disabled={loading.templates || loading.runs}
            className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            {loading.templates || loading.runs ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="space-y-2">
          <Link
            href={`/templates/new?spaceId=${spaceId}`}
            className="block w-full text-center px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Create New Template
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-xs text-red-600">!</span>
            </div>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

        <div className="p-4 space-y-6">
        {/* Insight panel */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Blueprint Insight</h3>
              <p className="text-xs text-gray-500">Preview which templates match before starting a run</p>
            </div>
            <button
              onClick={handleRequestInsight}
              disabled={insightLoading}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
            >
              {insightLoading ? 'Generating…' : 'Generate' }
            </button>
          </div>

          {insight ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-600">
                {insightGeneratedAt
                  ? `Last updated ${formatRelativeTime(insightGeneratedAt)}`
                  : 'Last updated just now'}
              </div>
              {insight.suggestedResponse?.text && (
                <div className="rounded bg-white p-3 text-sm text-gray-800 border border-gray-200">
                  {insight.suggestedResponse.text}
                </div>
              )}

              {insight.suggestedResponse?.blueprintMatches?.length ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Top matches</div>
                  {insight.suggestedResponse.blueprintMatches.slice(0, 3).map((match, index) => (
                    <div key={`${match.templateId}-${index}`} className="rounded border border-gray-200 bg-white p-3 text-xs text-gray-700">
                      <div className="flex items-center justify-between text-sm text-gray-900">
                        <span className="font-medium">#{index + 1} {match.name}</span>
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
              ) : (
                <div className="text-xs text-gray-500">No template matches yet. Try generating insight after you create a template.</div>
              )}

              {insight.runContext && (
                <div className="rounded border border-gray-200 bg-white p-3 text-xs text-gray-700">
                  <div className="font-semibold text-gray-800 mb-1">Run context preview</div>
                  <div className="grid gap-1">
                    <div><span className="font-medium">Status:</span> {insight.runContext.status}</div>
                    {insight.runContext.currentState && (
                      <div>
                        <span className="font-medium">Current state:</span> {insight.runContext.currentState.name}
                      </div>
                    )}
                    {insight.runContext.nextStates.length > 0 && (
                      <div>
                        <span className="font-medium">Next steps:</span> {insight.runContext.nextStates.map((state) => state.name).join(', ')}
                      </div>
                    )}
                    {insight.runContext.participants.length > 0 && (
                      <div>
                        <span className="font-medium">Participants:</span> {insight.runContext.participants.map((p) => p.role).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {insight.suggestedResponse?.actions?.length ? (
                <div className="text-xs text-gray-600">
                  <div className="font-semibold text-gray-700 mb-1">Suggested next steps</div>
                  <div className="flex flex-wrap gap-2">
                    {insight.suggestedResponse.actions.map((action) => (
                      <span key={action} className="rounded-full bg-gray-200/70 px-3 py-1 text-[11px] text-gray-700">
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-gray-500">Generate an insight to see matching templates and suggested actions.</div>
          )}
        </div>
        {/* Templates Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Templates</h3>
            <Link
              href={`/templates?spaceId=${spaceId}`}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              View All
            </Link>
          </div>

          {loading.templates ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="mb-2">No templates available</div>
              <Link
                href={`/templates/new?spaceId=${spaceId}`}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Create your first template
              </Link>
            </div>
          ) : (
            <TemplateSelector
              templates={templates}
              onSelectTemplate={handleTemplateSelect}
              spaceId={spaceId}
            />
          )}
        </div>

        {/* Active Runs Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Active Coordination Runs</h3>
            <span className="text-xs text-gray-500">
              {activeRuns.length} active
            </span>
          </div>

          {loading.runs ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <ActiveRunsList
              runs={activeRuns}
              onStatusChange={handleRunStatusChange}
              onShowMagicLinks={handleShowMagicLinks}
              onRefresh={loadActiveRuns}
              spaceId={spaceId}
            />
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-lg font-semibold text-blue-900">
              {templates.length}
            </div>
            <div className="text-xs text-blue-700">Templates</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-lg font-semibold text-green-900">
              {activeRuns.filter(r => r.status === 'active').length}
            </div>
            <div className="text-xs text-green-700">Active Runs</div>
          </div>
        </div>

        {/* Help Section */}
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Getting Started
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>1. Create templates to define coordination workflows</p>
            <p>2. Use templates to start coordination runs with participants</p>
            <p>3. Share magic links for participants to join runs</p>
            <p>4. Monitor progress and manage active coordinations</p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showRunCreationModal && selectedTemplate && (
        <RunCreationModal
          template={selectedTemplate}
          spaceId={spaceId}
          onClose={() => {
            setShowRunCreationModal(false);
            setSelectedTemplate(null);
          }}
          onRunCreated={handleRunCreated}
        />
      )}

      {showMagicLinkManager && selectedRunForLinks && (
        <MagicLinkManager
          run={selectedRunForLinks}
          spaceId={spaceId}
          onClose={() => {
            setShowMagicLinkManager(false);
            setSelectedRunForLinks(null);
          }}
        />
      )}
    </div>
  );
};

export default CoordinationPanel;
