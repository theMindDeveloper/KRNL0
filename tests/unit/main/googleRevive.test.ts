/** Decision 64 P4 — an event Google still holds as deleted is brought back, not refused for ever. */
import { describe, it, expect, afterEach } from 'vitest';
import { GoogleAdapter } from '../../../src/main/calendars/google';

describe('Google: making again an event that was deleted', () => {
  afterEach(() => { delete process.env['KRNL0_GOOGLE_CLIENT_ID']; });
  it('a refused import (409) finds the deleted event by its UID and confirms it', async () => {
    process.env['KRNL0_GOOGLE_CLIENT_ID'] = 'test-client';
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const fetchFn = (async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, ...(init?.body && !url.includes('oauth2') ? { body: JSON.parse(init.body) as Record<string, unknown> } : {}) });
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('oauth2')) return json(200, { access_token: 'a', expires_in: 3600 });
      if (url.endsWith('/events/import')) return json(409, { error: { code: 409 } });
      if (url.includes('iCalUID=')) return json(200, { items: [{ id: 'old-id', iCalUID: 'h1@krnl0', status: 'cancelled' }] });
      if (method === 'PUT') return json(200, { id: 'old-id', etag: '"2"' });
      return json(404, {});
    }) as unknown as typeof fetch;
    const g = new GoogleAdapter({ refreshToken: 'r' }, fetchFn);
    const res = await g.put('cal', { id: 'h1', uid: 'h1@krnl0', name: 'Dentist', repeat: { kind: 'weekly', days: [5] }, at: '15:00', lengthMin: 60, startsOn: '2026-11-27', endsOn: '2026-11-27', skips: [], moved: [] }, 'Europe/Berlin');
    expect(res).toEqual({ ref: 'old-id', etag: '"2"' });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toContain('/events/old-id');
    expect(put.body?.['status']).toBe('confirmed');
  });
});
