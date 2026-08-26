const DEFAULT_BACKEND_ORIGIN = 'https://bestcaredentalclinicsdash.netlify.app';

const API_PATHS = new Set([
  '/api/admin-patients',
  '/api/alerts',
  '/api/appointment-requests',
  '/api/auth',
  '/api/clinics',
  '/api/lab-cases',
  '/api/patient-lookup',
  '/api/patient-profile',
  '/api/patients',
  '/api/prescriptions',
  '/api/presence',
  '/api/push',
  '/api/state',
  '/api/statistics',
  '/api/treatment-catalog',
  '/api/treatment-plan',
  '/api/treatment-plan-registry',
]);

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  },
});

function backendOrigin(env) {
  const candidate = String(env?.NETLIFY_BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN).trim();
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.netlify.app')) {
    throw new Error('Invalid backend origin configuration');
  }
  return parsed.origin;
}

function appendVary(headers, value) {
  const current = String(headers.get('vary') || '');
  const values = current.split(',').map(item => item.trim()).filter(Boolean);
  if (!values.some(item => item.toLowerCase() === value.toLowerCase())) values.push(value);
  headers.set('vary', values.join(', '));
}

async function proxyApi(request, env) {
  const incomingUrl = new URL(request.url);
  if (!API_PATHS.has(incomingUrl.pathname)) {
    return json({ error: 'API endpoint not found' }, 404);
  }

  if (request.method !== 'GET') {
    const incomingOrigin = request.headers.get('origin');
    if (incomingOrigin !== incomingUrl.origin) {
      return json({ error: 'Invalid request origin' }, 403);
    }
  }

  const upstreamOrigin = backendOrigin(env);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamOrigin);
  const headers = new Headers(request.headers);

  // Existing Netlify functions enforce same-origin CSRF checks. The browser still
  // talks only to the Cloudflare origin; this rewrite is server-to-server only.
  headers.set('origin', upstreamOrigin);
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', 'https');
  headers.delete('host');

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    cf: { cacheTtl: 0 },
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate');
  responseHeaders.set('access-control-allow-origin', incomingUrl.origin);
  responseHeaders.set('access-control-allow-credentials', 'true');
  responseHeaders.set('x-content-type-options', 'nosniff');
  appendVary(responseHeaders, 'Origin');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await proxyApi(request, env);
      } catch {
        return json({ error: 'Backend service is temporarily unavailable' }, 502);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

export const __test = { API_PATHS, appendVary, backendOrigin, proxyApi };
