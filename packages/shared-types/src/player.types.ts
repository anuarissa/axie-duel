/**
 * Tipos del jugador (perfil + estado en partida).
 */

import type { CardInstance } from './card.types.js';

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  walletAddress?: string;
  hasNFTAxies: boolean;
  eloRanked: number;
  eloRankedNFT: number;
  level: number;
  xp: number;
  avatarUrl?: string;
}

export type DeckFormat = 'Standard' | 'Premium';

export interface DeckSummary {
  id: string;
  name: string;
  format: DeckFormat;
  mainCount: number;
  extraCount: number;
  sideCount: number;
  isActive: boolean;
}

/**
 * Snapshot del jugador dentro de una partida. Es el estado público
 * del rival (sin mostrar la mano) y privado del propio jugador (con mano visible).
 */
export interface PlayerInDuel {
  id: string;
  username: string;
  lifePoints: number;
  /** Cantidad de cartas en mano. La lista real solo se manda al cliente del propio jugador. */
  handSize: number;
  /** La mano del propio jugador (privada). */
  hand?: CardInstance[];
  deckSize: number;
  extraDeckSize: number;
  graveyard: CardInstance[];
  banished: CardInstance[];
  monsterZones: Array<CardInstance | null>;
  spellTrapZones: Array<CardInstance | null>;
  fieldSpell: CardInstance | null;
  /** true si está esperando respuesta de cadena. */
  awaitingChainResponse: boolean;
}
