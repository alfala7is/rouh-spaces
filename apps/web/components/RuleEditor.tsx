"use client";
import React, { useState } from 'react';
import { Button, Card, Input } from '@rouh/ui';

interface Rule {
  id?: string;
  name: string;
  description?: string;
  category: string;
  conditions: {
    keywords?: string[];
    intent?: string;
    patterns?: string[];
  };
  responses: {
    text?: string;
    actions?: string[];
    followUp?: string;
  };
  priority?: number;
  isActive?: boolean;
}

interface RuleEditorProps {
  rule?: Rule | null;
  onSave: (rule: Rule) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

const RULE_CATEGORIES = [
  'faq',
  'greeting',
  'booking',
  'pricing',
  'support',
  'general',
];

export default function RuleEditor({ rule, onSave, onCancel, isOpen }: RuleEditorProps) {
  const [formData, setFormData] = useState<Rule>({
    name: rule?.name || '',
    description: rule?.description || '',
    category: rule?.category || 'faq',
    conditions: {
      keywords: rule?.conditions?.keywords || [],
      intent: rule?.conditions?.intent || '',
      patterns: rule?.conditions?.patterns || [],
    },
    responses: {
      text: rule?.responses?.text || '',
      actions: rule?.responses?.actions || [],
      followUp: rule?.responses?.followUp || '',
    },
    priority: rule?.priority || 100,
    isActive: rule?.isActive ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  if (!isOpen) return null;

  const updateFormData = (field: keyof Rule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateConditions = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      conditions: { ...prev.conditions, [field]: value }
    }));
  };

  const updateResponses = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      responses: { ...prev.responses, [field]: value }
    }));
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.conditions.keywords?.includes(keywordInput.trim())) {
      updateConditions('keywords', [...(formData.conditions.keywords || []), keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    updateConditions('keywords', formData.conditions.keywords?.filter(k => k !== keyword) || []);
  };

  const addAction = () => {
    if (actionInput.trim() && !formData.responses.actions?.includes(actionInput.trim())) {
      updateResponses('actions', [...(formData.responses.actions || []), actionInput.trim()]);
      setActionInput('');
    }
  };

  const removeAction = (action: string) => {
    updateResponses('actions', formData.responses.actions?.filter(a => a !== action) || []);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onCancel(); // Close the editor
    } catch (error) {
      console.error('Failed to save rule:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = formData.name.trim() && formData.responses.text?.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <Card className="m-0">
          {/* Header */}
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {rule?.id ? 'Edit Rule' : 'Create New Rule'}
              </h2>
              <Button variant="secondary" onClick={onCancel}>×</Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Rule Name *</label>
                <Input
                  placeholder="e.g., 'Pricing Information'"
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData('name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={formData.category}
                  onChange={(e) => updateFormData('category', e.target.value)}
                >
                  {RULE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Input
                placeholder="Brief description of when this rule applies"
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData('description', e.target.value)}
              />
            </div>

            {/* Conditions */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-4">When to Apply This Rule</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Keywords</label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add keyword to trigger this rule"
                      value={keywordInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKeywordInput(e.target.value)}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button type="button" onClick={addKeyword} variant="secondary">Add</Button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {formData.conditions.keywords?.map((keyword, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => removeKeyword(keyword)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Responses */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-4">How to Respond</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Response Text *</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={4}
                    placeholder="The message your space will send when this rule matches..."
                    value={formData.responses.text}
                    onChange={(e) => updateResponses('text', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Suggested Actions</label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="e.g., 'Schedule Consultation', 'View Pricing'"
                      value={actionInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionInput(e.target.value)}
                      onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAction();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button type="button" onClick={addAction} variant="secondary">Add</Button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {formData.responses.actions?.map((action, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center gap-1"
                      >
                        {action}
                        <button
                          type="button"
                          onClick={() => removeAction(action)}
                          className="text-green-600 hover:text-green-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Follow-up Question</label>
                  <Input
                    placeholder="Optional question to ask after the response"
                    value={formData.responses.followUp}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateResponses('followUp', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-4">Rule Settings</h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Priority</label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.priority}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData('priority', parseInt(e.target.value) || 100)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Lower numbers = higher priority</p>
                </div>

                <div className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => updateFormData('isActive', e.target.checked)}
                    className="rounded"
                  />
                  <label className="text-sm font-medium">Rule is active</label>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!isFormValid || isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? 'Saving...' : (rule?.id ? 'Update Rule' : 'Create Rule')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
