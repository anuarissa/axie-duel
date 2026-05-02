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
import { getJwt, apiFetch } from '../../../lib/auth';

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
  deckSize: number;
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
interface CardDef {
  name: string;
  type: 'Monster' | 'Spell' | 'Trap';
  subType?: string | null;
  rarity?: string;
  attribute?: string | null;       // Beast | Aqua | Plant | Bird | Reptile (monsters)
  level?: number | null;
  atk?: number | null;
  def?: number | null;
  description?: string;
  effectKind?: string;
  effectDescription?: string;
  spellSpeed?: number;
}
interface CardCatalog {
  [id: string]: CardDef;
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
  const [selectedMonster, setSelectedMonster] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<CardSnapshot | null>(null);
  const [handMenuCard, setHandMenuCard] = useState<CardSnapshot | null>(null);
  const [drawAnims, setDrawAnims] = useState<Array<{ id: number; cardName: string }>>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; kind: 'info' | 'error' | 'combat' | 'success'; title: string; body?: string }>>([]);
  const [combatFlash, setCombatFlash] = useState<{ attacker: 'me' | 'opp' } | null>(null);
  const [spellOverlay, setSpellOverlay] = useState<{ name: string; description?: string; ownedByMe: boolean; type: string } | null>(null);
  const [combatVFX, setCombatVFX] = useState<{
    attackerInstanceId: string;
    defenderInstanceId?: string;
    attackerDestroyed: boolean;
    defenderDestroyed: boolean;
  } | null>(null);
  const [pendingSummon, setPendingSummon] = useState<{
    cardInstanceId: string;
    cardName: string;
    position: 'ATK' | 'DEF';
    requiredTributes: number;
    selectedTributes: string[];
  } | null>(null);
  const [lunacianCoins, setLunacianCoins] = useState<string>('—');
  const [activeDeckName, setActiveDeckName] = useState<string | null>(null);
  const [coinsAnimating, setCoinsAnimating] = useState(false);
  const lastHandSizeRef = useRef<number>(0);
  const drawAnimIdRef = useRef<number>(0);
  const toastIdRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement>(null);

  function pushToast(kind: 'info' | 'error' | 'combat' | 'success', title: string, body?: string) {
    const id = ++toastIdRef.current;
    setToasts((curr) => [...curr, { id, kind, title, ...(body !== undefined ? { body } : {}) }]);
    setTimeout(() => {
      setToasts((curr) => curr.filter((t) => t.id !== id));
    }, kind === 'combat' ? 4500 : 3500);
  }

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
        // En paralelo: catálogo + decks (para deck activo) + perfil (para LC).
        const [meData, decksData] = await Promise.all([
          apiFetch<{ lunacianCoins: string }>('/users/me').catch(() => ({ lunacianCoins: '0' })),
          apiFetch<{ decks: Array<{ id: string; name: string; isActive: boolean }> }>('/decks').catch(() => ({ decks: [] })),
        ]);
        if (!mounted) return;
        setLunacianCoins(meData.lunacianCoins ?? '0');
        const activeDeck = decksData.decks.find((d) => d.isActive);

        // Cargar catálogo de cartas para mostrar nombres + tooltips ricos.
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/cards`);
        const cardsRes = (await r.json()) as {
          cards: Array<{
            id: string;
            name: string;
            type: 'Monster' | 'Spell' | 'Trap';
            subType: string | null;
            rarity: string;
            attribute: string | null;
            level: number | null;
            atk: number | null;
            def: number | null;
            description: string;
            effectJson: { kind: string; description?: string; spellSpeed?: number } | null;
          }>;
        };
        if (!mounted) return;
        const cat: CardCatalog = {};
        cardsRes.cards.forEach((c) => {
          cat[c.id] = {
            name: c.name,
            type: c.type,
            subType: c.subType,
            rarity: c.rarity,
            attribute: c.attribute,
            level: c.level,
            atk: c.atk,
            def: c.def,
            description: c.description,
            effectKind: c.effectJson?.kind,
            effectDescription: c.effectJson?.description,
            spellSpeed: c.effectJson?.spellSpeed,
          };
        });
        setCatalog(cat);

        // Conectar a Colyseus PvERoom (con deckId si hay deck activo).
        if (activeDeck) {
          setActiveDeckName(activeDeck.name);
        } else {
          pushToast('info', 'Sin deck activo', 'Jugando con deck por defecto. Activá un deck en /decks para usar el tuyo.');
        }
        const client = new Client(GAME_SERVER);
        const joinOpts: { username: string; difficulty: 'Easy'; deckId?: string } = {
          username: 'You',
          difficulty: 'Easy',
        };
        if (activeDeck) joinOpts.deckId = activeDeck.id;
        const joinedRoom = await client.joinOrCreate('pve', joinOpts);
        if (!mounted) {
          await joinedRoom.leave();
          return;
        }
        activeRoom = joinedRoom;
        setRoom(joinedRoom);
        setMySessionId(joinedRoom.sessionId);
        setConnecting(false);
        log('system', `Conectado a sala ${joinedRoom.roomId} como ${joinedRoom.sessionId}`);

        // Volcar el state inicial inmediatamente — onStateChange solo dispara con CAMBIOS,
        // y si onJoin del server termina antes de que registremos el listener, el primer
        // state se "pierde" y la pantalla queda en "Esperando state inicial...".
        try {
          setState(toSnapshot(joinedRoom.state));
        } catch (snapErr) {
          log('error', `Error decodificando state inicial: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}`);
        }

        joinedRoom.onStateChange((newState: unknown) => {
          try {
            setState(toSnapshot(newState));
          } catch (snapErr) {
            log('error', `toSnapshot falló: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}`);
          }
        });

        joinedRoom.onMessage('ERROR', (data: { code: string; message: string }) => {
          log('error', `[${data.code}] ${data.message}`);
          // Mostrar toast visible (no solo en log lateral).
          pushToast('error', friendlyErrorTitle(data.code), data.message);
        });

        joinedRoom.onMessage('COMBAT_RESULT', (data: {
          attackerOwnerId: string;
          defenderOwnerId: string;
          attackerInstanceId: string;
          defenderInstanceId?: string;
          attackerName?: string;
          defenderName?: string;
          direct?: boolean;
          attackerDestroyed?: boolean;
          defenderDestroyed?: boolean;
          damageToAttackerOwner?: number;
          damageToDefenderOwner?: number;
          advantageBonus?: number;
          effectiveAtk?: number;
          attackerClass?: string;
          defenderClass?: string;
        }) => {
          const meAttacking = data.attackerOwnerId === joinedRoom.sessionId;
          const aName = data.attackerName ?? 'Attacker';
          const dName = data.defenderName ?? 'oponente';
          let title: string;
          const lines: string[] = [];
          if (data.direct) {
            title = meAttacking ? `⚔ ${aName} ataca directo` : `🛡 ${aName} te ataca directo`;
            const dmgToFoe = data.damageToDefenderOwner ?? 0;
            const dmgToYou = data.damageToAttackerOwner ?? 0;
            if (meAttacking && dmgToFoe > 0) lines.push(`-${dmgToFoe} LP al oponente`);
            if (!meAttacking && dmgToYou > 0) lines.push(`-${dmgToYou} LP a vos`);
          } else {
            title = meAttacking ? `⚔ ${aName} → ${dName}` : `${aName} → ${dName}`;
            if (data.defenderDestroyed) lines.push(`💥 ${dName} destruido`);
            if (data.attackerDestroyed) lines.push(`💥 ${aName} destruido`);
            const dmgToFoe = data.damageToDefenderOwner ?? 0;
            const dmgToYou = data.damageToAttackerOwner ?? 0;
            if (meAttacking) {
              if (dmgToFoe > 0) lines.push(`-${dmgToFoe} LP al oponente`);
              if (dmgToYou > 0) lines.push(`-${dmgToYou} LP a vos (DEF mayor que ATK)`);
            } else {
              if (dmgToYou > 0) lines.push(`-${dmgToYou} LP a vos`);
              if (dmgToFoe > 0) lines.push(`-${dmgToFoe} LP al bot (DEF mayor que ATK)`);
            }
            if (!data.attackerDestroyed && !data.defenderDestroyed && dmgToFoe === 0 && dmgToYou === 0) {
              lines.push('Sin destrucción ni daño (stats iguales o defensa boca abajo)');
            }
          }
          // Indicador de ventaja de clase (Plant>Bird, Bird>Beast, etc).
          if (data.advantageBonus && data.advantageBonus > 0 && data.attackerClass && data.defenderClass) {
            lines.unshift(`⚡ Ventaja de clase ${data.attackerClass} > ${data.defenderClass} (+${data.advantageBonus}% ATK → ${data.effectiveAtk})`);
          }
          pushToast('combat', title, lines.join(' · '));
          log('action', `combat: ${title} | ${lines.join(' · ')}`);
          // Trigger flash visual del lado del atacante.
          setCombatFlash({ attacker: meAttacking ? 'me' : 'opp' });
          setTimeout(() => setCombatFlash(null), 600);
          // VFX por instanceId: el atacante hace lunge + el defensor flash + destruidos shake.
          setCombatVFX({
            attackerInstanceId: data.attackerInstanceId,
            ...(data.defenderInstanceId !== undefined ? { defenderInstanceId: data.defenderInstanceId } : {}),
            attackerDestroyed: data.attackerDestroyed ?? false,
            defenderDestroyed: data.defenderDestroyed ?? false,
          });
          setTimeout(() => setCombatVFX(null), 800);
        });

        joinedRoom.onMessage('CARD_ACTIVATED', (data: { ownerId: string; cardName: string; kind: string; cancelled?: boolean }) => {
          const meOwner = data.ownerId === joinedRoom.sessionId;
          const who = meOwner ? 'Vos' : 'Bot';
          if (data.cancelled) {
            pushToast('info', `${data.cardName} negado`, `Una contra-trampa neutralizó el ${data.kind}.`);
          } else {
            pushToast('success', `${who} activó ${data.cardName}`, `${data.kind} resuelto.`);
            // Overlay grande de la carta activada — 1.6s en pantalla.
            setSpellOverlay({ name: data.cardName, ownedByMe: meOwner, type: data.kind });
            setTimeout(() => setSpellOverlay(null), 1800);
          }
        });

        joinedRoom.onLeave(() => {
          log('system', 'Desconectado del room.');
          pushToast('error', 'Desconectado', 'Perdiste conexión con el game server.');
        });
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        log('error', msg);
        setConnectError(msg);
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

  // Detectar incremento de handSize → disparar animación de robo + toast.
  const _myHandSize = state?.players[mySessionId]?.handSize ?? 0;
  const _isMyTurn = state?.activePlayerId === mySessionId;
  useEffect(() => {
    const prev = lastHandSizeRef.current;
    const delta = _myHandSize - prev;
    if (delta > 0 && prev > 0) {
      const newAnims = Array.from({ length: delta }, () => ({
        id: ++drawAnimIdRef.current,
        cardName: 'carta',
      }));
      setDrawAnims((curr) => [...curr, ...newAnims]);
      newAnims.forEach((a) => {
        setTimeout(() => {
          setDrawAnims((curr) => curr.filter((x) => x.id !== a.id));
        }, 700);
      });
      pushToast('info', `+${delta} carta${delta > 1 ? 's' : ''} robada${delta > 1 ? 's' : ''}`, 'De tu mazo a la mano.');
    }
    lastHandSizeRef.current = _myHandSize;
  }, [_myHandSize]);

  // Cerrar handMenu si cambia el turno.
  useEffect(() => {
    if (!_isMyTurn) setHandMenuCard(null);
  }, [_isMyTurn]);

  // Al GAME_OVER → refresh LC desde el api (el server otorgó +50/+10/+20 LC).
  const _isGameOver = state?.status === 'GAME_OVER';
  useEffect(() => {
    if (!_isGameOver) return;
    setTimeout(() => {
      apiFetch<{ lunacianCoins: string }>('/users/me')
        .then((u) => {
          setLunacianCoins(u.lunacianCoins);
          setCoinsAnimating(true);
          setTimeout(() => setCoinsAnimating(false), 1200);
        })
        .catch(() => undefined);
    }, 800); // pequeño delay para que el server haya procesado el match.
  }, [_isGameOver]);

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
    // Abrir submenu con opciones contextuales en vez de invocar directo.
    setHandMenuCard(card);
    setSelectedHandCard(card.instanceId);
  }

  function performHandAction(card: CardSnapshot, action: 'summon-atk' | 'summon-def' | 'set' | 'activate') {
    const def = catalog[card.cardId];
    if (!def) return;
    setHandMenuCard(null);
    if (action === 'summon-atk' || action === 'summon-def') {
      if (def.type !== 'Monster') return;
      const level = def.level ?? 0;
      const requiredTributes = level <= 4 ? 0 : level <= 6 ? 1 : 2;
      if (requiredTributes === 0) {
        send('NORMAL_SUMMON', {
          cardInstanceId: card.instanceId,
          tributes: [],
          position: action === 'summon-atk' ? 'ATK' : 'DEF',
        });
        return;
      }
      // Necesita tributos → abrir tribute UI.
      const monstersOnField = state?.players[mySessionId]?.monsterZones.filter((z) => z.instanceId).length ?? 0;
      if (monstersOnField < requiredTributes) {
        pushToast('error', 'Faltan monstruos para tributar', `Necesitás ${requiredTributes} monstruo(s) propio(s) en el campo, tenés ${monstersOnField}.`);
        return;
      }
      setPendingSummon({
        cardInstanceId: card.instanceId,
        cardName: def.name,
        position: action === 'summon-atk' ? 'ATK' : 'DEF',
        requiredTributes,
        selectedTributes: [],
      });
    } else if (action === 'set') {
      send('SET_CARD', { cardInstanceId: card.instanceId });
    } else if (action === 'activate') {
      if (def.type === 'Spell' && def.spellSpeed === 1) {
        send('ACTIVATE_EFFECT', { cardInstanceId: card.instanceId, targets: [] });
      } else {
        pushToast('info', `${def.name}`, 'Requiere SET previo (spell speed ≥ 2 o trap).');
      }
    }
  }

  function toggleTributeSelection(monsterInstanceId: string) {
    setPendingSummon((curr) => {
      if (!curr) return curr;
      const isSelected = curr.selectedTributes.includes(monsterInstanceId);
      if (isSelected) {
        return { ...curr, selectedTributes: curr.selectedTributes.filter((id) => id !== monsterInstanceId) };
      }
      if (curr.selectedTributes.length >= curr.requiredTributes) {
        return curr; // ya tiene los necesarios
      }
      return { ...curr, selectedTributes: [...curr.selectedTributes, monsterInstanceId] };
    });
  }

  function confirmTributeSummon() {
    if (!pendingSummon) return;
    if (pendingSummon.selectedTributes.length !== pendingSummon.requiredTributes) return;
    send('NORMAL_SUMMON', {
      cardInstanceId: pendingSummon.cardInstanceId,
      tributes: pendingSummon.selectedTributes,
      position: pendingSummon.position,
    });
    setPendingSummon(null);
  }

  function clickMyMonster(card: CardSnapshot) {
    if (!isMyTurn) return;
    // En MAIN_1/MAIN_2: selección para cambio de posición.
    if (phase === 'MAIN_1' || phase === 'MAIN_2') {
      setSelectedMonster(card.instanceId);
      return;
    }
    // En BATTLE: selección para atacar.
    if (phase !== 'BATTLE') return;
    if (card.position !== 'ATK' || card.hasAttacked) return;
    setSelectedAttacker(card.instanceId);
    log('info', `Atacante seleccionado: ${catalog[card.cardId]?.name ?? card.cardId}. Click un monster oponente o DIRECT.`);
  }

  function changePosition(cardInstanceId: string) {
    send('CHANGE_POSITION', { cardInstanceId });
    setSelectedMonster(null);
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

  if (connectError) {
    return (
      <main className="dashboard">
        <div className="card-section" style={{ background: 'rgba(255,118,118,0.08)' }}>
          <strong style={{ color: '#ff7676' }}>No se pudo conectar al game server.</strong>
          <pre style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.85 }}>
            {connectError}
          </pre>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={() => location.reload()}>
              Reintentar
            </button>
            <Link href="/dashboard" className="btn-secondary">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const me = state?.players[mySessionId];
  const opponent = state ? Object.entries(state.players).find(([id]) => id !== mySessionId)?.[1] : undefined;
  const phase = state?.phase ?? '—';
  const isMyTurn = state?.activePlayerId === mySessionId;
  const opponentMonsterCount = opponent?.monsterZones.filter((z) => z.instanceId).length ?? 0;

  const phaseHints: Record<string, string> = {
    DRAW: 'Robá y avanzá',
    STANDBY: 'Efectos de mantenimiento',
    MAIN_1: 'Invocá monstruos · poné Spell/Trap · activá efectos',
    BATTLE: 'Declará ataques',
    MAIN_2: 'Acciones extra · Spell/Trap',
    END: 'Fin del turno',
  };

  const isGameOver = state?.status === 'GAME_OVER';
  const won = state?.winnerId === mySessionId;

  return (
    <main className="tcg-page">
      {/* Toolbar slim */}
      <header className="tcg-toolbar">
        <Link href="/dashboard" className="tcg-back">
          ← Salir
        </Link>
        <div className="tcg-status">
          <span><strong>Modo</strong> {state?.mode ?? '—'}</span>
          {activeDeckName ? <span><strong>Deck</strong> {activeDeckName}</span> : null}
          <span><strong>Turno</strong> {state?.turnNumber ?? '—'}</span>
          <span><strong>Fase</strong> {phase}</span>
          <span className={`tcg-pill ${isMyTurn ? 'your-turn' : 'opp-turn'}`}>
            {isMyTurn ? '⚡ Tu turno' : '⏳ Bot pensando…'}
          </span>
          <span className={`lc-chip ${coinsAnimating ? 'pulse' : ''}`}>
            🪙 {lunacianCoins} <span className="lc-chip-suffix">LC</span>
          </span>
        </div>
        <button className="tcg-surrender" onClick={surrender} disabled={isGameOver}>
          Rendirse
        </button>
      </header>

      {/* Tablero */}
      <div className="tcg-board">
        {/* Lado oponente */}
        {opponent ? (
          <section className="tcg-side opponent">
            <PlayerHud player={opponent} variant="opponent" />
            <div className="tcg-zones">
              <div className="tcg-zone-row">
                {opponent.spellTrapZones.map((c, i) => (
                  <div key={`opp-st-${i}`} className={`tcg-slot spelltrap ${c.instanceId ? 'has-card' : ''}`}>
                    {c.instanceId ? (
                      <Card card={c} catalog={catalog} faceDown faceMini />
                    ) : (
                      'S/T'
                    )}
                  </div>
                ))}
              </div>
              <div className="tcg-zone-row">
                {opponent.monsterZones.map((c, i) => {
                  const isAttackerVFX = combatVFX?.attackerInstanceId === c.instanceId;
                  const isDefenderVFX = combatVFX?.defenderInstanceId === c.instanceId;
                  const isDestroyed = (isAttackerVFX && combatVFX?.attackerDestroyed) || (isDefenderVFX && combatVFX?.defenderDestroyed);
                  return (
                    <div
                      key={`opp-m-${i}`}
                      className={`tcg-slot ${c.instanceId ? 'has-card' : ''} ${
                        selectedAttacker && c.instanceId ? 'targetable' : ''
                      } ${isAttackerVFX ? 'vfx-attacker' : ''} ${isDefenderVFX ? 'vfx-defender' : ''} ${isDestroyed ? 'vfx-destroyed' : ''}`}
                      onClick={() => c.instanceId && clickOppMonster(c)}
                    >
                      {c.instanceId ? (
                        <Card card={c} catalog={catalog} faceMini onHoverChange={setHoveredCard} />
                      ) : (
                        'Monster'
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="tcg-side opponent"><p style={{ opacity: 0.5 }}>Esperando oponente…</p></section>
        )}

        {/* Divider central */}
        <div className="tcg-divider">
          <div className="tcg-phase-badge">
            <div className="tcg-phase-name">{phase}</div>
            <div className="tcg-phase-hint">{phaseHints[phase] ?? '—'}</div>
          </div>
        </div>

        {/* Lado tuyo */}
        {me ? (
          <section className="tcg-side you">
            <PlayerHud player={me} variant="you" />
            <div className="tcg-zones">
              <div className="tcg-zone-row">
                {me.monsterZones.map((c, i) => {
                  const isTributable = !!pendingSummon && !!c.instanceId;
                  const isTributeSelected = !!pendingSummon && pendingSummon.selectedTributes.includes(c.instanceId);
                  const isAttackerVFX = combatVFX?.attackerInstanceId === c.instanceId;
                  const isDefenderVFX = combatVFX?.defenderInstanceId === c.instanceId;
                  const isDestroyed = (isAttackerVFX && combatVFX?.attackerDestroyed) || (isDefenderVFX && combatVFX?.defenderDestroyed);
                  const handleClick = () => {
                    if (!c.instanceId) return;
                    if (pendingSummon) {
                      toggleTributeSelection(c.instanceId);
                      return;
                    }
                    clickMyMonster(c);
                  };
                  return (
                    <div
                      key={`me-m-${i}`}
                      className={`tcg-slot ${c.instanceId ? 'has-card' : ''} ${
                        selectedAttacker === c.instanceId || selectedMonster === c.instanceId ? 'selected-monster' : ''
                      } ${isTributable ? 'tributable' : ''} ${isTributeSelected ? 'tribute-selected' : ''} ${isAttackerVFX ? 'vfx-attacker' : ''} ${isDefenderVFX ? 'vfx-defender' : ''} ${isDestroyed ? 'vfx-destroyed' : ''}`}
                      onClick={handleClick}
                    >
                      {c.instanceId ? <Card card={c} catalog={catalog} faceMini onHoverChange={setHoveredCard} ownedByMe /> : 'Monster'}
                    </div>
                  );
                })}
              </div>
              <div className="tcg-zone-row">
                {me.spellTrapZones.map((c, i) => (
                  <div key={`me-st-${i}`} className={`tcg-slot spelltrap ${c.instanceId ? 'has-card' : ''}`}>
                    {c.instanceId ? <Card card={c} catalog={catalog} faceMini onHoverChange={setHoveredCard} ownedByMe /> : 'S/T'}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* Footer: hand + actions */}
      <footer className="tcg-footer">
        <div className="tcg-hand">
          {me && me.hand.length > 0 ? (
            me.hand.map((c) => {
              const def = catalog[c.cardId];
              const isMonster = def?.type === 'Monster';
              const tooHighLevel = isMonster && (def?.level ?? 0) > 4;
              const playable = isMyTurn && (phase === 'MAIN_1' || phase === 'MAIN_2');
              const disabled = !playable || tooHighLevel;
              return (
                <div
                  key={c.instanceId}
                  className={`tcg-hand-card tcg-card ${(def?.type ?? 'monster').toLowerCase()} ${
                    selectedHandCard === c.instanceId ? 'selected' : ''
                  } ${disabled ? 'disabled' : ''}`}
                  onClick={() => !disabled && clickHandCard(c)}
                  onMouseEnter={() => setHoveredCard(c)}
                  onMouseLeave={() => setHoveredCard((curr) => (curr?.instanceId === c.instanceId ? null : curr))}
                >
                  <div className="tcg-card-type-tag">{def?.type?.[0] ?? '?'}</div>
                  <div className="tcg-card-name">{def?.name ?? c.cardId.slice(0, 8)}</div>
                  {isMonster && def?.level ? (
                    <div className="tcg-card-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
                  ) : null}
                  <div className="tcg-card-art">
                    {isMonster ? '🐾' : def?.type === 'Spell' ? '✦' : def?.type === 'Trap' ? '⚠' : '?'}
                  </div>
                  {isMonster && def?.atk !== null && def?.def !== null ? (
                    <div className="tcg-card-stats">
                      <span className="tcg-card-atk">⚔ {def.atk}</span>
                      <span className="tcg-card-def">🛡 {def.def}</span>
                    </div>
                  ) : (
                    <div className="tcg-card-stats" style={{ justifyContent: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.55rem' }}>
                        {def?.type ?? '?'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <span className="tcg-hand-empty">(mano vacía)</span>
          )}
        </div>

        <div className="tcg-actions">
          <button
            className="tcg-btn-primary"
            onClick={endPhase}
            disabled={!isMyTurn || isGameOver}
          >
            {isMyTurn ? `Avanzar fase (${phase} →)` : 'Esperá al bot…'}
          </button>
          {/* Ataque directo: SOLO visible si no hay monsters opp y hay attacker seleccionado */}
          {selectedAttacker && phase === 'BATTLE' && opponentMonsterCount === 0 ? (
            <button type="button" className="tcg-btn-attack" onClick={attackDirect}>
              ⚔ Ataque directo
            </button>
          ) : null}
          {selectedAttacker ? (
            <button type="button" className="tcg-btn-ghost" onClick={() => setSelectedAttacker(null)}>
              Cancelar atacante
            </button>
          ) : null}
          {/* Cambio de posición ATK ↔ DEF en MAIN phase */}
          {selectedMonster && (phase === 'MAIN_1' || phase === 'MAIN_2') ? (
            <>
              <button
                type="button"
                className="tcg-btn-attack"
                onClick={() => changePosition(selectedMonster)}
              >
                {(() => {
                  const c = me?.monsterZones.find((z) => z.instanceId === selectedMonster);
                  return c?.position === 'ATK' ? '🛡 Cambiar a DEF' : '⚔ Cambiar a ATK';
                })()}
              </button>
              <button type="button" className="tcg-btn-ghost" onClick={() => setSelectedMonster(null)}>
                Cancelar
              </button>
            </>
          ) : null}
          {isMyTurn ? (
            <div className="tcg-instruction">
              {phase === 'DRAW' || phase === 'STANDBY'
                ? 'Click "Avanzar fase" para llegar a Main Phase.'
                : phase === 'MAIN_1' || phase === 'MAIN_2'
                  ? 'Click una carta de la mano para invocar/setear · Click un Monster en campo para cambiar su posición.'
                  : phase === 'BATTLE'
                    ? opponentMonsterCount > 0
                      ? 'Click un Monster tuyo en ATK → después click un monster enemigo.'
                      : 'Click un Monster tuyo en ATK → "Ataque directo" (oponente sin monsters).'
                    : 'Click END para terminar el turno.'}
            </div>
          ) : null}
        </div>
      </footer>

      {/* Log flotante */}
      <aside className={`tcg-log-panel ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="tcg-log-header" onClick={() => setLogCollapsed(!logCollapsed)}>
          <span>📜 Log ({logs.length})</span>
          <span>{logCollapsed ? '◀' : '▶'}</span>
        </div>
        <div className="tcg-log-body" ref={logRef}>
          {logs.map((l, i) => (
            <div key={i} className={`tcg-log-entry ${l.type}`}>
              {l.msg}
            </div>
          ))}
        </div>
      </aside>

      {/* Hover tooltip — panel fijo arriba a la izquierda */}
      {hoveredCard ? <CardTooltip card={hoveredCard} catalog={catalog} /> : null}

      {/* Hand action menu — popover sobre la mano cuando hacés click en una carta */}
      {handMenuCard ? (
        <HandActionMenu
          card={handMenuCard}
          catalog={catalog}
          onAction={(action) => performHandAction(handMenuCard, action)}
          onClose={() => {
            setHandMenuCard(null);
            setSelectedHandCard(null);
          }}
        />
      ) : null}

      {/* Animaciones de robo — divs flotantes que viajan del deck a la mano */}
      {drawAnims.map((a) => (
        <div key={a.id} className="tcg-draw-anim" />
      ))}

      {/* Toasts visibles arriba al centro */}
      <div className="tcg-toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`tcg-toast tcg-toast-${t.kind}`}>
            <div className="tcg-toast-title">{t.title}</div>
            {t.body ? <div className="tcg-toast-body">{t.body}</div> : null}
          </div>
        ))}
      </div>

      {/* Flash de combate — overlay rojo brevísimo del lado del atacante */}
      {combatFlash ? (
        <div className={`tcg-combat-flash ${combatFlash.attacker}`} />
      ) : null}

      {/* Overlay de Spell activado — carta agrandada en el centro */}
      {spellOverlay ? (
        <div className="tcg-spell-overlay">
          <div className={`tcg-spell-overlay-card ${spellOverlay.type.toLowerCase()}`}>
            <div className="tcg-spell-overlay-tag">
              {spellOverlay.ownedByMe ? '⚡ Vos activaste' : '🤖 El bot activó'}
            </div>
            <div className="tcg-spell-overlay-name">{spellOverlay.name}</div>
            <div className="tcg-spell-overlay-type">{spellOverlay.type}</div>
          </div>
        </div>
      ) : null}

      {/* Tribute selection panel */}
      {pendingSummon ? (
        <div className="tcg-tribute-panel">
          <div className="tcg-tribute-header">
            <strong>{pendingSummon.cardName}</strong>
            <span>requiere {pendingSummon.requiredTributes} tributo{pendingSummon.requiredTributes > 1 ? 's' : ''}</span>
          </div>
          <div className="tcg-tribute-progress">
            Seleccionados: {pendingSummon.selectedTributes.length} / {pendingSummon.requiredTributes}
          </div>
          <div className="tcg-tribute-hint">
            Click un Monster propio del campo para tributar. Click otra vez para deseleccionar.
          </div>
          <div className="tcg-tribute-actions">
            <button
              type="button"
              className="tcg-btn-primary"
              disabled={pendingSummon.selectedTributes.length !== pendingSummon.requiredTributes}
              onClick={confirmTributeSummon}
            >
              ⚡ Invocar ({pendingSummon.position})
            </button>
            <button type="button" className="tcg-btn-ghost" onClick={() => setPendingSummon(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Game over overlay */}
      {isGameOver ? (
        <div className="tcg-gameover">
          <div className="tcg-gameover-card">
            <div className={`tcg-gameover-title ${won ? '' : 'lose'}`}>
              {won ? '¡Ganaste!' : state.winnerId ? 'Derrotado' : 'Empate'}
            </div>
            <p style={{ opacity: 0.75, marginBottom: '1.5rem' }}>
              Razón: <strong>{state.winReason}</strong>
            </p>
            <Link href="/dashboard" className="tcg-btn-primary" style={{ display: 'inline-block', padding: '0.7rem 1.4rem', borderRadius: '0.5rem', textDecoration: 'none' }}>
              Volver al dashboard
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function PlayerHud({ player, variant }: { player: PlayerSnapshot; variant: 'you' | 'opponent' }) {
  const lpPct = Math.max(0, Math.min(100, (player.lifePoints / 8000) * 100));
  const low = player.lifePoints < 2000;
  // Stack visual del mazo: hasta 4 cartas apiladas con offset escalonado para dar profundidad.
  const stackDepth = Math.min(4, Math.max(1, Math.ceil(player.deckSize / 10)));
  return (
    <div className={`tcg-hud-wrap ${variant}`}>
      <div className={`tcg-hud ${variant}`}>
        <div className="tcg-hud-name">
          {variant === 'opponent' ? '🤖' : '👤'} {player.username}
        </div>
        <div className={`tcg-hud-lp ${low ? 'low' : ''}`}>
          {player.lifePoints}<span className="lp-suffix">LP</span>
        </div>
        <div className="tcg-hud-bar">
          <div className={`tcg-hud-bar-fill ${low ? 'low' : ''}`} style={{ width: `${lpPct}%` }} />
        </div>
        <div className="tcg-hud-stats">
          <div className="tcg-hud-stat">
            <span className="tcg-hud-stat-value">{player.handSize}</span>
            <span className="tcg-hud-stat-label">Mano</span>
          </div>
          <div className="tcg-hud-stat">
            <span className="tcg-hud-stat-value">{player.graveyard.length}</span>
            <span className="tcg-hud-stat-label">Cementerio</span>
          </div>
        </div>
      </div>
      {/* Mazo de robo visible — pila de cartas apiladas */}
      <div className={`tcg-deckstack ${variant}`} title={`${player.deckSize} cartas en el mazo`}>
        {Array.from({ length: stackDepth }).map((_, i) => (
          <div
            key={i}
            className="tcg-deckcard"
            style={{
              transform: `translate(${i * 2}px, ${i * -2}px)`,
              zIndex: stackDepth - i,
            }}
          />
        ))}
        <div className="tcg-deckstack-count">{player.deckSize}</div>
      </div>
    </div>
  );
}

function Card({
  card,
  catalog,
  faceDown,
  faceMini,
  onHoverChange,
  ownedByMe,
}: {
  card: CardSnapshot;
  catalog: CardCatalog;
  faceDown?: boolean;
  faceMini?: boolean;
  onHoverChange?: (card: CardSnapshot | null) => void;
  ownedByMe?: boolean;
}) {
  const def = catalog[card.cardId];
  const showFaceDown = faceDown || card.faceDown;
  const type = (def?.type ?? 'Monster').toLowerCase();
  const isMonster = def?.type === 'Monster';
  const isSpellOrTrap = def?.type === 'Spell' || def?.type === 'Trap';
  const attacked = card.hasAttacked;

  if (showFaceDown) {
    // Si la carta es mía, mostrar back pattern + un mini chip con el TIPO real (M/S/T)
    // y permitir hover para revelar tooltip — yo sé qué seteé.
    return (
      <div
        className={`tcg-card face-down ${ownedByMe ? 'mine' : ''} ${isMonster ? 'is-monster-set' : ''} ${isSpellOrTrap ? 'is-st-set' : ''}`}
        onMouseEnter={() => ownedByMe && onHoverChange?.(card)}
        onMouseLeave={() => ownedByMe && onHoverChange?.(null)}
      >
        {ownedByMe && def ? (
          <div className="tcg-card-facedown-tag">{def.type[0]}</div>
        ) : null}
      </div>
    );
  }

  const isDef = card.position === 'DEF';
  return (
    <div
      className={`tcg-card ${type} ${attacked ? 'attacked' : ''} ${isDef ? 'def-position' : ''}`}
      onMouseEnter={() => onHoverChange?.(card)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <div className="tcg-card-type-tag">{def?.type?.[0] ?? '?'}</div>
      {card.position ? <div className="tcg-card-pos">{card.position}</div> : null}
      <div className="tcg-card-name">{def?.name ?? card.cardId.slice(0, 8)}</div>
      {isMonster && def?.level ? (
        <div className="tcg-card-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
      ) : null}
      {!faceMini ? (
        <div className="tcg-card-art">
          {isMonster ? '🐾' : def?.type === 'Spell' ? '✦' : '⚠'}
        </div>
      ) : null}
      {isMonster ? (
        <div className="tcg-card-stats">
          <span className="tcg-card-atk">⚔ {(def?.atk ?? 0) + card.atkMod}</span>
          <span className="tcg-card-def">🛡 {(def?.def ?? 0) + card.defMod}</span>
        </div>
      ) : null}
    </div>
  );
}

/* Map de códigos de error del server a títulos legibles para toasts. */
function friendlyErrorTitle(code: string): string {
  const map: Record<string, string> = {
    NOT_YOUR_TURN: 'No es tu turno',
    WRONG_PHASE: 'Fase incorrecta',
    ALREADY_NORMAL_SUMMONED: 'Ya invocaste este turno',
    ZONE_FULL: 'Zona llena',
    NEEDS_TRIBUTES: 'Faltan tributos',
    CARD_NOT_IN_HAND: 'Carta no encontrada',
    TARGET_INVALID: 'Objetivo inválido',
    CANT_ATTACK_FIRST_TURN: 'No podés atacar en el primer turno',
    ALREADY_ATTACKED: 'Esa carta ya atacó este turno',
    CONDITION_NOT_MET: 'Condición no cumplida',
    INTERNAL_ERROR: 'Error del servidor',
  };
  return map[code] ?? code;
}

/* Tooltip rich con todos los stats — panel fijo arriba-izquierda. */
function CardTooltip({ card, catalog }: { card: CardSnapshot; catalog: CardCatalog }) {
  const def = catalog[card.cardId];
  if (!def) return null;
  const isMonster = def.type === 'Monster';
  const tributesNeeded = isMonster ? ((def.level ?? 0) <= 4 ? 0 : (def.level ?? 0) <= 6 ? 1 : 2) : 0;
  const type = def.type.toLowerCase();

  return (
    <div className={`tcg-tooltip ${type}`}>
      <div className="tcg-tooltip-header">
        <span className={`tcg-tooltip-rarity rarity-${def.rarity?.toLowerCase() ?? 'common'}`}>
          {def.rarity ?? 'Common'}
        </span>
        <span className="tcg-tooltip-typetag">{def.type}{def.subType ? ` · ${def.subType}` : ''}</span>
      </div>
      <h3 className="tcg-tooltip-name">{def.name}</h3>
      {isMonster && def.level ? (
        <div className="tcg-tooltip-stars">
          {'★'.repeat(Math.min(def.level, 8))} <span>L{def.level}</span>
        </div>
      ) : null}
      {def.attribute ? <div className="tcg-tooltip-attr">{def.attribute}</div> : null}
      {isMonster ? (
        <div className="tcg-tooltip-statgrid">
          <div><span>ATK</span><strong>{(def.atk ?? 0) + card.atkMod}</strong></div>
          <div><span>DEF</span><strong>{(def.def ?? 0) + card.defMod}</strong></div>
          <div><span>Tributos</span><strong>{tributesNeeded}</strong></div>
        </div>
      ) : null}
      {def.spellSpeed ? (
        <div className="tcg-tooltip-row">
          <span>Spell Speed</span>
          <strong>{def.spellSpeed}</strong>
        </div>
      ) : null}
      {def.description ? <p className="tcg-tooltip-desc">{def.description}</p> : null}
      {def.effectDescription ? (
        <div className="tcg-tooltip-effect">
          <strong>Efecto ({def.effectKind ?? '—'}):</strong> {def.effectDescription}
        </div>
      ) : null}
      <div className="tcg-tooltip-foot">
        Posición: {card.position || '—'}
        {card.faceDown ? ' · Boca abajo' : ''}
        {card.hasAttacked ? ' · Ya atacó' : ''}
      </div>
    </div>
  );
}

/* Submenu contextual sobre la mano cuando hacés click en una carta. */
function HandActionMenu({
  card,
  catalog,
  onAction,
  onClose,
}: {
  card: CardSnapshot;
  catalog: CardCatalog;
  onAction: (action: 'summon-atk' | 'summon-def' | 'set' | 'activate') => void;
  onClose: () => void;
}) {
  const def = catalog[card.cardId];
  if (!def) return null;
  const isMonster = def.type === 'Monster';
  const tooHighLevel = isMonster && (def.level ?? 0) > 4;
  const isQuickSpell = def.type === 'Spell' && def.spellSpeed === 1;

  return (
    <>
      <div className="tcg-menu-backdrop" onClick={onClose} />
      <div className="tcg-handmenu">
        <div className="tcg-handmenu-header">
          <strong>{def.name}</strong>
          <button className="tcg-handmenu-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="tcg-handmenu-actions">
          {isMonster ? (
            <>
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => onAction('summon-atk')}
                disabled={tooHighLevel}
              >
                ⚔ Invocar (ATK)
              </button>
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => onAction('summon-def')}
                disabled={tooHighLevel}
              >
                🛡 Invocar (DEF)
              </button>
              {tooHighLevel ? (
                <div className="tcg-handmenu-hint">
                  Requiere {(def.level ?? 0) <= 6 ? 1 : 2} tributo(s) — UI todavía no soportada.
                </div>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => onAction('set')}
              >
                ⌬ SET (boca abajo)
              </button>
              {isQuickSpell ? (
                <button
                  type="button"
                  className="tcg-handmenu-btn"
                  onClick={() => onAction('activate')}
                >
                  ✦ Activar ahora
                </button>
              ) : null}
            </>
          )}
        </div>
        {def.description ? <p className="tcg-handmenu-desc">{def.description}</p> : null}
      </div>
    </>
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
        deckSize: p.deck?.length ?? 0,
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
