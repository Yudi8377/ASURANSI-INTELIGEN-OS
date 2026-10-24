import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryCode, totpCodeSchema } from '../src/mfa-recovery.mjs';

test('recovery codes have three uppercase hexadecimal groups', () => {
  const code = generateRecoveryCode();
  assert.match(code, /^[A-F0-9]{6}(?:-[A-F0-9]{6}){2}$/);
});

test('recovery codes are independently generated', () => {
  const codes = new Set(Array.from({ length: 100 }, generateRecoveryCode));
  assert.equal(codes.size, 100);
});

test('TOTP schema accepts exactly six decimal digits', () => {
  for (const code of ['000000', '123456', '999999']) {
    assert.equal(totpCodeSchema.safeParse(code).success, true, code);
  }
  for (const code of ['', '12345', '1234567', '12a456', '１２３４５６', '123 56']) {
    assert.equal(totpCodeSchema.safeParse(code).success, false, code);
  }
});
