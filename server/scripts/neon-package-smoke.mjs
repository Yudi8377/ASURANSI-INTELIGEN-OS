import assert from 'node:assert/strict';
import argon2 from 'argon2';
import handler from '../src/neon-function.mjs';

const hash = await argon2.hash('ci-smoke-test-password');
assert.equal(await argon2.verify(hash, 'ci-smoke-test-password'), true);

// This package smoke test intentionally runs without a PostgreSQL service.
// It verifies the function boots and the health route reports database
// unavailability honestly. The deployment workflow separately requires
// HTTP 200 from the live health route after connecting to Neon.
const response = await handler.fetch(new Request('https://example.invalid/api/health'));
assert.equal(response.status, 503);
const health = await response.json();
assert.equal(health.service, 'asuransi-inteligen-api');
assert.equal(health.status, 'degraded');
assert.equal(health.database, 'unavailable');
console.log('Neon Function ARM64 native dependency + degraded /api/health smoke test passed');
