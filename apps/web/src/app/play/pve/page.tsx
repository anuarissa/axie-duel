'use client';

/**
 * Sala PvE jugable contra el bot. Conecta vía WebSocket Colyseus a la room "pve".
 *
 * Estado renderizado en tiempo real desde Colyseus state schema:
 * - LP de ambos jugadores
 * - Phase actual (Draw/Standby/Main1/Battle/Main2/End)
 * - Turn number + activePlayerId
 * - Mano del jugador (privada)
 * - 5 zonas de monsters + 5 zonas spell/trap por jugador
 * - Graveyard size
 *
 * Acciones del jugador (botones contextuales según fase):
 * - END_PHASE: avanza fase
 * - NORMAL_SUMMON: click carta en mano (debe ser Monster) + click slot vacío
 * - SET_CARD: click carta Spell/Trap en mano + slot spell/trap vacío
 * - DECLARE_ATTACK: click attacker en zona + click target opp (o "DIRECT")
 * - ACTIVATE_EFFECT: click carta con effect + targets opcionales
 * - SURRENDER
 *
 * Cuando es turno del BOT, se ven sus acciones en el log + esperás que termine.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Client, type Room } from 'colyseus.js';
import { getJwt } from '../../../lib/auth';

const GAME_SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'ws://localhost:2567';

// Tipos del Colyseus state — replica del server side schema (sin importar el package).
interface CardSnapshot {
  instanceId: string;
  cardId: string;
  ownerId: string;
  position: string;
  faceDown: boolean;
  atkMod: number;
  defMod: number;
  hasAttacked: boolean;
}
interface PlayerSnapshot {
  id: string;
  username: string;
  lifePoints: number;
  handSize: number;
  hand: CardSnapshot[];
  monsterZones: CardSnapshot[];
  spellTrapZones: CardSnapshot[];
  graveyard: CardSnapshot[];
  hasNormalSummonedThisTurn: boolean;
}
interface DuelStateSnapshot {
  matchId: string;
  status: string;
  mode: string;
  phase: string;
  turnNumber: number;
  activePlayerId: string;
  players: Record<string, PlayerSnapshot>;
  winnerId: string;
  winReason: string;
}

// Catálogo cargado del API para renderizar nombres / stats de cartas.
interface CardCatalog {
  [id: string]: { name: string; type: string; atk: number | null; def: number | null; level: number | null };
}

interface LogEntry {
  type: 'system' | 'action' | 'error' | 'info';
  msg: string;
  ts: number;
}

export default function PvePage() {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<DuelStateSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CardCatalog>({});
  const [mySessionId, setMySessionId] = useState<string>('');
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connecting, setConnecting] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  function log(type: LogEntry['type'], msg: string) {
    setLogs((prev) => [...prev.slice(-50), { type, msg, ts: Date.now() }]);
  }

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }

    let mounted = true;
    let activeRoom: Room | null = null;

    void (async () => {
      try {
        // Cargar catálogo de cartas para mostrar nombres.
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/cards`);
        const cardsRes = (await r.json()) as { cards: Array<{ id: string; name: string; type: string; atk: number | null; def: number | null; level: number | null }> };
        if (!mounted) return;
        const cat: CardCatalog = {};
        cardsRes.cards.forEach((c) => {
          cat[c.id] = { name: c.name, type: c.type, atk: c.atk, def: c.def, level: c.level };
        });
        setCatalog(cat);

        // Conectar a Colyseus PvERoom.
        const client = new Client(GAME_SERVER);
        const joinedRoom = await client.joinOrCreate('pve', { username: 'You', difficulty: 'Easy' });
        if (!mounted) {
          await joinedRoom.leave();
          return;
        }
        activeRoom = joinedRoom;
        setRoom(joinedRoom);
        setMySessionId(joinedRoom.sessionId);
        setConnecting(false);
        log('system', `Conectado a sala ${joinedRoom.roomId} como ${joinedRoom.sessionId}`);

        joinedRoom.onStateChange((newState: unknown) => {
          // El state de Colyseus es un Schema — convertir a snapshot plano.
          setState(toSnapshot(newState));
        });

        joinedRoom.onMessage('ERROR', (data: { code: string; message: string }) => {
          log('error', `[${data.code}] ${data.message}`);
        });

        joinedRoom.onLeave(() => {
          log('system', 'Desconectado del room.');
        });
      } catch (err) {
        if (!mounted) return;
        log('error', err instanceof Error ? err.message : String(err));
        setConnecting(false);
      }
    })();

    return () => {
      mounted = false;
      if (activeRoom) void activeRoom.leave().catch(() => undefined);
    };
  }, [router]);

  // Auto-scroll del log al final.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  function send(type: string, payload: unknown = {}) {
    if (!room) return;
    log('action', `→ ${type} ${JSON.stringify(payload)}`);
    room.send(type, payload);
    setSelectedHandCard(null);
    setSelectedAttacker(null);
  }

  function endPhase() { send('END_PHASE'); }
  function surrender() { if (confirm('¿Rendirte?')) send('SURRENDER'); }

  function clickHandCard(card: CardSnapshot) {
    if (!isMyTurn) return;
    const def = catalog[card.cardId];
    if (!def) return;

    if (def.type === 'Monster') {
      // En Main: invocar directo (sin tributos por ahora — solo cartas low-level).
      if ((def.level ?? 0) <= 4) {
        send('NORMAL_SUMMON', { cardInstanceId: card.instanceId, tributes: [], position: 'ATK' });
      } else {
        log('info', `${def.name} requiere tributos. Auto-tribute no implementado en text-mode — usá Swagger.`);
      }
    } else {
      // Spell/Trap → SET face-down.
      send('SET_CARD', { cardInstanceId: card.instanceId });
    }
  }

  function clickMyMonster(card: CardSnapshot) {
    if (!isMyTurn || phase !== 'BATTLE') return;
    if (card.position !== 'ATK' || card.hasAttacked) return;
    setSelectedAttacker(card.instanceId);
    log('info', `Atacante seleccionado: ${catalog[card.cardId]?.name ?? card.cardId}. Click un monster oponente o DIRECT.`);
  }

  function clickOppMonster(card: CardSnapshot) {
    if (!selectedAttacker) return;
    send('DECLARE_ATTACK', { attackerInstanceId: selectedAttacker, targetInstanceId: card.instanceId });
  }

  function attackDirect() {
    if (!selectedAttacker) return;
    send('DECLARE_ATTACK', { attackerInstanceId: selectedAttacker, targetInstanceId: 'DIRECT' });
  }

  if (connecting) return <main className="loading-screen">Conectando al game server…</main>;

  const me = state?.players[mySessionId];
  const opponent = state ? Object.entries(state.players).find(([id]) => id !== mySessionId)?.[1] : undefined;
  const phase = state?.phase ?? '—';
  const isMyTurn = state?.activePlayerId === mySessionId;
  const opponentMonsterCount = opponent?.monsterZones.filter((z) => z.instanceId).length ?? 0;

  return (
    <main className="play-page">
      <div className="play-toolbar">
        <Link href="/dashboard" className="cards-back">
          ← Salir
        </Link>
        <div className="play-status">
          <span>
            <strong>Modo:</strong> {state?.mode ?? '—'}
          </span>
          <span>
            <strong>Turno:</strong> {state?.turnNumber ?? '—'}
          </span>
          <span>
            <strong>Fase:</strong> {phase}
          </span>
          <span className={`play-pill ${isMyTurn ? 'your-turn' : 'opp-turn'}`}>
            {isMyTurn ? 'Tu turno' : 'Turno del bot'}
          </span>
          {state?.status === 'GAME_OVER' ? (
            <span className="play-pill" style={{ background: '#ffd96644', color: '#ffd966' }}>
              GAME OVER — {state.winnerId === mySessionId ? '¡Ganaste!' : state.winnerId ? 'Perdiste' : 'Empate'} ({state.winReason})
            </span>
          ) : null}
        </div>
        <button className="btn-secondary" onClick={surrender} style={{ color: '#ff9090' }}>
          Rendirse
        </button>
      </div>

      {!state ? (
        <p className="loading-screen">Esperando state inicial…</p>
      ) : (
        <div className="play-board">
          {/* Lado del oponente (BOT) */}
          {opponent ? (
            <section className="play-side opponent">
              <div className="play-side-header">
                <strong>🤖 {opponent.username}</strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  Mano: {opponent.handSize} · Mazo: {opponent.handSize === 0 ? '?' : '?'} · Cementerio: {opponent.graveyard.length}
                </span>
                <span className={`play-lp ${opponent.lifePoints < 2000 ? 'low' : ''}`}>{opponent.lifePoints} LP</span>
              </div>
              <div className="play-zones">
                {opponent.monsterZones.map((c, i) => (
                  <div
                    key={`opp-m-${i}`}
                    className={`play-slot ${c.instanceId ? 'has-card' : ''} ${selectedAttacker ? 'targetable' : ''}`}
                    onClick={() => c.instanceId && clickOppMonster(c)}
                  >
                    {c.instanceId ? <CardMini card={c} catalog={catalog} /> : 'Monster'}
                  </div>
                ))}
              </div>
              <div className="play-zones">
                {opponent.spellTrapZones.map((c, i) => (
                  <div key={`opp-st-${i}`} className={`play-slot ${c.instanceId ? 'has-card def-down' : ''}`}>
                    {c.instanceId ? '🂠 Set' : 'S/T'}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p>Esperando oponente…</p>
          )}

          {/* Lado tuyo */}
          {me ? (
            <section className="play-side you">
              <div className="play-zones">
                {me.spellTrapZones.map((c, i) => (
                  <div key={`me-st-${i}`} className={`play-slot ${c.instanceId ? 'has-card' : ''}`}>
                    {c.instanceId ? <CardMini card={c} catalog={catalog} /> : 'S/T'}
                  </div>
                ))}
              </div>
              <div className="play-zones">
                {me.monsterZones.map((c, i) => (
                  <div
                    key={`me-m-${i}`}
                    className={`play-slot ${c.instanceId ? 'has-card' : ''} ${
                      selectedAttacker === c.instanceId ? 'targetable' : ''
                    }`}
                    onClick={() => c.instanceId && clickMyMonster(c)}
                  >
                    {c.instanceId ? <CardMini card={c} catalog={catalog} /> : 'Monster'}
                  </div>
                ))}
              </div>
              <div className="play-side-header">
                <strong>👤 You</strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  Cementerio: {me.graveyard.length}
                </span>
                <span className={`play-lp ${me.lifePoints < 2000 ? 'low' : ''}`}>{me.lifePoints} LP</span>
              </div>

              <div className="play-hand">
                {me.hand.map((c) => {
                  const def = catalog[c.cardId];
                  return (
                    <div
                      key={c.instanceId}
                      className={`play-hand-card ${selectedHandCard === c.instanceId ? 'selected' : ''}`}
                      onClick={() => clickHandCard(c)}
                      title={`${def?.name ?? c.cardId}${def?.type === 'Monster' ? ` · ATK ${def.atk}/${def.def}` : ''}`}
                    >
                      <div className="play-card-mini-name">{def?.name ?? c.cardId.slice(0, 8)}</div>
                      {def?.type === 'Monster' ? (
                        <div className="play-card-mini-stats">
                          <span>{def.atk}</span>
                          <span>·</span>
                          <span>{def.def}</span>
                        </div>
                      ) : (
                        <div className="play-card-mini-stats">{def?.type ?? '?'}</div>
                      )}
                    </div>
                  );
                })}
                {me.hand.length === 0 ? <span style={{ opacity: 0.4 }}>(mano vacía)</span> : null}
              </div>

              {/* Action bar */}
              <div className="play-action-bar">
                <button
                  className="btn-primary"
                  onClick={endPhase}
                  disabled={!isMyTurn || state.status === 'GAME_OVER'}
                >
                  End Phase ({phase} →)
                </button>
                {selectedAttacker && phase === 'BATTLE' ? (
                  <button
                    className="btn-secondary"
                    onClick={attackDirect}
                    disabled={opponentMonsterCount > 0}
                    title={opponentMonsterCount > 0 ? 'No podés atacar directo: oponente tiene monstruos' : 'Ataque directo'}
                  >
                    ⚔️ DIRECT
                  </button>
                ) : null}
                {selectedAttacker ? (
                  <button className="btn-secondary" onClick={() => setSelectedAttacker(null)}>
                    Cancelar selección
                  </button>
                ) : null}
              </div>

              {isMyTurn ? (
                <div className="play-instruction">
                  {phase === 'MAIN_1' || phase === 'MAIN_2' ? (
                    <>
                      Click una carta de tu mano: Monster (level ≤4) → invocación normal en ATK · Spell/Trap → SET face-down.
                      Después click END Phase para avanzar.
                    </>
                  ) : phase === 'BATTLE' ? (
                    <>
                      Click un monster propio en ATK que no haya atacado → después click un monster oponente o el botón DIRECT.
                    </>
                  ) : (
                    <>Click END Phase para continuar.</>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Log */}
          <div className="play-log" ref={logRef}>
            {logs.map((l, i) => (
              <div key={i} className={`play-log-entry ${l.type}`}>
                {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function CardMini({ card, catalog }: { card: CardSnapshot; catalog: CardCatalog }) {
  const def = catalog[card.cardId];
  return (
    <div className="play-card-mini">
      <div className="play-position">{card.position}</div>
      <div className="play-card-mini-name">{def?.name ?? card.cardId.slice(0, 6)}</div>
      {def?.type === 'Monster' ? (
        <div className="play-card-mini-stats">
          <span>⚔ {(def.atk ?? 0) + card.atkMod}</span>
          <span>🛡 {(def.def ?? 0) + card.defMod}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Convierte el estado Colyseus (Schema con Maps/Arrays) a un snapshot plano JSON-serializable.
 * Necesario porque Schema no es directamente accesible por React (no rerender).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSnapshot(s: any): DuelStateSnapshot {
  const players: Record<string, PlayerSnapshot> = {};
  if (s.players && typeof s.players.forEach === 'function') {
    s.players.forEach((p: any, key: string) => {
      players[key] = {
        id: p.id,
        username: p.username,
        lifePoints: p.lifePoints,
        handSize: p.handSize,
        hand: arrayOf(p.hand),
        monsterZones: arrayOf(p.monsterZones),
        spellTrapZones: arrayOf(p.spellTrapZones),
        graveyard: arrayOf(p.graveyard),
        hasNormalSummonedThisTurn: p.hasNormalSummonedThisTurn,
      };
    });
  }
  return {
    matchId: s.matchId,
    status: s.status,
    mode: s.mode,
    phase: s.phase,
    turnNumber: s.turnNumber,
    activePlayerId: s.activePlayerId,
    players,
    winnerId: s.winnerId,
    winReason: s.winReason,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrayOf(arr: any): CardSnapshot[] {
  if (!arr) return [];
  const out: CardSnapshot[] = [];
  arr.forEach((c: any) => {
    out.push({
      instanceId: c.instanceId ?? '',
      cardId: c.cardId ?? '',
      ownerId: c.ownerId ?? '',
      position: c.position ?? '',
      faceDown: c.faceDown ?? false,
      atkMod: c.atkMod ?? 0,
      defMod: c.defMod ?? 0,
      hasAttacked: c.hasAttacked ?? false,
    });
  });
  return out;
}
