import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const IDLE_MS = 3 * 60 * 60 * 1000;
const OTP_MS = 5 * 60 * 1000;
const COOKIE = 'bc_session';
const origin = process.env.APP_ORIGIN || '*';
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
const json = async request => { try { return await request.json(); } catch { return {}; } };
const authEnabled = () => process.env.AUTH_ENABLED === 'true';
const store = name => getStore({ name, consistency: 'strong' });
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const sign = value => createHmac('sha256', process.env.AUTH_SESSION_SECRET || 'change-me-before-production').update(value).digest('hex');
const passwordHash = value => createHash('sha256').update(String(value)).digest();
const passwordMatches = value => timingSafeEqual(passwordHash(value), passwordHash(process.env.AUTH_BOOTSTRAP_PASSWORD || 'BestCare@2026'));
const token = () => randomBytes(32).toString('base64url');
const cleanUsername = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 48);
const cleanPhone = value => {
  let phone = String(value || '').replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (phone.startsWith('05')) phone = `+966${phone.slice(1)}`;
  if (/^5\d{8}$/.test(phone)) phone = `+966${phone}`;
  return phone.slice(0, 20);
};
const cleanEmail = value => String(value || '').trim().toLowerCase().slice(0, 160);
const emailMatches = (a, b) => cleanEmail(a) === cleanEmail(b);
const phoneMatches = (a, b) => cleanPhone(a) === cleanPhone(b);
const safeUser = user => ({ username: user.username, displayName: user.displayName, role: user.role, clinicId: user.clinicId || '' });
const bootstrapUser = () => {
  const username = cleanUsername(process.env.AUTH_BOOTSTRAP_USERNAME);
  const phone = cleanPhone(process.env.AUTH_BOOTSTRAP_PHONE);
  const email = cleanEmail(process.env.AUTH_BOOTSTRAP_EMAIL);
  return username && (phone || email) ? { username, phone, email, displayName: 'Administrator', role: 'admin', clinicId: '', createdAt: 0 } : null;
};
async function findUser(username, contact, method = 'phone') {
  const normalized = cleanUsername(username);
  const boot = bootstrapUser();
  const matches = method === 'email' ? emailMatches(boot?.email, contact) : phoneMatches(boot?.phone, contact);
  if (boot && boot.username === normalized && matches) return boot;
  if (!normalized) return null;
  const user = await store('clinic-dashboard-auth-users').get(`users/${normalized}`, { type: 'json', consistency: 'strong' });
  return user && (method === 'email' ? emailMatches(user.email, contact) : phoneMatches(user.phone, contact)) ? user : null;
}
async function sendOtp(phone, code) {
  const message = `Best Care verification code: ${code}`;
  if (process.env.UNIFONIC_APP_SID && process.env.UNIFONIC_SENDER_ID) {
    const body = new URLSearchParams({ AppSid: process.env.UNIFONIC_APP_SID, SenderID: process.env.UNIFONIC_SENDER_ID, Recipient: phone, Body: message });
    const response = await fetch(process.env.UNIFONIC_URL || 'https://api.unifonic.com/rest/SMS/messages', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: process.env.UNIFONIC_API_KEY || '' }, body });
    if (!response.ok) throw new Error('SMS provider rejected request');
    return true;
  }
  throw new Error('SMS provider is not configured');
}
async function sendEmailOtp(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM || 'Best Care Dashboard <onboarding@resend.dev>';
  if (!apiKey) throw new Error('Email provider is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Best Care - رمز تسجيل الدخول', text: `رمز تسجيل الدخول الخاص بك هو: ${code}\n\nالرمز صالح لمدة خمس دقائق ولا تشاركه مع أي شخص.` })
  });
  if (!response.ok) throw new Error('Email provider rejected request');
  return true;
}
async function sessionFrom(request) {
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const sessions = store('clinic-dashboard-auth-sessions');
  const key = `sessions/${hash(raw)}`;
  const session = await sessions.get(key, { type: 'json', consistency: 'strong' });
  const now = Date.now();
  if (!session || session.tokenSignature !== sign(raw) || now - Number(session.lastSeenAt || 0) > IDLE_MS || now > Number(session.expiresAt || 0)) {
    if (session) await sessions.delete(key);
    return null;
  }
  session.lastSeenAt = now;
  await sessions.setJSON(key, session);
  return { token: raw, ...session };
}
const sessionCookie = value => `${COOKIE}=${value}; Path=/; Max-Age=${Math.floor(IDLE_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`;
const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export default async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const url = new URL(request.url);
  if (!authEnabled()) return reply({ enabled: false, authenticated: true, user: null });
  const action = url.searchParams.get('action') || 'session';
  if (request.method === 'GET' && action === 'session') {
    const session = await sessionFrom(request);
    return reply({ enabled: true, authenticated: Boolean(session), user: session ? safeUser(session.user) : null }, session ? 200 : 401);
  }
  if (request.method === 'POST' && action === 'password-login') {
    const body = await json(request);
    const user = bootstrapUser();
    if (!user || cleanUsername(body.username) !== user.username || !passwordMatches(body.password)) return reply({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
    const raw = token(); const now = Date.now();
    await store('clinic-dashboard-auth-sessions').setJSON(`sessions/${hash(raw)}`, { tokenSignature: sign(raw), user, createdAt: now, lastSeenAt: now, expiresAt: now + 12 * 60 * 60 * 1000 });
    return reply({ ok: true, user: safeUser(user) }, 200, { 'set-cookie': sessionCookie(raw) });
  }
  if (request.method === 'POST' && action === 'request-otp') {
    const body = await json(request);
    const username = cleanUsername(body.username); const method = body.method === 'email' ? 'email' : 'phone';
    const contact = method === 'email' ? cleanEmail(body.email) : cleanPhone(body.phone);
    const user = await findUser(username, contact, method);
    // Do not reveal whether a username/phone pair exists.
    if (!user) return reply({ ok: true, message: 'If the details match an account, a code will be sent.' });
    const code = String(randomInt(1000, 10000));
    const challengeId = token();
    await store('clinic-dashboard-auth-otp').setJSON(`challenges/${hash(challengeId)}`, { username, method, contact, phone: method === 'phone' ? contact : '', email: method === 'email' ? contact : '', codeHash: hash(code), createdAt: Date.now(), expiresAt: Date.now() + OTP_MS, attempts: 0 });
    try { method === 'email' ? await sendEmailOtp(contact, code) : await sendOtp(contact, code); } catch (error) { await store('clinic-dashboard-auth-otp').delete(`challenges/${hash(challengeId)}`); return reply({ error: method === 'email' ? 'Email provider is not configured' : 'SMS provider is not configured' }, 503); }
    return reply({ ok: true, challengeId, expiresIn: OTP_MS });
  }
  if (request.method === 'POST' && action === 'verify-otp') {
    const body = await json(request); const challengeId = String(body.challengeId || ''); const code = String(body.code || '').trim();
    const key = `challenges/${hash(challengeId)}`; const otpStore = store('clinic-dashboard-auth-otp'); const challenge = await otpStore.get(key, { type: 'json', consistency: 'strong' });
    if (!challenge || Date.now() > challenge.expiresAt || challenge.attempts >= 5 || !/^\d{4}$/.test(code)) return reply({ error: 'Invalid or expired code' }, 401);
    challenge.attempts += 1; await otpStore.setJSON(key, challenge);
    if (!timingSafeEqual(Buffer.from(hash(code)), Buffer.from(challenge.codeHash))) return reply({ error: 'Invalid or expired code' }, 401);
    await otpStore.delete(key);
    const user = await findUser(challenge.username, challenge.method === 'email' ? challenge.email : challenge.phone, challenge.method || 'phone'); if (!user) return reply({ error: 'Account unavailable' }, 401);
    const raw = token(); const now = Date.now(); await store('clinic-dashboard-auth-sessions').setJSON(`sessions/${hash(raw)}`, { tokenSignature: sign(raw), user, createdAt: now, lastSeenAt: now, expiresAt: now + 12 * 60 * 60 * 1000 });
    return reply({ ok: true, user: safeUser(user) }, 200, { 'set-cookie': sessionCookie(raw) });
  }
  if (request.method === 'POST' && action === 'logout') return reply({ ok: true }, 200, { 'set-cookie': clearCookie });
  const session = await sessionFrom(request);
  if (!session) return reply({ error: 'Authentication required' }, 401, { 'set-cookie': clearCookie });
  if (request.method === 'POST' && action === 'users') {
    if (session.user.role !== 'admin') return reply({ error: 'Admin role required' }, 403);
    const body = await json(request); const username = cleanUsername(body.username); const phone = cleanPhone(body.phone); const email = cleanEmail(body.email);
    if (!username || (!/^\+\d{8,15}$/.test(phone) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return reply({ error: 'Invalid username, phone, or email' }, 400);
    await store('clinic-dashboard-auth-users').setJSON(`users/${username}`, { username, phone, email, displayName: String(body.displayName || username).slice(0, 80), role: body.role === 'admin' ? 'admin' : 'clinic', clinicId: String(body.clinicId || '').slice(0, 40), createdAt: Date.now() });
    return reply({ ok: true });
  }
  return reply({ error: 'Unsupported action' }, 400);
};
