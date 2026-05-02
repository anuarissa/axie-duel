import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema.js';
import { ChainLinkSchema } from './ChainLinkSchema.js';

export class DuelStateSchema extends Schema {
  @type('string') matchId = '';
  /** Status de la partida: WAITING_PLAYERS | MULLIGAN | IN_PROGRESS | CHAIN_RESOLUTION | GAME_OVER */
  @type('string') status = 'WAITING_PLAYERS';
  /** PvE | PvP_Casual | PvP_Ranked | PvP_RankedNFT */
  @type('string') mode = 'PvP_Casual';
  /** Phase: DRAW | STANDBY | MAIN_1 | BATTLE | MAIN_2 | END */
  @type('string') phase = 'DRAW';
  @type('int32') turnNumber = 0;
  @type('string') activePlayerId = '';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ChainLinkSchema]) chain = new ArraySchema<ChainLinkSchema>();
  @type('int64') turnDeadlineMs = 0;
  @type('int64') chainResponseDeadlineMs = 0;
  @type('string') winnerId = '';
  @type('string') winReason = '';
  /** Seed determinista para shuffle/random. Permite reconstruir replays. */
  @type('string') rngSeed = '';
}
