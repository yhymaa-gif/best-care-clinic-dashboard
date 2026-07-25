import { getStore } from '@netlify/blobs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const IDLE_MS = 3 * 60 * 60 * 1000;
const COOKIE = 'bc_session';
const SESSION_STORE = 'clinic-dashboard-auth-sessions';
const DEFAULT_ORIGIN = 'https://bestcaredentalclinicsdash.netlify.app';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
};
const sessionSecret = () => {
  const value = String(process.env.AUTH_SESSION_SECRET || '');
  return value.length >= 32 ? value : '';
};
const sessionToken = request => (request.headers.get('cookie') || '')
  .split(';')
  .map(value => value.trim())
  .find(value => value.startsWith(`${COOKIE}=`))
  ?.slice(COOKIE.length + 1) || '';

export const apiHeaders = (methods = 'GET,OPTIONS') => ({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, no-cache, must-revalidate',
  'access-control-allow-origin': process.env.APP_ORIGIN || DEFAULT_ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': methods,
  'access-control-allow-headers': 'content-type,accept',
  vary: 'Origin',
});

export function sameOriginRequest(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigin = process.env.APP_ORIGIN || DEFAULT_ORIGIN;
    return origin === requestOrigin || origin === configuredOrigin;
  } catch {
    return false;
  }
}

export async function requireUser(request) {
  if (process.env.AUTH_ENABLED !== 'true') {
    return { ok: false, status: 503, error: 'Authentication is not configured' };
  }
  const secret = sessionSecret();
  if (!secret) return { ok: false, status: 503, error: 'Authentication secret is not configured' };
  const raw = sessionToken(request);
  if (!raw) return { ok: false, status: 401, error: 'Authentication required' };

  const sessions = getStore({ name: SESSION_STORE, consistency: 'strong' });
  const key = `sessions/${hash(raw)}`;
  const session = await sessions.get(key, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  const expired = !session ||
    !safeEqual(session.tokenSignature, signature) ||
    now - Number(session.lastSeenAt || 0) > IDLE_MS ||
    now > Number(session.expiresAt || 0);
  if (expired) {
    if (session) await sessions.delete(key);
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  if (now - Number(session.lastSeenAt || 0) >= 5 * 60 * 1000) {
    session.lastSeenAt = now;
    await sessions.setJSON(key, session);
  }
  return { ok: true, user: session.user || null, sessionKey: key };
}

export function canAccessClinic(user, clinicId) {
  if (!user || !/^clinic-([1-9]|1[0-5])$/.test(String(clinicId || ''))) return false;
  if (user.role === 'admin') return true;
  return user.role === 'clinic' && String(user.clinicId || '') === String(clinicId);
}

export function publicUser(user) {
  return {
    username: String(user?.username || ''),
    displayName: String(user?.displayName || ''),
    role: user?.role === 'admin' ? 'admin' : 'clinic',
    clinicId: String(user?.clinicId || ''),
  };
}
