export async function getCryptoKey(): Promise<CryptoKey> {
  const secretKey = process.env.OOB_ENCRYPTION_KEY;
  if (!secretKey) {
    throw new Error('OOB_ENCRYPTION_KEY environment variable is required');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const hash = await crypto.subtle.digest('SHA-256', keyData);

  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return Buffer.from(combined).toString('base64');
}

export async function decryptText(encryptedBase64: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  if (combined.length < 12) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
