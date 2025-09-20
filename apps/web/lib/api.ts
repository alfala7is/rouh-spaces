export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiFetch(path: string, init: RequestInit & { spaceId?: string; userId?: string } = {}) {
  const headers = new Headers(init.headers || {});
  const spaceId = (init as any).spaceId;
  const userId = (init as any).userId || 'web-user';
  if (spaceId) headers.set('x-space-id', spaceId);
  headers.set('x-user-id', userId);

  const url = `${API_URL}${path}`;
  console.log('API Request:', url, init.method || 'GET');

  const res = await fetch(url, { ...init, headers });
  console.log('API Response:', res.status, res.statusText);

  if (!res.ok) {
    const errorText = await res.text();
    console.error('API Error:', res.status, errorText);
    throw new Error(`API ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  console.log('API Data:', path, data);
  return data;
}

