"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Input } from '@rouh/ui';
import { apiFetch } from '@/lib/api';

interface Space {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  verified: boolean;
  profile: {
    businessName: string;
    bio: string;
    rating: number;
    reviewCount: number;
    responseTime: number;
  } | null;
  _count: {
    actions: number;
  };
}

interface ExploreResult {
  spaces: Space[];
  total: number;
  hasMore: boolean;
}

const FALLBACK_SPACES: Space[] = [
  {
    id: 'demo-brewed-awakening',
    name: 'Brewed Awakening',
    description: 'Neighborhood café bot that helps regulars find seasonal drinks and preorder pastries.',
    category: 'food',
    tags: ['coffee', 'bakery', 'local'],
    verified: true,
    profile: {
      businessName: 'Brewed Awakening Café',
      bio: 'Small-batch roastery with handcrafted pastries and latte art classes.',
      rating: 4.8,
      reviewCount: 182,
      responseTime: 2,
    },
    _count: { actions: 421 },
  },
  {
    id: 'demo-greenfield-clinic',
    name: 'Greenfield Family Clinic',
    description: 'Triages symptoms, books appointments, and sends prep checklists for each visit.',
    category: 'healthcare',
    tags: ['clinic', 'primary-care', 'appointments'],
    verified: true,
    profile: {
      businessName: 'Greenfield Family Practice',
      bio: 'Patient-first family clinic specialising in preventative care and telehealth follow-ups.',
      rating: 4.9,
      reviewCount: 264,
      responseTime: 5,
    },
    _count: { actions: 318 },
  },
  {
    id: 'demo-gearhead-garage',
    name: 'Gearhead Garage',
    description: 'Guides customers through repair quotes, loaner scheduling, and real-time status updates.',
    category: 'automotive',
    tags: ['service', 'repairs', 'loaners'],
    verified: false,
    profile: {
      businessName: 'Gearhead Garage & Detail',
      bio: 'Full-service auto repair with certified technicians and loyalty perks.',
      rating: 4.6,
      reviewCount: 143,
      responseTime: 8,
    },
    _count: { actions: 205 },
  },
  {
    id: 'demo-lighthouse-tutoring',
    name: 'Lighthouse Tutoring',
    description: 'Matches students with tutors, manages scheduling, and shares progress summaries.',
    category: 'education',
    tags: ['tutoring', 'k-12', 'progress-reports'],
    verified: true,
    profile: {
      businessName: 'Lighthouse Learning Co.',
      bio: 'On-demand tutoring for maths, sciences, and college prep with weekly progress notes.',
      rating: 4.7,
      reviewCount: 98,
      responseTime: 3,
    },
    _count: { actions: 267 },
  },
  {
    id: 'demo-studio-nova',
    name: 'Studio Nova Creative',
    description: 'Captures project briefs, sends mood boards, and coordinates shoot logistics.',
    category: 'services',
    tags: ['creative', 'photography', 'branding'],
    verified: false,
    profile: {
      businessName: 'Studio Nova Creative',
      bio: 'Boutique creative studio delivering photography, video, and brand campaigns.',
      rating: 4.5,
      reviewCount: 77,
      responseTime: 4,
    },
    _count: { actions: 156 },
  },
  {
    id: 'demo-harbor-escapes',
    name: 'Harbor Escapes Travel',
    description: 'Plans bespoke getaways, handles upgrades, and manages passenger manifests automatically.',
    category: 'travel',
    tags: ['travel', 'concierge', 'luxury'],
    verified: true,
    profile: {
      businessName: 'Harbor Escapes Concierge Travel',
      bio: 'Curated travel experiences with 24/7 concierge support and exclusive partnerships.',
      rating: 4.9,
      reviewCount: 312,
      responseTime: 1,
    },
    _count: { actions: 502 },
  },
];

const CATEGORIES = [
  'all',
  'healthcare',
  'education',
  'food',
  'automotive',
  'consulting',
  'retail',
  'services',
];

export default function ExplorePage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadSpaces(true);
  }, [selectedCategory, searchQuery]);

  const loadSpaces = async (reset = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '20');
      if (!reset) params.set('offset', spaces.length.toString());

      console.log('Loading spaces with params:', params.toString());
      const result: ExploreResult = await apiFetch(`/spaces/explore?${params}`);
      console.log('Spaces loaded:', result);

      const fetchedSpaces = result.spaces;

      if (reset) {
        if (fetchedSpaces.length === 0 && !searchQuery && selectedCategory === 'all') {
          setSpaces(FALLBACK_SPACES);
          setHasMore(false);
        } else {
          setSpaces(fetchedSpaces);
          setHasMore(result.hasMore);
        }
      } else {
        if (fetchedSpaces.length === 0 && spaces.length === 0) {
          setSpaces(FALLBACK_SPACES);
          setHasMore(false);
        } else {
          setSpaces(prev => [...prev, ...fetchedSpaces]);
          setHasMore(result.hasMore);
        }
      }
    } catch (error) {
      console.error('Failed to load spaces:', error);
      if (spaces.length === 0) {
        setSpaces(FALLBACK_SPACES);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
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

  return (
    <main className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Explore Spaces</h1>
            <p className="text-gray-600">Discover intelligent Spaces that can help you get things done</p>
          </div>
          <Link href="/create-space">
            <Button className="bg-green-600 hover:bg-green-700">
              Create Your Space
            </Button>
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search for spaces, providers, or services..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'primary' : 'secondary'}
                onClick={() => setSelectedCategory(category)}
                className={`text-sm ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading && spaces.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading spaces...</div>
        </div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No spaces found matching your criteria</div>
          <Link href="/create-space">
            <Button>Be the first to create a Space</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Space Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {spaces.map((space) => (
              <Card key={space.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{space.name}</h3>
                      {space.verified && (
                        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{space.description}</p>
                  </div>
                </div>

                {space.profile && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-900">{space.profile.businessName}</p>
                    {space.profile.rating && (
                      <div className="flex items-center gap-4 mt-2">
                        <StarRating rating={space.profile.rating} />
                        <span className="text-xs text-gray-500">({space.profile.reviewCount} reviews)</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-1">
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                      {space.category}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    {space._count.actions} actions completed
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {space.profile?.responseTime && (
                    <div className="text-xs text-gray-500">
                      • Responds in ~{space.profile.responseTime}min
                    </div>
                  )}
                  
                  <Link href={`/s/${space.id}/profile`}>
                    <Button size="sm">
                      Connect
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="text-center">
              <Button
                onClick={() => loadSpaces(false)}
                disabled={isLoading}
                variant="secondary"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Call to Action */}
      <div className="mt-16 text-center bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8">
        <h2 className="text-2xl font-bold mb-4">Ready to create your own Space?</h2>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          Turn your expertise into an intelligent Space that helps people 24/7. 
          No coding required - just your knowledge and experience.
        </p>
        <Link href="/create-space">
          <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3">
            Start Building Your Space
          </Button>
        </Link>
      </div>
    </main>
  );
}
