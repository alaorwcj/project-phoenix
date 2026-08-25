import { describe, it, expect, beforeEach } from 'vitest';
import { validateBody, StartContainerSchema, StopContainerSchema } from '../lib/validation';
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimit';
import { encryptSecret, decryptSecret, encryptEnvVars, decryptEnvVars } from '../lib/secrets';

describe('Input Validation', () => {
  it('accepts valid container start payload', () => {
    const result = validateBody(StartContainerSchema, {
      name: 'my-container',
      image: 'nginx:latest',
      hostId: '00000000-0000-0000-0000-000000000001',
    });
    expect('data' in result).toBe(true);
  });

  it('rejects container name with invalid chars', () => {
    const result = validateBody(StartContainerSchema, {
      name: 'my container!', // spaces and ! not allowed
      image: 'nginx:latest',
      hostId: '00000000-0000-0000-0000-000000000001',
    });
    expect('error' in result).toBe(true);
  });

  it('rejects container name that is too long', () => {
    const result = validateBody(StartContainerSchema, {
      name: 'a'.repeat(65),
      image: 'nginx:latest',
      hostId: '00000000-0000-0000-0000-000000000001',
    });
    expect('error' in result).toBe(true);
  });

  it('rejects invalid hostId UUID', () => {
    const result = validateBody(StartContainerSchema, {
      name: 'my-container',
      image: 'nginx:latest',
      hostId: 'not-a-uuid',
    });
    expect('error' in result).toBe(true);
  });

  it('rejects env var with invalid key', () => {
    const result = validateBody(StartContainerSchema, {
      name: 'my-container',
      image: 'nginx:latest',
      hostId: '00000000-0000-0000-0000-000000000001',
      environmentVars: { '123INVALID': 'value' },
    });
    expect('error' in result).toBe(true);
  });

  it('accepts valid stop payload', () => {
    const result = validateBody(StopContainerSchema, {
      containerId: '00000000-0000-0000-0000-000000000001',
    });
    expect('data' in result).toBe(true);
  });

  it('rejects invalid timeout', () => {
    const result = validateBody(StopContainerSchema, {
      containerId: '00000000-0000-0000-0000-000000000001',
      timeoutSeconds: 999,
    });
    expect('error' in result).toBe(true);
  });
});

describe('Rate Limiting', () => {
  it('allows requests within limit', () => {
    const key = 'test:rl:' + Math.random();
    const config = { windowMs: 60_000, maxRequests: 3 };
    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);
    expect(checkRateLimit(key, config).allowed).toBe(true);
  });

  it('blocks requests over limit', () => {
    const key = 'test:rl:' + Math.random();
    const config = { windowMs: 60_000, maxRequests: 2 };
    checkRateLimit(key, config); // 1
    checkRateLimit(key, config); // 2
    const result = checkRateLimit(key, config); // 3 — should be blocked
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('Secrets Encryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
  });

  it('encrypts and decrypts a secret', () => {
    const plaintext = 'my-secret-password';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same input (random IV)', () => {
    const plaintext = 'same-value';
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
  });

  it('encrypts and decrypts a map of env vars', () => {
    const vars = { DB_PASS: 'secret123', API_KEY: 'key456' };
    const encrypted = encryptEnvVars(vars);
    expect(encrypted['DB_PASS']).not.toBe('secret123');
    const decrypted = decryptEnvVars(encrypted);
    expect(decrypted).toEqual(vars);
  });

  it('throws if ENCRYPTION_KEY is not set', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret('test')).toThrow('ENCRYPTION_KEY');
  });
});
