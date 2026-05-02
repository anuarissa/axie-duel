/**
 * Tests AccountService con mock PrismaClient (vitest-mock-extended).
 * Cubre: findOrCreateUserBySocial (3 paths: existing, sameEmail attach, new),
 * generateUniqueUsername, issueGameJwt.
 *
 * NO testea linkWaypoint/linkWallet end-to-end porque dependen de roninService
 * (red real). Esos están cubiertos por smoke tests + e2e manual.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import { jwtVerify } from 'jose';
import type { PrismaClient, User } from '@prisma/client';
import { AccountService } from '../src/services/AccountService.js';

// Mock de roninService para que no haga llamadas reales a Ronin.
vi.mock('../src/services/RoninService.js', () => ({
  roninService: {
    getAxieBalance: vi.fn().mockResolvedValue(0),
  },
}));

// Mock de notificationService para no ensuciar tests con creates falsos.
vi.mock('../src/services/NotificationService.js', () => ({
  notificationService: {
    create: vi.fn().mockResolvedValue({ id: 'notif_x' }),
  },
}));

// Mock de starterAxieService.
vi.mock('../src/services/StarterAxieService.js', () => ({
  starterAxieService: {
    generateStartersForUser: vi.fn().mockReturnValue([]),
  },
}));

// Mock de axsService.
vi.mock('../src/services/AxsService.js', () => ({
  axsService: {
    earn: vi.fn().mockResolvedValue({ newBalance: '100', txId: 'ax_x' }),
  },
}));

const mkUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    email: null,
    emailVerified: false,
    username: 'player1',
    displayName: null,
    avatarUrl: null,
    googleSub: null,
    microsoftSub: null,
    facebookSub: null,
    waypointSub: null,
    walletAddress: null,
    hasNFTAxies: false,
    isAdmin: false,
    eloRanked: 1000,
    eloRankedNFT: 1000,
    level: 1,
    xp: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    axsBalance: { toString: () => '0' } as never,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe('AccountService', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let service: AccountService;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new AccountService(prisma);
  });

  describe('findOrCreateUserBySocial', () => {
    it('updates existing user when found by sub (Google)', async () => {
      const existing = mkUser({ id: 'existing', googleSub: 'g_123', email: 'old@x.com' });
      prisma.user.findUnique.mockResolvedValueOnce(existing);
      prisma.user.update.mockResolvedValueOnce({ ...existing, email: 'new@x.com' });

      const result = await service.findOrCreateUserBySocial('google', {
        sub: 'g_123',
        email: 'new@x.com',
        name: 'Anuar',
        email_verified: true,
      });
      expect(result.email).toBe('new@x.com');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('attaches new social provider to existing user with same email', async () => {
      // No user con microsoftSub.
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // findUnique({microsoftSub})
        .mockResolvedValueOnce(mkUser({ id: 'u_email', email: 'shared@x.com' })); // findUnique({email})
      prisma.user.update.mockResolvedValueOnce(
        mkUser({ id: 'u_email', email: 'shared@x.com', microsoftSub: 'ms_456' }),
      );

      const result = await service.findOrCreateUserBySocial('microsoft', {
        sub: 'ms_456',
        email: 'shared@x.com',
        name: 'Same User',
      });
      expect(result.id).toBe('u_email');
      expect(result.microsoftSub).toBe('ms_456');
    });

    it('creates fresh user when no match by sub or email', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // findUnique({facebookSub})
        .mockResolvedValueOnce(null) // findUnique({email})
        .mockResolvedValueOnce(null); // generateUniqueUsername check
      prisma.user.create.mockResolvedValueOnce(
        mkUser({ id: 'new_u', facebookSub: 'fb_789', email: 'fresh@x.com', username: 'fresh' }),
      );
      prisma.starterAxie.count.mockResolvedValue(1); // skip starter setup
      prisma.axsTransaction.findFirst.mockResolvedValue({ id: 'tx_x' } as never);

      const result = await service.findOrCreateUserBySocial('facebook', {
        sub: 'fb_789',
        email: 'fresh@x.com',
        name: 'Fresh',
      });
      expect(result.id).toBe('new_u');
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('generateUniqueUsername', () => {
    it('strips email domain and special chars', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const u = await service.generateUniqueUsername('Anuar.Issa@hotmail.com');
      // Tras strip: 'anuarissa' (sin punto, lowercase, sin @hotmail.com).
      expect(u).toMatch(/^anuarissa/);
    });

    it('appends numeric suffix on collision', async () => {
      // Primer try existe, segundo no.
      prisma.user.findUnique
        .mockResolvedValueOnce(mkUser({ username: 'taken' }))
        .mockResolvedValueOnce(null);
      const u = await service.generateUniqueUsername('taken');
      expect(u).toBe('taken_1');
    });

    it('falls back to random player name when seed too short', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const u = await service.generateUniqueUsername('!!');
      expect(u).toMatch(/^player\d+/);
    });
  });

  describe('issueGameJwt', () => {
    it('emits a JWT with userId, username, isAdmin/wallet/hasNFT shape', async () => {
      const u = mkUser({
        id: 'jwt_user',
        username: 'jwttest',
        walletAddress: '0xabc',
        hasNFTAxies: true,
      });
      const token = await service.issueGameJwt(u);
      // Verificar que se puede decodificar con la misma JWT_SECRET.
      const SECRET = new TextEncoder().encode(
        process.env.JWT_SECRET ?? 'dev_only_test_secret_min_32_chars_ok_xx',
      );
      const { payload } = await jwtVerify(token, SECRET, { issuer: 'axie-duel' });
      expect(payload.userId).toBe('jwt_user');
      expect(payload.username).toBe('jwttest');
      expect(payload.walletAddress).toBe('0xabc');
      expect(payload.hasNFTAxies).toBe(true);
    });
  });
});
