/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';

// Hoist mock functions so they're available at vi.mock factory evaluation time
const { mockCreateAccount, mockSetupTrustline } = vi.hoisted(() => ({
    mockCreateAccount: vi.fn(),
    mockSetupTrustline: vi.fn(),
}));

// Mock dependencies before importing the module under test
vi.mock('../db', () => ({
    db: {
        update: vi.fn(function () {
            return {
                set: vi.fn(function () {
                    return { where: vi.fn() };
                }),
            };
        }),
    },
}));

vi.mock('../utils/encryption', () => ({
    encryptWalletSecret: vi.fn(() => 'encrypted-secret-payload'),
}));

// Use a regular function (not arrow) so it can be called with `new`
vi.mock('../services/stellar', () => ({
    StellarClient: vi.fn(function () {
        return {
            createAccount: mockCreateAccount,
            setupTrustline: mockSetupTrustline,
        };
    }),
}));

import { provisionWallet } from '../services/wallet';
import { db } from '../db';
import { encryptWalletSecret } from '../utils/encryption';
import { StellarClient } from '../services/stellar';

// Generate a real valid keypair for escrow mock
const escrowKeypair = Keypair.random();

describe('provisionWallet', () => {
    const mockUserId = 'user-uuid-123';
    const MOCK_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

    beforeEach(() => {
        vi.clearAllMocks();
        // Restore the StellarClient constructor mock (vi.clearAllMocks strips mockImplementation)
        (StellarClient as any).mockImplementation(function () {
            return {
                createAccount: mockCreateAccount,
                setupTrustline: mockSetupTrustline,
            };
        });
        mockCreateAccount.mockResolvedValue({ hash: 'mock-create-tx' });
        mockSetupTrustline.mockResolvedValue({ hash: 'mock-trustline-tx' });
        process.env.PLATFORM_ESCROW_SECRET = escrowKeypair.secret();
        process.env.USDC_ASSET_ISSUER = MOCK_USDC_ISSUER;
        process.env.STELLAR_NETWORK = 'TESTNET';
        process.env.WALLET_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    it('should successfully provision a wallet for a new user', async () => {
        const publicKey = await provisionWallet(mockUserId);

        // Should return a valid Stellar public key
        expect(publicKey).toBeDefined();
        expect(publicKey).toMatch(/^G[A-Z2-7]{55}$/);

        // Should have created a StellarClient
        expect(StellarClient).toHaveBeenCalledWith('TESTNET');

        // Should have called createAccount with correct starting balance
        expect(mockCreateAccount).toHaveBeenCalledTimes(1);
        const createAccountArgs = mockCreateAccount.mock.calls[0];
        expect(createAccountArgs[0]).toBeInstanceOf(Keypair);
        expect(createAccountArgs[1]).toBeInstanceOf(Keypair);
        expect(createAccountArgs[2]).toBe('3');

        // Should have set up USDC trustline
        expect(mockSetupTrustline).toHaveBeenCalledTimes(1);
        const trustlineArgs = mockSetupTrustline.mock.calls[0];
        expect(trustlineArgs[0]).toBeInstanceOf(Keypair);
        expect(trustlineArgs[1]).toBe('USDC');
        expect(trustlineArgs[2]).toBe(MOCK_USDC_ISSUER);

        // Should have encrypted the secret
        expect(encryptWalletSecret).toHaveBeenCalledTimes(1);

        // Should have updated the DB
        expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('should throw if PLATFORM_ESCROW_SECRET is not set', async () => {
        delete process.env.PLATFORM_ESCROW_SECRET;

        await expect(provisionWallet(mockUserId)).rejects.toThrow(
            'PLATFORM_ESCROW_SECRET environment variable is not set'
        );
    });

    it('should throw if USDC_ASSET_ISSUER is not set', async () => {
        delete process.env.USDC_ASSET_ISSUER;

        await expect(provisionWallet(mockUserId)).rejects.toThrow(
            'USDC_ASSET_ISSUER environment variable is not set'
        );
    });

    it('should throw if createAccount fails', async () => {
        mockCreateAccount.mockRejectedValue(new Error('Network error'));

        await expect(provisionWallet(mockUserId)).rejects.toThrow('Network error');

        // DB SHOULD have been updated (keys persist before funding to prevent fund loss)
        expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('should throw if setupTrustline fails', async () => {
        mockSetupTrustline.mockRejectedValue(new Error('Trustline error'));

        await expect(provisionWallet(mockUserId)).rejects.toThrow('Trustline error');

        // DB SHOULD have been updated (keys persist before funding to prevent fund loss)
        expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('should default to TESTNET when STELLAR_NETWORK is not set', async () => {
        delete process.env.STELLAR_NETWORK;

        await provisionWallet(mockUserId);

        expect(StellarClient).toHaveBeenCalledWith('TESTNET');
    });
});
