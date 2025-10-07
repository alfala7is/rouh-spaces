"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@rouh/ui';
import TemplateCompiler, { TemplateCompilerRef } from '../../../components/templates/TemplateCompiler';
import { saveCompiledTemplate } from '../../../lib/api';
import BlueprintDesigner, { BlueprintDesignerResult } from '../../../components/templates/BlueprintDesigner';

export default function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spaceId = searchParams.get('spaceId');

  // Redirect if no spaceId provided
  if (!spaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">
            ❌ Missing Space ID
          </h1>
          <p className="text-gray-600 mb-4">
            A space ID is required to create templates. Please navigate from a space page.
          </p>
          <div className="space-y-2">
            <Button
              variant="primary"
              onClick={() => router.push('/')}
            >
              Go Home
            </Button>
            <p className="text-xs text-gray-500">
              Tip: Templates must be created within a specific space
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Now we know spaceId is not null, create a non-null variable
  const sid: string = spaceId;

  const [currentStep, setCurrentStep] = useState<'designer' | 'compiler'>('designer');
  const [compiledTemplate, setCompiledTemplate] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [designerResult, setDesignerResult] = useState<BlueprintDesignerResult | null>(null);
  const [generatedDescription, setGeneratedDescription] = useState<string>('');
  const templateCompilerRef = useRef<TemplateCompilerRef>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's' && compiledTemplate) {
          e.preventDefault();
          handleSaveTemplate();
        }
      }
      if (e.key === 'Escape' && !isSaving) {
        if (currentStep === 'compiler' && designerResult) {
          setCurrentStep('designer');
        } else if (currentStep === 'designer') {
          handleCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [currentStep, compiledTemplate, isSaving, designerResult]);

  const handleTemplateCompiled = async (template: any) => {
    console.log('[NewTemplatePage] Template compiled:', template.name);
    setError('');
    setValidationWarnings([]);
    setCompiledTemplate(template);

    // Validate template structure and show warnings
    const warnings = validateTemplateStructure(template);
    setValidationWarnings(warnings);

    setCurrentStep('compiler');
  };

  // Template structure validation
  const validateTemplateStructure = (template: any) => {
    const warnings: string[] = [];

    if (!template.participants || template.participants.length === 0) {
      warnings.push('No participants defined - consider adding participant roles');
    }

    if (!template.states || template.states.length < 2) {
      warnings.push('Very few states defined - consider adding more workflow steps');
    }

    if (!template.description || template.description.length < 20) {
      warnings.push('Short description - consider adding more detail for clarity');
    }

    if (template.states?.length > 10) {
      warnings.push('Many states defined - consider simplifying the workflow');
    }

    return warnings;
  };

  const handleCompilerError = (errorMessage: string) => {
    console.error('[NewTemplatePage] Compiler error:', errorMessage);
    setError(errorMessage);
  };

  const handleSaveTemplate = async () => {
    if (!compiledTemplate) return;

    setIsSaving(true);
    setError('');

    try {
      console.log('[NewTemplatePage] Saving template:', compiledTemplate.name);

      const response = await saveCompiledTemplate(sid, {
        compiledTemplate: compiledTemplate
      });

      console.log('[NewTemplatePage] Template saved successfully:', response.data?.name);

      // Redirect to space page or templates list
      router.push(`/s/${sid}?tab=templates&created=${encodeURIComponent(response.data?.name || 'Template')}`);

    } catch (error: any) {
      console.error('[NewTemplatePage] Failed to save template:', error);
      setError(`Failed to save template: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(`/s/${sid}?tab=templates`);
  };

  const handleDesignerSnapshot = (result: BlueprintDesignerResult) => {
    setDesignerResult(result);
    setGeneratedDescription(result.description);
    setCompiledTemplate(null);
    setValidationWarnings([]);
  };

  const handleDesignerComplete = (result: BlueprintDesignerResult) => {
    console.log('[NewTemplatePage] Designer conversation captured. Moving to compiler step.');
    setDesignerResult(result);
    setGeneratedDescription(result.description);
    templateCompilerRef.current?.prefillDescription(result.description);
    setCurrentStep('compiler');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              {/* Enhanced Breadcrumb Navigation */}
              <nav className="flex items-center space-x-2 text-sm">
                <button
                  onClick={() => router.push('/')}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Spaces
                </button>
                <span className="text-gray-400">›</span>
                <button
                  onClick={() => router.push(`/s/${sid}`)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {sid}
                </button>
                <span className="text-gray-400">›</span>
                <button
                  onClick={() => router.push(`/s/${sid}?tab=templates`)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Templates
                </button>
                <span className="text-gray-400">›</span>
                <span className="text-gray-900 font-medium">
                  New Template
                </span>
              </nav>
              <div className="h-6 w-px bg-gray-300 ml-4"></div>
              <div className="flex items-center space-x-3">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    Create New Template
                  </h1>
                  <p className="text-sm text-gray-600 flex items-center space-x-2">
                    <span>
                      Step {currentStep === 'designer' ? '1' : '2'} of 2
                    </span>
                    {validationWarnings.length > 0 && (
                      <span className="text-yellow-600">
                        • {validationWarnings.length} warning{validationWarnings.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === 'designer'
                    ? 'bg-blue-600 text-white'
                    : designerResult
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                }`}>
                  1
                </div>
                <span className="text-sm text-gray-600">Designer</span>
              </div>

              <div className="w-8 h-px bg-gray-300"></div>

              <div className="flex items-center space-x-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === 'compiler'
                    ? 'bg-blue-600 text-white'
                    : compiledTemplate
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                }`}>
                  2
                </div>
                <span className="text-sm text-gray-600">Draft</span>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-red-500 mr-3">⚠️</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  Template Creation Error
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  {error}
                </p>
                <div className="mt-3 flex space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setError('')}
              >
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && !error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <span className="text-yellow-500 mr-3">⚡</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Template Validation Warnings
                </h3>
                <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                  {validationWarnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
                <p className="text-xs text-yellow-600 mt-2">
                  These are suggestions to improve your template. You can still proceed.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setValidationWarnings([])}
              >
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
            <div className="space-y-6">
              {currentStep === 'designer' && (
                <BlueprintDesigner
                  spaceId={sid}
                  templateId={null}
                  defaultResult={designerResult}
                  onSnapshot={handleDesignerSnapshot}
                  onComplete={handleDesignerComplete}
                  onCancel={handleCancel}
                />
              )}

              <div
                className={`bg-white rounded-xl shadow-sm border border-gray-200/80 transition-opacity ${
                  currentStep === 'designer' ? 'opacity-40 pointer-events-none' : 'opacity-100'
                }`}
              >
                <TemplateCompiler
                  ref={templateCompilerRef}
                  spaceId={sid}
                  onTemplateCompiled={handleTemplateCompiled}
                  onError={handleCompilerError}
                  className="rounded-t-xl"
                />
              </div>

              {generatedDescription && (
                <Card className="p-4 shadow-sm border border-blue-100 bg-blue-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-blue-900 mb-1">Draft description captured from your conversation</h3>
                      <p className="text-xs text-blue-700">Fine-tune it in the drafting step if anything looks off.</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentStep('designer')}
                    >
                      Edit Conversation
                    </Button>
                  </div>
                  <pre className="mt-3 text-xs text-blue-900 whitespace-pre-wrap bg-white rounded p-3 border border-blue-100 max-h-40 overflow-auto">
                    {generatedDescription}
                  </pre>
                </Card>
              )}
            </div>

          {compiledTemplate && (
            <Card className="p-6 shadow-sm border border-gray-200/80">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Compiled Draft</h2>
                  <p className="text-sm text-gray-500">
                    Review the generated structure, then save to add it to your space.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => templateCompilerRef.current?.prefillDescription(generatedDescription || '')}
                >
                  Recompile
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Participants</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {compiledTemplate.participants?.map((p: any) => p.role || p.name).join(', ') || 'No roles found'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">States</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {compiledTemplate.states?.map((s: any) => s.name).join(' → ') || 'States not defined'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Slots</p>
                  <p className="text-sm text-gray-800 mt-1">
                    {compiledTemplate.slots?.map((slot: any) => slot.name).join(', ') || 'No data slots captured'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p>
                  <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                    {compiledTemplate.description || 'No description provided'}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Button
                  variant="primary"
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                  className="sm:w-auto"
                >
                  {isSaving ? 'Saving…' : 'Save Template'}
                </Button>
                <p className="text-xs text-gray-500">
                  Saving publishes this draft to the current space so runs and personas can use it.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Development Mode Indicator */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-yellow-100 border border-yellow-300 rounded-lg p-2 text-xs text-yellow-800">
          <div>Step: {currentStep}</div>
          <div>Template: {compiledTemplate?.name || 'None'}</div>
          <div>Compiled: {compiledTemplate ? '✅' : '❌'}</div>
        </div>
      )}
    </div>
  );
}
