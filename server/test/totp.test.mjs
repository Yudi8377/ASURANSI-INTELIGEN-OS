import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTotp, generateTotpSecret, matchingTotpCounter, verifyTotp } from '../src/totp.mjs';

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('matches RFC 6238 SHA-1 six-digit test vector at 59 seconds', () => {
  assert.equal(generateTotp(RFC_SECRET, 59_000), '287082');
});

test('accepts valid codes and rejects malformed codes', () => {
  const now = 1_700_000_000_000;
  const code = generateTotp(RFC_SECRET, now);
  assert.equal(verifyTotp(RFC_SECRET, code, { now, window: 0 }), true);
  assert.equal(verifyTotp(RFC_SECRET, 'abc123', { now }), false);
  assert.equal(verifyTotp(RFC_SECRET, '12345', { now }), false);
});

test('returns a matched counter and rejects replayed or older counters', () => {
  const now = 1_700_000_000_000;
  const counter = Math.floor(now / 30_000);
  const code = generateTotp(RFC_SECRET, now);
  assert.equal(matchingTotpCounter(RFC_SECRET, code, { now, window: 0, afterCounter: counter - 1 }), counter);
  assert.equal(matchingTotpCounter(RFC_SECRET, code, { now, window: 0, afterCounter: counter }), null);
  assert.equal(matchingTotpCounter(RFC_SECRET, code, { now, window: 0, afterCounter: counter + 1 }), null);
});

test('accepts only the configured small clock-drift window', () => {
  const now = 1_700_000_000_000;
  const priorCode = generateTotp(RFC_SECRET, now - 30_000);
  assert.equal(verifyTotp(RFC_SECRET, priorCode, { now, window: 1 }), true);
  assert.equal(verifyTotp(RFC_SECRET, priorCode, { now, window: 0 }), false);
});

test('generates cryptographically random Base32 secrets', () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();
  assert.match(first, /^[A-Z2-7]+$/);
  assert.equal(first.length, 32);
  assert.notEqual(first, second);
  assert.throws(() => generateTotpSecret(8), /between 16 and 64/);
});

test('rejects malformed secrets and invalid options', () => {
  assert.throws(() => generateTotp('not-valid-!'), /Base32/);
  assert.equal(verifyTotp(RFC_SECRET, '123456', { now: -1 }), false);
  assert.equal(verifyTotp(RFC_SECRET, '123456', { now: 0, window: 2 }), false);
});
