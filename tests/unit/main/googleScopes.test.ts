/** Decision 64 — Google sign-in asks for the narrowest access, and needs all of it. */
import { describe, it, expect, afterEach } from 'vitest';
import { signInGoogle, CALENDAR_SCOPES } from '../../../src/main/calendars/google';

const idToken = `x.${Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64')}.y`;

function run(grantedScope: string) {
  let asked = '';
  const fetchFn = (async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600, id_token: idToken, scope: grantedScope }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
  const openBrowser = async (url: string) => {
    const u = new URL(url);
    asked = u.searchParams.get('scope') ?? '';
    // Google sends the owner back to KRNL0's loopback address.
    const back = new URL(u.searchParams.get('redirect_uri')!);
    back.searchParams.set('state', u.searchParams.get('state')!);
    back.searchParams.set('code', 'the-code');
    await fetch(back);
  };
  return { result: signInGoogle(openBrowser, fetchFn), asked: () => asked };
}

describe('Google sign-in: what it asks for', () => {
  afterEach(() => { delete process.env['KRNL0_GOOGLE_CLIENT_ID']; });

  it('asks only to read the calendars and to manage the calendars KRNL0 makes, never all calendars', async () => {
    process.env['KRNL0_GOOGLE_CLIENT_ID'] = 'test-client';
    const r = run(['openid', 'https://www.googleapis.com/auth/userinfo.email', ...CALENDAR_SCOPES].join(' '));
    const res = await r.result;
    expect(res.email).toBe('me@gmail.com');
    const asked = r.asked().split(' ');
    expect(asked).toEqual(expect.arrayContaining([...CALENDAR_SCOPES]));
    expect(asked).not.toContain('https://www.googleapis.com/auth/calendar');
  });

  it('a sign-in with one calendar box unticked is refused with a plain reason', async () => {
    process.env['KRNL0_GOOGLE_CLIENT_ID'] = 'test-client';
    const r = run(['openid', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'].join(' '));
    await expect(r.result).rejects.toThrow(/all three calendar boxes/);
  });
});
