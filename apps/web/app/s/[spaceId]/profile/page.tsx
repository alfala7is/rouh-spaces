"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card } from '@rouh/ui';
import { apiFetch } from '@/lib/api';

interface Space {
  id: string;
  name: string;
  description: string;
  category: string;
  verified: boolean;
  profile: {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    website: string;
    bio: string;
    rating: number;
    reviewCount: number;
    responseTime: number;
  } | null;
  spaceTemplate: {
    name: string;
    domain: string;
  } | null;
  rules: Array<{
    name: string;
    responses: any;
  }>;
  _count: {
    actions: number;
  };
}

export default function SpaceProfilePage({ params }: { params: { spaceId: string } }) {
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSpace();
  }, [params.spaceId]);

  const loadSpace = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const spaceData = await apiFetch(`/spaces/${params.spaceId}/profile`, {
        spaceId: params.spaceId,
      });
      setSpace(spaceData);
    } catch (error: any) {
      console.error('Failed to load space:', error);
      setError(error.message || 'Failed to load space');
    } finally {
      setIsLoading(false);
    }
  };

  const StarRating = ({ rating }: { rating: number }) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? 'text-yellow-400' : 'text-gray-300'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
        <span className="ml-1 text-sm text-gray-600">({rating.toFixed(1)})</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading space...</div>
        </div>
      </main>
    );
  }

  if (error || !space) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-red-500 mb-4">{error || 'Space not found'}</div>
          <Link href="/explore">
            <Button>Back to Explore</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/explore">
          <Button variant="secondary" size="sm">
            ← Back to Explore
          </Button>
        </Link>
        <Link href={`/s/${space.id}`}>
          <Button className="bg-green-600 hover:bg-green-700">
            Connect to Space
          </Button>
        </Link>
      </div>

      {/* Space Info */}
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{space.name}</h1>
              {space.verified && (
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-lg text-gray-600 mb-4">{space.description}</p>
            <div className="flex gap-2">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                {space.category}
              </span>
              {space.spaceTemplate && (
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                  {space.spaceTemplate.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8 p-6 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{space._count.actions}</div>
            <div className="text-sm text-gray-600">Actions Completed</div>
          </div>
          {space.profile?.rating && (
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <StarRating rating={space.profile.rating} />
              </div>
              <div className="text-sm text-gray-600">{space.profile.reviewCount} reviews</div>
            </div>
          )}
          {space.profile?.responseTime && (
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">~{space.profile.responseTime}min</div>
              <div className="text-sm text-gray-600">Response Time</div>
            </div>
          )}
        </div>

        {/* Provider Profile */}
        {space.profile && (
          <div className="space-y-6">
            <div className="border-t pt-6">
              <h2 className="text-xl font-semibold mb-4">About {space.profile.businessName}</h2>
              {space.profile.bio && (
                <p className="text-gray-700 mb-4">{space.profile.bio}</p>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  {space.profile.contactName && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Contact Person</label>
                      <p className="text-sm">{space.profile.contactName}</p>
                    </div>
                  )}
                  {space.profile.email && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Email</label>
                      <p className="text-sm">{space.profile.email}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {space.profile.phone && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Phone</label>
                      <p className="text-sm">{space.profile.phone}</p>
                    </div>
                  )}
                  {space.profile.website && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Website</label>
                      <a
                        href={space.profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {space.profile.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FAQ */}
        {space.rules.length > 0 && (
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Frequently Asked</h2>
            <div className="space-y-4">
              {space.rules.slice(0, 5).map((rule, index) => (
                <div key={index} className="bg-white border rounded-lg p-4">
                  <h4 className="font-medium mb-2">{rule.name}</h4>
                  <p className="text-sm text-gray-600">
                    {typeof rule.responses === 'string'
                      ? rule.responses
                      : rule.responses?.text || 'Response available via chat'
                    }
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Connect CTA */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Ready to get started?</h3>
          <p className="text-gray-600 mb-4">
            Connect with {space.profile?.businessName || space.name} through this intelligent Space
          </p>
          <Link href={`/s/${space.id}`}>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2">
              Start Conversation
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
