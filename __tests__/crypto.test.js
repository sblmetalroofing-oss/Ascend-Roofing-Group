import { encryptField, decryptField, maskTail } from '../lib/crypto.js';

const KEY = 'a'.repeat(64); // valid 64-hex key

describe('without ENCRYPTION_KEY (identity mode)', () => {
    beforeEach(() => { delete process.env.ENCRYPTION_KEY; });

    test('encryptField passes values through unchanged', () => {
        expect(encryptField('123456789')).toBe('123456789');
        expect(encryptField('')).toBe('');
        expect(encryptField(null)).toBe(null);
    });

    test('decryptField passes plaintext through unchanged', () => {
        expect(decryptField('123456789')).toBe('123456789');
        expect(decryptField(null)).toBe(null);
    });

    test('decryptField throws on ciphertext when the key is missing', () => {
        process.env.ENCRYPTION_KEY = KEY;
        const ct = encryptField('secret');
        delete process.env.ENCRYPTION_KEY;
        expect(() => decryptField(ct)).toThrow(/ENCRYPTION_KEY/);
    });
});

describe('with ENCRYPTION_KEY', () => {
    beforeEach(() => { process.env.ENCRYPTION_KEY = KEY; });
    afterEach(() => { delete process.env.ENCRYPTION_KEY; });

    test('round-trips values', () => {
        const ct = encryptField('123456789');
        expect(ct).toMatch(/^enc:v1:/);
        expect(ct).not.toContain('123456789');
        expect(decryptField(ct)).toBe('123456789');
    });

    test('unique IV per encryption (same plaintext, different ciphertext)', () => {
        expect(encryptField('062000')).not.toBe(encryptField('062000'));
    });

    test('legacy plaintext rows still pass through decryptField', () => {
        expect(decryptField('12345678')).toBe('12345678');
    });

    test('tampered ciphertext fails authentication', () => {
        const ct = encryptField('secret');
        const parts = ct.split(':');
        // flip a character in the ciphertext segment
        const last = parts[parts.length - 1];
        parts[parts.length - 1] = (last[0] === 'A' ? 'B' : 'A') + last.slice(1);
        expect(() => decryptField(parts.join(':'))).toThrow();
    });

    test('invalid key format degrades to plaintext storage', () => {
        process.env.ENCRYPTION_KEY = 'not-hex';
        expect(encryptField('123')).toBe('123');
    });
});

describe('maskTail', () => {
    test('masks all but the last 3 characters by default', () => {
        expect(maskTail('123456789')).toBe('••••••789');
        expect(maskTail('062-000')).toBe('••••000');
    });

    test('fully masks short values', () => {
        expect(maskTail('12')).toBe('••');
        expect(maskTail('123')).toBe('•••');
    });

    test('handles empty/nullish values', () => {
        expect(maskTail('')).toBe('');
        expect(maskTail(null)).toBe('');
        expect(maskTail(undefined)).toBe('');
    });
});
