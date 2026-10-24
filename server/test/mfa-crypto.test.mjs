import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptMfaSecret, encryptMfaSecret } from '../src/mfa-crypto.mjs';

const KEY = '0123456789abcdef'.repeat(4);

test('encrypts and decrypts an MFA secret with authenticated encryption', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const encrypted = encryptMfaSecret(secret, KEY);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted, KEY), secret);
  assert.notEqual(encryptMfaSecret(secret, KEY), encrypted);
});

test('rejects tampered ciphertext and wrong encryption keys', () => {
  const encrypted = encryptMfaSecret('private-totp-secret', KEY);
  const parts = encrypted.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptMfaSecret(parts.join('.'), KEY));
  assert.throws(() => decryptMfaSecret(encryptMfaSecret('secret', KEY), 'f'.repeat(64)));
});

test('requires a 32-byte hex encryption key', () => {
  assert.throws(() => encryptMfaSecret('secret', 'short'), /64 hex characters/);
});
