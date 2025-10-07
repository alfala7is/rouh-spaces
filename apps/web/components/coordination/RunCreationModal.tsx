"use client";
import React, { useState, useEffect } from 'react';
import {
  createCoordinationRunFromTemplate,
  handleCoordinationApiError
} from '@/lib/coordination-api';
import { apiFetch } from '@/lib/api';
import type { CoordinationRunDto, ParticipantRole, DEFAULT_ROLE_PERMISSIONS } from '@/types/coordination';

interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  roles?: Array<{
    id: string;
    name: string;
    minRequired: number;
    maxAllowed?: number;
    description?: string;
  }>;
}

interface SpaceCoordinationRun extends CoordinationRunDto {
  templateId: string;
  templateName: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

interface Props {
  template: Template;
  spaceId: string;
  onClose: () => void;
  onRunCreated: (run: SpaceCoordinationRun) => void;
}

interface ParticipantConfig {
  id: string;
  email: string;
  role: ParticipantRole;
  name?: string;
}

interface SpaceMember {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface RoleRequirement {
  role: string;
  minRequired: number;
  maxAllowed?: number;
  description?: string;
}

const RunCreationModal: React.FC<Props> = ({ template, spaceId, onClose, onRunCreated }) => {
  const [runName, setRunName] = useState(`${template.name} - ${new Date().toLocaleDateString()}`);
  const [runDescription, setRunDescription] = useState('');
  const [participants, setParticipants] = useState<ParticipantConfig[]>([]);
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [roleRequirements, setRoleRequirements] = useState<RoleRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'config' | 'participants' | 'review'>('config');
  const [createdRun, setCreatedRun] = useState<SpaceCoordinationRun | null>(null);
  const [magicLinks, setMagicLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSpaceMembers();
    loadTemplateRoles();
  }, [spaceId, template.id]);

  const loadSpaceMembers = async () => {
    try {
      const response = await apiFetch(`/spaces/${spaceId}/members`, {
        method: 'GET',
        spaceId,
      });
      setSpaceMembers(response.data || []);
    } catch (error) {
      console.error('Failed to load space members:', error);
    }
  };

  const loadTemplateRoles = async () => {
    try {
      // If template already has roles, use them
      if (template.roles && template.roles.length > 0) {
        setRoleRequirements(
          template.roles.map(role => ({
            role: role.name,
            minRequired: role.minRequired,
            maxAllowed: role.maxAllowed,
            description: role.description
          }))
        );
        return;
      }

      // Otherwise fetch template preview
      const response = await apiFetch(`/spaces/${spaceId}/templates/${template.id}/preview`, {
        method: 'GET',
        spaceId,
      });

      if (response.data?.roles) {
        setRoleRequirements(
          response.data.roles.map((role: any) => ({
            role: role.name,
            minRequired: role.minRequired || 1,
            maxAllowed: role.maxAllowed,
            description: role.description
          }))
        );
      } else {
        // Fallback to default roles
        setRoleRequirements([
          { role: 'requester', minRequired: 1, maxAllowed: 1, description: 'The person requesting the service' },
          { role: 'provider', minRequired: 1, maxAllowed: 3, description: 'Service providers who will fulfill the request' },
        ]);
      }
    } catch (error) {
      console.error('Failed to load template roles:', error);
      // Fallback to default roles
      setRoleRequirements([
        { role: 'requester', minRequired: 1, maxAllowed: 1, description: 'The person requesting the service' },
        { role: 'provider', minRequired: 1, maxAllowed: 3, description: 'Service providers who will fulfill the request' },
      ]);
    }
  };

  const addParticipant = (role: ParticipantRole) => {
    const newParticipant: ParticipantConfig = {
      id: `temp_${Date.now()}`,
      email: '',
      role,
    };
    setParticipants(prev => [...prev, newParticipant]);
  };

  const updateParticipant = (id: string, updates: Partial<ParticipantConfig>) => {
    setParticipants(prev =>
      prev.map(p => p.id === id ? { ...p, ...updates } : p)
    );
  };

  const removeParticipant = (id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const validateParticipants = () => {
    const roleCount = participants.reduce((acc, p) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const req of roleRequirements) {
      const count = roleCount[req.role] || 0;
      if (count < req.minRequired) {
        return `Need at least ${req.minRequired} participant(s) for ${req.role} role`;
      }
      if (req.maxAllowed && count > req.maxAllowed) {
        return `Too many participants for ${req.role} role (max: ${req.maxAllowed})`;
      }
    }

    for (const participant of participants) {
      if (!participant.email.trim()) {
        return 'All participants must have an email address';
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.email)) {
        return `Invalid email format: ${participant.email}`;
      }
    }

    return null;
  };

  const handleCreateRun = async () => {
    const validationError = validateParticipants();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create the coordination run using space-scoped API
      const runResponse = await createCoordinationRunFromTemplate(
        spaceId,
        template.id,
        {
          name: runName.trim(),
          description: runDescription.trim(),
          participants: participants.map(p => ({
            email: p.email,
            role: p.role,
            name: p.name,
          })),
        }
      );

      const newRun: SpaceCoordinationRun = {
        ...runResponse.run,
        templateId: template.id,
        templateName: template.name,
        status: 'active',
      };

      setCreatedRun(newRun);

      // Set magic links directly from the response (keyed by email)
      setMagicLinks(runResponse.magicLinks || {});
      setStep('review');

    } catch (err: any) {
      console.error('Failed to create coordination run:', err);
      setError(handleCoordinationApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    if (createdRun) {
      onRunCreated(createdRun);
    }
    onClose();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const renderConfigStep = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Run Name
        </label>
        <input
          type="text"
          value={runName}
          onChange={(e) => setRunName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter a descriptive name for this coordination run"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description (Optional)
        </label>
        <textarea
          value={runDescription}
          onChange={(e) => setRunDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Add any additional details about this coordination run"
        />
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Template: {template.name}</h4>
        <p className="text-sm text-blue-800">{template.description}</p>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={() => setStep('participants')}
          disabled={!runName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Add Participants
        </button>
      </div>
    </div>
  );

  const renderParticipantsStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Participants & Roles</h4>
        <div className="text-xs text-gray-500">
          {participants.length} participant{participants.length !== 1 ? 's' : ''} added
        </div>
      </div>

      {/* Role Requirements */}
      <div className="bg-gray-50 rounded-lg p-3">
        <h5 className="text-xs font-medium text-gray-700 mb-2">Role Requirements:</h5>
        <div className="space-y-1">
          {roleRequirements.map((req) => (
            <div key={req.role} className="text-xs text-gray-600">
              <span className="font-medium capitalize">{req.role}:</span> {req.minRequired}
              {req.maxAllowed && req.maxAllowed !== req.minRequired ? `-${req.maxAllowed}` : ''} required
              {req.description && <span className="text-gray-500"> • {req.description}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Add Participant Buttons */}
      <div className="flex gap-2 flex-wrap">
        {roleRequirements.map((requirement) => {
          const currentCount = participants.filter(p => p.role === requirement.role).length;
          const canAdd = !requirement.maxAllowed || currentCount < requirement.maxAllowed;

          return (
            <button
              key={requirement.role}
              onClick={() => addParticipant(requirement.role as ParticipantRole)}
              disabled={!canAdd}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed capitalize"
            >
              Add {requirement.role}
            </button>
          );
        })}
      </div>

      {/* Participant List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {participants.map((participant) => (
          <div key={participant.id} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full capitalize">
                    {participant.role}
                  </span>
                  <button
                    onClick={() => removeParticipant(participant.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={participant.email}
                    onChange={(e) => updateParticipant(participant.id, { email: e.target.value })}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={participant.name || ''}
                    onChange={(e) => updateParticipant(participant.id, { name: e.target.value })}
                    className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Space Member Suggestions */}
            {spaceMembers.length > 0 && !participant.email && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-600 mb-1">Quick add from space members:</div>
                <div className="flex flex-wrap gap-1">
                  {spaceMembers.slice(0, 3).map((member) => (
                    <button
                      key={member.id}
                      onClick={() => updateParticipant(participant.id, {
                        email: member.email,
                        name: member.name,
                      })}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {participants.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No participants added yet. Use the buttons above to add participants for each role.
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setStep('config')}
          className="px-4 py-2 text-gray-600 hover:text-gray-800"
        >
          Back
        </button>
        <button
          onClick={handleCreateRun}
          disabled={loading || participants.length === 0 || !!validateParticipants()}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Run...' : 'Create Run'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✅</span>
        </div>
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Coordination Run Created!</h4>
        <p className="text-sm text-gray-600">Your coordination run has been created and participants have been notified.</p>
      </div>

      {createdRun && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-700">
            <div className="font-medium">Run: {createdRun.id}</div>
            <div>Template: {template.name}</div>
            <div>Status: {createdRun.status}</div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h5 className="text-sm font-semibold text-gray-900">Magic Links for Participants:</h5>
        {Object.entries(magicLinks).map(([email, link]) => (
          <div key={email} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">{email}</span>
              <button
                onClick={() => copyToClipboard(link)}
                className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
              >
                Copy Link
              </button>
            </div>
            <div className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded break-all">
              {link}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <h5 className="text-sm font-semibold text-blue-900 mb-2">Next Steps:</h5>
        <ol className="text-sm text-blue-800 space-y-1">
          <li>1. Share the magic links with each participant</li>
          <li>2. Participants will use these links to join the coordination</li>
          <li>3. Monitor progress from the coordination panel</li>
          <li>4. Provide support as needed throughout the process</li>
        </ol>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => createdRun && window.open(`/r/${createdRun.id}`, '_blank')}
          disabled={!createdRun}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          View Coordination
        </button>
        <button
          onClick={handleFinish}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {step === 'config' && 'Create Coordination Run'}
              {step === 'participants' && 'Add Participants'}
              {step === 'review' && 'Run Created Successfully'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <span className="sr-only">Close</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="mt-4 flex items-center">
            {['config', 'participants', 'review'].map((stepName, index) => (
              <div key={stepName} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === stepName
                    ? 'bg-blue-600 text-white'
                    : (['config', 'participants'].indexOf(step) > index || step === 'review')
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                {index < 2 && (
                  <div className={`w-16 h-1 mx-2 rounded ${
                    (['config', 'participants'].indexOf(step) > index || step === 'review')
                      ? 'bg-green-600'
                      : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          {step === 'config' && renderConfigStep()}
          {step === 'participants' && renderParticipantsStep()}
          {step === 'review' && renderReviewStep()}
        </div>
      </div>
    </div>
  );
};

export default RunCreationModal;