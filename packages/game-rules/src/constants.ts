/**
 * Constantes inmutables del juego. Cualquier cambio aquí afecta TODO el balance —
 * no se modifican sin pasar por revisión de game design.
 */

import type { DuelConfig } from '@axie-duel/shared-types';

export const LIFE_POINTS_INITIAL = 8000;

export const STARTING_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 7;

export const DECK_MIN = 40;
export const DECK_MAX = 60;
export const EXTRA_DECK_MAX = 15;
export const SIDE_DECK_MAX = 15;

export const MAX_COPIES_PER_CARD = 3;

export const MONSTER_ZONES = 5;
export const SPELL_TRAP_ZONES = 5;

export const TURN_DURATION_MS = 90_000;
export const TURN_BANK_BUDGET_MS = 60_000;
export const CHAIN_RESPONSE_WINDOW_MS = 15_000;
export const RECONNECT_GRACE_MS = 60_000;

/** Niveles de monstruo y costo de sacrificio (sección 4.4.1 del master prompt). */
export const TRIBUTES_BY_LEVEL: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 1,
  6: 1,
  7: 2,
  8: 2,
  9: 2,
  10: 2,
  11: 2,
  12: 2,
};

export const ELO_INITIAL = 1000;
export const MATCHMAKING_INITIAL_TOLERANCE = 50;
export const MATCHMAKING_MAX_TOLERANCE = 200;
/** A los X ms en cola, la tolerancia ELO crece linealmente hasta el máximo. */
export const MATCHMAKING_TOLERANCE_GROW_MS = 60_000;

export const RANKED_NFT_MIN_NFT_AXIES = 3;

export const DEFAULT_DUEL_CONFIG: DuelConfig = {
  initialLifePoints: LIFE_POINTS_INITIAL,
  startingHandSize: STARTING_HAND_SIZE,
  maxHandSize: MAX_HAND_SIZE,
  turnDurationMs: TURN_DURATION_MS,
  bankBudgetMs: TURN_BANK_BUDGET_MS,
  chainResponseWindowMs: CHAIN_RESPONSE_WINDOW_MS,
};
