import { describe, it, expect, beforeEach } from 'vitest';
import { encryptWalletSecret, decryptWalletSecret } from '../utils/encryption';
import crypto from 'crypto';

describe('Wallet Encryption Utility', () => {
    const VALID_TEST_KEY_HEX = crypto.randomBytes(32).toString('hex'); // 64 chars
    const SAMPLE_SECRET = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    beforeEach(() => {
        // Reset env variable before each test
        process.env.WALLET_ENCRYPTION_KEY = VALID_TEST_KEY_HEX;
    });

    it('should correctly encrypt and decrypt a wallet secret', () => {
        const encrypted = encryptWalletSecret(SAMPLE_SECRET);
        expect(encrypted).not.toEqual(SAMPLE_SECRET);

        const decrypted = decryptWalletSecret(encrypted);
        expect(decrypted).toEqual(SAMPLE_SECRET);
    });

    it('should format the encrypted output correctly (iv:tag:ciphertext)', () => {
        const encrypted = encryptWalletSecret(SAMPLE_SECRET);
        const parts = encrypted.split(':');
        
        expect(parts.length).toBe(3);
        
        // IV should be 12 bytes = 24 hex chars
        expect(parts[0].length).toBe(24);
        
        // Auth tag should be 16 bytes = 32 hex chars
        expect(parts[1].length).toBe(32);
        
        // Ciphertext varies in length but shouldn't be empty
        expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should fail to decrypt if cipher text format is invalid', () => {
        expect(() => decryptWalletSecret("invalid:format")).toThrow(
            'Invalid encrypted wallet secret format. Expected iv:authTag:ciphertext'
        );
    });

    it('should fail to decrypt if auth tag is tampered with', () => {
        const encrypted = encryptWalletSecret(SAMPLE_SECRET);
        const parts = encrypted.split(':');
        
        // Modify the auth tag slightly
        const originalAuthTag = parts[1];
        const tamperedAuthTag = originalAuthTag.substring(0, 31) + (originalAuthTag[31] === '0' ? '1' : '0');
        parts[1] = tamperedAuthTag;
        
        const tamperedCiphertext = parts.join(':');
        
        expect(() => decryptWalletSecret(tamperedCiphertext)).toThrow(/Failed to decrypt wallet secret/);
    });

    it('should fail to decrypt if payload is tampered with', () => {
        const encrypted = encryptWalletSecret(SAMPLE_SECRET);
        const parts = encrypted.split(':');
        
        // Modify the ciphertext slightly
        const originalCiphertext = parts[2];
        const tamperedPayload = originalCiphertext.substring(0, originalCiphertext.length - 1) + (originalCiphertext[originalCiphertext.length - 1] === '0' ? '1' : '0');
        parts[2] = tamperedPayload;
        
        const tamperedCiphertext = parts.join(':');
        
        expect(() => decryptWalletSecret(tamperedCiphertext)).toThrow(/Failed to decrypt wallet secret/);
    });

    it('should fail if WALLET_ENCRYPTION_KEY is missing', () => {
        delete process.env.WALLET_ENCRYPTION_KEY;
        expect(() => encryptWalletSecret(SAMPLE_SECRET)).toThrow(
            'WALLET_ENCRYPTION_KEY environment variable is not set'
        );
    });

    it('should fail if WALLET_ENCRYPTION_KEY is invalid length', () => {
        // Less than 32 bytes
        process.env.WALLET_ENCRYPTION_KEY = crypto.randomBytes(16).toString('hex');
        expect(() => encryptWalletSecret(SAMPLE_SECRET)).toThrow(
            'WALLET_ENCRYPTION_KEY must be a valid 64-character hex string (32 bytes)'
        );
    });
});
