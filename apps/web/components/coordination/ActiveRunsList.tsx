"use client";
import React, { useState } from 'react';
import { updateSpaceCoordinationRunStatus, handleCoordinationApiError, formatCoordinationState, getCoordinationStateClasses } from '@/lib/coordination-api';
import type { CoordinationRunDto, CoordinationState } from '@/types/coordination';
import { StateProgressBar } from './StateProgressBar';

interface SpaceCoordinationRun extends CoordinationRunDto {
  templateId: string;
  templateName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

interface Props {
  runs: SpaceCoordinationRun[];
  onStatusChange: (runId: string, status: SpaceCoordinationRun['status']) => void;
  onShowMagicLinks: (run: SpaceCoordinationRun) => void;
  onRefresh: () => void;
  spaceId: string;
}

const ActiveRunsList: React.FC<Props> = ({
  runs,
  onStatusChange,
  onShowMagicLinks,
  onRefresh,
  spaceId
}) => {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'status' | 'template'>('recent');

  const filteredRuns = runs.filter(run => {
    if (filter === 'all') return true;
    return run.status === filter;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'status':
        return a.status.localeCompare(b.status);
      case 'template':
        return a.templateName.localeCompare(b.templateName);
      default:
        return 0;
    }
  });

  const handleStatusChange = async (runId: string, newStatus: SpaceCoordinationRun['status']) => {
    setLoading(prev => ({ ...prev, [runId]: true }));
    setError(null);

    try {
      await updateSpaceCoordinationRunStatus(spaceId, runId, newStatus);
      onStatusChange(runId, newStatus);
    } catch (err: any) {
      console.error('Failed to update run status:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(prev => ({ ...prev, [runId]: false }));
    }
  };

  const getStatusColor = (status: SpaceCoordinationRun['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };


  const getParticipantSummary = (participants: any[]) => {
    const roleCounts = participants.reduce((acc, p) => {
      const role = typeof p.role === 'string' ? p.role : p.role?.name || 'unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(roleCounts)
      .map(([role, count]) => `${count} ${role}${count > 1 ? 's' : ''}`)
      .join(', ');
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="mb-2">No coordination runs yet</div>
        <div className="text-sm">Create a template and start your first coordination run!</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'paused', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1 text-sm rounded-full transition-colors capitalize ${
                filter === status
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="recent">Sort by: Recent</option>
          <option value="status">Sort by: Status</option>
          <option value="template">Sort by: Template</option>
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Runs List */}
      <div className="space-y-3">
        {filteredRuns.map((run) => (
          <div
            key={run.id}
            className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {run.templateName}
                  </h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-x-3">
                  <span>ID: {run.id.substring(0, 8)}...</span>
                  <span>Updated {formatTimeAgo(run.updatedAt)}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => window.open(`/r/${run.id}`, '_blank')}
                  className="p-1 text-blue-600 hover:text-blue-700 text-xs"
                  title="View Coordination"
                >
                  👁️
                </button>
                <button
                  onClick={() => onShowMagicLinks(run)}
                  className="p-1 text-purple-600 hover:text-purple-700 text-xs"
                  title="Manage Magic Links"
                >
                  🔗
                </button>
              </div>
            </div>

            {/* Current State and Progress */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{formatCoordinationState(run.currentState).icon}</span>
                <span className="text-sm font-medium text-gray-700">
                  Current: {formatCoordinationState(run.currentState).label}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getCoordinationStateClasses(run.currentState).progress}`}
                    style={{
                      width: `${formatCoordinationState(run.currentState).progressPercent}%`
                    }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  Step {formatCoordinationState(run.currentState).progressIndex + 1} of 5
                </div>
              </div>
            </div>

            {/* Participants Summary */}
            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-1">Participants:</div>
              <div className="text-sm text-gray-800">
                {getParticipantSummary(run.participants)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {run.status === 'active' && (
                <button
                  onClick={() => handleStatusChange(run.id, 'paused')}
                  disabled={loading[run.id]}
                  className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 disabled:opacity-50"
                >
                  {loading[run.id] ? '...' : 'Pause'}
                </button>
              )}
              {run.status === 'paused' && (
                <button
                  onClick={() => handleStatusChange(run.id, 'active')}
                  disabled={loading[run.id]}
                  className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-md hover:bg-green-200 disabled:opacity-50"
                >
                  {loading[run.id] ? '...' : 'Resume'}
                </button>
              )}
              {(run.status === 'active' || run.status === 'paused') && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to cancel this coordination run?')) {
                      handleStatusChange(run.id, 'cancelled');
                    }
                  }}
                  disabled={loading[run.id]}
                  className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-md hover:bg-red-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => onShowMagicLinks(run)}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
              >
                Manage Links
              </button>
            </div>

            {/* Completion Status */}
            {run.status === 'completed' && run.completedAt && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <span>✅</span>
                  <span>Completed {formatTimeAgo(run.completedAt)}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State for Filtered Results */}
      {filteredRuns.length === 0 && runs.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="mb-2">No runs match the current filter</div>
          <button
            onClick={() => setFilter('all')}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Show all runs
          </button>
        </div>
      )}

      {/* Load More / Pagination could go here */}
      {filteredRuns.length > 0 && (
        <div className="text-center pt-4">
          <button
            onClick={onRefresh}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Refresh runs
          </button>
        </div>
      )}
    </div>
  );
};

export default ActiveRunsList;