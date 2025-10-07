"use client";
import React from 'react';
import type { CoordinationRunDto } from '../../types/coordination';

interface StateProgressBarProps {
  currentState: 'Express_Need' | 'Explore_Options' | 'Commit' | 'Evidence' | 'Confirm';
  participantRole: string | null;
  runData: CoordinationRunDto;
}

type CoordinationStep = {
  id: 'Express_Need' | 'Explore_Options' | 'Commit' | 'Evidence' | 'Confirm';
  label: string;
  shortLabel: string;
  description: string;
  roleDescription: Record<string, string>;
  icon: string;
};

const COORDINATION_STEPS: CoordinationStep[] = [
  {
    id: 'Express_Need',
    label: 'Express Need',
    shortLabel: 'Express',
    description: 'Clearly articulate what is needed',
    roleDescription: {
      requester: 'Express what you need help with',
      provider: 'Understand the request and ask clarifying questions',
      organizer: 'Facilitate clear communication of needs'
    },
    icon: '💭'
  },
  {
    id: 'Explore_Options',
    label: 'Explore Options',
    shortLabel: 'Explore',
    description: 'Discuss available approaches and solutions',
    roleDescription: {
      requester: 'Review and discuss proposed options',
      provider: 'Present available options and approaches',
      organizer: 'Help evaluate different possibilities'
    },
    icon: '🔍'
  },
  {
    id: 'Commit',
    label: 'Commit',
    shortLabel: 'Commit',
    description: 'Make formal agreements and commitments',
    roleDescription: {
      requester: 'Confirm your commitment to the agreement',
      provider: 'Commit to delivering the agreed solution',
      organizer: 'Document the mutual commitments'
    },
    icon: '🤝'
  },
  {
    id: 'Evidence',
    label: 'Evidence',
    shortLabel: 'Evidence',
    description: 'Share proof of work and progress',
    roleDescription: {
      requester: 'Review evidence of completion',
      provider: 'Share evidence of your work and progress',
      organizer: 'Verify evidence meets requirements'
    },
    icon: '📋'
  },
  {
    id: 'Confirm',
    label: 'Confirm',
    shortLabel: 'Confirm',
    description: 'Final confirmation and completion',
    roleDescription: {
      requester: 'Confirm satisfaction and completion',
      provider: 'Receive final confirmation',
      organizer: 'Mark coordination as completed'
    },
    icon: '✅'
  }
];

export function StateProgressBar({ currentState, participantRole, runData }: StateProgressBarProps) {
  const currentStepIndex = COORDINATION_STEPS.findIndex(step => step.id === currentState);

  const getStepStatus = (stepIndex: number): 'completed' | 'current' | 'pending' => {
    if (stepIndex < currentStepIndex) return 'completed';
    if (stepIndex === currentStepIndex) return 'current';
    return 'pending';
  };

  const getStatusColor = (status: 'completed' | 'current' | 'pending'): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 text-white';
      case 'current':
        return 'bg-blue-500 text-white';
      case 'pending':
        return 'bg-gray-200 text-gray-600';
    }
  };

  const getConnectorColor = (status: 'completed' | 'current' | 'pending'): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'current':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-gray-200';
    }
  };

  const getCurrentStepDescription = (): string => {
    const currentStep = COORDINATION_STEPS[currentStepIndex];
    if (!currentStep) return '';

    if (participantRole && currentStep.roleDescription[participantRole]) {
      return currentStep.roleDescription[participantRole];
    }

    return currentStep.description;
  };

  return (
    <div className="w-full">
      {/* Progress Steps */}
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200 z-0">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{
              width: `${(currentStepIndex / (COORDINATION_STEPS.length - 1)) * 100}%`
            }}
          />
        </div>

        {/* Steps */}
        <div className="relative z-10 flex justify-between">
          {COORDINATION_STEPS.map((step, index) => {
            const status = getStepStatus(index);
            const isClickable = status === 'completed';

            return (
              <div
                key={step.id}
                className={`flex flex-col items-center ${isClickable ? 'cursor-pointer' : ''}`}
                title={`${step.label}: ${step.description}`}
              >
                {/* Step Circle */}
                <div
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium
                    transition-all duration-300 border-2 border-white shadow-lg
                    ${getStatusColor(status)}
                    ${status === 'current' ? 'ring-4 ring-blue-200 ring-opacity-50' : ''}
                    ${isClickable ? 'hover:scale-110' : ''}
                  `}
                >
                  {status === 'completed' ? '✓' : step.icon}
                </div>

                {/* Step Label */}
                <div className="mt-2 text-center">
                  <div className={`text-sm font-medium ${
                    status === 'current' ? 'text-blue-600' :
                    status === 'completed' ? 'text-green-600' :
                    'text-gray-500'
                  }`}>
                    {step.shortLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Step Info */}
      <div className="mt-6 text-center">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-center mb-2">
            <span className="text-2xl mr-2">{COORDINATION_STEPS[currentStepIndex]?.icon}</span>
            <h3 className="text-lg font-semibold text-blue-900">
              {COORDINATION_STEPS[currentStepIndex]?.label}
            </h3>
          </div>
          <p className="text-sm text-blue-700">
            {getCurrentStepDescription()}
          </p>
        </div>
      </div>

      {/* Completion Status */}
      {currentState === 'Confirm' && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            Coordination Complete
          </div>
        </div>
      )}

      {/* Mobile-friendly compact view */}
      <div className="md:hidden mt-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Progress:</span>
            <span className="font-medium">
              Step {currentStepIndex + 1} of {COORDINATION_STEPS.length}
            </span>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${((currentStepIndex + 1) / COORDINATION_STEPS.length) * 100}%`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}