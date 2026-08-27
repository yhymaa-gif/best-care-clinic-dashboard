# Best Care Dashboard — Migration Rollback Runbook

## Immutable safety facts

- Original Netlify URL: `https://bestcaredentalclinicsdash.netlify.app`
- Netlify site ID: `3c4d489e-36cb-4ed2-a934-99e87e4f79e7`
- Last known good Netlify production commit: `f5f794cd60477a39e4c7863c07eaa8a6738dcb19`
- Last known good Netlify deploy: `6a8d7be2c529fd000886ec2d`
- Temporary Cloudflare preview URL: `https://best-care-dashboard-candidate.empty-pomegranate.workers.dev`
- Persistent account-owned Cloudflare candidate URL: `https://best-care-dashboard-candidate.best-care-dashboard-v4.workers.dev`
- Candidate source/version: `1afea2a` / `2b91670b-2baf-4cc6-b656-3b4079472638`
- Production custom domain: none
- DNS before migration: no custom production DNS; the application uses the Netlify subdomain
- DNS after parallel deployment: unchanged

## Current rollback state

Netlify is still primary and has not been disabled, deleted, unlinked, or modified. No rollback action is currently required.

Reverified on 2026-08-27: the production deploy and source SHA above are unchanged. The candidate was subsequently deployed to the user's account on 2026-08-28 Riyadh time using Wrangler 4.127.0. Cloudflare registered its own workers.dev subdomain; no production DNS or Netlify environment setting was changed.

## Emergency rollback procedure after a future cutover

1. Stop routing users to the Cloudflare candidate/custom domain.
2. Direct users to `https://bestcaredentalclinicsdash.netlify.app`.
3. If a custom domain is introduced later, restore its last recorded Netlify DNS target from the cutover record and wait for DNS health checks.
4. Confirm `/`, `/api/auth?action=session`, and the protected dashboard load from Netlify.
5. Confirm read/write operations and a two-device synchronization test against the existing Netlify Functions and Blobs.
6. Confirm the PWA service worker has refreshed to the Netlify origin when users reopen or reinstall it.
7. Leave the Cloudflare Worker deployed but remove it from production traffic for incident analysis; do not delete production data or Netlify configuration.

## Environment dependencies

The production backend depends on the following Netlify variable names; values remain only in Netlify's secret/environment store:

`APP_ORIGIN`, `AUTH_BOOTSTRAP_EMAIL`, `AUTH_BOOTSTRAP_PASSWORD`, `AUTH_BOOTSTRAP_PHONE`, `AUTH_BOOTSTRAP_USERNAME`, `AUTH_EMAIL_FROM`, `AUTH_ENABLED`, `AUTH_SESSION_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_PUBLIC_KEY`.

## Emergency checklist

- [ ] Netlify site is enabled and reachable
- [ ] Last known good Netlify deploy is available
- [ ] Netlify Functions return expected status codes
- [ ] Netlify Blobs reads and writes succeed
- [ ] Login/logout works
- [ ] CRUD smoke test passes
- [ ] Two-device synchronization works
- [ ] Web Push/PWA behavior is checked
- [ ] No Netlify environment variable was removed
- [ ] Incident time, failing URL, failing commit, and recovery time are recorded

## Prohibited rollback actions

Do not reset or replace Netlify Blobs, delete the Cloudflare Worker, delete the Netlify site, rotate secrets without an incident reason, or rewrite Git history as part of rollback.
