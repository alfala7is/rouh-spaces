import 'dotenv/config';

const API = process.env.API_URL || 'http://localhost:3001';

async function api(path: string, init: RequestInit & { spaceId?: string } = {}) {
  const headers = new Headers(init.headers || {});
  if (init.spaceId) headers.set('x-space-id', init.spaceId);
  headers.set('content-type', headers.get('content-type') || 'application/json');
  headers.set('x-user-id', 'e2e-user');
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function run() {
  const space = await api('/spaces', { method: 'POST', body: JSON.stringify({ name: 'E2E Space' }) });
  const sid = space.id;
  console.log('Created space', sid);

  await api('/items/upsert', { spaceId: sid, method: 'POST', body: JSON.stringify({ canonicalJson: { title: 'E2E A', phone: '+991' } }) });
  await api('/items/upsert', { spaceId: sid, method: 'POST', body: JSON.stringify({ canonicalJson: { title: 'E2E B', phone: '+992' } }) });
  console.log('Upserted items');

  const search = await api(`/items/search?query=E2E`, { spaceId: sid });
  console.log('Search results count:', search.length);

  // RLS isolation
  const other = await api(`/items/search?query=E2E`, { spaceId: '00000000-0000-0000-0000-000000000000' }).catch(() => []);
  console.log('Other space results count (expect 0):', Array.isArray(other) ? other.length : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

