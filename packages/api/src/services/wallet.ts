import { Keypair } from '@stellar/stellar-sdk';
import { StellarClient, NetworkType } from './stellar';
import { encryptWalletSecret } from '../utils/encryption';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Provisions a Stellar wallet for a newly registered user.
 *
 * Steps:
 * 1. Generate a random Stellar keypair
 * 2. Encrypt the secret key and store both keys in the database
 * 3. Fund the new account from the platform escrow with minimum XLM
 * 4. Set up a USDC trustline on the new account
 *
 * @param userId - The UUID of the user to provision a wallet for
 * @returns The public key of the newly provisioned wallet
 * @throws If any step fails (missing env vars, Stellar network errors, DB errors)
 */
export async function provisionWallet(userId: string): Promise<string> {
    // Validate required environment variables
    const escrowSecret = process.env.PLATFORM_ESCROW_SECRET;
    if (!escrowSecret) {
        throw new Error('PLATFORM_ESCROW_SECRET environment variable is not set');
    }

    const usdcIssuer = process.env.USDC_ASSET_ISSUER;
    if (!usdcIssuer) {
        throw new Error('USDC_ASSET_ISSUER environment variable is not set');
    }

    const network = (process.env.STELLAR_NETWORK || 'TESTNET') as NetworkType;

    // 1. Generate a new keypair
    const newKeypair = Keypair.random();
    const escrowKeypair = Keypair.fromSecret(escrowSecret);

    // 2. Encrypt the secret key and store in DB FIRST to prevent loss of funds
    const encryptedSecret = encryptWalletSecret(newKeypair.secret());

    await db.update(users)
        .set({
            walletAddress: newKeypair.publicKey(),
            walletSecretEnc: encryptedSecret,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

    // 3. Create and fund the account from platform escrow
    const stellarClient = new StellarClient(network);
    const startingBalance = '3'; // Enough for base reserve (1 XLM) + trustline reserve (0.5 XLM) + fees
    await stellarClient.createAccount(newKeypair, escrowKeypair, startingBalance);

    // 4. Set up USDC trustline
    await stellarClient.setupTrustline(newKeypair, 'USDC', usdcIssuer);

    console.log(`[Wallet Provisioning] Successfully provisioned wallet for user ${userId}: ${newKeypair.publicKey()}`);

    return newKeypair.publicKey();
}
