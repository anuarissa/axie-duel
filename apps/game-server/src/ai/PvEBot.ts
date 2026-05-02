/**
 * Bot PvE — política greedy.
 *
 * Difficulty:
 *   - Easy: invoca el monster low-level más fuerte que pueda; ataca al más débil del oponente o directo.
 *   - Normal: igual que Easy + considera tributos cuando tiene 1+ monsters en zone con monsters de su mano de level 5+.
 *   - Hard: TODO Fase 4 (minimax 2 plies).
 *
 * El bot itera todas sus jugadas posibles en la fase actual, ejecuta la mejor según score,
 * después decide si avanzar fase o seguir actuando. Termina en END_PHASE.
 *
 * Llamado por PvERoom cuando state.activePlayerId === 'BOT'.
 */

import type { GameEngine } from '../engine/GameEngine.js';
import { Phase } from '@axie-duel/shared-types';
import { InvalidActionError } from '../engine/ActionValidator.js';
import type { CardSchema } from '../rooms/schema/CardSchema.js';

export type BotDifficulty = 'Easy' | 'Normal' | 'Hard';

export class PvEBot {
  constructor(
    private engine: GameEngine,
    private playerId: string,
    private difficulty: BotDifficulty = 'Easy',
  ) {}

  /**
   * Ejecuta el turno completo del bot. Cycla por las fases tomando decisiones
   * greedy hasta llegar a END Phase. Cap defensivo: máx 50 acciones para evitar loops.
   */
  takeTurn(): void {
    const state = (this.engine as unknown as { state: import('../rooms/schema/DuelStateSchema.js').DuelStateSchema }).state;
    if (state.activePlayerId !== this.playerId) return;
    if (state.status !== 'IN_PROGRESS') return;

    let safety = 50;
    while (state.activePlayerId === this.playerId && state.status === 'IN_PROGRESS' && safety-- > 0) {
      const phase = state.phase as Phase;
      let acted = false;

      if (phase === Phase.MAIN_1 || phase === Phase.MAIN_2) {
        acted = this.tryMainPhaseAction();
      } else if (phase === Phase.BATTLE) {
        acted = this.tryBattlePhaseAction();
      }

      if (!acted) {
        // No hay acción más en esta fase → end_phase para avanzar.
        try {
          this.engine.handleEndPhase(this.playerId);
        } catch {
          break;
        }
      }
    }
  }

  /** Intenta UNA acción de main phase (invocar monster). Devuelve true si actuó. */
  private tryMainPhaseAction(): boolean {
    const player = this.getPlayer();
    if (!player) return false;
    if (player.hasNormalSummonedThisTurn) return false;

    const freeZone = player.monsterZones.findIndex((z) => !z.instanceId);
    if (freeZone === -1) return false;

    // Buscar el monster MÁS FUERTE en mano que pueda invocar sin tributos.
    let bestNoTribute: { card: CardSchema; atk: number } | null = null;
    let bestWithTribute: { card: CardSchema; atk: number; tributesNeeded: number } | null = null;

    for (const handCard of player.hand) {
      const def = this.engine.cards.getById(handCard.cardId);
      if (!def || def.type !== 'Monster') continue;
      const required = def.level <= 4 ? 0 : def.level <= 6 ? 1 : 2;
      if (required === 0) {
        if (!bestNoTribute || def.atk > bestNoTribute.atk) {
          bestNoTribute = { card: handCard, atk: def.atk };
        }
      } else if (this.difficulty !== 'Easy') {
        // Normal/Hard considera tributar si tiene monsters bajos en zone.
        const ownMonsters = player.monsterZones.filter((m) => m.instanceId);
        if (ownMonsters.length >= required) {
          if (!bestWithTribute || def.atk > bestWithTribute.atk) {
            bestWithTribute = { card: handCard, atk: def.atk, tributesNeeded: required };
          }
        }
      }
    }

    if (bestNoTribute) {
      try {
        this.engine.handleNormalSummon(this.playerId, {
          cardInstanceId: bestNoTribute.card.instanceId,
          tributes: [],
          position: 'ATK',
        });
        return true;
      } catch {
        return false;
      }
    }

    if (bestWithTribute) {
      // Tributar los monsters más débiles propios.
      const ownMonsters = [...player.monsterZones]
        .filter((m) => m.instanceId)
        .sort((a, b) => {
          const adef = this.engine.cards.getById(a.cardId);
          const bdef = this.engine.cards.getById(b.cardId);
          const aAtk = adef && adef.type === 'Monster' ? adef.atk + a.atkMod : 0;
          const bAtk = bdef && bdef.type === 'Monster' ? bdef.atk + b.atkMod : 0;
          return aAtk - bAtk;
        })
        .slice(0, bestWithTribute.tributesNeeded);
      try {
        this.engine.handleNormalSummon(this.playerId, {
          cardInstanceId: bestWithTribute.card.instanceId,
          tributes: ownMonsters.map((m) => m.instanceId),
          position: 'ATK',
        });
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * En BATTLE: encuentra el monster propio que aún no atacó y le elige el mejor target.
   * Mejor target: monster oponente con ATK menor que el propio (destrucción favorable),
   * o DIRECT si oponente no tiene monsters.
   */
  private tryBattlePhaseAction(): boolean {
    const player = this.getPlayer();
    if (!player) return false;

    const opponentId = [...this.getState().players.keys()].find((id) => id !== this.playerId);
    const opponent = opponentId ? this.getState().players.get(opponentId) : undefined;

    // Encontrar primer attacker disponible (en ATK, no atacó).
    const attacker = player.monsterZones.find(
      (m) => !!m.instanceId && m.position === 'ATK' && !m.hasAttacked,
    );
    if (!attacker) return false;

    const attackerDef = this.engine.cards.getById(attacker.cardId);
    if (!attackerDef || attackerDef.type !== 'Monster') return false;
    const attackerAtk = attackerDef.atk + attacker.atkMod;

    const oppMonsters = opponent?.monsterZones.filter((m) => m.instanceId) ?? [];

    let target: string | 'DIRECT' = 'DIRECT';
    if (oppMonsters.length > 0) {
      // Buscar target con ATK más baja (en caso de target en ATK) o DEF más baja (en caso de DEF).
      let bestTarget: { id: string; cost: number } | null = null;
      for (const m of oppMonsters) {
        const mDef = this.engine.cards.getById(m.cardId);
        if (!mDef || mDef.type !== 'Monster') continue;
        const mAtk = mDef.atk + m.atkMod;
        const mDefStat = mDef.def + m.defMod;
        // "Cost" = lo que se pierde el atacante en esta batalla.
        // ATK vs ATK: gana el de mayor; el bot pierde ATK del rival - ATK propio si pierde.
        // ATK vs DEF: si gana, no pierde nada; si pierde, pierde DEF rival - ATK propio.
        let cost = Number.MAX_SAFE_INTEGER;
        if (m.position === 'ATK') {
          if (attackerAtk > mAtk) cost = -(attackerAtk - mAtk); // ganamos
          else if (attackerAtk < mAtk) cost = mAtk - attackerAtk; // perdemos LP
          else cost = 1000; // empate, ambos mueren
        } else {
          if (attackerAtk > mDefStat) cost = -100; // destruimos defender
          else if (attackerAtk < mDefStat) cost = mDefStat - attackerAtk;
          else cost = 0;
        }
        if (!bestTarget || cost < bestTarget.cost) bestTarget = { id: m.instanceId, cost };
      }
      // Threshold de agresión por dificultad. Easy ataca incluso con pérdida razonable.
      const aggressionThreshold = this.difficulty === 'Easy' ? 1500 : this.difficulty === 'Normal' ? 1000 : 600;
      if (bestTarget && bestTarget.cost < aggressionThreshold) {
        target = bestTarget.id;
      } else if (bestTarget) {
        // En vez de pasar, atacar al target con menor cost igual — el bot debe ser activo.
        // Solo se abstiene si el cost es absurdamente alto (perder >50% de su LP en una jugada).
        if (bestTarget.cost < 4000) {
          target = bestTarget.id;
        } else {
          attacker.hasAttacked = true;
          return true;
        }
      } else {
        attacker.hasAttacked = true;
        return true;
      }
    }

    try {
      this.engine.handleDeclareAttack(this.playerId, {
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: target,
      });
      return true;
    } catch (err) {
      // Si InvalidActionError (ej: turno 1 first player), marcar como atacado.
      if (err instanceof InvalidActionError) {
        attacker.hasAttacked = true;
      }
      return true;
    }
  }

  private getPlayer() {
    return this.getState().players.get(this.playerId);
  }

  private getState() {
    return (this.engine as unknown as { state: import('../rooms/schema/DuelStateSchema.js').DuelStateSchema }).state;
  }

  get difficultyLevel(): BotDifficulty {
    return this.difficulty;
  }
}
