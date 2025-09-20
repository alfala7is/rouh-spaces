"use client";
import React from 'react';
import { Button } from '@rouh/ui';

interface ChatButtonProps {
  onClick: () => void;
}

export default function ChatButton({ onClick }: ChatButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40">
      <Button
        onClick={onClick}
        className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        title="Chat with Rouh AI"
      >
        <div className="relative">
          <span className="text-xl">🤖</span>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
        </div>
      </Button>

      {/* Tooltip */}
      <div className="absolute bottom-16 right-0 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        Chat with Rouh AI
      </div>
    </div>
  );
}
