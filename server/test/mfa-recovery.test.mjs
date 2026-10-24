import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryCode } from '../src/mfa-recovery.mjs';

test('recovery codes have three uppercase hexadecimal groups', () => {
  const code = generateRecoveryCode();
  assert.match(code, /^[A-F0-9]{6}(?:-[A-F0-9]{6}){2}$/);
});

test('recovery codes are independently generated', () => {
  const codes = new Set(Array.from({ length: 100 }, generateRecoveryCode));
  assert.equal(codes.size, 100);
});
