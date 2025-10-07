"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import TemplatePreview from '../templates/TemplatePreview';

interface Template {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  usageCount?: number;
  roles?: Array<{
    id: string;
    name: string;
    minRequired: number;
    maxAllowed?: number;
    description?: string;
  }>;
}

interface Props {
  templates: Template[];
  onSelectTemplate: (template: Template) => void;
  spaceId: string;
}

interface TemplatePreviewData {
  template: {
    id: string;
    name: string;
    description: string;
    version: string;
    isPreview?: boolean;
  };
  coordinationPattern?: {
    express: any;
    explore: any;
    commit: any;
    evidence: any;
    confirm: any;
  };
  sampleFlow: {
    states: Array<{
      name: string;
      type: string;
      description?: string;
      sequence?: number;
      requiredData: Array<{
        name: string;
        type: string;
        required: boolean;
      }>;
    }>;
  };
  participants: Array<{
    role: string;
    description?: string;
    minRequired: number;
    maxAllowed?: number;
    permissions: string[];
  }>;
  dataCollection: Array<{
    field: string;
    type: string;
    required: boolean;
    validation: any;
    sampleValue: any;
  }>;
}

const TemplateSelector: React.FC<Props> = ({ templates, onSelectTemplate, spaceId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<TemplatePreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePreviewTemplate = async (template: Template) => {
    setSelectedTemplate(template);
    setLoading(true);
    try {
      const response = await apiFetch(`/spaces/${spaceId}/templates/${template.id}/preview`, {
        method: 'GET',
        spaceId,
      });
      setPreviewData(response.data);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to load template preview:', error);
      // Fallback to basic template info if preview fails
      setPreviewData({
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          version: template.version,
        },
        sampleFlow: { states: [] },
        participants: template.roles ? template.roles.map(role => ({
          role: role.name,
          description: role.description,
          minRequired: role.minRequired,
          maxAllowed: role.maxAllowed,
          permissions: []
        })) : [],
        dataCollection: [],
      });
      setShowPreview(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setPreviewData(null);
    setSelectedTemplate(null);
  };

  const handleUseTemplate = () => {
    if (selectedTemplate && previewData) {
      // Enhance the template with role definitions from preview
      const enhancedTemplate: Template = {
        ...selectedTemplate,
        roles: previewData.participants?.map(participant => ({
          id: participant.role, // Use role name as ID for now
          name: participant.role,
          minRequired: participant.minRequired,
          maxAllowed: participant.maxAllowed,
          description: participant.description,
        }))
      };
      onSelectTemplate(enhancedTemplate);
      handleClosePreview();
    }
  };

  const getComplexityLevel = (template: Template) => {
    // Simple heuristic based on template description length and usage
    const descLength = template.description.length;
    const usage = template.usageCount || 0;

    if (descLength > 200 || usage > 10) return 'High';
    if (descLength > 100 || usage > 5) return 'Medium';
    return 'Low';
  };

  const getComplexityColor = (level: string) => {
    switch (level) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  if (showPreview && previewData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Template Preview</h3>
            <div className="flex gap-2">
              <button
                onClick={handleUseTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Use This Template
              </button>
              <button
                onClick={handleClosePreview}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <div className="p-4">
            <TemplatePreview
              preview={previewData}
              onSave={handleUseTemplate}
              onCancel={handleClosePreview}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
          <span className="text-gray-400">🔍</span>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? (
            <div>
              <p className="mb-2">No templates match your search</p>
              <button
                onClick={() => setSearchTerm('')}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-2">No templates available</p>
              <Link
                href={`/templates/new?spaceId=${spaceId}`}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                Create your first template
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map((template) => {
            const complexity = getComplexityLevel(template);
            return (
              <div
                key={template.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all bg-white"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {template.name}
                      </h4>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${getComplexityColor(complexity)}`}
                      >
                        {complexity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed mb-2">
                      {template.description.length > 120
                        ? `${template.description.substring(0, 120)}...`
                        : template.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>v{template.version}</span>
                      {template.usageCount !== undefined && (
                        <span>{template.usageCount} uses</span>
                      )}
                      <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={async () => {
                      // Fetch role definitions first if not available
                      if (!template.roles) {
                        try {
                          const response = await apiFetch(`/spaces/${spaceId}/templates/${template.id}/preview`, {
                            method: 'GET',
                            spaceId,
                          });
                          const enhancedTemplate: Template = {
                            ...template,
                            roles: response.data?.participants?.map((participant: any) => ({
                              id: participant.role,
                              name: participant.role,
                              minRequired: participant.minRequired,
                              maxAllowed: participant.maxAllowed,
                              description: participant.description,
                            }))
                          };
                          onSelectTemplate(enhancedTemplate);
                        } catch (error) {
                          console.warn('Failed to fetch role definitions, using template as-is:', error);
                          onSelectTemplate(template);
                        }
                      } else {
                        onSelectTemplate(template);
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Create Run
                  </button>
                  <button
                    onClick={() => handlePreviewTemplate(template)}
                    disabled={loading}
                    className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {loading && selectedTemplate?.id === template.id ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Preview'
                    )}
                  </button>
                  <Link
                    href={`/templates/${template.id}?spaceId=${spaceId}`}
                    className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TemplateSelector;