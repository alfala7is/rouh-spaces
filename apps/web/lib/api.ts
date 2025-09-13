export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiFetch(path: string, init: RequestInit & { spaceId?: string; userId?: string } = {}) {
  const headers = new Headers(init.headers || {});
  const spaceId = (init as any).spaceId;
  const userId = (init as any).userId || 'web-user';
  if (spaceId) headers.set('x-space-id', spaceId);
  headers.set('x-user-id', userId);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

