"use client";
import React, { useState } from 'react';
import { Button, Card } from '@rouh/ui';
import type { CoordinationRunDto, ParticipantContextDto } from '../../types/coordination';

interface ParticipantListProps {
  participants: ParticipantContextDto[];
  currentUser: ParticipantContextDto | null;
  runData: CoordinationRunDto;
}

export function ParticipantList({ participants, currentUser, runData }: ParticipantListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Role badge colors
  const getRoleBadgeColor = (role: string): string => {
    switch (role.toLowerCase()) {
      case 'requester':
        return 'bg-blue-100 text-blue-800';
      case 'provider':
        return 'bg-green-100 text-green-800';
      case 'organizer':
        return 'bg-purple-100 text-purple-800';
      case 'observer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get online status indicator
  const getStatusIndicator = (participant: ParticipantContextDto): JSX.Element => {
    const isCurrentUser = currentUser?.id === participant.id;
    const isOnline = participant.isOnline ?? true; // Assume online if not specified

    return (
      <div className={`w-3 h-3 rounded-full ${
        isCurrentUser
          ? 'bg-green-500'
          : isOnline
          ? 'bg-green-400'
          : 'bg-gray-300'
      }`} title={
        isCurrentUser
          ? 'You'
          : isOnline
          ? 'Online'
          : 'Offline'
      } />
    );
  };

  // Check if current user can view participants based on permissions
  const canViewParticipants = (): boolean => {
    return currentUser?.canViewParticipants ?? true;
  };

  // Check if current user can manage participants (add/remove)
  const canManageParticipants = (): boolean => {
    return currentUser?.role === 'organizer' || currentUser?.canManageParticipants;
  };

  // Get participant display name
  const getParticipantName = (participant: ParticipantContextDto): string => {
    return participant.email || participant.name || `${participant.role} participant`;
  };

  // Get participant activity status
  const getActivityStatus = (participant: ParticipantContextDto): string => {
    if (participant.lastActivity) {
      const lastActivity = new Date(participant.lastActivity);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));

      if (diffMinutes < 1) {
        return 'Active now';
      } else if (diffMinutes < 60) {
        return `Active ${diffMinutes}m ago`;
      } else if (diffMinutes < 1440) {
        const hours = Math.floor(diffMinutes / 60);
        return `Active ${hours}h ago`;
      } else {
        const days = Math.floor(diffMinutes / 1440);
        return `Active ${days}d ago`;
      }
    }
    return 'Unknown';
  };

  if (!canViewParticipants()) {
    return (
      <div className="p-4">
        <div className="text-center text-gray-500 text-sm">
          Participant list not available for your role
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center">
            <span className="mr-2">👥</span>
            Participants
            <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
              {participants.length}
            </span>
          </h3>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-gray-600 md:hidden"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Participants List */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'hidden md:block' : ''}`}>
        <div className="p-4 space-y-3">
          {participants.map((participant) => (
            <Card key={participant.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {/* Status indicator */}
                  {getStatusIndicator(participant)}

                  {/* Participant info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getParticipantName(participant)}
                        {currentUser?.id === participant.id && (
                          <span className="text-xs text-gray-500 ml-1">(You)</span>
                        )}
                      </p>
                    </div>

                    {/* Role badge */}
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        getRoleBadgeColor(participant.role)
                      }`}>
                        {participant.role}
                      </span>
                    </div>

                    {/* Activity status */}
                    <p className="text-xs text-gray-500 mt-1">
                      {getActivityStatus(participant)}
                    </p>
                  </div>
                </div>

                {/* Actions (if user can manage participants) */}
                {canManageParticipants() && participant.id !== currentUser?.id && (
                  <div className="flex-shrink-0">
                    <button
                      className="text-gray-400 hover:text-red-600 text-xs"
                      title="Remove participant"
                      onClick={() => {
                        // TODO: Implement remove participant functionality
                        console.log('Remove participant:', participant.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Additional participant details */}
              {participant.permissions && Object.keys(participant.permissions).length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Permissions: {Object.entries(participant.permissions)
                      .filter(([, value]) => value)
                      .map(([key]) => key.replace('can', '').toLowerCase())
                      .join(', ')}
                  </p>
                </div>
              )}
            </Card>
          ))}

          {participants.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No participants yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Add participant button */}
      {canManageParticipants() && (
        <div className="border-t p-4">
          <Button
            variant="secondary"
            className="w-full text-sm"
            onClick={() => {
              // TODO: Implement add participant functionality
              console.log('Add participant to run:', runData.id);
            }}
          >
            + Add Participant
          </Button>
        </div>
      )}

      {/* Coordination info */}
      <div className="border-t p-4 bg-gray-50">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Run ID:</span>
            <span className="font-mono">{runData.id.slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between">
            <span>Created:</span>
            <span>{new Date(runData.createdAt).toLocaleDateString()}</span>
          </div>
          {runData.completedAt && (
            <div className="flex justify-between">
              <span>Completed:</span>
              <span>{new Date(runData.completedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}