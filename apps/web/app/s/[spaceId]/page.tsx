"use client";
import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import SpaceStudio from '../../../components/SpaceStudio';

export default function SpacePage() {
  const params = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  const spaceId = params.spaceId;

  // URL parameter handling for coordination deep linking
  const activeTab = searchParams.get('tab');
  const templateId = searchParams.get('templateId');
  const runId = searchParams.get('runId');

  // Update page title when coordination is active
  useEffect(() => {
    if (activeTab === 'coordination') {
      document.title = 'Coordination - Space Studio';
    } else {
      document.title = 'Space Studio';
    }

    // Add coordination-specific meta tags for social sharing
    if (activeTab === 'coordination') {
      const existingMeta = document.querySelector('meta[name="description"]');
      if (existingMeta) {
        existingMeta.setAttribute('content', 'Create and manage coordination runs in your space');
      }
    }
  }, [activeTab]);

  // Pass URL parameters to SpaceStudio for coordination routing
  const coordinationContext = {
    activeTab: activeTab || undefined,
    templateId: templateId || undefined,
    runId: runId || undefined,
  };

  return <SpaceStudio spaceId={spaceId} coordinationContext={coordinationContext} />;
}
