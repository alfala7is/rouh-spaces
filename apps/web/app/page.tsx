"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Input } from '@rouh/ui/src';

export default function HomePage() {
  const [spaceId, setSpaceId] = useState("");
  return (
    <main className="max-w-3xl mx-auto p-6 grid gap-6">
      <h1 className="text-2xl font-semibold">Rouh Spaces</h1>
      <Card className="p-4 grid gap-3">
        <p>Join a space by ID or create a new one via API.</p>
        <div className="flex gap-2">
          <Input placeholder="space id" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} />
          <Link href={`/s/${spaceId}`}>{/* default to /s/ */}
            <Button disabled={!spaceId}>Enter</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}

