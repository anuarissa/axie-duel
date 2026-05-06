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
import { classMatchup, type AxieClass } from '@axie-duel/game-rules';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type BotDifficulty = 'Easy' | 'Normal' | 'Hard';

export class PvEBot {
  /** Delay entre cada sub-acción del bot. 0 = sin pausa (modo rápido). */
  public actionDelayMs = 1500;

  /**
   * Callback opcional: el bot lo llama ANTES de declarar un ataque para que el room le
   * pregunte al jugador si quiere activar alguna trap SET. Retorna el instanceId de la
   * trap a activar (o null si el jugador pasó / timeout).
   * `attackInfo` permite al cliente mostrar visualmente quién ataca a quién (flecha + slot
   * highlight) y distinguir ataque directo.
   */
  public onBeforeAttack?: (
    defenderId: string,
    defenderTraps: Array<{ instanceId: string; cardId: string }>,
    attackInfo: {
      attackerInstanceId: string;
      attackerCardId: string;
      targetInstanceId: string | 'DIRECT';
      targetCardId?: string;
    },
  ) => Promise<string | null>;

  constructor(
    private engine: GameEngine,
    private playerId: string,
    private difficulty: BotDifficulty = 'Easy',
  ) {}

  /**
   * Ejecuta el turno completo del bot. Cycla por las fases tomando decisiones
   * greedy hasta llegar a END Phase. Pausa `actionDelayMs` entre cada sub-acción
   * para que el cliente vea el progreso (Robar → pausa → Invocar → pausa → ...).
   * Cap defensivo: máx 50 acciones para evitar loops.
   */
  async takeTurn(): Promise<void> {
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
        acted = await this.tryBattlePhaseAction();
      }

      if (!acted) {
        // Antes de avanzar de END phase, si el bot tiene discard pendiente por hand limit,
        // resolver eligiendo las cartas de menor valor estratégico.
        const me = state.players.get(this.playerId);
        if (me && state.phase === Phase.END && me.pendingHandLimitDiscard > 0) {
          this.autoDiscardForHandLimit(me.pendingHandLimitDiscard);
        }
        try {
          this.engine.handleEndPhase(this.playerId);
        } catch {
          break;
        }
      }

      // Pausa para que el cliente vea el cambio de state antes de la próxima acción.
      if (this.actionDelayMs > 0) {
        await sleep(this.actionDelayMs);
      }
    }
  }

  /**
   * Discard automático del bot cuando hand > 6 al fin del turno.
   * Heurística: descartar las cartas de menor valor estratégico:
   *   1) Spells/Traps duplicados (preferimos quedarnos con uno solo de cada efecto)
   *   2) Monsters de menor ATK (mantenemos los hitters)
   *   3) Si todo es igual, las primeras (orden de mano).
   */
  private autoDiscardForHandLimit(count: number): void {
    const player = this.getPlayer();
    if (!player) return;
    const scored = player.hand.map((card) => {
      const def = this.engine.cards.getById(card.cardId);
      let score = 100;
      if (def?.type === 'Monster') {
        score = (def.atk ?? 0) + (def.def ?? 0); // hitters tienen score alto → se conservan
      } else if (def?.type === 'Spell' || def?.type === 'Trap') {
        score = 1500; // valor base intermedio: spells/traps son útiles pero replaceables
      }
      return { instanceId: card.instanceId, score };
    });
    // Sort ascending → primeros = peores → descartar
    scored.sort((a, b) => a.score - b.score);
    const ids = scored.slice(0, count).map((s) => s.instanceId);
    try {
      this.engine.handleHandLimitDiscard(this.playerId, ids);
    } catch {
      // Si falla, no hacemos nada; handleEndPhase tirará MUST_DISCARD y el bot se cortará.
    }
  }

  /** Intenta UNA acción de main phase (invocar monster). Devuelve true si actuó. */
  private tryMainPhaseAction(): boolean {
    const player = this.getPlayer();
    if (!player) return false;
    if (player.hasNormalSummonedThisTurn) return false;

    const freeZone = player.monsterZones.findIndex((z) => !z.instanceId);
    if (freeZone === -1) return false;

    // Detectar si el bot Experto tiene HIGH-LEVEL en mano (L5+) y NO suficientes tributos en field.
    // Estrategia: summonea fodder en DEF para tener tributo el próximo turno.
    let highLevelInHand = 0;
    let highLevelTributesNeeded = 0;
    for (const handCard of player.hand) {
      const def = this.engine.cards.getById(handCard.cardId);
      if (!def || def.type !== 'Monster') continue;
      if (def.level >= 5) {
        highLevelInHand++;
        const req = def.level <= 6 ? 1 : 2;
        if (req > highLevelTributesNeeded) highLevelTributesNeeded = req;
      }
    }
    const ownMonstersOnField = player.monsterZones.filter((m) => m.instanceId).length;
    const expertoFodderMode =
      this.difficulty === 'Hard' &&
      highLevelInHand > 0 &&
      ownMonstersOnField < highLevelTributesNeeded;

    // Buscar el monster MÁS FUERTE en mano que pueda invocar sin tributos.
    let bestNoTribute: { card: CardSchema; atk: number; def: number } | null = null;
    let bestWithTribute: { card: CardSchema; atk: number; tributesNeeded: number } | null = null;

    for (const handCard of player.hand) {
      const def = this.engine.cards.getById(handCard.cardId);
      if (!def || def.type !== 'Monster') continue;
      const required = def.level <= 4 ? 0 : def.level <= 6 ? 1 : 2;
      if (required === 0) {
        // Experto en fodder mode: prefiere el monster con MÁS DEF (tanqueo + sirve de tributo).
        if (expertoFodderMode) {
          if (!bestNoTribute || def.def > bestNoTribute.def) {
            bestNoTribute = { card: handCard, atk: def.atk, def: def.def };
          }
        } else {
          if (!bestNoTribute || def.atk > bestNoTribute.atk) {
            bestNoTribute = { card: handCard, atk: def.atk, def: def.def };
          }
        }
      } else if (this.difficulty !== 'Easy') {
        const ownMonsters = player.monsterZones.filter((m) => m.instanceId);
        if (ownMonsters.length >= required) {
          if (!bestWithTribute || def.atk > bestWithTribute.atk) {
            bestWithTribute = { card: handCard, atk: def.atk, tributesNeeded: required };
          }
        }
      }
    }

    // Experto: si tiene tributos suficientes, prioriza summon high-level (override no-tribute).
    if (this.difficulty === 'Hard' && bestWithTribute) {
      try {
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
        this.engine.handleNormalSummon(this.playerId, {
          cardInstanceId: bestWithTribute.card.instanceId,
          tributes: ownMonsters.map((m) => m.instanceId),
          position: 'ATK',
        });
        return true;
      } catch { /* fallthrough to no-tribute */ }
    }

    if (bestNoTribute) {
      try {
        // Experto en fodder mode summonea EN DEF (no ataca este turno, solo tanquea).
        const position: 'ATK' | 'DEF_FACEDOWN' = expertoFodderMode ? 'DEF_FACEDOWN' : 'ATK';
        this.engine.handleNormalSummon(this.playerId, {
          cardInstanceId: bestNoTribute.card.instanceId,
          tributes: [],
          position,
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
  private async tryBattlePhaseAction(): Promise<boolean> {
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
      // Avanzado/Experto: aplica BONUS al target sobre el que tienen class advantage (+15% effective ATK).
      let bestTarget: { id: string; cost: number } | null = null;
      for (const m of oppMonsters) {
        const mDef = this.engine.cards.getById(m.cardId);
        if (!mDef || mDef.type !== 'Monster') continue;

        // Effective ATK considerando class triangle (Avanzado/Experto only).
        let effectiveAtk = attackerAtk;
        if (this.difficulty !== 'Easy' && attackerDef.attribute && mDef.attribute) {
          const matchup = classMatchup(attackerDef.attribute as AxieClass, mDef.attribute as AxieClass);
          if (matchup === 'advantage') effectiveAtk = Math.floor(attackerAtk * 1.15);
          else if (matchup === 'disadvantage') effectiveAtk = Math.floor(attackerAtk * 0.85);
        }

        const mAtk = mDef.atk + m.atkMod;
        const mDefStat = mDef.def + m.defMod;
        let cost = Number.MAX_SAFE_INTEGER;
        if (m.position === 'ATK') {
          if (effectiveAtk > mAtk) cost = -(effectiveAtk - mAtk); // ganamos (más negativo = mejor)
          else if (effectiveAtk < mAtk) cost = mAtk - effectiveAtk;
          else cost = 1000;
        } else {
          if (effectiveAtk > mDefStat) cost = -100;
          else if (effectiveAtk < mDefStat) cost = mDefStat - effectiveAtk;
          else cost = 0;
        }

        // Bonus extra para Avanzado/Experto: prefieren atacar en class-advantage incluso si
        // el cost numérico es similar — refleja que valoran el +15% como info estratégica.
        if (this.difficulty !== 'Easy' && attackerDef.attribute && mDef.attribute) {
          const matchup = classMatchup(attackerDef.attribute as AxieClass, mDef.attribute as AxieClass);
          if (matchup === 'advantage') cost -= 200; // prefer
          else if (matchup === 'disadvantage') cost += 200; // avoid
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

    // Antes de declarar el ataque: si el opponent (player) tiene traps SET con triggers
    // de attack (Mirror Web, Poison Backlash, Counterstrike), preguntarle si quiere
    // activar alguna. Solo se invoca si está set el callback (PvERoom lo configura).
    if (this.onBeforeAttack && opponentId && opponent) {
      const trapCandidates = opponent.spellTrapZones
        .filter((c) => c.instanceId && c.faceDown)
        .map((c) => {
          const def = this.engine.cards.getById(c.cardId);
          if (!def || def.type !== 'Trap') return null;
          // Filtro: solo traps que reaccionan a attack (spellSpeed >= 2 con trigger relevante).
          const kind = def.effect?.kind ?? '';
          if (!['negateAttack', 'atkDebuff', 'negateAndDestroy'].includes(kind)) return null;
          return { instanceId: c.instanceId, cardId: c.cardId };
        })
        .filter((x): x is { instanceId: string; cardId: string } => !!x);

      if (trapCandidates.length > 0) {
        // Resolver el target real para info — si target === 'DIRECT', el targetCardId es undefined.
        let targetCardId: string | undefined;
        if (target !== 'DIRECT') {
          const targetMonster = opponent.monsterZones.find((m) => m.instanceId === target);
          targetCardId = targetMonster?.cardId;
        }
        const trapToActivate = await this.onBeforeAttack(opponentId, trapCandidates, {
          attackerInstanceId: attacker.instanceId,
          attackerCardId: attacker.cardId,
          targetInstanceId: target,
          ...(targetCardId ? { targetCardId } : {}),
        });
        if (trapToActivate) {
          // Activar la trap del opponent ANTES del declare attack — el handler regular
          // del trap (registrado en TriggerRegistry) cancela el attack o aplica debuff.
          try {
            this.engine.handleActivateEffect(opponentId, {
              cardInstanceId: trapToActivate,
              targets: [],
            });
          } catch {
            // Si falla la activación (carta inválida, etc), continuar sin trap.
          }
        }
      }
    }

    try {
      this.engine.handleDeclareAttack(this.playerId, {
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: target,
      });
      return true;
    } catch (err) {
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
