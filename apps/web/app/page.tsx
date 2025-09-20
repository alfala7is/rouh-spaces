"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@rouh/ui';
import { API_URL } from '@/lib/api';

export default function HomePage() {
  const [spaceId, setSpaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const createDemoSpace = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/spaces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Space' }),
      });
      if (!res.ok) throw new Error('Failed to create space');
      const json = await res.json();
      router.push(`/s/${json.id}`);
    } catch (e) {
      // no-op minimal handling
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-6 grid gap-8">
      {/* Hero Section */}
      <div className="text-center grid gap-6">
        <h1 className="text-5xl font-bold">
          Turn Your Expertise Into
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent block">
            Intelligent Spaces
          </span>
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Create small, focused apps that understand what people need, bring the right knowledge forward,
          and get things done automatically—with human touch when it matters.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/create-space">
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg">
              Create Your Space
            </Button>
          </Link>
          <div className="flex gap-2">
            <Link href="/explore">
              <Button variant="secondary" className="px-8 py-3 text-lg">
                Explore Spaces
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary" className="px-8 py-3 text-lg">
                Provider Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Value Props */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-semibold mb-2">For Experts & Businesses</h3>
          <p className="text-sm text-gray-600">
            Your knowledge works 24/7, greeting people, answering questions, and connecting when your touch is needed.
          </p>
        </Card>

        <Card className="p-6 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="font-semibold mb-2">For People</h3>
          <p className="text-sm text-gray-600">
            Talk naturally to get real help. No forms, no waiting, no dead ends—just outcomes.
          </p>
        </Card>

        <Card className="p-6 text-center">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6" />
            </svg>
          </div>
          <h3 className="font-semibold mb-2">For Communities</h3>
          <p className="text-sm text-gray-600">
            Better connections, less chasing, fewer dead ends. Everyone gets what they need faster.
          </p>
        </Card>
      </div>

      {/* Use Cases */}
      <Card className="p-8">
        <h3 className="text-2xl font-semibold mb-6 text-center">Real Use Cases Made Simple</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-semibold text-sm">👨‍⚕️</span>
              </div>
              <div>
                <h4 className="font-medium">"Dr. Jasem"</h4>
                <p className="text-sm text-gray-600">Medical expertise that guides patients and books consultations only when needed.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 font-semibold text-sm">🏪</span>
              </div>
              <div>
                <h4 className="font-medium">"Shop Explorer"</h4>
                <p className="text-sm text-gray-600">See what's available now, hold items, ask stores, pick up later.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-purple-600 font-semibold text-sm">🏫</span>
              </div>
              <div>
                <h4 className="font-medium">"My School"</h4>
                <p className="text-sm text-gray-600">Attendance and teacher notes that feel alive—tap to excuse, schedule, or sign.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 font-semibold text-sm">🚗</span>
              </div>
              <div>
                <h4 className="font-medium">"Sell Your Car"</h4>
                <p className="text-sm text-gray-600">One conversation collects offers from dealers and people, helps you choose.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-yellow-600 font-semibold text-sm">✈️</span>
              </div>
              <div>
                <h4 className="font-medium">"Trip Advisor"</h4>
                <p className="text-sm text-gray-600">Agency knowledge + live deals = great itineraries with smooth booking.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 font-semibold text-sm">☕</span>
              </div>
              <div>
                <h4 className="font-medium">"Downtown Café"</h4>
                <p className="text-sm text-gray-600">Order ahead, customize your drink, get real pickup times with receipts.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/explore">
            <Button variant="secondary">See Live Examples</Button>
          </Link>
        </div>
      </Card>

      {/* How it Works */}
      <Card className="p-8">
        <h3 className="text-2xl font-semibold mb-6 text-center">How Rouh Works</h3>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🧠</span>
            </div>
            <h4 className="font-semibold mb-2">Understands</h4>
            <p className="text-sm text-gray-600">Natural conversation captures what people really need</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💡</span>
            </div>
            <h4 className="font-semibold mb-2">Proposes</h4>
            <p className="text-sm text-gray-600">Smart suggestions based on your expertise and rules</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚡</span>
            </div>
            <h4 className="font-semibold mb-2">Acts</h4>
            <p className="text-sm text-gray-600">Executes through APIs, emails, or connects to humans</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📋</span>
            </div>
            <h4 className="font-semibold mb-2">Completes</h4>
            <p className="text-sm text-gray-600">Shows progress and provides receipts for real outcomes</p>
          </div>
        </div>
      </Card>

      {/* Demo Access */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Want to see it in action?</h3>
          <p className="text-gray-600 mb-4">Try our demo Spaces to see how the platform works</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={createDemoSpace} disabled={busy} variant="secondary">
              {busy ? 'Creating...' : 'Try Demo Space'}
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="Or enter space ID..."
                value={spaceId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpaceId(e.target.value)}
                className="w-48"
              />
              <Link href={spaceId ? `/s/${spaceId}` : '#'}>
                <Button disabled={!spaceId} variant="secondary">Open</Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500">
        <p>
          Built with the Action Execution Engine — transforming requests into results.
        </p>
      </div>
    </main>
  );
}
