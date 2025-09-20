"use client";
import React, { useState } from 'react';
import { Button, Input } from '@rouh/ui';

type AskBarProps = {
  onExecute: (actionType: string, parameters: any, mockItem: any) => Promise<void>;
  placeholder?: string;
};

export default function AskBar({ onExecute, placeholder = "Ask Rouh what to do..." }: AskBarProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const parseIntent = (message: string): { actionType: string; parameters: any; mockItem: any } | null => {
    const m = message.toLowerCase();
    if (m.includes('coffee') || m.includes('latte') || m.includes('order')) {
      return {
        actionType: 'order',
        parameters: {
          items: [{ name: 'Latte', price: 5.5, quantity: 1, modifications: m.includes('oat') ? ['oat milk'] : [] }],
          pickup_time: '15 minutes',
          customer_name: 'Demo User',
        },
        mockItem: {
          type: 'cafe',
          name: 'Downtown Café',
          email: 'orders@downtowncafe.com',
          phone: '+1-555-CAFE',
          order_system: 'square',
          square_application_id: 'sq_app_123',
          square_access_token: 'sq_token_456',
        },
      };
    }
    if (m.includes('meeting') || m.includes('schedule') || m.includes('teacher')) {
      return {
        actionType: 'schedule',
        parameters: {
          meeting_topic: 'Consultation meeting',
          preferred_date: 'Next week',
          preferred_time: '3:30 PM',
          duration: '30 minutes',
          user_name: 'Demo User',
        },
        mockItem: { type: 'school', name: 'Greenwood Elementary', email: 'admin@greenwood.edu' },
      };
    }
    if (m.includes('test drive') || m.includes('car')) {
      return {
        actionType: 'book',
        parameters: {
          preferred_date: 'This weekend',
          preferred_time: 'Morning',
          special_requirements: 'Test drive inquiry',
          user_name: 'Demo User',
        },
        mockItem: { type: 'car', name: 'AutoMax Dealership', email: 'sales@automax.com' },
      };
    }
    if (m.includes('consult') || m.includes('doctor') || m.includes('expert')) {
      return {
        actionType: 'book',
        parameters: {
          consultation_type: 'Professional consultation',
          preferred_date: 'This week',
          preferred_time: 'Afternoon',
          duration: '30 minutes',
          user_name: 'Demo User',
        },
        mockItem: { type: 'expert', name: 'Dr. Jasem', email: 'consult@drjasem.com' },
      };
    }
    // Default to inquiry
    return {
      actionType: 'inquiry',
      parameters: { inquiry_message: message, user_name: 'Demo User' },
      mockItem: { type: 'service', name: 'Provider', email: 'info@example.com' },
    };
  };

  const submit = async () => {
    if (!text.trim() || busy) return;
    const spec = parseIntent(text.trim());
    if (!spec) return;
    setBusy(true);
    try {
      await onExecute(spec.actionType, spec.parameters, spec.mockItem);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={text}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') submit();
        }}
        className="flex-1"
        disabled={busy}
      />
      <Button onClick={submit} disabled={busy || !text.trim()}>Ask</Button>
    </div>
  );
}

