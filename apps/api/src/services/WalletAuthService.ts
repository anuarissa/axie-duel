/**
 * Verificación de firmas EIP-4361 (Sign-In With Ethereum / SIWE) para login
 * directo con wallet (Ronin Wallet extension, MetaMask, etc.) sin pasar por Waypoint.
 *
 * Flujo:
 *   1. Cliente pide a /auth/wallet/nonce → backend genera nonce de 16 chars
 *      y lo guarda en Redis 5min con la address declarada.
 *   2. Cliente construye un mensaje SIWE estándar incluyendo ese nonce y lo
 *      firma con su wallet (window.ethereum.request).
 *   3. Cliente postea {message, signature, address} → backend:
 *      a) Recupera el nonce de Redis y verifica que coincida con el del mensaje.
 *      b) Verifica criptográficamente que la firma corresponde a la address.
 *      c) Borra el nonce (one-shot, anti-replay).
 *      d) Linkea wallet al user logueado o crea nuevo user.
 *
 * Esto reemplaza el TODO inseguro que había en /auth/link/wallet.
 */

import { verifyMessage, type Address } from 'viem';
import { randomBytes } from 'node:crypto';
import { redis } from '../lib/redis.js';
import { ValidationError, AuthError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const NONCE_TTL_SECONDS = 300; // 5 min
const NONCE_KEY = (address: string) => `siwe:nonce:${address.toLowerCase()}`;

const NONCE_REGEX = /\bNonce:\s*([a-zA-Z0-9]{8,})/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export class WalletAuthService {
  /**
   * Genera un nonce y lo guarda asociado a la address. El cliente debe
   * incluirlo en el mensaje SIWE que firma.
   */
  async issueNonce(address: string): Promise<string> {
    if (!ADDRESS_REGEX.test(address)) {
      throw new ValidationError('invalid wallet address');
    }
    const nonce = randomBytes(12).toString('hex'); // 24 hex chars
    await redis.set(NONCE_KEY(address), nonce, 'EX', NONCE_TTL_SECONDS);
    return nonce;
  }

  /**
   * Verifica una firma SIWE. Devuelve la address recuperada.
   * - El message debe incluir "Nonce: <nonce>" (formato EIP-4361 estándar).
   * - El nonce debe matchear el que guardamos en Redis para esa address.
   * - La firma debe ser criptográficamente válida para esa address.
   */
  async verifySignature(message: string, signature: string, declaredAddress: string): Promise<Address> {
    if (!ADDRESS_REGEX.test(declaredAddress)) {
      throw new ValidationError('invalid wallet address');
    }
    if (!signature.startsWith('0x') || signature.length < 130) {
      throw new ValidationError('invalid signature format');
    }

    // 1. Extraer nonce del mensaje y validar contra Redis.
    const match = NONCE_REGEX.exec(message);
    if (!match || !match[1]) {
      throw new AuthError('Message missing or malformed Nonce field', 'SIWE_NONCE_MISSING');
    }
    const messageNonce = match[1];
    const stored = await redis.get(NONCE_KEY(declaredAddress));
    if (!stored) {
      throw new AuthError('Nonce expired or not issued', 'SIWE_NONCE_EXPIRED');
    }
    if (stored !== messageNonce) {
      throw new AuthError('Nonce mismatch', 'SIWE_NONCE_MISMATCH');
    }

    // 2. Verificar firma criptográficamente.
    const valid = await verifyMessage({
      address: declaredAddress as Address,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      throw new AuthError('Signature does not match address', 'SIWE_INVALID_SIGNATURE');
    }

    // 3. Consumir el nonce (anti-replay).
    await redis.del(NONCE_KEY(declaredAddress));

    logger.info({ address: declaredAddress.toLowerCase() }, 'SIWE signature verified');
    return declaredAddress.toLowerCase() as Address;
  }
}

export const walletAuthService = new WalletAuthService();
