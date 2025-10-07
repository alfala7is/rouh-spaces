"use client";
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CoordinationChat } from '../../../components/coordination/CoordinationChat';
import { validateMagicLink, getCoordinationRun } from '../../../lib/coordination-api';
import type { CoordinationRunDto, ParticipantContextDto } from '../../../types/coordination';

interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export default function CoordinationRunPage() {
  const params = useParams<{ runId: string }>();
  const searchParams = useSearchParams();
  const runId = params.runId;
  const token = searchParams.get('token');
  const role = searchParams.get('role');

  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    error: null,
  });
  const [runData, setRunData] = useState<CoordinationRunDto | null>(null);
  const [participantContext, setParticipantContext] = useState<ParticipantContextDto | null>(null);

  useEffect(() => {
    async function initializePage() {
      if (!runId) {
        setLoadingState({
          isLoading: false,
          error: 'Invalid coordination run ID',
        });
        return;
      }

      try {
        setLoadingState({ isLoading: true, error: null });

        // Validate magic link token if provided, or use role/observer mode
        let resolvedParticipant: ParticipantContextDto | null = null;
        let runFromMagicLink: CoordinationRunDto | null = null;

        if (token || role) {
          try {
            const magicLinkResult = await validateMagicLink(runId, token || undefined, role);
            resolvedParticipant = magicLinkResult.participantContext;
            runFromMagicLink = magicLinkResult.runData;
          } catch (error) {
            setLoadingState({
              isLoading: false,
              error: 'Invalid or expired magic link. Please request a new invitation.',
            });
            return;
          }
        }

        // Fetch coordination run data if not already obtained from magic link validation
        const run = runFromMagicLink || await getCoordinationRun(runId);

        setRunData(run);
        setParticipantContext(resolvedParticipant);
        setLoadingState({ isLoading: false, error: null });
      } catch (error) {
        console.error('Failed to load coordination run:', error);
        setLoadingState({
          isLoading: false,
          error: 'Failed to load coordination run. Please check the URL and try again.',
        });
      }
    }

    initializePage();
  }, [runId, token, role]);

  if (loadingState.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading coordination run...</p>
        </div>
      </div>
    );
  }

  if (loadingState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Error</h1>
          <p className="text-gray-600 mb-6">{loadingState.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!runData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Coordination run not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CoordinationChat
        runData={runData}
        participantContext={participantContext}
        magicToken={token || undefined}
      />
    </div>
  );
}