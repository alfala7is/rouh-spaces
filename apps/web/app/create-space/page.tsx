"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@rouh/ui';
import { apiFetch } from '@/lib/api';

interface SpaceTemplate {
  id: string;
  name: string;
  domain: string;
  description: string;
  schemaJson: any;
  configJson: any;
}

interface CreateSpaceForm {
  name: string;
  description: string;
  templateId: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  phone?: string;
  hours?: string;
}

const CATEGORIES = [
  'healthcare',
  'education',
  'food',
  'automotive',
  'consulting',
  'retail',
  'services',
  'other'
];

export default function CreateSpacePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [templates, setTemplates] = useState<SpaceTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<CreateSpaceForm>({
    name: '',
    description: '',
    templateId: '',
    category: '',
    tags: [],
    isPublic: false,
    phone: '',
    hours: '',
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      console.log('Fetching templates...');
      const response = await apiFetch('/spaces/templates');
      console.log('Templates fetched:', response);
      setTemplates(response);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const updateForm = (updates: Partial<CreateSpaceForm>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch('/spaces/create-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      setSuccess('Space created successfully! Redirecting to training...');

      // Redirect directly to the space with training mode enabled
      setTimeout(() => {
        router.push(`/s/${response.id}?mode=training&onboarding=true`);
      }, 1500);

    } catch (error: any) {
      console.error('Failed to create space:', error);
      setError(error.message || 'Failed to create space. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 2));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const selectedTemplate = templates.find(t => t.id === form.templateId);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Your Space</h1>
        <p className="text-gray-600">Transform your expertise into an intelligent, helpful Space that works 24/7</p>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center mb-8">
        {[1, 2].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {step}
            </div>
            {step < 2 && (
              <div className={`w-20 h-1 mx-2 ${
                step < currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Labels */}
      <div className="flex items-center justify-between mb-6 text-xs text-gray-500">
        <span>Choose Template</span>
        <span>Create Your Space</span>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-red-600">❌</div>
            <div className="ml-3 text-red-700">{error}</div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <div className="text-green-600">✅</div>
            <div className="ml-3 text-green-700">{success}</div>
          </div>
        </div>
      )}

      {/* Step Content */}
      <Card className="p-8">
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4">What kind of Space do you want to create?</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className={`p-4 cursor-pointer transition-all ${
                      form.templateId === template.id
                        ? 'ring-2 ring-blue-600 bg-blue-50'
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => updateForm({ templateId: template.id, category: template.domain })}
                  >
                    <h3 className="font-semibold mb-2">{template.name}</h3>
                    <p className="text-sm text-gray-600">{template.description}</p>
                    <div className="mt-2">
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                        {template.domain}
                      </span>
                    </div>
                  </Card>
                ))}

                {/* Custom Option */}
                <Card
                  className={`p-4 cursor-pointer transition-all ${
                    form.templateId === 'custom'
                      ? 'ring-2 ring-blue-600 bg-blue-50'
                      : 'hover:shadow-md'
                  }`}
                  onClick={() => updateForm({ templateId: 'custom', category: '' })}
                >
                  <h3 className="font-semibold mb-2">Custom Space</h3>
                  <p className="text-sm text-gray-600">Build your Space from scratch with your own requirements</p>
                  <div className="mt-2">
                    <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded">
                      custom
                    </span>
                  </div>
                </Card>
              </div>

              {form.templateId === 'custom' && (
                <div className="mt-6 p-4 border border-purple-200 rounded-lg bg-purple-50">
                  <h4 className="font-medium mb-3">Describe your custom Space</h4>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    placeholder="Tell us what kind of Space you want to create, what it should help with, and any specific features you need..."
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Name Your Space</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Space Name *</label>
                  <Input
                    placeholder="e.g., Joe's Coffee Shop, Dr. Smith's Clinic, Ace Car Dealership"
                    value={form.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateForm({ name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Describe what your Space helps people with..."
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone (optional)</label>
                    <Input
                      placeholder="+1 (555) 123-4567"
                      value={form.phone}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateForm({ phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Hours (optional)</label>
                    <Input
                      placeholder="Mon-Fri 9AM-5PM"
                      value={form.hours}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateForm({ hours: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => updateForm({ isPublic: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Make this Space publicly discoverable</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Public Spaces appear in the directory and can be found by anyone
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="secondary"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            Previous
          </Button>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => router.push('/')}
            >
              Cancel
            </Button>

            {currentStep < 2 ? (
              <Button
                onClick={nextStep}
                disabled={currentStep === 1 && !form.templateId}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !form.name}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? 'Creating...' : 'Create Space'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}