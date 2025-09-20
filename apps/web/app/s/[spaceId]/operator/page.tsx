"use client";
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Button, Card, Input } from '@rouh/ui';

export default function OperatorConsole() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const [csv, setCsv] = useState("id,title,phone\n1,Demo Listing,+123\n2,Another Listing,+456\n");
  const [sourceId, setSourceId] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const ensureSource = async () => {
    const res = await apiFetch('/sources', {
      spaceId,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'csv' }),
    });
    setSourceId(res.id);
  };
  useEffect(() => {
    ensureSource();
  }, []);

  const syncCsv = async () => {
    const rows = csv
      .trim()
      .split(/\n/)
      .slice(1)
      .map((line) => {
        const [id, title, phone] = line.split(',');
        return { id, title, phone };
      });
    await apiFetch(`/sources/${sourceId}/sync`, {
      spaceId,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    setStatus('Sync queued');
    setTimeout(() => setStatus(''), 1500);
  };

  return (
    <main className="max-w-4xl mx-auto p-6 grid gap-4">
      <h1 className="text-xl font-semibold">Operator Console</h1>
      <Card className="p-4 grid gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-600">CSV Source: {sourceId || 'creating...'}</div>
          <Button onClick={syncCsv} disabled={!sourceId}>Sync now</Button>
        </div>
        <textarea className="w-full h-40 border rounded p-2 text-sm" value={csv} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCsv(e.target.value)} />
        {status && <div className="text-green-700 text-sm">{status}</div>}
      </Card>
    </main>
  );
}
