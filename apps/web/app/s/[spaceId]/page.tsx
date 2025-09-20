"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import SpaceStudio from '../../../components/SpaceStudio';

export default function SpacePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;

  return <SpaceStudio spaceId={spaceId} />;
}
