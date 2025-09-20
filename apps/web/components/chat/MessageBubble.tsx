"use client";
import React from 'react';

type MessageBubbleProps = {
  role: 'user' | 'assistant' | 'system';
  children: React.ReactNode;
};

export default function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const base = 'max-w-[720px] rounded-2xl px-4 py-3 text-sm shadow-sm';
  const userCls = 'bg-blue-600 text-white self-end';
  const assistantCls = 'bg-white text-gray-900 border border-gray-200';
  const systemCls = 'bg-gray-50 text-gray-700 border border-gray-200';
  const cls = `${base} ${isUser ? userCls : isSystem ? systemCls : assistantCls}`;
  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div className={cls}>{children}</div>
    </div>
  );
}

