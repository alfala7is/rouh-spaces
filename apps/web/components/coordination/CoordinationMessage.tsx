"use client";
import React, { useState } from 'react';
import { Button } from '@rouh/ui';
import type { CoordinationMessageDto, ParticipantContextDto } from '../../types/coordination';

interface CoordinationMessageProps {
  message: CoordinationMessageDto;
  currentUser: ParticipantContextDto | null;
  currentState: string;
}

export function CoordinationMessage({ message, currentUser, currentState }: CoordinationMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine message alignment and styling based on sender
  const isCurrentUser = message.sender?.id === currentUser?.id;
  const isSystemMessage = message.messageType === 'system' || message.messageType === 'state_transition';

  // Get role-based styling
  const getRoleBasedStyling = () => {
    if (isSystemMessage) {
      return {
        containerClass: 'justify-center',
        messageClass: 'bg-gray-50 text-gray-700 border border-gray-200 rounded-lg',
        maxWidth: 'max-w-2xl'
      };
    }

    if (isCurrentUser) {
      return {
        containerClass: 'justify-end',
        messageClass: 'bg-blue-600 text-white rounded-2xl rounded-br-lg',
        maxWidth: 'max-w-md'
      };
    }

    // Other participants - style based on role
    const senderRole = message.sender?.role;
    let roleClass = 'bg-white text-gray-900 border border-gray-200';

    switch (senderRole) {
      case 'requester':
        roleClass = 'bg-blue-50 text-blue-900 border border-blue-200';
        break;
      case 'provider':
        roleClass = 'bg-green-50 text-green-900 border border-green-200';
        break;
      case 'organizer':
        roleClass = 'bg-purple-50 text-purple-900 border border-purple-200';
        break;
    }

    return {
      containerClass: 'justify-start',
      messageClass: `${roleClass} rounded-2xl rounded-bl-lg`,
      maxWidth: 'max-w-md'
    };
  };

  // Get sender display info
  const getSenderInfo = () => {
    if (isSystemMessage || !message.sender) {
      return null;
    }

    const senderName = message.sender.email || message.sender.name || `${message.sender.role} participant`;
    const senderRole = message.sender.role;

    return { senderName, senderRole };
  };

  // Get role badge color
  const getRoleBadgeColor = (role: string | undefined) => {
    if (!role) return 'bg-gray-100 text-gray-700';

    switch (role.toLowerCase()) {
      case 'requester':
        return 'bg-blue-100 text-blue-700';
      case 'provider':
        return 'bg-green-100 text-green-700';
      case 'organizer':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Render state transition message
  const renderStateTransitionContent = () => {
    if (message.messageType !== 'state_transition') return null;

    const metadata = message.metadata;
    const previousState = metadata?.previousState;
    const newState = metadata?.newState;

    return (
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 text-sm">
          <span className="text-blue-600 font-medium">{previousState}</span>
          <span className="text-gray-400">→</span>
          <span className="text-green-600 font-medium">{newState}</span>
        </div>
        {metadata?.transitionData && (
          <div className="mt-2 text-xs text-gray-600">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-blue-600 hover:text-blue-800"
            >
              {isExpanded ? 'Hide details' : 'Show details'}
            </button>
            {isExpanded && (
              <div className="mt-2 p-2 bg-gray-100 rounded text-left">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(metadata.transitionData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render evidence attachment
  const renderEvidenceContent = () => {
    if (message.messageType !== 'evidence') return null;

    const evidence = message.metadata?.evidence;
    if (!evidence) return null;

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-lg">📋</span>
          <span className="text-sm font-medium text-gray-800">Evidence Submitted</span>
        </div>

        {evidence.files && evidence.files.length > 0 && (
          <div className="space-y-2">
            {evidence.files.map((file: any, index: number) => (
              <div key={index} className="flex items-center space-x-2 text-sm">
                <span className="text-blue-600">📎</span>
                <span className="text-gray-700">{file.name}</span>
                <span className="text-gray-500">({(file.size / 1024).toFixed(1)}KB)</span>
              </div>
            ))}
          </div>
        )}

        {evidence.description && (
          <div className="mt-2 text-sm text-gray-700">
            {evidence.description}
          </div>
        )}

        {currentUser?.role === 'requester' && (
          <div className="mt-3 flex space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                // TODO: Implement evidence approval
                console.log('Approve evidence');
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                // TODO: Implement evidence rejection
                console.log('Request changes');
              }}
            >
              Request Changes
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Render commitment details
  const renderCommitmentContent = () => {
    if (message.messageType !== 'commitment') return null;

    const commitment = message.metadata?.commitment;
    if (!commitment) return null;

    return (
      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-lg">🤝</span>
          <span className="text-sm font-medium text-blue-800">Commitment Made</span>
        </div>

        <div className="space-y-2 text-sm">
          {commitment.terms && (
            <div>
              <span className="font-medium text-gray-800">Terms:</span>
              <p className="text-gray-700 mt-1">{commitment.terms}</p>
            </div>
          )}

          {commitment.deadline && (
            <div>
              <span className="font-medium text-gray-800">Deadline:</span>
              <p className="text-gray-700">{new Date(commitment.deadline).toLocaleDateString()}</p>
            </div>
          )}

          {commitment.deposit && (
            <div>
              <span className="font-medium text-gray-800">Deposit:</span>
              <p className="text-gray-700">${commitment.deposit}</p>
            </div>
          )}
        </div>

        {commitment.status && (
          <div className="mt-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              commitment.status === 'confirmed'
                ? 'bg-green-100 text-green-800'
                : commitment.status === 'pending'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {commitment.status}
            </span>
          </div>
        )}
      </div>
    );
  };

  const styling = getRoleBasedStyling();
  const senderInfo = getSenderInfo();

  return (
    <div className={`w-full flex ${styling.containerClass} mb-4`}>
      <div className={`${styling.maxWidth} ${styling.messageClass} px-4 py-3 shadow-sm`}>
        {/* Sender info for non-system messages */}
        {senderInfo && (
          <div className="flex items-center space-x-2 mb-2">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              getRoleBadgeColor(senderInfo.senderRole)
            }`}>
              {senderInfo.senderRole}
            </span>
            <span className="text-xs opacity-75">
              {isCurrentUser ? 'You' : senderInfo.senderName}
            </span>
          </div>
        )}

        {/* Message content */}
        <div className="text-sm">
          {message.messageType === 'state_transition' ? (
            renderStateTransitionContent()
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>

        {/* Special content based on message type */}
        {renderEvidenceContent()}
        {renderCommitmentContent()}

        {/* Message actions for specific roles and states */}
        {message.messageType === 'user' && !isCurrentUser && currentUser?.role === 'organizer' && (
          <div className="mt-3 pt-2 border-t border-gray-200 flex space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                // TODO: Implement message flagging
                console.log('Flag message');
              }}
            >
              Flag
            </Button>
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-2 text-xs opacity-60 text-right">
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}