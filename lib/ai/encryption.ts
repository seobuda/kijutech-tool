import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getMasterKey(): Buffer {
  const key = process.env.AI_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('AI_ENCRYPTION_KEY no configurada en variables de entorno');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encryptedBuffer = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: Buffer.concat([encryptedBuffer, authTag]).toString('hex'),
    iv: iv.toString('hex'),
  };
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getMasterKey();
  const encryptedBuffer = Buffer.from(encrypted, 'hex');
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(authTag);

  const decryptedBuffer = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decryptedBuffer.toString('utf8');
}
