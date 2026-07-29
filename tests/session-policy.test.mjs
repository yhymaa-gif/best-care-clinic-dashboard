import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as authPolicy } from '../netlify/functions/auth.mjs';
import { __test as sessionPolicy } from '../netlify/functions/lib/session.mjs';

const at = value => new Date(value).getTime();

test('idle protection pauses from 14:00 until before 23:00 Riyadh', () => {
  const cases = [
    ['2026-07-30T10:59:00Z', false],
    ['2026-07-30T11:00:00Z', true],
    ['2026-07-30T19:59:00Z', true],
    ['2026-07-30T20:00:00Z', false],
  ];
  for (const [value, expected] of cases) {
    assert.equal(authPolicy.idleProtectionPaused(at(value)), expected);
    assert.equal(sessionPolicy.idleProtectionPaused(at(value)), expected);
  }
});

test('client and server policies use a five-hour idle threshold', () => {
  assert.equal(authPolicy.IDLE_MS, 5 * 60 * 60 * 1000);
  assert.equal(sessionPolicy.IDLE_MS, 5 * 60 * 60 * 1000);
  assert.equal(authPolicy.SESSION_MAX_MS, 24 * 60 * 60 * 1000);
});
