"use client";
import React, { useState, useCallback } from 'react';
import { Button } from '@rouh/ui';
import type { DocumentUploadResult } from './TrainingChat';

type Props = {
  spaceId: string;
  onDocumentUploaded?: (result?: DocumentUploadResult) => Promise<void> | void;
};

type Source = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
};

export default function SourcesPanel({ spaceId, onDocumentUploaded }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await uploadFiles(files);
      }
    },
    [spaceId]
  );

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    setUploadError('');

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/spaces/${spaceId}/documents`,
          {
            method: 'POST',
            headers: {
              'x-space-id': spaceId,
              'x-user-id': localStorage.getItem('userId') || 'anonymous',
            },
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const payload = (await response.json()) as DocumentUploadResult | undefined;

        const newSource: Source = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type || 'unknown',
          size: file.size,
          uploadedAt: new Date(),
        };

        setSources(prev => [...prev, newSource]);

        if (onDocumentUploaded) {
          await onDocumentUploaded(payload);
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        setUploadError(`Failed to upload ${file.name}`);
      }
    }

    setIsUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(Array.from(files));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string): string => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('text')) return '📝';
    if (type.includes('doc')) return '📃';
    return '📎';
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center">
          <svg
            className="w-12 h-12 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600 mb-2">
            Drag and drop files here, or
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <span className="text-blue-600 hover:text-blue-700 font-medium">
              browse to upload
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-2">
            PDF, TXT, DOC, or images up to 10MB
          </p>
        </div>
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{uploadError}</p>
        </div>
      )}

      {/* Uploading indicator */}
      {isUploading && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-600">Uploading files...</p>
        </div>
      )}

      {/* Sources List */}
      <div className="mt-6 flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No sources uploaded yet</p>
            <p className="text-gray-400 text-xs mt-1">
              Upload documents to help train your AI
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map(source => (
              <div
                key={source.id}
                className="flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <span className="text-2xl mr-3">{getFileIcon(source.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {source.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(source.size)} • {new Date(source.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Note Button */}
      <div className="mt-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            // Future: Open a modal to add a text note
            console.log('Add note clicked');
          }}
        >
          + Add Note
        </Button>
      </div>
    </div>
  );
}
