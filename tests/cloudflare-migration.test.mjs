import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import worker, { __test } from '../cloudflare/worker.mjs';

const root = new URL('../', import.meta.url);

test('Cloudflare build contains the PWA shell and excludes Netlify server code', async () => {
  const result = spawnSync(process.execPath, ['scripts/build-cloudflare-assets.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  await stat(new URL('../dist-cloudflare/index.html', import.meta.url));
  await stat(new URL('../dist-cloudflare/service-worker.js', import.meta.url));
  await stat(new URL('../dist-cloudflare/manifest.webmanifest', import.meta.url));
  await assert.rejects(stat(new URL('../dist-cloudflare/netlify/functions/auth.mjs', import.meta.url)));
  await assert.rejects(stat(new URL('../dist-cloudflare/package.json', import.meta.url)));
});

test('Cloudflare static headers preserve PWA freshness and security policy', async () => {
  const headers = await readFile(new URL('../cloudflare/static/_headers', import.meta.url), 'utf8');
  const redirects = await readFile(new URL('../cloudflare/static/_redirects', import.meta.url), 'utf8');
  assert.match(headers, /\/service-worker\.js[\s\S]*no-cache, no-store, must-revalidate/);
  assert.match(headers, /Content-Security-Policy: default-src 'self'/);
  assert.match(headers, /connect-src 'self'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(redirects, /^\/\s+\/index\.html\s+200/m);
  assert.match(redirects, /^\/favicon\.ico\s+\/assets\/icons\/icon-192\.png\s+302/m);
});

test('API proxy is allow-listed, rewrites upstream origin, and preserves session cookies', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'bc_session=test-token; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    });
  };

  try {
    const response = await worker.fetch(new Request('https://candidate.example/api/auth?action=session', {
      headers: { cookie: 'bc_session=existing-token' },
    }), {
      NETLIFY_BACKEND_ORIGIN: 'https://bestcaredentalclinicsdash.netlify.app',
    });
    assert.equal(captured.url, 'https://bestcaredentalclinicsdash.netlify.app/api/auth?action=session');
    assert.equal(captured.init.headers.get('origin'), 'https://bestcaredentalclinicsdash.netlify.app');
    assert.equal(captured.init.headers.get('cookie'), 'bc_session=existing-token');
    assert.match(response.headers.get('set-cookie') || '', /bc_session=test-token/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://candidate.example');
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown API routes never become an open Netlify proxy', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response(); };
  try {
    const response = await worker.fetch(new Request('https://candidate.example/api/not-real'), {});
    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('state-changing API requests require the Cloudflare same origin before proxying', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  try {
    const missingOrigin = await worker.fetch(new Request('https://candidate.example/api/alerts', {
      method: 'POST',
      body: '{}',
    }), {});
    const crossOrigin = await worker.fetch(new Request('https://candidate.example/api/alerts', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: '{}',
    }), {});
    assert.equal(missingOrigin.status, 403);
    assert.equal(crossOrigin.status, 403);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('same-origin mutations are forwarded with the trusted Netlify origin', async () => {
  const originalFetch = globalThis.fetch;
  let capturedOrigin = '';
  globalThis.fetch = async (_url, init) => {
    capturedOrigin = init.headers.get('origin');
    return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request('https://candidate.example/api/alerts', {
      method: 'POST',
      headers: { origin: 'https://candidate.example', 'content-type': 'application/json' },
      body: '{}',
    }), {
      NETLIFY_BACKEND_ORIGIN: 'https://bestcaredentalclinicsdash.netlify.app',
    });
    assert.equal(response.status, 401);
    assert.equal(capturedOrigin, 'https://bestcaredentalclinicsdash.netlify.app');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid backend configuration fails closed without exposing an error stack', async () => {
  const response = await worker.fetch(new Request('https://candidate.example/api/state'), {
    NETLIFY_BACKEND_ORIGIN: 'http://127.0.0.1:8787',
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.deepEqual(body, { error: 'Backend service is temporarily unavailable' });
});

test('non-API requests delegate to the static asset binding', async () => {
  let delegated = '';
  const response = await worker.fetch(new Request('https://candidate.example/index.html'), {
    ASSETS: {
      fetch(request) {
        delegated = request.url;
        return new Response('asset', { status: 200 });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(delegated, 'https://candidate.example/index.html');
});

test('the proxy exposes exactly the production API surface', () => {
  assert.equal(__test.API_PATHS.size, 17);
  assert.ok(__test.API_PATHS.has('/api/auth'));
  assert.ok(__test.API_PATHS.has('/api/state'));
  assert.ok(!__test.API_PATHS.has('/.netlify/functions/auth'));
});

test('Cloudflare observability does not persist API query URLs or tracing metadata', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.observability.logs.invocation_logs, false);
  assert.equal(config.observability.traces.enabled, false);
  assert.equal(config.workers_dev, true);
  assert.equal(config.routes, undefined);
});
