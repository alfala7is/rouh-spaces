"use client";
import React, { useState, useEffect } from 'react';
import {
  getRunMagicLinksWithExpiry,
  generateCoordinationMagicLink,
  addCoordinationParticipant,
  removeCoordinationParticipant,
  inviteSpaceMemberToRun,
  handleCoordinationApiError
} from '@/lib/coordination-api';
import type { CoordinationRunDto, ParticipantContextDto, ParticipantRole } from '@/types/coordination';

interface SpaceCoordinationRun extends CoordinationRunDto {
  templateId: string;
  templateName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  template?: {
    roles?: Array<{
      id: string;
      name: string;
    }>;
  };
}

interface Props {
  run: SpaceCoordinationRun;
  spaceId: string;
  onClose: () => void;
}

interface MagicLinkData {
  participantId: string;
  email: string;
  role: string;
  name?: string;
  magicLink: string;
  expiresAt: string;
  isExpired: boolean;
  lastActivity?: string;
}

const MagicLinkManager: React.FC<Props> = ({ run, spaceId, onClose }) => {
  const [magicLinks, setMagicLinks] = useState<MagicLinkData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({
    email: '',
    name: '',
    role: 'provider' as ParticipantRole,
  });

  useEffect(() => {
    loadMagicLinks();
  }, [run.id]);

  const loadMagicLinks = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to use batch API first
      try {
        const batchLinks = await getRunMagicLinksWithExpiry(spaceId, run.id);
        const linksData: MagicLinkData[] = batchLinks.map(link => ({
          participantId: link.participantId,
          email: link.email,
          role: link.role,
          name: '',
          magicLink: link.magicLink,
          expiresAt: link.expiresAt,
          isExpired: link.isExpired,
        }));
        setMagicLinks(linksData);
        return;
      } catch (batchError) {
        console.warn('Batch magic link fetch failed, falling back to individual calls:', batchError);
      }

      // Fallback to individual calls for existing participants
      const linksData: MagicLinkData[] = [];

      for (const participant of run.participants) {
        try {
          const linkResponse = await generateCoordinationMagicLink(run.id, participant.id);
          linksData.push({
            participantId: participant.id,
            email: participant.email || participant.metadata?.email || '',
            role: typeof participant.role === 'string' ? participant.role : participant.role?.name || 'unknown',
            name: participant.name,
            magicLink: linkResponse.magicLink,
            expiresAt: linkResponse.expiresAt,
            isExpired: new Date(linkResponse.expiresAt) < new Date(),
            lastActivity: participant.lastActivity,
          });
        } catch (linkError) {
          console.error(`Failed to get magic link for participant ${participant.id}:`, linkError);
          linksData.push({
            participantId: participant.id,
            email: participant.email || participant.metadata?.email || '',
            role: typeof participant.role === 'string' ? participant.role : participant.role?.name || 'unknown',
            name: participant.name,
            magicLink: '',
            expiresAt: '',
            isExpired: true,
            lastActivity: participant.lastActivity,
          });
        }
      }

      setMagicLinks(linksData);
    } catch (err: any) {
      console.error('Failed to load magic links:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, participantEmail: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(participantEmail);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedLink(participantEmail);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  const regenerateLink = async (participantId: string, participantEmail: string) => {
    setLoading(true);
    setError(null);

    try {
      const linkResponse = await generateCoordinationMagicLink(run.id, participantId, 48); // 48-hour expiration

      setMagicLinks(prev =>
        prev.map(link =>
          link.participantId === participantId
            ? {
                ...link,
                magicLink: linkResponse.magicLink,
                expiresAt: linkResponse.expiresAt,
                isExpired: false,
              }
            : link
        )
      );
    } catch (err: any) {
      console.error('Failed to regenerate magic link:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const addParticipant = async () => {
    if (!newParticipant.email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newParticipant.email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let response: { participant: ParticipantContextDto; magicLink: string };

      // Try to resolve roleId from template roles if available
      const templateRoles = run.template?.roles || [];
      const roleId = templateRoles.find(role => role.name === newParticipant.role)?.id;

      // Use email-based API (roleId will be resolved by backend from role name)
      response = await addCoordinationParticipant(run.id, {
        email: newParticipant.email,
        role: newParticipant.role,
      });

      // Get the actual expiry from the generated magic link
      let actualExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      if (response.magicLink) {
        try {
          const freshLink = await generateCoordinationMagicLink(run.id, response.participant.id);
          actualExpiresAt = freshLink.expiresAt;
        } catch (linkError) {
          console.warn('Failed to get fresh link with expiry:', linkError);
        }
      }

      const newLinkData: MagicLinkData = {
        participantId: response.participant.id,
        email: response.participant.email || newParticipant.email,
        role: response.participant.role,
        name: newParticipant.name || response.participant.name,
        magicLink: response.magicLink,
        expiresAt: actualExpiresAt,
        isExpired: false,
      };

      setMagicLinks(prev => [...prev, newLinkData]);
      setNewParticipant({ email: '', name: '', role: 'provider' });
      setShowAddParticipant(false);
    } catch (err: any) {
      console.error('Failed to add participant:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (participantId: string, participantEmail: string) => {
    if (!confirm(`Remove ${participantEmail} from this coordination run?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await removeCoordinationParticipant(run.id, participantId);
      setMagicLinks(prev => prev.filter(link => link.participantId !== participantId));
    } catch (err: any) {
      console.error('Failed to remove participant:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const formatTimeUntilExpiry = (expiresAt: string) => {
    if (!expiresAt) return 'Unknown';

    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'requester': return 'bg-blue-100 text-blue-800';
      case 'provider': return 'bg-green-100 text-green-800';
      case 'organizer': return 'bg-purple-100 text-purple-800';
      case 'observer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Magic Link Manager</h3>
              <p className="text-sm text-gray-600 mt-1">
                {run.templateName} • {magicLinks.length} participant{magicLinks.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          {/* Actions */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setShowAddParticipant(true)}
              disabled={loading || showAddParticipant}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              Add Participant
            </button>
            <button
              onClick={loadMagicLinks}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 text-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* Add Participant Form */}
          {showAddParticipant && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900">Add New Participant</h4>
                <button
                  onClick={() => {
                    setShowAddParticipant(false);
                    setNewParticipant({ email: '', name: '', role: 'provider' });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  value={newParticipant.email}
                  onChange={(e) => setNewParticipant(prev => ({ ...prev, email: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={newParticipant.name}
                  onChange={(e) => setNewParticipant(prev => ({ ...prev, name: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <select
                  value={newParticipant.role}
                  onChange={(e) => setNewParticipant(prev => ({ ...prev, role: e.target.value as ParticipantRole }))}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="provider">Provider</option>
                  <option value="requester">Requester</option>
                  <option value="organizer">Organizer</option>
                  <option value="observer">Observer</option>
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={addParticipant}
                  disabled={loading || !newParticipant.email.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  Add Participant
                </button>
              </div>
            </div>
          )}

          {/* Magic Links List */}
          <div className="space-y-3">
            {magicLinks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No participants found</p>
              </div>
            ) : (
              magicLinks.map((linkData) => (
                <div
                  key={linkData.participantId}
                  className="border border-gray-200 rounded-lg p-4 bg-white"
                >
                  {/* Participant Info */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {linkData.name || linkData.email}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${getRoleColor(linkData.role)} capitalize`}>
                          {linkData.role}
                        </span>
                        {linkData.isExpired && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                            Link Expired
                          </span>
                        )}
                      </div>
                      {linkData.name && (
                        <div className="text-sm text-gray-600">{linkData.email}</div>
                      )}
                      {linkData.lastActivity && (
                        <div className="text-xs text-gray-500">
                          Last active: {new Date(linkData.lastActivity).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeParticipant(linkData.participantId, linkData.email)}
                      disabled={loading}
                      className="text-red-500 hover:text-red-700 text-sm disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Magic Link */}
                  {linkData.magicLink ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Magic Link</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Expires in: {formatTimeUntilExpiry(linkData.expiresAt)}
                          </span>
                          {linkData.isExpired && (
                            <button
                              onClick={() => regenerateLink(linkData.participantId, linkData.email)}
                              disabled={loading}
                              className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={linkData.magicLink}
                          readOnly
                          className="flex-1 px-2 py-1 text-sm font-mono bg-white border border-gray-300 rounded text-gray-600"
                        />
                        <button
                          onClick={() => copyToClipboard(linkData.magicLink, linkData.email)}
                          className={`px-3 py-1 text-sm rounded transition-colors ${
                            copiedLink === linkData.email
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {copiedLink === linkData.email ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-sm text-red-800">Failed to generate magic link</div>
                      <button
                        onClick={() => regenerateLink(linkData.participantId, linkData.email)}
                        disabled={loading}
                        className="mt-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200 disabled:opacity-50"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bulk Actions */}
          {magicLinks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Bulk Actions</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const allLinks = magicLinks.map(link => `${link.email}: ${link.magicLink}`).join('\n\n');
                    copyToClipboard(allLinks, 'all');
                  }}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Copy All Links
                </button>
                <button
                  onClick={() => {
                    magicLinks.forEach((link, index) => {
                      setTimeout(() => regenerateLink(link.participantId, link.email), index * 100);
                    });
                  }}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50"
                >
                  Regenerate All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Links are valid for 24-48 hours and can be regenerated as needed
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MagicLinkManager;