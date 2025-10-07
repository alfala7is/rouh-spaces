"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Button, Card } from '@rouh/ui';
import { TemplatePreviewResponse } from '../../lib/api';

export interface TemplatePreviewProps {
  preview: TemplatePreviewResponse['data'];
  onSave?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onExport?: (format: 'pdf' | 'json') => void;
  onSimulate?: () => void;
  isSaving?: boolean;
  className?: string;
}

interface ExpandedSections {
  overview: boolean;
  coordinationPattern: boolean;
  participants: boolean;
  workflow: boolean;
  dataFields: boolean;
  metrics: boolean;
}

interface TemplateMetrics {
  complexity: number;
  estimatedTime: number;
  participantLoad: number;
  dataFields: number;
  totalSteps: number;
}

export default function TemplatePreview({
  preview,
  onSave,
  onEdit,
  onCancel,
  onExport,
  onSimulate,
  isSaving = false,
  className = ''
}: TemplatePreviewProps) {
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>({
    overview: true,
    coordinationPattern: true,
    participants: true,
    workflow: true,
    dataFields: false,
    metrics: false,
  });

  const [showFlowDiagram, setShowFlowDiagram] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Calculate template metrics
  const calculateMetrics = (): TemplateMetrics => {
    const totalSteps = preview.sampleFlow?.states?.length || 0;
    const participantCount = preview.participants?.length || 0;
    const dataFieldCount = preview.dataCollection?.length || 0;

    // Simple complexity calculation based on various factors
    const complexity = Math.min(
      Math.round(
        (totalSteps * 0.3) +
        (participantCount * 0.4) +
        (dataFieldCount * 0.2) +
        (preview.coordinationPattern ? 1 : 0)
      ),
      10
    );

    // Estimate time based on steps and complexity
    const estimatedTime = Math.max(totalSteps * 5 + complexity * 10, 15);

    // Participant load based on roles and permissions
    const participantLoad = participantCount > 0
      ? Math.min(Math.round((totalSteps / participantCount) * 2), 10)
      : 0;

    return {
      complexity,
      estimatedTime,
      participantLoad,
      dataFields: dataFieldCount,
      totalSteps
    };
  };

  const metrics = calculateMetrics();

  // Accessibility: Focus management
  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.focus();
    }
  }, []);

  // Enhanced keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSimulationMode) {
        setIsSimulationMode(false);
      }
      if (e.key === 's' && (e.metaKey || e.ctrlKey) && onSave) {
        e.preventDefault();
        onSave();
      }
      if (e.key === 'e' && (e.metaKey || e.ctrlKey) && onEdit) {
        e.preventDefault();
        onEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimulationMode, onSave, onEdit]);

  const toggleSection = (section: keyof ExpandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const SectionHeader = ({
    title,
    icon,
    sectionKey,
    count
  }: {
    title: string;
    icon: string;
    sectionKey: keyof ExpandedSections;
    count?: number;
  }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-lg transition-colors"
      aria-expanded={expandedSections[sectionKey]}
      aria-controls={`section-${sectionKey}`}
      aria-label={`Toggle ${title} section ${expandedSections[sectionKey] ? 'collapsed' : 'expanded'}`}
    >
      <div className="flex items-center space-x-2">
        <span className="text-lg" role="img" aria-label={title}>{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {count !== undefined && (
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
            {count} item{count !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <span className="text-gray-500" aria-hidden="true">
        {expandedSections[sectionKey] ? '▼' : '▶'}
      </span>
    </button>
  );

  const getCoordinationStateIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'collect': return '📝';
      case 'negotiate': return '🤝';
      case 'commit': return '✅';
      case 'evidence': return '📋';
      case 'signoff': return '🎯';
      default: return '⚡';
    }
  };

  const getSlotTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'text': return '📝';
      case 'number': return '🔢';
      case 'date': return '📅';
      case 'file': return '📎';
      case 'location': return '📍';
      case 'currency': return '💰';
      case 'boolean': return '☑️';
      case 'select': return '📋';
      default: return '📄';
    }
  };

  const formatSampleValue = (value: any, type: string) => {
    if (value === null || value === undefined) return 'No default';

    if (typeof value === 'object') {
      if (type === 'location' && value.address) {
        return value.address;
      }
      if (type === 'currency' && value.amount && value.currency) {
        return `${value.amount} ${value.currency}`;
      }
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  return (
    <div
      ref={previewRef}
      className={`w-full max-w-4xl mx-auto space-y-4 ${className}`}
      tabIndex={-1}
      role="main"
      aria-label="Template preview"
    >
      {/* Enhanced Header */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl" role="img" aria-label="template">🎯</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {preview.template.name}
                </h1>
                <div className="flex items-center space-x-3 text-sm text-gray-600">
                  <span>Version {preview.template.version}</span>
                  {preview.template.isPreview && (
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                      Preview
                    </span>
                  )}
                  {/* Template Quality Indicators */}
                  <div className="flex items-center space-x-2">
                    <span className="flex items-center space-x-1">
                      <span className="text-yellow-500">⭐</span>
                      <span className="text-xs">Complexity: {metrics.complexity}/10</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="text-blue-500">⏱️</span>
                      <span className="text-xs">~{metrics.estimatedTime}min</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-gray-600 leading-relaxed">
              {preview.template.description}
            </p>
          </div>

          {/* Enhanced Action Buttons */}
          <div className="flex flex-col space-y-2 ml-4">
            <div className="flex space-x-2">
              {/* Interactive Features */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFlowDiagram(!showFlowDiagram)}
                className="flex items-center space-x-1"
              >
                <span>📊</span>
                <span>Flow</span>
              </Button>

              {onSimulate && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsSimulationMode(true);
                    onSimulate();
                  }}
                  className="flex items-center space-x-1"
                >
                  <span>▶️</span>
                  <span>Test Run</span>
                </Button>
              )}

              {onExport && (
                <div className="relative group">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex items-center space-x-1"
                  >
                    <span>📤</span>
                    <span>Export</span>
                  </Button>
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={() => onExport('pdf')}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-t-lg"
                    >
                      📄 Export as PDF
                    </button>
                    <button
                      onClick={() => onExport('json')}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-b-lg"
                    >
                      📋 Export as JSON
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              {onEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onEdit}
                  disabled={isSaving}
                  aria-label="Edit template (Ctrl+E)"
                >
                  ✏️ Edit
                </Button>
              )}
              {onCancel && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              )}
              {onSave && (
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                  className="bg-green-600 hover:bg-green-700"
                  aria-label="Save template (Ctrl+S)"
                >
                  {isSaving ? (
                    <div className="flex items-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Saving...
                    </div>
                  ) : (
                    '💾 Save Template'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className="mt-4 pt-4 border-t text-xs text-gray-500">
          <p>💡 <strong>Keyboard shortcuts:</strong> Ctrl+S to save, Ctrl+E to edit, Esc to exit simulation</p>
        </div>
      </div>

      {/* Template Metrics Section */}
      <Card className="p-0 overflow-hidden">
        <SectionHeader
          title="Template Metrics"
          icon="📈"
          sectionKey="metrics"
        />
        {expandedSections.metrics && (
          <div id="section-metrics" className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{metrics.complexity}/10</div>
                <div className="text-xs text-gray-600">Complexity</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{metrics.estimatedTime}min</div>
                <div className="text-xs text-gray-600">Est. Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{metrics.participantLoad}/10</div>
                <div className="text-xs text-gray-600">Participant Load</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{metrics.totalSteps}</div>
                <div className="text-xs text-gray-600">Total Steps</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{metrics.dataFields}</div>
                <div className="text-xs text-gray-600">Data Fields</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Enhanced Coordination Pattern */}
      {preview.coordinationPattern && (
        <Card className="p-0 overflow-hidden">
          <SectionHeader
            title="5-State Coordination Pattern"
            icon="🔄"
            sectionKey="coordinationPattern"
          />
          {expandedSections.coordinationPattern && (
            <div id="section-coordinationPattern" className="p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  { key: 'express', name: 'Express', icon: '💬' },
                  { key: 'explore', name: 'Explore', icon: '🔍' },
                  { key: 'commit', name: 'Commit', icon: '✅' },
                  { key: 'evidence', name: 'Evidence', icon: '📋' },
                  { key: 'confirm', name: 'Confirm', icon: '🎯' },
                ].map((phase, index) => {
                  const phaseData = preview.coordinationPattern[phase.key];
                  const isSelected = selectedPhase === phase.key;
                  return (
                    <div key={phase.key} className="relative">
                      <button
                        className={`w-full p-3 rounded-lg border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isSelected
                            ? 'border-blue-400 bg-blue-100 shadow-lg scale-105'
                            : phaseData?.enabled
                              ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                              : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => setSelectedPhase(selectedPhase === phase.key ? null : phase.key)}
                        aria-label={`${phase.name} phase details`}
                        aria-expanded={isSelected}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg" role="img" aria-label={phase.name}>{phase.icon}</span>
                            <span className="text-sm font-medium text-gray-900">
                              {phase.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className={`w-2 h-2 rounded-full ${
                              phaseData?.enabled ? 'bg-blue-500' : 'bg-gray-300'
                            }`} aria-hidden="true"></div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed text-left">
                          {phaseData?.description || `${phase.name} phase of coordination`}
                        </p>
                        {phaseData?.timeout && (
                          <div className="mt-2 text-xs text-gray-500 text-left">
                            <span role="img" aria-label="time">⏱️</span> {phaseData.timeout} minutes
                          </div>
                        )}
                        {(phaseData as any)?.requireDeposit && (
                          <div className="mt-1 text-xs text-green-600 text-left">
                            <span role="img" aria-label="money">💰</span> Requires deposit
                          </div>
                        )}
                        {(phaseData as any)?.requireProof && (
                          <div className="mt-1 text-xs text-orange-600 text-left">
                            <span role="img" aria-label="document">📋</span> Requires proof
                          </div>
                        )}
                      </button>

                      {/* Flow Connector */}
                      {index < 4 && (
                        <div className="hidden md:block absolute -right-2 top-1/2 transform -translate-y-1/2 z-10">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            phaseData?.enabled && preview.coordinationPattern[[
                              'express', 'explore', 'commit', 'evidence', 'confirm'
                            ][index + 1]]?.enabled
                              ? 'bg-blue-500 border-2 border-white shadow'
                              : 'bg-white border border-gray-300'
                          }`}>
                            <span className="text-xs text-white" aria-hidden="true">→</span>
                          </div>
                        </div>
                      )}

                      {/* Detailed Phase Info (when selected) */}
                      {isSelected && phaseData && (
                        <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white border border-blue-200 rounded-lg shadow-lg z-20">
                          <h4 className="font-semibold text-gray-900 mb-2">{phase.name} Phase Details</h4>
                          <div className="space-y-2 text-sm">
                            <div><strong>Status:</strong> {phaseData.enabled ? 'Enabled' : 'Disabled'}</div>
                            {phaseData.timeout && <div><strong>Timeout:</strong> {phaseData.timeout} minutes</div>}
                            {(phaseData as any)?.minParticipants && (
                              <div><strong>Min Participants:</strong> {(phaseData as any).minParticipants}</div>
                            )}
                            {(phaseData as any)?.autoAdvance && (
                              <div><strong>Auto Advance:</strong> Yes</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Flow Diagram Toggle */}
              {showFlowDiagram && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Interactive Flow Diagram</h4>
                  <div className="flex justify-center">
                    <svg width="400" height="100" viewBox="0 0 400 100" className="border rounded">
                      {[
                        { x: 20, name: 'Express' },
                        { x: 100, name: 'Explore' },
                        { x: 180, name: 'Commit' },
                        { x: 260, name: 'Evidence' },
                        { x: 340, name: 'Confirm' }
                      ].map((phase, index) => (
                        <g key={phase.name}>
                          <circle
                            cx={phase.x}
                            cy="50"
                            r="15"
                            fill={preview.coordinationPattern[phase.name.toLowerCase()]?.enabled ? '#3B82F6' : '#9CA3AF'}
                            className="cursor-pointer"
                            onClick={() => setSelectedPhase(phase.name.toLowerCase())}
                          />
                          <text
                            x={phase.x}
                            y="80"
                            textAnchor="middle"
                            className="text-xs fill-gray-600"
                          >
                            {phase.name}
                          </text>
                          {index < 4 && (
                            <line
                              x1={phase.x + 15}
                              y1="50"
                              x2={phase.x + 65}
                              y2="50"
                              stroke="#9CA3AF"
                              strokeWidth="2"
                              markerEnd="url(#arrowhead)"
                            />
                          )}
                        </g>
                      ))}
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                        </marker>
                      </defs>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Participants */}
      {preview.participants && preview.participants.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <SectionHeader
            title="Participants & Roles"
            icon="👥"
            sectionKey="participants"
            count={preview.participants.length}
          />
          {expandedSections.participants && (
            <div className="p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {preview.participants.map((participant, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 capitalize">
                        👤 {participant.role}
                      </h4>
                      <div className="text-xs text-gray-500">
                        {participant.minRequired}
                        {participant.maxAllowed && participant.maxAllowed !== participant.minRequired
                          ? `-${participant.maxAllowed}`
                          : ''} required
                      </div>
                    </div>
                    {participant.description && (
                      <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                        {participant.description}
                      </p>
                    )}
                    {participant.permissions && participant.permissions.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-gray-700">Permissions:</div>
                        <div className="flex flex-wrap gap-1">
                          {participant.permissions.map((permission, permIndex) => (
                            <span
                              key={permIndex}
                              className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"
                            >
                              {permission}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Workflow States */}
      {preview.sampleFlow && preview.sampleFlow.states && preview.sampleFlow.states.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <SectionHeader
            title="Workflow States"
            icon="⚡"
            sectionKey="workflow"
            count={preview.sampleFlow.states.length}
          />
          {expandedSections.workflow && (
            <div className="p-4 space-y-3">
              {preview.sampleFlow.states.map((state, index) => (
                <div key={index} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{getCoordinationStateIcon(state.type)}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">
                          {state.name}
                        </h4>
                        <span className="text-xs text-gray-500 capitalize">
                          {state.type} state
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      Step {(state.sequence || index) + 1}
                    </div>
                  </div>

                  {state.description && (
                    <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                      {state.description}
                    </p>
                  )}

                  {state.requiredData && state.requiredData.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        Required Data:
                      </div>
                      <div className="space-y-1">
                        {state.requiredData.map((data, dataIndex) => (
                          <div key={dataIndex} className="flex items-center space-x-2 text-xs">
                            <span className="text-gray-500">{getSlotTypeIcon(data.type)}</span>
                            <span className="text-gray-700">{data.name}</span>
                            <span className="text-gray-500">({data.type})</span>
                            {data.required && (
                              <span className="text-red-600">*</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Data Collection Fields */}
      {preview.dataCollection && preview.dataCollection.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <SectionHeader
            title="Data Collection Fields"
            icon="📊"
            sectionKey="dataFields"
            count={preview.dataCollection.length}
          />
          {expandedSections.dataFields && (
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Field
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Required
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Sample Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.dataCollection.map((field, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm">{getSlotTypeIcon(field.type)}</span>
                            <span className="text-sm font-medium text-gray-900">
                              {field.field}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full capitalize">
                            {field.type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {field.required ? (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                              Required
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Optional</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                            {formatSampleValue(field.sampleValue, field.type)}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}