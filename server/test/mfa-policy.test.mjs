import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresMandatoryMfa } from '../src/mfa-policy.mjs';

test('wildcard/system administrator permissions require MFA', () => {
  assert.equal(requiresMandatoryMfa({ permissions: ['*'] }), true);
  assert.equal(requiresMandatoryMfa({ permissions: ['clients:read', '*'] }), true);
});

test('least-privilege users and malformed claims do not trigger the privileged policy', () => {
  assert.equal(requiresMandatoryMfa({ permissions: ['clients:read', 'claims:read'] }), false);
  assert.equal(requiresMandatoryMfa({ permissions: [] }), false);
  assert.equal(requiresMandatoryMfa({ permissions: '*' }), false);
  assert.equal(requiresMandatoryMfa(null), false);
});
