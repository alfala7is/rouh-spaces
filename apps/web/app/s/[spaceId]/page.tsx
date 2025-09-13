"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Button, Card, Input } from '@rouh/ui/src';
import io from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_API_WS || 'http://localhost:3001');

export default function SpaceShortlist() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [toast, setToast] = useState<string>('');

  const search = async () => {
    const res = await apiFetch(`/items/search?query=${encodeURIComponent(query)}`, { spaceId });
    setItems(res);
  };
  useEffect(() => {
    search();
  }, []);

  useEffect(() => {
    socket.on('action.created', () => {
      setToast('Action confirmed');
      setTimeout(() => setToast(''), 1500);
    });
    return () => {
      socket.off('action.created');
    };
  }, []);

  const onContact = async (itemId: string) => {
    await apiFetch(`/actions`, {
      spaceId,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, type: 'contact' }),
    });
  };

  return (
    <main className="max-w-5xl mx-auto p-6 grid gap-6">
      <div className="flex items-center gap-2">
        <Input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={search}>Search</Button>
        <a className="ml-auto text-sm underline" href={`/s/${spaceId}/operator`}>Operator</a>
      </div>
      {toast && <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded">{toast}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((it) => (
          <Card key={it.id} className="p-4 grid gap-3">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">{it.canonicalJson?.title || 'Item'}</div>
                <div className="text-sm text-zinc-500">{it.type}</div>
              </div>
              <Button onClick={() => onContact(it.id)}>Contact</Button>
            </div>
            <details>
              <summary className="cursor-pointer">Why trusted?</summary>
              <pre className="bg-zinc-50 p-2 rounded text-xs overflow-auto">{JSON.stringify(it.canonicalJson, null, 2)}</pre>
            </details>
          </Card>
        ))}
      </div>
    </main>
  );
}
