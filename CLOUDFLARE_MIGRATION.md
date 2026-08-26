# Best Care Dashboard — Cloudflare Migration

## Migration policy

- Netlify remains the primary production platform during this migration.
- The Netlify site, deploy history, environment variables, functions, Blobs data, and URL must remain intact.
- Cloudflare is a parallel production candidate only. No DNS cutover is authorized by this branch.
- GitHub remains the source of truth. All Cloudflare work is isolated on `migration/cloudflare`.

## 1. Phase 0 safety baseline

| Item | Production baseline |
| --- | --- |
| GitHub repository | `yhymaa-gif/best-care-clinic-dashboard` |
| Production branch | `main` |
| Netlify production commit | `f5f794cd60477a39e4c7863c07eaa8a6738dcb19` |
| Netlify site ID | `3c4d489e-36cb-4ed2-a934-99e87e4f79e7` |
| Netlify site name | `bestcaredentalclinicsdash` |
| Netlify production URL | `https://bestcaredentalclinicsdash.netlify.app` |
| Custom domains | None |
| Last successful production deploy | `6a8d7be2c529fd000886ec2d` (2026-08-25) |
| Framework | Static multi-page HTML/CSS/JavaScript application |
| Package manager | pnpm lockfile v9 |
| Node version | Not pinned in the production repository; local migration validation uses Node 24.19.0 |
| Netlify build command | None |
| Netlify publish directory | Repository root (`.`) |
| Netlify functions directory | `netlify/functions` |
| Cloudflare migration branch | `migration/cloudflare` |

### Active Netlify environment variable names

Values are intentionally omitted.

- `APP_ORIGIN`
- `AUTH_BOOTSTRAP_EMAIL`
- `AUTH_BOOTSTRAP_PASSWORD`
- `AUTH_BOOTSTRAP_PHONE`
- `AUTH_BOOTSTRAP_USERNAME`
- `AUTH_EMAIL_FROM`
- `AUTH_ENABLED`
- `AUTH_SESSION_SECRET`
- `RESEND_API_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_PUBLIC_KEY`

The source also supports optional `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`, `UNIFONIC_API_KEY`, `UNIFONIC_URL`, and `VAPID_SUBJECT`, but they were not present in the production environment-name snapshot.

### Netlify platform inventory

- Functions: 17 active HTTP endpoints plus 5 shared function libraries.
- Scheduled Functions: none found in configuration or function exports.
- Edge Functions: none found.
- Netlify Blobs: used as the production database and session/push store.
- Netlify Forms: no configured production forms found.
- Build hooks: none found.
- Authentication: custom username/password or OTP flow in Netlify Functions; this project does not use Netlify Identity.
- Realtime behavior: application polling, optimistic revision checks, same-device `BroadcastChannel`, visibility/refocus refresh, and Web Push. No WebSocket or EventSource transport was found.
- PWA: manifest, service worker, offline shell, install icons, update activation, and push notifications are present.

## 2. Previous architecture

```text
Browser / installed PWA
  -> Netlify static files
  -> same-origin /api/* rewrites
  -> Netlify Functions
  -> Netlify Blobs (data, sessions, rate limits, subscriptions)
  -> polling / revision checks / Web Push
  -> other browser clients
```

The browser uses `localStorage` and `sessionStorage` for preferences, layout, short-lived UI state, and selected workflow hand-off data. They are not the authoritative production database. Patient, clinic, schedule, authentication, treatment-plan, prescription, laboratory, and notification records are stored through Netlify Functions in Netlify Blobs.

## 3. Target architecture — parallel phase

```text
GitHub migration/cloudflare
  -> Cloudflare Workers Build (candidate)
  -> Worker Static Assets (UI/PWA)
  -> allow-listed /api/* Worker proxy
  -> existing Netlify /api/* endpoints
  -> existing Netlify Functions and Netlify Blobs
```

This is deliberately a hosting-only first step: same application, same backend, same data, different static hosting. Native migration of Netlify Blobs is excluded from this phase because duplicating or replacing the production data store would increase data-loss and split-brain risk.

## 4. Netlify dependency classification

| Dependency | Status | Migration decision |
| --- | --- | --- |
| `netlify.toml` | USED | Keep unchanged for Netlify; create Cloudflare-specific equivalents separately. |
| `netlify/functions/*` | USED | Keep on Netlify during the parallel phase (class D). |
| `@netlify/blobs` | USED | Keep as the authoritative production data store during the parallel phase. |
| `/.netlify/functions/*` | USED INDIRECTLY | Netlify rewrites `/api/*`; Cloudflare will expose the same browser paths through an allow-listed proxy. |
| `.netlify/` | LOCAL ONLY | Ignored; not part of production source. |
| Netlify Forms | UNUSED | No migration required. |
| Netlify Identity | UNUSED | No migration required; authentication is custom. |
| Netlify Edge Functions | UNUSED | No migration required. |
| Netlify Scheduled Functions | UNUSED | No migration required. |
| Netlify headers/redirects | USED | Reproduce in Cloudflare Static Assets `_headers` and `_redirects`. |

### Function classification

All current HTTP functions are class D for the first parallel deployment because they depend on Netlify Blobs, the shared Netlify session store, or both:

`admin-patients`, `alerts`, `appointment-requests`, `auth`, `clinics`, `lab-cases`, `patient-lookup`, `patient-profile`, `patients`, `prescriptions`, `presence`, `push-subscription`, `state`, `statistics`, `treatment-catalog`, `treatment-plan-registry`, and `treatment-plan`.

No function is classified as browser-safe (class B). Moving authorization or patient-data writes into browser code is prohibited. A later native-backend phase would require an explicit data migration and dual-write/cutover design.

## 5. Storage inventory

Production Blobs stores discovered in source include:

- `clinic-dashboard-days`
- `clinic-dashboard-config`
- `clinic-dashboard-auth-sessions`
- `clinic-dashboard-auth-users`
- `clinic-dashboard-auth-otp`
- `clinic-dashboard-auth-rate-limit`
- `clinic-dashboard-alerts`
- `clinic-dashboard-presence`
- `clinic-dashboard-push-subscriptions`
- `clinic-appointment-requests`
- `clinic-appointment-request-limits`
- `clinic-patient-directory`
- `clinic-treatment-plans`
- `clinic-treatment-plan-registry`
- `clinic-treatment-catalog`
- `clinic-lab-cases`
- `clinic-prescriptions`

## 6. Security constraints for the Cloudflare proxy

- Proxy only the known `/api/*` endpoint allow-list; never provide a general upstream proxy.
- Keep authentication and authorization enforcement in the existing server functions.
- Preserve `HttpOnly`, `Secure`, and `SameSite` session cookie behavior.
- Rewrite the upstream `Origin` only inside the server-to-server request so existing CSRF checks remain effective.
- Never cache API responses or patient data.
- Return generic upstream errors without stack traces.
- Do not log request bodies, cookies, authorization data, patient data, OTP values, or secrets.

## 7. Changed files

- `wrangler.jsonc`: Workers Static Assets, selective `/api/*` Worker routing, observability, and candidate Worker name.
- `cloudflare/worker.mjs`: allow-listed API proxy to the unchanged Netlify backend with Cloudflare-side CSRF validation and no API caching.
- `cloudflare/static/_headers`: Cloudflare equivalents for security and PWA cache headers.
- `cloudflare/static/_redirects`: root entry rewrite, favicon fallback, and the existing public redirects.
- `scripts/build-cloudflare-assets.mjs`: creates a dedicated static artifact without Functions, repository metadata, dependencies, or secret files.
- `tests/cloudflare-migration.test.mjs`: build-boundary, routing, proxy, cookie, CSRF, failure, and allow-list tests.
- `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`: pinned Wrangler tooling and deterministic migration commands.
- `.gitignore`: excludes generated Cloudflare artifacts and local secret files.

## 8. Build and deployment

- Netlify: unchanged.
- Cloudflare build command: `pnpm run build:cloudflare`.
- Cloudflare verification command: `pnpm run check:cloudflare`.
- Cloudflare deploy command: `pnpm exec wrangler deploy`.
- Worker name: `best-care-dashboard-candidate`.
- Temporary Cloudflare preview URL: `https://best-care-dashboard-candidate.empty-pomegranate.workers.dev`.
- Temporary Worker version: `19f5d33a-c1bb-4371-8cc4-250cfe3e3711`.
- Persistent account-owned candidate URL: pending authenticated Cloudflare access.
- Production custom domain: not assigned; no cutover authorized.

## 9. Tests and acceptance status

### Completed locally on 2026-08-26

- `pnpm run check:cloudflare`: PASS — 100 tests, 0 failures.
- `wrangler deploy --dry-run`: PASS — 61 static assets, Worker bundle 3.48 KiB (1.39 KiB gzip), expected bindings only.
- Direct HTTP routes: PASS for `/`, appointment requests, notifications, laboratory, prescriptions, statistics, treatment plans, offline shell, manifest, and service worker.
- Browser smoke test: PASS for representative public/protected pages, RTL, direct navigation, deep-link refresh, and zero console entries.
- Remote Cloudflare smoke test: PASS on the temporary `workers.dev` URL for static routes, security headers, deep-link refresh, and zero browser console entries.
- Remote API statuses: PASS — session `401`, unknown endpoint `404`, unauthenticated same-origin mutation `401`, and cross-origin mutation `403`.
- API proxy smoke test: PASS — unauthenticated session returns the expected `401`; unknown APIs return `404`; state-changing requests require the Cloudflare same origin before the Worker rewrites Origin server-side.
- PWA static validation: PASS — manifest, icons, service worker, offline shell, update assets, and cache headers are included. Remote install/update testing still requires the persistent Cloudflare URL.
- Secret pattern scan: no confirmed source credential was found. Pattern-like bytes occurred only inside bundled OCR WASM JavaScript assets and were treated as binary false positives.
- Dependency audit: two high advisories remain through `@netlify/blobs -> @netlify/dev-utils -> image-size`. The vulnerable image parsers are not used by the application path found in this audit. Upgrading `@netlify/blobs` would change the Netlify runtime requirement and is deferred to a separately tested backend maintenance change rather than mixed into hosting migration.

### Pending acceptance gates

- Claim or redeploy the tested temporary version into the user's authenticated Cloudflare account to obtain a persistent account-owned candidate.
- Authenticated login/logout and production-data CRUD through the candidate origin.
- Two-device synchronization and Web Push comparison against Netlify.
- Android Chrome and desktop Chrome install/update/offline testing against the remote candidate.
- Performance comparison between persistent Netlify and Cloudflare URLs.
- Workers Builds Git integration validation.

Until these gates pass, the decision remains: **keep Netlify primary**.

## 10. Known limitations and remaining work

- A Cloudflare account session/API token with Workers deployment permission is required to create the persistent candidate URL and connect Workers Builds to GitHub.
- The first static/API candidate is ready to deploy, but no persistent Cloudflare URL can be claimed until Wrangler is authenticated to the target account.
- A user who is already signed in on the Netlify hostname will sign in separately on the Cloudflare candidate hostname because cookies are host-scoped. Both sessions still use the same server-side session store.
- Netlify remains an intentional backend dependency during this first phase. This is documented, reversible, and avoids data duplication.

## 11. Rollback

See `MIGRATION_ROLLBACK.md`. Until an explicit later cutover, rollback is simply continuing to use the unchanged Netlify production URL.
