/**
 * Cliente on-chain de Ronin via viem.
 * - Verifica que un address realmente posea Axies NFT (consultando ERC-721 balanceOf).
 * - Lee balance de RON.
 *
 * Saigon Testnet por defecto. Se cambia a mainnet vía RONIN_RPC_URL.
 */

import { createPublicClient, http, type Address, type Chain } from 'viem';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Ronin Saigon Testnet (chainId 2021) y Ronin Mainnet (chainId 2020).
const SAIGON: Chain = {
  id: 2021,
  name: 'Ronin Saigon Testnet',
  nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
  rpcUrls: { default: { http: ['https://saigon-testnet.roninchain.com/rpc'] } },
  blockExplorers: { default: { name: 'Saigon Explorer', url: 'https://saigon-app.roninchain.com' } },
};

const MAINNET: Chain = {
  id: 2020,
  name: 'Ronin',
  nativeCurrency: { name: 'RON', symbol: 'RON', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.roninchain.com/rpc'] } },
  blockExplorers: { default: { name: 'Ronin Explorer', url: 'https://app.roninchain.com' } },
};

const chain = config.RONIN_CHAIN_ID === 2020 ? MAINNET : SAIGON;

export const roninClient = createPublicClient({
  chain,
  transport: http(config.RONIN_RPC_URL),
});

const ERC721_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export class RoninService {
  /** Cuántos Axies NFT posee la address (consultando contrato Axie). */
  async getAxieBalance(address: Address): Promise<number> {
    try {
      const balance = await roninClient.readContract({
        address: config.AXIE_CONTRACT_ADDRESS as Address,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return Number(balance);
    } catch (err) {
      logger.error({ err, address }, 'getAxieBalance failed');
      return 0;
    }
  }

  /** Balance de RON nativo de la address. */
  async getRonBalance(address: Address): Promise<bigint> {
    return roninClient.getBalance({ address });
  }
}

export const roninService = new RoninService();
