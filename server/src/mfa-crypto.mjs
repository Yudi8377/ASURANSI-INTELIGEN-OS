import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKey(value = process.env.MFA_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters.');
  }
  return Buffer.from(value, 'hex');
}

export function encryptMfaSecret(plaintext, keyValue) {
  if (typeof plaintext !== 'string' || !plaintext) throw new TypeError('MFA secret is required.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(keyValue), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptMfaSecret(payload, keyValue) {
  if (typeof payload !== 'string') throw new TypeError('Encrypted MFA secret is required.');
  const [version, ivPart, tagPart, ciphertextPart, ...extra] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !ciphertextPart || extra.length) {
    throw new Error('Encrypted MFA secret has an invalid format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(keyValue), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]).toString('utf8');
}
