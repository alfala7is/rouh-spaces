"use client";
import React from 'react';
import { Button } from '@rouh/ui';

export type Suggestion = {
  label: string;
  actionType: string;
  parameters: any;
  mockItem: any;
};

type Props = {
  suggestions: Suggestion[];
  onSelect: (s: Suggestion) => void;
};

export default function SuggestionChips({ suggestions, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {suggestions.map((s, idx) => (
        <Button key={idx} variant="ghost" className="border border-gray-200" onClick={() => onSelect(s)}>
          {s.label}
        </Button>
      ))}
    </div>
  );
}

