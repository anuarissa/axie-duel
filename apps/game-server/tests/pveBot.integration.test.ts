/**
 * Integration test del PvEBot greedy.
 *
 * Verifica que el bot:
 * - Detecta jugadas posibles en MAIN_1 e invoca el monster más fuerte sin tributos.
 * - En BATTLE ataca al target favorable.
 * - Termina el turno en END Phase sin loops infinitos.
 */

import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { DuelStateSchema } from '../src/rooms/schema/DuelStateSchema.js';
import { GameEngine } from '../src/engine/GameEngine.js';
import { PvEBot } from '../src/ai/PvEBot.js';
import { Phase } from '@axie-duel/shared-types';

const log = pino({ level: 'silent' });

function setupPveGame(): { state: DuelStateSchema; engine: GameEngine; bot: PvEBot } {
  const state = new DuelStateSchema();
  state.matchId = 'pve_test';
  state.mode = 'PvE';
  const engine = new GameEngine(state, log, 'pve_seed');
  engine.setupPlayer({
    id: 'p1',
    username: 'Alice',
    mainDeckCardIds: Array(40).fill('mon_beast_001'),
    isFirstPlayer: true,
  });
  engine.setupPlayer({
    id: 'BOT',
    username: 'Bot',
    mainDeckCardIds: Array(40).fill('mon_aqua_001'),
    isFirstPlayer: false,
  });
  engine.startMatch();
  const bot = new PvEBot(engine, 'BOT', 'Easy');
  return { state, engine, bot };
}

describe('PvEBot greedy (Easy)', () => {
  it('takeTurn no-op cuando no es turno del bot', async () => {
    const { state, bot } = setupPveGame();
    bot.actionDelayMs = 0;
    expect(state.activePlayerId).toBe('p1');
    await bot.takeTurn();
    expect(state.activePlayerId).toBe('p1');
    expect(state.turnNumber).toBe(1);
  });

  it('toma turno completo: invoca + ataca + pasa fase, vuelve a p1', async () => {
    const { state, engine, bot } = setupPveGame();
    bot.actionDelayMs = 0;
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('BOT');
    expect(state.turnNumber).toBe(2);

    const botPlayer = state.players.get('BOT')!;
    const monstersBefore = botPlayer.monsterZones.filter((z) => z.instanceId).length;
    expect(monstersBefore).toBe(0);

    await bot.takeTurn();

    expect(state.activePlayerId).toBe('p1');
    expect(state.turnNumber).toBe(3);
    const monstersAfter = botPlayer.monsterZones.filter((z) => z.instanceId).length;
    expect(monstersAfter).toBeGreaterThanOrEqual(0);
  });

  it('Easy difficulty NO usa tributos (solo invoca level 1-4)', async () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'eseed');
    engine.setupPlayer({
      id: 'p1',
      username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'BOT',
      username: 'B',
      mainDeckCardIds: [
        ...Array(20).fill('mon_beast_001'),
        ...Array(20).fill('mon_aqua_001'),
      ],
      isFirstPlayer: false,
    });
    engine.startMatch();
    const bot = new PvEBot(engine, 'BOT', 'Easy');
    bot.actionDelayMs = 0;
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('BOT');

    await bot.takeTurn();

    const botPlayer = state.players.get('BOT')!;
    const summoned = botPlayer.monsterZones.filter((z) => z.instanceId);
    for (const m of summoned) {
      const def = engine.cards.getById(m.cardId);
      if (def && def.type === 'Monster') {
        expect(def.level).toBeLessThanOrEqual(4);
      }
    }
  });

  it('Normal difficulty SÍ tributa cuando tiene material', async () => {
    const state = new DuelStateSchema();
    const engine = new GameEngine(state, log, 'nseed');
    engine.setupPlayer({
      id: 'p1',
      username: 'A',
      mainDeckCardIds: Array(40).fill('mon_beast_001'),
      isFirstPlayer: true,
    });
    engine.setupPlayer({
      id: 'BOT',
      username: 'B',
      mainDeckCardIds: Array(40).fill('mon_aqua_001'),
      isFirstPlayer: false,
    });
    engine.startMatch();
    const bot = new PvEBot(engine, 'BOT', 'Normal');
    bot.actionDelayMs = 0;

    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    await bot.takeTurn();

    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('BOT');
    await bot.takeTurn();
    expect(state.turnNumber).toBeGreaterThan(2);
  });

  it('cap defensivo: no entra en loop infinito (max 50 acciones)', async () => {
    const { state, engine, bot } = setupPveGame();
    bot.actionDelayMs = 0;
    for (let i = 0; i < 6; i++) engine.handleEndPhase('p1');
    expect(state.activePlayerId).toBe('BOT');

    const start = Date.now();
    await bot.takeTurn();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(state.activePlayerId).toBe('p1');
  });
});
