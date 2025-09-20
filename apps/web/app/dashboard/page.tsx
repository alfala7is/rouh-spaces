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
  isPublic: boolean;
  verified: boolean;
  createdAt: string;
  profile: {
    businessName: string;
    rating: number;
    reviewCount: number;
  } | null;
  _count: {
    actions: number;
    members: number;
  };
}

interface DashboardStats {
  totalSpaces: number;
  totalActions: number;
  avgRating: number;
  totalReviews: number;
}

export default function DashboardPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      // Mock data for now - replace with actual API calls
      setSpaces([
        {
          id: '1',
          name: 'Dr. Smith Medical Advice',
          description: 'Get expert medical guidance and book consultations',
          category: 'healthcare',
          isPublic: true,
          verified: false,
          createdAt: '2024-01-15',
          profile: {
            businessName: 'Downtown Medical Clinic',
            rating: 4.8,
            reviewCount: 127,
          },
          _count: {
            actions: 342,
            members: 15,
          },
        },
      ]);

      setStats({
        totalSpaces: 3,
        totalActions: 1247,
        avgRating: 4.6,
        totalReviews: 89,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ title, value, change, icon }: {
    title: string;
    value: string | number;
    change?: string;
    icon: string;
  }) => (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {change && (
            <p className={`text-sm ${change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
              {change}
            </p>
          )}
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </Card>
  );

  if (isLoading) {
    return (
      <main className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Provider Dashboard</h1>
          <p className="text-gray-600">Manage your Spaces and track performance</p>
        </div>
        <Link href="/create-space">
          <Button className="bg-green-600 hover:bg-green-700">
            Create New Space
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-6">
        <StatCard
          title="Total Spaces"
          value={stats?.totalSpaces || 0}
          change="+2 this month"
          icon="🏢"
        />
        <StatCard
          title="Total Actions"
          value={stats?.totalActions || 0}
          change="+15% from last month"
          icon="⚡"
        />
        <StatCard
          title="Average Rating"
          value={stats?.avgRating ? `${stats.avgRating}★` : 'N/A'}
          change="+0.2 from last month"
          icon="⭐"
        />
        <StatCard
          title="Total Reviews"
          value={stats?.totalReviews || 0}
          change="+8 this week"
          icon="💬"
        />
      </div>

      {/* Quick Actions */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Link href="/create-space">
            <Button variant="secondary" className="w-full h-20 flex flex-col items-center justify-center">
              <span className="text-2xl mb-1">➕</span>
              <span>Create New Space</span>
            </Button>
          </Link>
          <Button variant="secondary" className="w-full h-20 flex flex-col items-center justify-center">
            <span className="text-2xl mb-1">📊</span>
            <span>View Analytics</span>
          </Button>
          <Button variant="secondary" className="w-full h-20 flex flex-col items-center justify-center">
            <span className="text-2xl mb-1">⚙️</span>
            <span>Manage Integrations</span>
          </Button>
        </div>
      </Card>

      {/* Your Spaces */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Your Spaces</h2>
          <div className="flex gap-2">
            <Input placeholder="Search spaces..." className="w-64" />
            <Button variant="secondary">Filter</Button>
          </div>
        </div>

        {spaces.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold mb-2">Create Your First Space</h3>
            <p className="text-gray-600 mb-6">
              Transform your expertise into an intelligent Space that helps people 24/7
            </p>
            <Link href="/create-space">
              <Button className="bg-blue-600 hover:bg-blue-700">
                Get Started
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6">
            {spaces.map((space) => (
              <Card key={space.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{space.name}</h3>
                      {space.verified && (
                        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        space.isPublic ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {space.isPublic ? 'Public' : 'Private'}
                      </span>
                    </div>

                    <p className="text-gray-600 mb-4">{space.description}</p>

                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <span>⚡</span>
                        <span>{space._count.actions} actions</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>👥</span>
                        <span>{space._count.members} members</span>
                      </div>
                      {space.profile?.rating && (
                        <div className="flex items-center gap-1">
                          <span>⭐</span>
                          <span>{space.profile.rating} ({space.profile.reviewCount} reviews)</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span>📅</span>
                        <span>Created {new Date(space.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/s/${space.id}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                    <Link href={`/dashboard/space/${space.id}`}>
                      <Button size="sm">
                        Manage
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 text-sm">✓</span>
              </div>
              <div>
                <p className="font-medium">New consultation booked</p>
                <p className="text-sm text-gray-600">Dr. Smith Medical Advice • 2 hours ago</p>
              </div>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 text-sm">💬</span>
              </div>
              <div>
                <p className="font-medium">New review received</p>
                <p className="text-sm text-gray-600">Downtown Medical Clinic • 5 hours ago</p>
              </div>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-sm">📊</span>
              </div>
              <div>
                <p className="font-medium">Weekly analytics report ready</p>
                <p className="text-sm text-gray-600">All Spaces • 1 day ago</p>
              </div>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
        </div>
      </Card>
    </main>
  );
}