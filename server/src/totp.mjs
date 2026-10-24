import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;
const DIGITS = 6;

function decodeBase32(value) {
  if (typeof value !== 'string' || !value.length || !/^[A-Z2-7]+=*$/i.test(value)) {
    throw new TypeError('TOTP secret must be a non-empty Base32 string.');
  }
  const normalized = value.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of normalized) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (!bytes.length) throw new TypeError('TOTP secret is too short.');
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20) {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new RangeError('TOTP secret size must be between 16 and 64 bytes.');
  }
  const source = randomBytes(bytes);
  let bits = '';
  for (const byte of source) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let offset = 0; offset < bits.length; offset += 5) {
    const chunk = bits.slice(offset, offset + 5).padEnd(5, '0');
    encoded += BASE32[Number.parseInt(chunk, 2)];
  }
  return encoded;
}

export function generateTotp(secret, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) throw new TypeError('TOTP timestamp must be a non-negative number.');
  const key = decodeBase32(secret);
  const counter = BigInt(Math.floor(now / STEP_MS));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0');
}

export function verifyTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  if (!Number.isFinite(now) || now < 0 || !Number.isInteger(window) || window < 0 || window > 2) return false;

  const supplied = Buffer.from(code, 'ascii');
  for (let drift = -window; drift <= window; drift += 1) {
    const timestamp = now + drift * STEP_MS;
    if (timestamp < 0) continue;
    const expected = Buffer.from(generateTotp(secret, timestamp), 'ascii');
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}
