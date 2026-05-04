/**
 * Account/User helpers compartidos entre todos los providers de auth.
 *
 * - `findOrCreateUserBySocial()`: upsert idempotente desde claims sociales (Google/Microsoft/Facebook).
 * - `linkWaypoint()` / `linkWallet()`: agregan provider Web3 a un usuario existente.
 * - `ensureNewUserSetup()`: corre side-effects de primer login (starter Axies + AXS bonus).
 * - `generateUniqueUsername()`: genera un username único derivado del email/displayName.
 * - `issueGameJwt()`: emite el JWT propio del juego.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient, User } from '@prisma/client';
import { SignJWT } from 'jose';
import type { Address } from 'viem';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { axsService } from './AxsService.js';
import { starterAxieService } from './StarterAxieService.js';
import { roninService } from './RoninService.js';
import { notificationService } from './NotificationService.js';
import { RANKED_NFT_MIN_NFT_AXIES } from '@axie-duel/game-rules';
import type { SocialClaims, SocialProvider } from './SocialAuthService.js';
import type { WaypointTokenClaims } from './WaypointService.js';

const SECRET = new TextEncoder().encode(config.JWT_SECRET);

function findBySub(db: PrismaClient, provider: SocialProvider, sub: string) {
  switch (provider) {
    case 'google':
      return db.user.findUnique({ where: { googleSub: sub } });
    case 'microsoft':
      return db.user.findUnique({ where: { microsoftSub: sub } });
    case 'facebook':
      return db.user.findUnique({ where: { facebookSub: sub } });
  }
}

function subFieldUpdate(provider: SocialProvider, sub: string): Prisma.UserUpdateInput {
  switch (provider) {
    case 'google':
      return { googleSub: sub };
    case 'microsoft':
      return { microsoftSub: sub };
    case 'facebook':
      return { facebookSub: sub };
  }
}

export class AccountService {
  constructor(private db: PrismaClient = prisma) {}

  async findOrCreateUserBySocial(provider: SocialProvider, claims: SocialClaims): Promise<User> {
    const existing = await findBySub(this.db, provider, claims.sub);
    if (existing) {
      // Sync email/avatar/displayName si vinieron actualizados.
      return this.db.user.update({
        where: { id: existing.id },
        data: {
          ...(claims.email && claims.email !== existing.email ? { email: claims.email } : {}),
          ...(claims.email_verified !== undefined ? { emailVerified: claims.email_verified } : {}),
          ...(claims.name && !existing.displayName ? { displayName: claims.name } : {}),
          // Refrescar avatarUrl SIEMPRE que el ID token traiga un picture: si el user
          // cambió su foto de Gmail o el URL viejo está roto, esto lo corrige al re-login.
          ...(claims.picture ? { avatarUrl: claims.picture } : {}),
        },
      });
    }

    // Si el email ya existe en otro provider, ATAR a ese usuario en lugar de crear duplicado.
    if (claims.email) {
      const sameEmail = await this.db.user.findUnique({ where: { email: claims.email } });
      if (sameEmail) {
        logger.info({ userId: sameEmail.id, provider }, 'attaching new social provider to existing email');
        return this.db.user.update({
          where: { id: sameEmail.id },
          data: subFieldUpdate(provider, claims.sub),
        });
      }
    }

    const username = await this.generateUniqueUsername(claims.email ?? claims.name ?? 'player');
    const user = await this.db.user.create({
      data: {
        ...(provider === 'google' ? { googleSub: claims.sub } : {}),
        ...(provider === 'microsoft' ? { microsoftSub: claims.sub } : {}),
        ...(provider === 'facebook' ? { facebookSub: claims.sub } : {}),
        email: claims.email ?? null,
        emailVerified: claims.email_verified ?? false,
        username,
        displayName: claims.name ?? null,
        avatarUrl: claims.picture ?? null,
      },
    });
    await this.ensureNewUserSetup(user.id);
    return user;
  }

  async linkWaypoint(userId: string, claims: WaypointTokenClaims): Promise<User> {
    const walletAddress = claims.wallet_address?.toLowerCase() ?? null;
    let hasNFTAxies = false;
    if (walletAddress) {
      const balance = await roninService.getAxieBalance(walletAddress as Address);
      hasNFTAxies = balance >= RANKED_NFT_MIN_NFT_AXIES;
    }
    const previouslyLinked = await this.db.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });
    const updated = await this.db.user.update({
      where: { id: userId },
      data: {
        waypointSub: claims.sub,
        ...(walletAddress ? { walletAddress } : {}),
        hasNFTAxies,
      },
    });
    // Notification solo si es la PRIMERA vez que linkea wallet (no en re-login).
    if (!previouslyLinked?.walletAddress && walletAddress) {
      notificationService
        .create(userId, 'WALLET_LINKED', 'Wallet de Ronin vinculada vía Waypoint', {
          walletAddress,
          hasNFTAxies,
          via: 'waypoint',
        })
        .catch(() => undefined);
    }
    return updated;
  }

  /**
   * Linkear una wallet directa (sin Waypoint) — el usuario firmó un challenge
   * server-issued con su wallet para probar ownership.
   * El caller (auth.routes /link/wallet) verifica SIWE EIP-4361 vía WalletAuthService.
   */
  async linkWallet(userId: string, walletAddress: Address): Promise<User> {
    const previouslyLinked = await this.db.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });
    const balance = await roninService.getAxieBalance(walletAddress);
    const hasNFTAxies = balance >= RANKED_NFT_MIN_NFT_AXIES;
    const updated = await this.db.user.update({
      where: { id: userId },
      data: { walletAddress: walletAddress.toLowerCase(), hasNFTAxies },
    });
    if (!previouslyLinked?.walletAddress) {
      notificationService
        .create(userId, 'WALLET_LINKED', 'Wallet de Ronin vinculada (firma EIP-4361)', {
          walletAddress: walletAddress.toLowerCase(),
          hasNFTAxies,
          via: 'siwe',
        })
        .catch(() => undefined);
    }
    return updated;
  }

  /**
   * Side-effects que se corren UNA SOLA VEZ por usuario, al primer login —
   * sin importar el provider. Idempotente vía guards en DB.
   */
  async ensureNewUserSetup(userId: string): Promise<void> {
    const existingStarters = await this.db.starterAxie.count({ where: { userId } });
    if (existingStarters === 0) {
      const starters = starterAxieService.generateStartersForUser(userId);
      await this.db.starterAxie.createMany({
        data: starters.map((s) => ({
          userId,
          axieClass: s.class,
          parts: s.parts as unknown as Prisma.InputJsonValue,
          stats: s.stats as unknown as Prisma.InputJsonValue,
          isStarter: true,
        })),
      });
      logger.info({ userId }, 'starter axies created');
    }

    // AXS starter bonus — solo si nunca ha recibido uno.
    const previousBonus = await this.db.axsTransaction.findFirst({
      where: { userId, kind: 'EARN_STARTER_BONUS' },
    });
    if (!previousBonus && config.AXS_STARTER_BONUS > 0) {
      await axsService.earn(
        userId,
        config.AXS_STARTER_BONUS,
        'EARN_STARTER_BONUS',
        'first_login',
      );
    }
  }

  async issueGameJwt(user: User): Promise<string> {
    return new SignJWT({
      userId: user.id,
      username: user.username,
      ...(user.walletAddress ? { walletAddress: user.walletAddress } : {}),
      hasNFTAxies: user.hasNFTAxies,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('axie-duel')
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(SECRET);
  }

  async generateUniqueUsername(seed: string): Promise<string> {
    const cleaned = seed
      .toLowerCase()
      .replace(/@.*$/, '')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16);
    const base = cleaned.length >= 3 ? cleaned : `player${Math.floor(Math.random() * 100000)}`;
    let candidate = base;
    let i = 1;
    // Cap at 50 attempts; absurdly improbable to need more.
    while (i < 50 && (await this.db.user.findUnique({ where: { username: candidate } }))) {
      candidate = `${base}_${i++}`;
    }
    return candidate;
  }
}

export const accountService = new AccountService();
