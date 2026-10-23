import assert from 'node:assert/strict';
import argon2 from 'argon2';
import handler from '../src/neon-function.mjs';

const hash = await argon2.hash('ci-smoke-test-password');
assert.equal(await argon2.verify(hash, 'ci-smoke-test-password'), true);
const response = await handler.fetch(new Request('https://example.invalid/api/health'));
assert.equal(response.status, 200);
const health = await response.json();
assert.equal(health.service, 'asuransi-inteligen-api');
console.log('Neon Function ARM64 native dependency + /api/health smoke test passed');
