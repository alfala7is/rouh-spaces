"use client";
import React from 'react';
import type { KnowledgeEntry, PendingSuggestion } from './TrainingChat';

interface Props {
  entries: KnowledgeEntry[];
  onDelete: (entryId: string) => void;
  onRefresh?: () => void;
  onEdit: (entryId: string, updates: { title: string; canonicalText: string; tags?: string[] }) => void;
  suggestions: PendingSuggestion[];
  onSuggestionAccept: (suggestion: PendingSuggestion) => void;
  onSuggestionDismiss: (suggestionId: string) => void;
  onTrain: () => Promise<void> | void;
  isTraining: boolean;
}

const typeLabels: Record<KnowledgeEntry['type'], string> = {
  fact: 'Facts',
  behavior: 'Behavior guidelines',
  workflow: 'Workflows',
};

const KnowledgePanel: React.FC<Props> = ({
  entries,
  onDelete,
  onRefresh,
  onEdit,
  suggestions,
  onSuggestionAccept,
  onSuggestionDismiss,
  onTrain,
  isTraining,
}) => {
  const grouped = entries.reduce<Record<KnowledgeEntry['type'], KnowledgeEntry[]>>(
    (acc, entry) => {
      acc[entry.type] = acc[entry.type] ? [...acc[entry.type], entry] : [entry];
      return acc;
    },
    { fact: [], behavior: [], workflow: [] }
  );

  const renderGroup = (type: KnowledgeEntry['type']) => {
    if (!grouped[type] || grouped[type].length === 0) {
      return null;
    }

    return (
      <div key={type} className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{typeLabels[type]}</h3>
        <div className="space-y-2">
          {grouped[type].map((entry) => (
            <div key={entry.id} className="border border-gray-200 bg-white rounded-lg p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{entry.title}</h4>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{entry.canonicalText}</p>
                  {entry.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const nextTitle = window.prompt('Edit title', entry.title) ?? entry.title;
                      const nextText = window.prompt('Edit knowledge text', entry.canonicalText) ?? entry.canonicalText;
                      if (!nextText.trim()) {
                        return;
                      }
                      onEdit(entry.id, {
                        title: nextTitle.trim() || entry.title,
                        canonicalText: nextText.trim(),
                        tags: entry.tags,
                      });
                    }}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    className="text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                Saved {new Date(entry.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {entries.length === 0 ? (
        <div className="mt-4 text-sm text-gray-500">
          <p>No knowledge captured yet.</p>
          <p className="mt-1">Upload documents or chat corrections to add facts, behaviors, or workflows.</p>
          {onRefresh && (
            <button
              type="button"
              className="mt-3 text-xs text-blue-600 hover:text-blue-700"
              onClick={onRefresh}
            >
              Refresh
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {(['fact', 'behavior', 'workflow'] as Array<KnowledgeEntry['type']>)
            .map(renderGroup)
            .filter(Boolean)}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Suggested knowledge</h3>
            <span className="text-xs text-gray-500">Review and accept to add</span>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="border border-blue-100 bg-blue-50 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{suggestion.title}</h4>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{suggestion.text}</p>
                    <div className="mt-2 text-xs text-gray-500">
                      Type: {suggestion.type}
                      {suggestion.confidence !== undefined &&
                        ` • Confidence: ${Math.round(suggestion.confidence * 100)}%`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onSuggestionAccept(suggestion)}
                      className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onSuggestionDismiss(suggestion.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">
          Training applies all saved knowledge to the assistant’s system prompt.
        </p>
        <button
          type="button"
          onClick={() => {
            void onTrain();
          }}
          disabled={isTraining}
          className={`w-full rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors ${
            isTraining ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isTraining ? 'Training…' : 'Train assistant'}
        </button>
      </div>
    </div>
  );
};

export default KnowledgePanel;
