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

import { Suspense, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Client, type Room } from 'colyseus.js';
import { getJwt, getJwtUserId, apiFetch } from '../../../lib/auth';
import { placeholderSvgFor as svgForCard, resolveCardImage } from '../../../lib/cardArt';
import { SoundControls } from '../../../components/SoundControls';
import { RockPaperScissorsIntro } from '../../../components/RockPaperScissorsIntro';
import { sound } from '../../../lib/sound';

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
  /** Bonus efectivo de auras dinámicas (continuousAura, beastSwarm, antiPlantDebuff, auraDef).
   *  Server-recomputado tras cada acción que cambie field state. */
  auraAtkBonus: number;
  auraDefBonus: number;
  /** True si esta carta está bajo CUALQUIER modificador (atkMod, defMod, o aura). */
  affectedByAura: boolean;
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
  turnDeadlineMs: number;
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
  imageUrl?: string;
  /** Si presente, la card requiere elegir target(s) al activar. zones: ANY_MONSTER | OWN_MONSTER | OPP_MONSTER */
  targetingZones?: string[];
  targetingCount?: number;
}
interface CardCatalog {
  [id: string]: CardDef;
}

interface LogEntry {
  type: 'system' | 'action' | 'error' | 'info';
  msg: string;
  ts: number;
}

// Wrap with Suspense for useSearchParams() (Next.js 14 App Router requirement).
export default function PvePageWrapper() {
  return (
    <Suspense fallback={<DuelConnectingSplash />}>
      <PvePage />
    </Suspense>
  );
}

function PvePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const difficultyParam = (searchParams.get('diff') ?? 'novato').toLowerCase();
  const difficulty: 'Easy' | 'Normal' | 'Hard' =
    difficultyParam === 'experto' ? 'Hard' :
    difficultyParam === 'avanzado' ? 'Normal' :
    'Easy';
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<DuelStateSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CardCatalog>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mySessionId, setMySessionId] = useState<string>('');
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null);
  const [selectedMonster, setSelectedMonster] = useState<string | null>(null);
  const [setCardMenu, setSetCardMenu] = useState<CardSnapshot | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<CardSnapshot | null>(null);
  const [previewCard, setPreviewCard] = useState<CardSnapshot | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trapPrompt, setTrapPrompt] = useState<{
    traps: Array<{ instanceId: string; name: string; description: string; kind: string }>;
    timeoutMs: number;
    expiresAt: number;
    phase: 'pre-attack' | 'post-combat';
    attackInfo?: {
      attackerInstanceId: string;
      attackerName: string;
      targetInstanceId: string | 'DIRECT';
      targetName?: string;
    };
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pendingSpellTarget, setPendingSpellTarget] = useState<{
    spellInstanceId: string;
    spellName: string;
    zones: string[];
    count: number;
    fromHand: boolean; // true = activar desde mano, false = desde field set
  } | null>(null);
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
  const [floatingTexts, setFloatingTexts] = useState<Array<{
    id: number;
    instanceId: string;
    text: string;
    variant: 'advantage' | 'weak';
  }>>([]);
  const [destructionEffects, setDestructionEffects] = useState<Array<{
    id: number;
    instanceId: string;
    color: string;
  }>>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [voidViewer, setVoidViewer] = useState<{ ownerId: string; ownerName: string } | null>(null);
  const [pendingSummon, setPendingSummon] = useState<{
    cardInstanceId: string;
    cardName: string;
    position: 'ATK' | 'DEF_FACEDOWN';
    requiredTributes: number;
    selectedTributes: string[];
  } | null>(null);
  const [lunacianCoins, setLunacianCoins] = useState<string>('—');
  const [meProfile, setMeProfile] = useState<{ username: string; displayName: string | null; avatarUrl: string | null }>({
    username: 'You', displayName: null, avatarUrl: null,
  });
  const [firstPlayerChoice, setFirstPlayerChoice] = useState<'me' | 'opponent' | null>(null);
  /** Mobile: hand peek-up state. Default 'peek' (40-45% hidden). Tap handle → expand. */
  const [handExpanded, setHandExpanded] = useState<boolean>(false);
  const coinsAtMatchStartRef = useRef<string | null>(null);
  const xpAtMatchStartRef = useRef<number | null>(null);
  const levelAtMatchStartRef = useRef<number | null>(null);
  // Set when MATCH_REWARDS broadcast arrives → fallback poll skips if true.
  const rewardArrivedRef = useRef<boolean>(false);
  const [lcReward, setLcReward] = useState<{ before: string; after: string; delta: number } | null>(null);
  const [xpReward, setXpReward] = useState<{ deltaXp: number; newXp: number; oldLevel: number; newLevel: number; leveledUp: boolean } | null>(null);
  const [fieldCardMenu, setFieldCardMenu] = useState<{ card: CardSnapshot; ownedByMe: boolean } | null>(null);
  const [activeDeckName, setActiveDeckName] = useState<string | null>(null);
  const [coinsAnimating, setCoinsAnimating] = useState(false);
  const [botSpeed, setBotSpeed] = useState<'normal' | 'fast'>('normal');
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
    // Arrancar BGM al primer gesto del usuario en esta página.
    sound.startBgmOnFirstGesture();
    // Anti-RPS-bypass: no joinear el room hasta que el user complete el RPS pre-match.
    if (firstPlayerChoice === null) return;

    let mounted = true;
    let activeRoom: Room | null = null;

    void (async () => {
      try {
        // En paralelo: catálogo + decks (para deck activo) + perfil (LC + XP + level + displayName + avatar).
        const [meData, decksData] = await Promise.all([
          apiFetch<{ lunacianCoins: string; username: string; displayName: string | null; avatarUrl: string | null; xp: number; level: number }>('/users/me')
            .catch(() => ({ lunacianCoins: '0', username: 'You', displayName: null, avatarUrl: null, xp: 0, level: 1 })),
          apiFetch<{ decks: Array<{ id: string; name: string; isActive: boolean }> }>('/decks').catch(() => ({ decks: [] })),
        ]);
        if (!mounted) return;
        setLunacianCoins(meData.lunacianCoins ?? '0');
        coinsAtMatchStartRef.current = meData.lunacianCoins ?? '0';
        xpAtMatchStartRef.current = meData.xp ?? 0;
        levelAtMatchStartRef.current = meData.level ?? 1;
        rewardArrivedRef.current = false;
        setMeProfile({
          username: meData.username ?? 'You',
          displayName: meData.displayName ?? null,
          avatarUrl: meData.avatarUrl ?? null,
        });
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
            effectJson: { kind: string; description?: string; spellSpeed?: number; targeting?: { count?: number; zones?: string[] } } | null;
            imageUrl: string;
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
            imageUrl: c.imageUrl,
            ...(c.effectJson?.targeting?.zones ? { targetingZones: c.effectJson.targeting.zones } : {}),
            ...(c.effectJson?.targeting?.count !== undefined ? { targetingCount: c.effectJson.targeting.count } : {}),
          };
        });
        setCatalog(cat);

        // Conectar a Colyseus PvERoom (con deckId si hay deck activo).
        if (activeDeck) {
          setActiveDeckName(activeDeck.name);
        } else {
          pushToast('info', 'No active deck', 'Playing with default deck. Activate one in /decks to use your own.');
        }
        const client = new Client(GAME_SERVER);
        const userId = getJwtUserId();
        const joinOpts: { username: string; difficulty: 'Easy' | 'Normal' | 'Hard'; deckId?: string; cardIds?: string[]; botSpeed: 'normal' | 'fast'; userId?: string; firstPlayer?: 'me' | 'opponent' } = {
          username: meData.displayName || meData.username || 'You',
          difficulty,
          firstPlayer: firstPlayerChoice ?? 'me',
          botSpeed,
        };
        // Priority: inline cardIds from localStorage (zero round-trip) → fallback to deckId (api fetch).
        if (typeof window !== 'undefined') {
          try {
            const stored = window.localStorage.getItem('user_active_deck');
            if (stored) {
              const parsed = JSON.parse(stored) as unknown;
              if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === 'string')) {
                joinOpts.cardIds = parsed as string[];
                setActiveDeckName(`Local (${parsed.length})`);
              }
            }
          } catch {
            // Storage parse error → ignorar, caer a deckId.
          }
        }
        if (!joinOpts.cardIds && activeDeck) joinOpts.deckId = activeDeck.id;
        if (userId) joinOpts.userId = userId;
        const joinedRoom = await client.joinOrCreate('pve', joinOpts);
        if (!mounted) {
          await joinedRoom.leave();
          return;
        }
        activeRoom = joinedRoom;
        setRoom(joinedRoom);
        setMySessionId(joinedRoom.sessionId);
        setConnecting(false);
        log('system', `Connected to room ${joinedRoom.roomId} as ${joinedRoom.sessionId}`);

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
          matchup?: 'advantage' | 'disadvantage' | 'neutral';
          effectiveAtk?: number;
          attackerClass?: string;
          defenderClass?: string;
        }) => {
          const meAttacking = data.attackerOwnerId === joinedRoom.sessionId;
          const aName = data.attackerName ?? 'Attacker';
          const dName = data.defenderName ?? 'opponent';
          let title: string;
          const lines: string[] = [];
          if (data.direct) {
            title = meAttacking ? `⚔ ${aName} attacks directly` : `🛡 ${aName} attacks you directly`;
            const dmgToFoe = data.damageToDefenderOwner ?? 0;
            const dmgToYou = data.damageToAttackerOwner ?? 0;
            if (meAttacking && dmgToFoe > 0) lines.push(`-${dmgToFoe} LP to opponent`);
            if (!meAttacking && dmgToYou > 0) lines.push(`-${dmgToYou} LP to you`);
          } else {
            title = meAttacking ? `⚔ ${aName} → ${dName}` : `${aName} → ${dName}`;
            if (data.defenderDestroyed) lines.push(`💥 ${dName} sent to The Void`);
            if (data.attackerDestroyed) lines.push(`💥 ${aName} sent to The Void`);
            const dmgToFoe = data.damageToDefenderOwner ?? 0;
            const dmgToYou = data.damageToAttackerOwner ?? 0;
            if (meAttacking) {
              if (dmgToFoe > 0) lines.push(`-${dmgToFoe} LP to opponent`);
              if (dmgToYou > 0) lines.push(`-${dmgToYou} LP to you (DEF higher than ATK)`);
            } else {
              if (dmgToYou > 0) lines.push(`-${dmgToYou} LP to you`);
              if (dmgToFoe > 0) lines.push(`-${dmgToFoe} LP to opponent (DEF higher than ATK)`);
            }
            if (!data.attackerDestroyed && !data.defenderDestroyed && dmgToFoe === 0 && dmgToYou === 0) {
              lines.push('No destruction or damage (equal stats or face-down defense)');
            }
          }
          // Class triangle indicator: +15% (advantage) or -15% (disadvantage).
          const matchup: 'advantage' | 'disadvantage' | 'neutral' | undefined =
            (data as { matchup?: 'advantage' | 'disadvantage' | 'neutral' }).matchup;
          if (data.advantageBonus && data.advantageBonus > 0 && data.attackerClass && data.defenderClass) {
            lines.unshift(`⚡ ${data.attackerClass} > ${data.defenderClass} (+${data.advantageBonus}% → effective ATK ${data.effectiveAtk})`);
          } else if (data.advantageBonus && data.advantageBonus < 0 && data.attackerClass && data.defenderClass) {
            lines.unshift(`🛡 ${data.attackerClass} weak vs ${data.defenderClass} (${data.advantageBonus}% → effective ATK ${data.effectiveAtk})`);
          }
          pushToast('combat', title, lines.join(' · '));
          // Audit log with the math op for clarity.
          const dmgToFoe = data.damageToDefenderOwner ?? 0;
          const dmgToAtt = data.damageToAttackerOwner ?? 0;
          const auditOp = data.direct
            ? `${data.effectiveAtk ?? '?'} ATK direct → -${dmgToFoe} LP to opponent`
            : `Effective ATK ${data.effectiveAtk ?? '?'} → damage to opponent ${dmgToFoe}, self ${dmgToAtt}`;
          log('info', `🧮 ${auditOp}`);
          log('action', `combat: ${title} | ${lines.join(' · ')}`);
          // SFX combate.
          sound.play('attackHit');
          if (data.attackerDestroyed || data.defenderDestroyed) {
            setTimeout(() => sound.play('cardDestroyed'), 280);
          }
          if ((data.damageToAttackerOwner ?? 0) > 0 || (data.damageToDefenderOwner ?? 0) > 0) {
            setTimeout(() => sound.play('lpDamage'), 140);
          }
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
          setTimeout(() => setCombatVFX(null), 1500);

          // Floating text VFX over the impact site (defender slot, or attacker slot for direct attacks).
          if (matchup === 'advantage' || matchup === 'disadvantage') {
            const anchorId = data.defenderInstanceId ?? data.attackerInstanceId;
            if (anchorId) {
              const id = ++toastIdRef.current;
              const variant = matchup === 'advantage' ? 'advantage' : 'weak';
              const text = variant === 'advantage' ? '¡VENTAJA +15%!' : '¡INEFICAZ -15%!';
              setFloatingTexts((prev) => [...prev, { id, instanceId: anchorId, text, variant }]);
              setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 1600);
            }
          }

          // Destruction particles VFX, color tinted by attribute.
          const classColor = (cls?: string): string => {
            switch (cls) {
              case 'Plant': return '#34d399';
              case 'Beast': return '#fb923c';
              case 'Aqua':  return '#22d3ee';
              case 'Bird':  return '#f472b6';
              case 'Reptile': return '#a3e635';
              case 'Bug':   return '#ef4444';
              case 'Mech':  return '#cbd5e1';
              case 'Dawn':  return '#c084fc';
              case 'Dusk':  return '#5eead4';
              default:      return '#fbbf24';
            }
          };
          if (data.defenderDestroyed && data.defenderInstanceId) {
            const id = ++toastIdRef.current;
            const color = classColor(data.defenderClass);
            setDestructionEffects((prev) => [...prev, { id, instanceId: data.defenderInstanceId!, color }]);
            setTimeout(() => setDestructionEffects((prev) => prev.filter((d) => d.id !== id)), 1600);
          }
          if (data.attackerDestroyed) {
            const id = ++toastIdRef.current;
            const color = classColor(data.attackerClass);
            setDestructionEffects((prev) => [...prev, { id, instanceId: data.attackerInstanceId, color }]);
            setTimeout(() => setDestructionEffects((prev) => prev.filter((d) => d.id !== id)), 1600);
          }
        });

        joinedRoom.onMessage('TRAP_RESPONSE_PROMPT', (data: {
          defenderId: string;
          traps: Array<{ instanceId: string; name: string; description: string; kind: string }>;
          timeoutMs: number;
          phase?: 'pre-attack' | 'post-combat';
          attackInfo?: {
            attackerInstanceId: string;
            attackerName: string;
            targetInstanceId: string | 'DIRECT';
            targetName?: string;
          };
        }) => {
          // pre-attack: el server me notifica que el bot ataca → soy defender.
          // post-combat: yo destruí un enemigo y tengo burn traps → soy attacker.
          // Ambos casos: defenderId === mi sessionId.
          if (data.defenderId !== joinedRoom.sessionId) return;
          const phase = data.phase ?? 'pre-attack';
          setTrapPrompt({
            traps: data.traps,
            timeoutMs: data.timeoutMs,
            expiresAt: Date.now() + data.timeoutMs,
            phase,
            ...(data.attackInfo ? { attackInfo: data.attackInfo } : {}),
          });
          if (phase === 'post-combat') {
            log('system', `🔥 Your Axie destroyed an enemy — activate a burn Trap?`);
          } else if (data.attackInfo) {
            const isDirect = data.attackInfo.targetInstanceId === 'DIRECT';
            const targetLabel = isDirect ? 'YOU directly' : (data.attackInfo.targetName ?? 'your Axie');
            log('system', `🃏 ${data.attackInfo.attackerName} → ${targetLabel} — execute a Trap?`);
          } else {
            log('system', `🃏 Opponent declared a Combat — execute a Trap?`);
          }
          sound.play('error'); // alarmita corta para llamar atención
        });

        joinedRoom.onMessage('GAME_EVENT', (data: {
          kind: 'SUMMON' | 'SET_CARD' | 'PHASE_CHANGE' | 'TURN_START';
          ownerId: string;
          cardName?: string;
          position?: string;
          fromPhase?: string;
          toPhase?: string;
          turnNumber?: number;
        }) => {
          const isMe = data.ownerId === joinedRoom.sessionId;
          const who = isMe ? 'You' : '🤖 Opponent';
          // Map server phase enum to UI label (Extraction/Sync/Tactical/Combat/Resolution).
          const phaseLabelOf = (p?: string): string => {
            const map: Record<string, string> = {
              DRAW: 'Extraction', STANDBY: 'Sync', MAIN_1: 'Tactical Phase 1',
              MAIN_2: 'Tactical Phase 2', BATTLE: 'Combat', END: 'Resolution',
            };
            return p ? (map[p] ?? p) : '?';
          };
          let msg = '';
          switch (data.kind) {
            case 'SUMMON':
              msg = `${who} deploys ${data.cardName ?? '?'}${data.position ? ` (${data.position})` : ''}`;
              sound.play('cardDeploy');
              break;
            case 'SET_CARD':
              msg = `${who} installs ${data.cardName ?? 'card'} face-down`;
              sound.play('cardSet');
              break;
            case 'PHASE_CHANGE':
              msg = `↪ ${phaseLabelOf(data.fromPhase)} → ${phaseLabelOf(data.toPhase)}`;
              sound.play('phaseAdvance');
              break;
            case 'TURN_START':
              msg = `═══ Turn ${data.turnNumber} — ${who} ═══`;
              sound.play('turnStart');
              break;
          }
          log(data.kind === 'TURN_START' ? 'system' : data.kind === 'PHASE_CHANGE' ? 'info' : 'action', msg);
        });

        joinedRoom.onMessage('CARD_ACTIVATED', (data: { ownerId: string; cardName: string; kind: string; cancelled?: boolean }) => {
          const meOwner = data.ownerId === joinedRoom.sessionId;
          const who = meOwner ? 'You' : 'Opponent';
          if (data.cancelled) {
            pushToast('info', `${data.cardName} negated`, `A counter-trap neutralized the ${data.kind}.`);
            sound.play('error');
          } else {
            pushToast('success', `${who} executed ${data.cardName}`, `${data.kind} resolved.`);
            sound.play(data.kind === 'Trap' ? 'trapActivate' : 'spellActivate');
            // Big overlay of activated card — 1.8s on screen.
            setSpellOverlay({ name: data.cardName, ownedByMe: meOwner, type: data.kind });
            setTimeout(() => setSpellOverlay(null), 1800);
          }
        });

        // CARD_EFFECT_ACTIVATED — fired for monster triggered effects (onDeploy, onDeath, passive auras).
        joinedRoom.onMessage('CARD_EFFECT_ACTIVATED', (data: { ownerId: string; cardName: string; cardId: string; effectKind: string; trigger: string }) => {
          const meOwner = data.ownerId === joinedRoom.sessionId;
          const who = meOwner ? 'You' : 'Opponent';
          const triggerLabel = data.trigger === 'onSummon' ? 'on deploy' : data.trigger === 'onDeath' ? 'on death' : data.trigger;
          pushToast('success', '¡Efecto Activado!', `${who}: ${data.cardName} (${triggerLabel})`);
          sound.play('phaseAdvance');
          log('action', `⚡ Effect: ${data.cardName} [${data.effectKind}] (${triggerLabel}) — ${who}`);
        });

        // CARD_EFFECT_TRIGGERED — fired cuando una Field/Continuous Spell aplica un modificador
        // a un monster específico (ej: Sky Mavis Field +300 ATK al summon).
        joinedRoom.onMessage('CARD_EFFECT_TRIGGERED', (data: {
          sourceOwnerId: string;
          sourceCardName: string;
          sourceCardId: string;
          targetInstanceId: string;
          effectKind: string;
          delta: { atk?: number; def?: number };
        }) => {
          const meOwner = data.sourceOwnerId === joinedRoom.sessionId;
          const who = meOwner ? 'You' : 'Opponent';
          const deltaParts: string[] = [];
          if (data.delta.atk) deltaParts.push(`${data.delta.atk > 0 ? '+' : ''}${data.delta.atk} ATK`);
          if (data.delta.def) deltaParts.push(`${data.delta.def > 0 ? '+' : ''}${data.delta.def} DEF`);
          const deltaText = deltaParts.join(' / ');
          pushToast('success', `${who}: ${data.sourceCardName} triggered`, deltaText);
          sound.play('phaseAdvance');
          log('action', `💧 ${data.sourceCardName} → ${deltaText} (${who})`);
          // Floating text VFX sobre el target.
          const id = ++toastIdRef.current;
          setFloatingTexts((prev) => [...prev, {
            id,
            instanceId: data.targetInstanceId,
            text: deltaText,
            variant: 'advantage',
          }]);
          setTimeout(() => setFloatingTexts((prev) => prev.filter((f) => f.id !== id)), 1600);
        });

        joinedRoom.onMessage('TURN_TIMEOUT', (data: { previousPlayerId: string }) => {
          const wasMe = data.previousPlayerId === joinedRoom.sessionId;
          if (wasMe) {
            pushToast('error', '⏱ Time\'s up!', 'Your turn auto-ended at 0s.');
            log('system', '⏱ Turn auto-ended (timeout 60s).');
          }
        });

        // Reward summary push del server — sin polling, info instantánea al GAME_OVER.
        joinedRoom.onMessage('MATCH_REWARDS', (data: {
          matchId: string;
          outcome: 'WIN' | 'LOSS' | 'DRAW';
          dustEarned: number;
          dustNewBalance: string;
          xpEarned: number;
          xpNewTotal: number;
          oldLevel: number;
          newLevel: number;
          leveledUp: boolean;
        }) => {
          rewardArrivedRef.current = true;
          const before = coinsAtMatchStartRef.current ?? '0';
          setLunacianCoins(data.dustNewBalance);
          setLcReward({ before, after: data.dustNewBalance, delta: data.dustEarned });
          setXpReward({
            deltaXp: data.xpEarned,
            newXp: data.xpNewTotal,
            oldLevel: data.oldLevel,
            newLevel: data.newLevel,
            leveledUp: data.leveledUp,
          });
          setCoinsAnimating(true);
          if (data.dustEarned > 0) setTimeout(() => sound.play('coinReward'), 350);
          if (data.leveledUp) setTimeout(() => sound.play('victory'), 700);
          setTimeout(() => setCoinsAnimating(false), 1200);
          try { localStorage.setItem('axie:lc-updated', String(Date.now())); } catch { /* noop */ }
          if (data.leveledUp) {
            try {
              localStorage.setItem('axie:level-up-pending', JSON.stringify({
                oldLevel: data.oldLevel,
                newLevel: data.newLevel,
                ts: Date.now(),
              }));
            } catch { /* noop */ }
          }
        });

        joinedRoom.onLeave(() => {
          log('system', 'Disconnected from room.');
          pushToast('error', 'Disconnected', 'Lost connection with game server.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, firstPlayerChoice]);

  // Auto-scroll del log al final.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Turn timer countdown — re-tick cada 250ms para suavidad. Lee state.turnDeadlineMs.
  // IMPORTANTE: este hook DEBE estar antes de los early returns (RPS, connecting, etc.)
  // para evitar "Rendered more hooks than during the previous render" de React.
  useEffect(() => {
    if (!state || state.status !== 'IN_PROGRESS' || !state.turnDeadlineMs) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.turnDeadlineMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state?.turnDeadlineMs, state?.status]);

  // Detectar incremento de handSize → disparar animación de robo + toast.
  const _myHandSize = state?.players[mySessionId]?.handSize ?? 0;
  const _isMyTurn = state?.activePlayerId === mySessionId;
  useEffect(() => {
    const prev = lastHandSizeRef.current;
    const delta = _myHandSize - prev;
    if (delta > 0 && prev > 0) {
      sound.play('cardDraw');
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
      pushToast('info', `+${delta} card${delta > 1 ? 's' : ''} extracted`, 'From The Core to your Cache.');
    }
    lastHandSizeRef.current = _myHandSize;
  }, [_myHandSize]);

  // Cerrar handMenu si cambia el turno.
  useEffect(() => {
    if (!_isMyTurn) setHandMenuCard(null);
  }, [_isMyTurn]);

  // Mousemove tracker: activo cuando hay attacker O spell target pendiente.
  // OPTIMIZACIÓN PERF: throttle vía requestAnimationFrame para evitar re-renders excesivos
  // (mousemove dispara ~60-120 eventos/seg en hardware moderno → state update saturaba React).
  useEffect(() => {
    if (!selectedAttacker && !pendingSpellTarget) return;
    let rafId: number | null = null;
    let nextX = 0;
    let nextY = 0;
    const handler = (e: MouseEvent) => {
      nextX = e.clientX;
      nextY = e.clientY;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setMousePos({ x: nextX, y: nextY });
        rafId = null;
      });
    };
    window.addEventListener('mousemove', handler);
    return () => {
      window.removeEventListener('mousemove', handler);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [selectedAttacker, pendingSpellTarget]);

  // ESC cancela spell targeting.
  useEffect(() => {
    if (!pendingSpellTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelSpellTarget();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpellTarget]);

  // Al GAME_OVER → SFX inmediato. Los rewards llegan via MATCH_REWARDS broadcast (server push).
  // Polling de /users/me solo como fallback defensivo si el broadcast se pierde (ej WS reconnect).
  const _isGameOver = state?.status === 'GAME_OVER';
  useEffect(() => {
    if (!_isGameOver) return;
    const won = state?.winnerId === mySessionId;
    const draw = !state?.winnerId;
    sound.play(draw ? 'phaseAdvance' : won ? 'victory' : 'defeat');

    let cancelled = false;
    const before = coinsAtMatchStartRef.current ?? lunacianCoins;
    const xpBefore = xpAtMatchStartRef.current ?? 0;
    const lvlBefore = levelAtMatchStartRef.current ?? 1;

    // Esperamos el broadcast 1.2s. Si llegó (lcReward seteado), no pollear.
    // Si no llegó → fallback poll rápido (4× 350ms = 1.4s).
    const fallbackPoll = async () => {
      // Grace period para el broadcast antes de pollear.
      await new Promise<void>((r) => setTimeout(r, 1200));
      if (cancelled || rewardArrivedRef.current) return;
      let attempts = 0;
      const MAX = 4;
      while (!cancelled && !rewardArrivedRef.current && attempts < MAX) {
        attempts++;
        try {
          const u = await apiFetch<{ lunacianCoins: string; xp: number; level: number }>('/users/me');
          if (cancelled) return;
          const delta = Number(u.lunacianCoins) - Number(before);
          const xpDelta = (u.xp ?? 0) - xpBefore;
          // Si los datos del server muestran que el reward ya fue procesado → set state.
          if (delta !== 0 || xpDelta !== 0) {
            setLunacianCoins(u.lunacianCoins);
            setLcReward({ before, after: u.lunacianCoins, delta });
            const newLvl = u.level ?? lvlBefore;
            const leveledUp = newLvl > lvlBefore;
            setXpReward({
              deltaXp: xpDelta,
              newXp: u.xp ?? 0,
              oldLevel: lvlBefore,
              newLevel: newLvl,
              leveledUp,
            });
            setCoinsAnimating(true);
            if (delta > 0) setTimeout(() => sound.play('coinReward'), 350);
            if (leveledUp) setTimeout(() => sound.play('victory'), 700);
            setTimeout(() => setCoinsAnimating(false), 1200);
            try { localStorage.setItem('axie:lc-updated', String(Date.now())); } catch { /* noop */ }
            if (leveledUp) {
              try {
                localStorage.setItem('axie:level-up-pending', JSON.stringify({
                  oldLevel: lvlBefore,
                  newLevel: newLvl,
                  ts: Date.now(),
                }));
              } catch { /* noop */ }
            }
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise<void>((r) => setTimeout(r, 350));
      }
    };
    void fallbackPoll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          // Deploy en defensa = SET face-down (estilo YGO clásico).
          position: action === 'summon-atk' ? 'ATK' : 'DEF_FACEDOWN',
        });
        return;
      }
      // Necesita tributos → abrir tribute UI.
      const monstersOnField = state?.players[mySessionId]?.monsterZones.filter((z) => z.instanceId).length ?? 0;
      if (monstersOnField < requiredTributes) {
        pushToast(
          'error',
          `${def.name} requires Burn ${requiredTributes}`,
          `You need ${requiredTributes} of your own Axie(s) on field. You have ${monstersOnField}. Deploy low-level units first.`,
        );
        log('error', `Burn fail: ${def.name} (L${level}) requires ${requiredTributes} burn(s), have ${monstersOnField} on field`);
        return;
      }
      log('info', `Opening burn panel: ${def.name} (L${level}) requires Burn ${requiredTributes}`);
      setPendingSummon({
        cardInstanceId: card.instanceId,
        cardName: def.name,
        position: action === 'summon-atk' ? 'ATK' : 'DEF_FACEDOWN',
        requiredTributes,
        selectedTributes: [],
      });
    } else if (action === 'set') {
      send('SET_CARD', { cardInstanceId: card.instanceId });
    } else if (action === 'activate') {
      if (def.type === 'Spell' && def.spellSpeed === 1) {
        // Si la card requiere target → abrir spell targeting flow.
        if (def.targetingZones && def.targetingZones.length > 0 && (def.targetingCount ?? 0) > 0) {
          setPendingSpellTarget({
            spellInstanceId: card.instanceId,
            spellName: def.name,
            zones: def.targetingZones,
            count: def.targetingCount ?? 1,
            fromHand: true,
          });
          pushToast('info', `${def.name} requires target`, `Click an Axie (${def.targetingZones.join(', ')})`);
        } else {
          send('ACTIVATE_EFFECT', { cardInstanceId: card.instanceId, targets: [] });
        }
      } else {
        pushToast('info', `${def.name}`, 'Requires Install first (spell speed ≥ 2 or trap).');
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
    // Spell targeting takes priority — never block target selection.
    if (pendingSpellTarget) {
      const allowOwn = pendingSpellTarget.zones.some((z) => z === 'OWN_MONSTER' || z === 'ANY_MONSTER');
      if (allowOwn) {
        pickSpellTarget(card.instanceId);
        return;
      }
      pushToast('error', 'Invalid target', `${pendingSpellTarget.spellName} only targets ${pendingSpellTarget.zones.join(', ')}`);
      return;
    }
    // Cancel attacker if user clicks the same one (or any own monster while one is selected).
    if (selectedAttacker) {
      if (selectedAttacker === card.instanceId) {
        setSelectedAttacker(null);
        log('info', '✖ Attacker deselected');
        return;
      }
      // Switch attacker to a different own monster (only if eligible).
      if (card.position === 'ATK' && !card.hasAttacked && phase === 'BATTLE') {
        setSelectedAttacker(card.instanceId);
        return;
      }
      return;
    }
    // No active selection → open the field menu (lupa + contextual actions).
    setFieldCardMenu({ card, ownedByMe: true });
  }

  function changePosition(cardInstanceId: string) {
    send('CHANGE_POSITION', { cardInstanceId });
    setSelectedMonster(null);
  }

  function toggleBotSpeed() {
    const next: 'normal' | 'fast' = botSpeed === 'normal' ? 'fast' : 'normal';
    setBotSpeed(next);
    if (room) {
      room.send('SET_BOT_SPEED', { speed: next });
      log('system', `Velocidad del bot: ${next === 'fast' ? 'Rápida (sin pausas)' : 'Normal (1.5s entre acciones)'}`);
    }
  }

  function clickMySetCard(card: CardSnapshot) {
    if (!isMyTurn) return;
    if (phase !== 'MAIN_1' && phase !== 'MAIN_2') {
      pushToast('error', 'Wrong phase', 'You can only execute Spells/Traps during Tactical Phase.');
      return;
    }
    const def = catalog[card.cardId];
    if (!def) return;
    if (def.type === 'Trap') {
      pushToast('info', `${def.name} (Trap)`, 'Traps execute automatically when their trigger fires (e.g. when opponent declares an attack).');
      return;
    }
    setSetCardMenu(card);
  }

  function activateSetCard(card: CardSnapshot) {
    const def = catalog[card.cardId];
    setSetCardMenu(null);
    // Si requiere target → abrir spell targeting flow desde el field.
    if (def?.targetingZones && def.targetingZones.length > 0 && (def.targetingCount ?? 0) > 0) {
      setPendingSpellTarget({
        spellInstanceId: card.instanceId,
        spellName: def.name,
        zones: def.targetingZones,
        count: def.targetingCount ?? 1,
        fromHand: false,
      });
      pushToast('info', `${def.name} requiere target`, `Click un monstruo (${def.targetingZones.join(', ')})`);
      return;
    }
    send('ACTIVATE_EFFECT', { cardInstanceId: card.instanceId, targets: [] });
  }

  function pickSpellTarget(monsterInstanceId: string) {
    if (!pendingSpellTarget) return;
    send('ACTIVATE_EFFECT', {
      cardInstanceId: pendingSpellTarget.spellInstanceId,
      targets: [monsterInstanceId],
    });
    setPendingSpellTarget(null);
  }

  function cancelSpellTarget() {
    setPendingSpellTarget(null);
    log('info', '✖ Targeting cancelado');
  }

  function respondToTrapPrompt(trapInstanceId: string | null) {
    if (!room) return;
    room.send('TRAP_RESPONSE', { trapInstanceId });
    setTrapPrompt(null);
    if (trapInstanceId) {
      log('action', `→ Activando trampa contra el ataque del bot`);
    } else {
      log('info', `→ Pasaste — la trampa permanece boca abajo`);
    }
  }

  /** Trigger preview con delay (evita disparar al pasar rápido). PC: 250ms hover. Mobile: 400ms tap-and-hold. */
  function showCardPreview(card: CardSnapshot, delayMs = 250) {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setPreviewCard(card), delayMs);
  }
  function hideCardPreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    setPreviewCard(null);
  }

  function clickOppMonster(card: CardSnapshot) {
    if (pendingSpellTarget) {
      const allowOpp = pendingSpellTarget.zones.some((z) => z === 'OPP_MONSTER' || z === 'ANY_MONSTER');
      if (allowOpp) {
        pickSpellTarget(card.instanceId);
        return;
      }
      pushToast('error', 'Target inválido', `${pendingSpellTarget.spellName} solo target ${pendingSpellTarget.zones.join(', ')}`);
      return;
    }
    if (selectedAttacker) {
      send('DECLARE_ATTACK', { attackerInstanceId: selectedAttacker, targetInstanceId: card.instanceId });
      return;
    }
    // No active selection → field card menu (Inspect lupa).
    if (!card.faceDown) {
      setFieldCardMenu({ card, ownedByMe: false });
    }
  }

  function attackDirect() {
    if (!selectedAttacker) return;
    send('DECLARE_ATTACK', { attackerInstanceId: selectedAttacker, targetInstanceId: 'DIRECT' });
  }

  /** Click on empty opp slot when an attacker is selected → DIRECT attack (only if opp has 0 monsters). */
  function clickOppEmptySlot() {
    if (!selectedAttacker) return;
    if (!opponent) return;
    const oppHasMonsters = opponent.monsterZones.some((z) => z.instanceId);
    if (oppHasMonsters) {
      pushToast('info', 'Direct attack blocked', 'Opponent still has Axies on the field.');
      return;
    }
    attackDirect();
  }

  // RPS pre-match: si no se eligió el orden todavía, mostrar el modal antes de cualquier conexión.
  if (firstPlayerChoice === null) {
    return <RockPaperScissorsIntro onResult={(choice) => setFirstPlayerChoice(choice)} />;
  }

  if (connecting) return <DuelConnectingSplash />;

  if (connectError) {
    return (
      <main className="dashboard">
        <div className="card-section" style={{ background: 'rgba(255,118,118,0.08)' }}>
          <strong style={{ color: '#ff7676' }}>Could not connect to game server.</strong>
          <pre style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.85 }}>
            {connectError}
          </pre>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={() => location.reload()}>
              Retry
            </button>
            <Link href="/dashboard" className="btn-secondary">
              Back to dashboard
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

  /** Mapeo del enum interno (DRAW/STANDBY/MAIN_1/...) a nombre UI moderno (Extraction/Sync/Tactical Phase 1/...). */
  const phaseLabels: Record<string, string> = {
    DRAW: 'Extraction',
    STANDBY: 'Sync',
    MAIN_1: 'Tactical Phase 1',
    MAIN_2: 'Tactical Phase 2',
    BATTLE: 'Combat',
    END: 'Resolution',
  };
  const phaseHints: Record<string, string> = {
    DRAW: 'Extract a card from The Core',
    STANDBY: 'Maintenance triggers',
    MAIN_1: 'Deploy units · Install Spell/Trap · Execute effects',
    BATTLE: 'Declare combat',
    MAIN_2: 'Extra actions · Install Spell/Trap',
    END: 'End of turn',
  };
  const phaseLabel = phaseLabels[phase] ?? phase;

  const isGameOver = state?.status === 'GAME_OVER';
  const won = state?.winnerId === mySessionId;

  return (
    <main className="tcg-page">
      {/* Toolbar slim */}
      <header className="tcg-toolbar">
        <Link href="/dashboard" className="tcg-back">
          ← Exit
        </Link>
        <div className="tcg-status">
          <span><strong>Mode</strong> {state?.mode ?? '—'}</span>
          {activeDeckName ? <span><strong>Deck</strong> {activeDeckName}</span> : null}
          <span><strong>Turn</strong> {state?.turnNumber ?? '—'}</span>
          <span><strong>Phase</strong> {phaseLabel}</span>
          <span className={`tcg-pill ${isMyTurn ? 'your-turn' : 'opp-turn'}`}>
            {isMyTurn ? '⚡ Your Turn' : '⏳ Opponent thinking…'}
          </span>
          {secondsLeft !== null && !isGameOver ? (
            <span
              className={`tcg-turn-timer ${secondsLeft <= 10 ? 'urgent' : ''} ${isMyTurn ? 'mine' : 'opp'}`}
              title={isMyTurn ? 'Time left this turn' : 'Opponent time'}
            >
              ⏱ <strong>{secondsLeft}s</strong>
            </span>
          ) : null}
          <span className={`lc-chip ${coinsAnimating ? 'pulse' : ''}`}>
            🪙 {lunacianCoins} <span className="lc-chip-suffix">Dust</span>
          </span>
          <button
            type="button"
            className="tcg-speed-toggle"
            onClick={toggleBotSpeed}
            title="Cambiar velocidad del bot"
          >
            {botSpeed === 'fast' ? '⚡ Fast' : '⏱ Normal'}
          </button>
        </div>
        <SoundControls />
        <button type="button" className="tcg-surrender" onClick={surrender} disabled={isGameOver}>
          Surrender
        </button>
      </header>

      {/* HUDs como children directos del .tcg-page grid → en mobile grid-area
       * los pone en sidebars; en desktop se ocultan con display:none y los
       * inline en .tcg-side toman protagonismo. */}
      {opponent ? (
        <aside className="tcg-sidebar tcg-sidebar-opponent" aria-label="Opponent info">
          <PlayerHud
            player={opponent}
            variant="opponent"
            catalog={catalog}
            onOpenVoid={() => setVoidViewer({ ownerId: opponent.id, ownerName: opponent.username })}
          />
        </aside>
      ) : null}
      {me ? (
        <aside className="tcg-sidebar tcg-sidebar-me" aria-label="Your info">
          <PlayerHud
            player={me}
            variant="you"
            catalog={catalog}
            profile={meProfile}
            onHelp={() => setShowHelpModal(true)}
            onOpenVoid={() => setVoidViewer({ ownerId: me.id, ownerName: me.username })}
          />
          <div className="tcg-sidebar-extras">
            <span className="tcg-sidebar-dust">✨ {Number(lunacianCoins).toLocaleString()} Dust</span>
          </div>
        </aside>
      ) : null}

      {/* Tablero */}
      <div className="tcg-board">
        {/* Lado oponente */}
        {opponent ? (
          <section className="tcg-side opponent">
            <PlayerHud player={opponent} variant="opponent" catalog={catalog} onOpenVoid={() => setVoidViewer({ ownerId: opponent.id, ownerName: opponent.username })} />
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
                  const isSpellTargetable = !!pendingSpellTarget && !!c.instanceId &&
                    pendingSpellTarget.zones.some((z) => z === 'OPP_MONSTER' || z === 'ANY_MONSTER');
                  const slotFloating = floatingTexts.filter((f) => f.instanceId === c.instanceId);
                  const slotDestruction = destructionEffects.filter((d) => d.instanceId === c.instanceId);
                  const oppHasMonsters = opponent.monsterZones.some((z) => z.instanceId);
                  const isDirectTargetable = !c.instanceId && !!selectedAttacker && !oppHasMonsters;
                  return (
                    <div
                      key={`opp-m-${i}`}
                      data-instance-id={c.instanceId || undefined}
                      className={`tcg-slot ${c.instanceId ? 'has-card' : ''} ${
                        (selectedAttacker || isSpellTargetable) && c.instanceId ? 'targetable' : ''
                      } ${isDirectTargetable ? 'direct-targetable' : ''} ${isSpellTargetable ? 'spell-targetable' : ''} ${isAttackerVFX ? 'vfx-attacker' : ''} ${isDefenderVFX ? 'vfx-defender' : ''} ${isDestroyed ? 'vfx-destroyed' : ''}`}
                      onClick={() => {
                        if (c.instanceId) clickOppMonster(c);
                        else if (isDirectTargetable) clickOppEmptySlot();
                      }}
                    >
                      {c.instanceId ? (
                        <>
                          <Card
                            card={c}
                            catalog={catalog}
                            faceMini
                            onHoverChange={setHoveredCard}
                            onShowPreview={!c.faceDown ? () => showCardPreview(c, 350) : undefined}
                            onHidePreview={!c.faceDown ? () => hideCardPreview() : undefined}
                          />
                          {!c.faceDown ? (
                            <button
                              type="button"
                              className="tcg-slot-lupa"
                              onClick={(e) => { e.stopPropagation(); showCardPreview(c, 0); }}
                              title="Inspect card"
                              aria-label="Inspect card"
                            >
                              🔍
                            </button>
                          ) : null}
                        </>
                      ) : isDirectTargetable ? (
                        <span className="tcg-slot-direct-hint">⚔ Direct</span>
                      ) : (
                        'Axie'
                      )}
                      {slotFloating.map((f) => (
                        <div key={f.id} className={`tcg-floating-text ${f.variant}`}>{f.text}</div>
                      ))}
                      {slotDestruction.map((d) => (
                        <DestructionParticles key={d.id} color={d.color} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="tcg-side opponent"><p style={{ opacity: 0.5 }}>Waiting for opponent…</p></section>
        )}

        {/* Banner central de turno + fase. key={phase + turn} fuerza re-mount → CSS animation
            slide-in dispara cada vez que cambia. Color-coded: jugador=cyan/oro, bot=magenta. */}
        <div className="tcg-divider">
          <div
            key={`${state?.turnNumber ?? 0}-${phase}-${state?.activePlayerId ?? ''}`}
            className={`tcg-phase-banner ${isMyTurn ? 'is-mine' : 'is-opp'}`}
          >
            <div className="tcg-phase-banner-turn">
              {isMyTurn ? '⚡ YOUR TURN' : '🤖 OPPONENT TURN'}
            </div>
            <div className="tcg-phase-banner-name">{phaseLabel}</div>
            <div className="tcg-phase-banner-hint">{phaseHints[phase] ?? '—'}</div>
          </div>
        </div>

        {/* Lado tuyo */}
        {me ? (
          <section className="tcg-side you">
            <PlayerHud player={me} variant="you" catalog={catalog} profile={meProfile} onHelp={() => setShowHelpModal(true)} onOpenVoid={() => setVoidViewer({ ownerId: me.id, ownerName: me.username })} />
            <div className="tcg-zones">
              <div className="tcg-zone-row">
                {me.monsterZones.map((c, i) => {
                  const isTributable = !!pendingSummon && !!c.instanceId;
                  const isTributeSelected = !!pendingSummon && pendingSummon.selectedTributes.includes(c.instanceId);
                  const isAttackerVFX = combatVFX?.attackerInstanceId === c.instanceId;
                  const isDefenderVFX = combatVFX?.defenderInstanceId === c.instanceId;
                  const isDestroyed = (isAttackerVFX && combatVFX?.attackerDestroyed) || (isDefenderVFX && combatVFX?.defenderDestroyed);
                  const isSpellTargetable = !!pendingSpellTarget && !!c.instanceId &&
                    pendingSpellTarget.zones.some((z) => z === 'OWN_MONSTER' || z === 'ANY_MONSTER');
                  const handleClick = () => {
                    if (!c.instanceId) return;
                    if (pendingSummon) {
                      toggleTributeSelection(c.instanceId);
                      return;
                    }
                    clickMyMonster(c);
                  };
                  const slotFloating = floatingTexts.filter((f) => f.instanceId === c.instanceId);
                  const slotDestruction = destructionEffects.filter((d) => d.instanceId === c.instanceId);
                  return (
                    <div
                      key={`me-m-${i}`}
                      data-instance-id={c.instanceId || undefined}
                      className={`tcg-slot ${c.instanceId ? 'has-card' : ''} ${
                        selectedAttacker === c.instanceId || selectedMonster === c.instanceId ? 'selected-monster' : ''
                      } ${isTributable ? 'tributable' : ''} ${isTributeSelected ? 'tribute-selected' : ''} ${isSpellTargetable ? 'spell-targetable' : ''} ${isAttackerVFX ? 'vfx-attacker' : ''} ${isDefenderVFX ? 'vfx-defender' : ''} ${isDestroyed ? 'vfx-destroyed' : ''} ${trapPrompt?.attackInfo?.targetInstanceId === c.instanceId && c.instanceId ? 'incoming-attack-target' : ''}`}
                      onClick={handleClick}
                    >
                      {c.instanceId ? (
                        <>
                          <Card
                            card={c}
                            catalog={catalog}
                            faceMini
                            onHoverChange={setHoveredCard}
                            ownedByMe
                            onShowPreview={() => showCardPreview(c, 350)}
                            onHidePreview={() => hideCardPreview()}
                          />
                          <button
                            type="button"
                            className="tcg-slot-lupa"
                            onClick={(e) => { e.stopPropagation(); showCardPreview(c, 0); }}
                            title="Inspect card"
                            aria-label="Inspect card"
                          >
                            🔍
                          </button>
                        </>
                      ) : 'Axie'}
                      {slotFloating.map((f) => (
                        <div key={f.id} className={`tcg-floating-text ${f.variant}`}>{f.text}</div>
                      ))}
                      {slotDestruction.map((d) => (
                        <DestructionParticles key={d.id} color={d.color} />
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="tcg-zone-row">
                {me.spellTrapZones.map((c, i) => (
                  <div
                    key={`me-st-${i}`}
                    className={`tcg-slot spelltrap ${c.instanceId ? 'has-card' : ''}`}
                    onClick={() => c.instanceId && clickMySetCard(c)}
                  >
                    {c.instanceId ? (
                      <>
                        <Card
                          card={c}
                          catalog={catalog}
                          faceMini
                          onHoverChange={setHoveredCard}
                          ownedByMe
                          onShowPreview={() => showCardPreview(c, 350)}
                          onHidePreview={() => hideCardPreview()}
                        />
                        <button
                          type="button"
                          className="tcg-slot-lupa"
                          onClick={(e) => { e.stopPropagation(); showCardPreview(c, 0); }}
                          title="Inspect card"
                          aria-label="Inspect card"
                        >
                          🔍
                        </button>
                      </>
                    ) : 'S/T'}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* Footer: hand + actions. En mobile la hand-wrap es fixed-bottom con peek, actions floating. */}
      <footer className="tcg-footer">
        <div className={`tcg-hand-wrap ${handExpanded ? 'expanded' : 'peek'}`}>
          <button
            type="button"
            className="tcg-hand-wrap-handle"
            onClick={() => setHandExpanded((p) => !p)}
            aria-label={handExpanded ? 'Hide hand' : 'Show hand'}
          />
          <div className="tcg-hand">
          {me && me.hand.length > 0 ? (
            me.hand.map((c) => {
              const def = catalog[c.cardId];
              const isMonster = def?.type === 'Monster';
              const cardLevel = def?.level ?? 0;
              const requiresTribute = isMonster && cardLevel > 4;
              const playable = isMyTurn && (phase === 'MAIN_1' || phase === 'MAIN_2');
              // CLICK SIEMPRE habilitado en MAIN para Monsters L5+ → abre tribute panel.
              // El visual badge "tributo" indica que se necesitan, pero NO bloquea click.
              const disabled = !playable;
              return (
                <div
                  key={c.instanceId}
                  className={`tcg-hand-card tcg-card ${(def?.type ?? 'monster').toLowerCase()} ${
                    selectedHandCard === c.instanceId ? 'selected' : ''
                  } ${disabled ? 'disabled' : ''} ${requiresTribute ? 'needs-tribute' : ''} ${def?.attribute ? `attr-${def.attribute.toLowerCase()}` : ''}`}
                  onClick={() => !disabled && clickHandCard(c)}
                  onMouseEnter={() => { setHoveredCard(c); showCardPreview(c, 350); }}
                  onMouseLeave={() => { setHoveredCard((curr) => (curr?.instanceId === c.instanceId ? null : curr)); hideCardPreview(); }}
                >
                  <div className="tcg-card-type-tag">{def ? displayType(def.type)[0] : '?'}</div>
                  <div className="tcg-card-name">{def?.name ?? c.cardId.slice(0, 8)}</div>
                  {isMonster && def?.level ? (
                    <div className="tcg-card-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
                  ) : null}
                  <div className="tcg-card-art">
                    {def ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveCardImage({ ...def, id: c.cardId }, def.imageUrl)}
                        alt={def.name}
                        className="tcg-card-art-img"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const fallback = svgForCard({ ...def, id: c.cardId });
                          if (img.src !== fallback) img.src = fallback;
                        }}
                      />
                    ) : '?'}
                  </div>
                  {isMonster && def?.atk !== null && def?.def !== null ? (
                    <div className="tcg-card-stats">
                      <span className="tcg-card-atk">⚔ {def.atk}</span>
                      <span className="tcg-card-def">🛡 {def.def}</span>
                    </div>
                  ) : (
                    <div className="tcg-card-stats" style={{ justifyContent: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.55rem' }}>
                        {def ? displayType(def.type) : '?'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <span className="tcg-hand-empty">(empty cache)</span>
          )}
          </div>
        </div>

        <div className="tcg-actions">
          <button
            className="tcg-btn-primary"
            onClick={endPhase}
            disabled={!isMyTurn || isGameOver}
          >
            {isMyTurn ? `Advance Phase (${phaseLabel} →)` : 'Waiting opponent…'}
          </button>
          {/* Direct attack: only visible if opponent has no monsters and an attacker is selected */}
          {selectedAttacker && phase === 'BATTLE' && opponentMonsterCount === 0 ? (
            <button type="button" className="tcg-btn-attack" onClick={attackDirect}>
              ⚔ Direct attack
            </button>
          ) : null}
          {selectedAttacker ? (
            <button type="button" className="tcg-btn-ghost" onClick={() => setSelectedAttacker(null)}>
              Cancel attacker
            </button>
          ) : null}
          {/* Battle position change ATK ↔ DEF in Tactical Phase */}
          {selectedMonster && (phase === 'MAIN_1' || phase === 'MAIN_2') ? (
            <>
              <button
                type="button"
                className="tcg-btn-attack"
                onClick={() => changePosition(selectedMonster)}
              >
                {(() => {
                  const c = me?.monsterZones.find((z) => z.instanceId === selectedMonster);
                  return c?.position === 'ATK' ? '🛡 Switch to DEF' : '⚔ Switch to ATK';
                })()}
              </button>
              <button type="button" className="tcg-btn-ghost" onClick={() => setSelectedMonster(null)}>
                Cancel
              </button>
            </>
          ) : null}
          {isMyTurn ? (
            <div className="tcg-instruction">
              {phase === 'DRAW' || phase === 'STANDBY'
                ? 'Click "Advance Phase" to reach Tactical Phase.'
                : phase === 'MAIN_1' || phase === 'MAIN_2'
                  ? 'Click a card in your Cache to Deploy/Install · Click an Axie on field to switch position.'
                  : phase === 'BATTLE'
                    ? opponentMonsterCount > 0
                      ? 'Click your Axie in ATK → then click an enemy Axie.'
                      : 'Click your Axie in ATK → "Direct attack" (opponent has no Axies).'
                    : 'Click "Advance Phase" to end your turn.'}
            </div>
          ) : null}
        </div>
      </footer>

      {/* Log flotante — pill-style con icon bubbles + turn dividers */}
      <aside className={`tcg-log-panel ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="tcg-log-header" onClick={() => setLogCollapsed(!logCollapsed)}>
          <span className="tcg-log-header-title">
            <span className="tcg-log-header-dot" />
            Battle Log
            <span className="tcg-log-header-count">{logs.length}</span>
          </span>
          <span className="tcg-log-header-toggle">{logCollapsed ? '◀' : '▶'}</span>
        </div>
        <div className="tcg-log-body" ref={logRef}>
          {logs.map((l, i) => {
            // Detectar TURN_START → render como divider especial.
            const turnMatch = l.msg.match(/^═══ Turn (\d+)/);
            if (turnMatch) {
              return (
                <div key={i} className="tcg-log-turn-divider">
                  <span className="tcg-log-turn-line" />
                  <span className="tcg-log-turn-label">⚔ Turn {turnMatch[1]}</span>
                  <span className="tcg-log-turn-line" />
                </div>
              );
            }
            const icon = logIcon(l.type);
            return (
              <div key={i} className={`tcg-log-entry-pill type-${l.type}`}>
                <span className="tcg-log-entry-icon">{icon}</span>
                <div className="tcg-log-entry-content">
                  {renderLogMessage(l.msg, catalog, (cardId) => {
                    const def = catalog[cardId];
                    if (!def) return;
                    setPreviewCard({
                      instanceId: `log-preview-${cardId}`,
                      cardId,
                      ownerId: '',
                      position: '',
                      faceDown: false,
                      atkMod: 0,
                      defMod: 0,
                      hasAttacked: false,
                      auraAtkBonus: 0,
                      auraDefBonus: 0,
                      affectedByAura: false,
                    });
                  })}
                </div>
              </div>
            );
          })}
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
          onShowPreview={() => showCardPreview(handMenuCard, 0)}
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
              {spellOverlay.ownedByMe ? '⚡ You executed' : '🤖 Opponent executed'}
            </div>
            <div className="tcg-spell-overlay-name">{spellOverlay.name}</div>
            <div className="tcg-spell-overlay-type">{spellOverlay.type}</div>
          </div>
        </div>
      ) : null}

      {/* Massive card preview — overlay full-screen al hover/tap-hold.
          Se cierra cuando el mouse sale de la hand-card (onMouseLeave → hideCardPreview). */}
      {previewCard ? (
        <CardPreviewOverlay card={previewCard} catalog={catalog} onClose={hideCardPreview} />
      ) : null}

      {showHelpModal ? <ClassTriangleHelp onClose={() => setShowHelpModal(false)} /> : null}

      {voidViewer && state ? (
        <VoidContentsModal
          ownerName={voidViewer.ownerName}
          cards={state.players[voidViewer.ownerId]?.graveyard ?? []}
          catalog={catalog}
          onClose={() => setVoidViewer(null)}
          onCardClick={(c) => { setVoidViewer(null); showCardPreview(c, 0); }}
        />
      ) : null}

      {fieldCardMenu ? (
        <FieldCardMenu
          card={fieldCardMenu.card}
          ownedByMe={fieldCardMenu.ownedByMe}
          catalog={catalog}
          phase={phase}
          isMyTurn={isMyTurn}
          onInspect={() => { showCardPreview(fieldCardMenu.card, 0); setFieldCardMenu(null); }}
          onAttack={() => {
            if (fieldCardMenu.card.position === 'ATK' && !fieldCardMenu.card.hasAttacked && phase === 'BATTLE') {
              setSelectedAttacker(fieldCardMenu.card.instanceId);
              log('info', `Attacker selected: ${catalog[fieldCardMenu.card.cardId]?.name ?? fieldCardMenu.card.cardId}. Click an enemy Axie or empty zone for Direct.`);
            }
            setFieldCardMenu(null);
          }}
          onChangePosition={() => { changePosition(fieldCardMenu.card.instanceId); setFieldCardMenu(null); }}
          onClose={() => setFieldCardMenu(null)}
        />
      ) : null}

      {/* Targeting arrow — flecha SVG del attacker/spell al mouse. */}
      {selectedAttacker ? <TargetingArrow attackerInstanceId={selectedAttacker} mousePos={mousePos} variant="attack" /> : null}
      {pendingSpellTarget ? (
        <>
          <TargetingArrow attackerInstanceId={pendingSpellTarget.spellInstanceId} mousePos={mousePos} variant="spell" />
          <div className="tcg-spell-target-prompt">
            <span>✨ <strong>{pendingSpellTarget.spellName}</strong> — Click a valid Axie ({pendingSpellTarget.zones.join(', ')})</span>
            <button type="button" onClick={cancelSpellTarget}>Cancel (Esc)</button>
          </div>
        </>
      ) : null}

      {/* Visual: arrow del attacker bot al target del user durante el prompt pre-attack */}
      {trapPrompt?.phase === 'pre-attack' && trapPrompt.attackInfo ? (
        <IncomingAttackArrow
          attackerInstanceId={trapPrompt.attackInfo.attackerInstanceId}
          targetInstanceId={trapPrompt.attackInfo.targetInstanceId}
        />
      ) : null}

      {/* Trap response prompt — pre-attack: bot atacando, post-combat: tu monster destruyó enemigo */}
      {trapPrompt ? (
        <div className="tcg-trap-prompt-backdrop">
          <div className="tcg-trap-prompt">
            <div className="tcg-trap-prompt-header">
              {trapPrompt.phase === 'post-combat'
                ? '🔥 Your Axie destroyed an enemy'
                : '⚔ Opponent declared a Combat attack'}
            </div>
            {trapPrompt.phase === 'pre-attack' && trapPrompt.attackInfo ? (
              <div className="tcg-trap-prompt-attack-info">
                <span className="tcg-trap-prompt-attacker">🤖 {trapPrompt.attackInfo.attackerName}</span>
                <span className="tcg-trap-prompt-arrow">⟶</span>
                {trapPrompt.attackInfo.targetInstanceId === 'DIRECT' ? (
                  <span className="tcg-trap-prompt-target direct">⚠ YOU directly</span>
                ) : (
                  <span className="tcg-trap-prompt-target">🎯 {trapPrompt.attackInfo.targetName ?? 'your Axie'}</span>
                )}
              </div>
            ) : null}
            <div className="tcg-trap-prompt-body">
              {trapPrompt.phase === 'post-combat'
                ? 'Execute a Trap to deal extra damage?'
                : 'Execute one of your Installed Traps?'}
            </div>
            <div className="tcg-trap-prompt-list">
              {trapPrompt.traps.map((t) => (
                <button
                  key={t.instanceId}
                  type="button"
                  className="tcg-trap-prompt-card"
                  onClick={() => respondToTrapPrompt(t.instanceId)}
                  title={t.description}
                >
                  <div className="tcg-trap-prompt-card-name">✦ Execute {t.name}</div>
                  <div className="tcg-trap-prompt-card-desc">{t.description}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tcg-trap-prompt-pass"
              onClick={() => respondToTrapPrompt(null)}
            >
              Pass (don't execute)
            </button>
            <div className="tcg-trap-prompt-timeout">
              Auto-pass in {Math.ceil(trapPrompt.timeoutMs / 1000)}s if no response
            </div>
          </div>
        </div>
      ) : null}

      {/* Set Spell activate menu */}
      {setCardMenu ? (
        <>
          <div className="tcg-menu-backdrop" onClick={() => setSetCardMenu(null)} />
          <div className="tcg-handmenu">
            <div className="tcg-handmenu-header">
              <strong>{catalog[setCardMenu.cardId]?.name ?? setCardMenu.cardId}</strong>
              <button className="tcg-handmenu-close" onClick={() => setSetCardMenu(null)} type="button">✕</button>
            </div>
            <div className="tcg-handmenu-actions">
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => activateSetCard(setCardMenu)}
              >
                ✦ Execute now
              </button>
            </div>
            {catalog[setCardMenu.cardId]?.description ? (
              <p className="tcg-handmenu-desc">{catalog[setCardMenu.cardId]?.description}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Burn (tribute) selection panel */}
      {pendingSummon ? (
        <div className="tcg-tribute-panel">
          <div className="tcg-tribute-header">
            <strong>{pendingSummon.cardName}</strong>
            <span>requires Burn {pendingSummon.requiredTributes}</span>
          </div>
          <div className="tcg-tribute-progress">
            Selected: {pendingSummon.selectedTributes.length} / {pendingSummon.requiredTributes}
          </div>
          <div className="tcg-tribute-hint">
            Click your own Axie on field to Burn it. Click again to deselect.
          </div>
          <div className="tcg-tribute-actions">
            <button
              type="button"
              className="tcg-btn-primary"
              disabled={pendingSummon.selectedTributes.length !== pendingSummon.requiredTributes}
              onClick={confirmTributeSummon}
            >
              ⚡ Deploy ({pendingSummon.position})
            </button>
            <button type="button" className="tcg-btn-ghost" onClick={() => setPendingSummon(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Game over overlay */}
      {isGameOver ? (
        <div className={`tcg-gameover ${won ? 'is-victory' : state.winnerId ? 'is-defeat' : 'is-draw'}`}>
          {won ? (
            <div className="tcg-gameover-confetti" aria-hidden="true">
              {Array.from({ length: 40 }).map((_, i) => (
                <span
                  key={i}
                  className="tcg-confetti-piece"
                  style={{
                    left: `${(i * 2.5) % 100}%`,
                    animationDelay: `${(i % 10) * 0.12}s`,
                    background: ['#34d399','#fbbf24','#22d3ee','#f472b6','#c084fc','#fb923c'][i % 6],
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className={`tcg-gameover-card ${won ? 'victory' : state.winnerId ? 'defeat' : 'draw'}`}>
            <div className="tcg-gameover-emoji" aria-hidden="true">
              {won ? '🏆' : state.winnerId ? '💔' : '🤝'}
            </div>
            <div className={`tcg-gameover-title ${won ? '' : 'lose'}`}>
              {won ? 'VICTORY!' : state.winnerId ? 'DEFEATED' : 'DRAW'}
            </div>
            <p className="tcg-gameover-sub">
              {won ? '¡Felicitaciones, comandante!' : state.winnerId ? 'Volvé al campo y revertí el resultado.' : 'Ambos sobrevivieron.'}
            </p>
            <p className="tcg-gameover-reason">
              Reason: <strong>{state.winReason}</strong>
            </p>
            <div className="tcg-gameover-rewards">
              {lcReward ? (
                <div className={`tcg-gameover-reward dust ${lcReward.delta >= 0 ? 'positive' : 'negative'}`}>
                  <div className="tcg-gameover-reward-icon" aria-hidden="true">✨</div>
                  <div className="tcg-gameover-reward-body">
                    <div className="tcg-gameover-reward-label">DUST EARNED</div>
                    <div className="tcg-gameover-reward-value">
                      <span className="tcg-gameover-reward-sign">{lcReward.delta >= 0 ? '+' : ''}</span>
                      <AnimatedNumber to={Math.abs(lcReward.delta)} />
                    </div>
                    <div className="tcg-gameover-reward-balance">
                      Total: <strong>{Number(lcReward.after).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="tcg-gameover-reward dust pending">
                  <div className="tcg-gameover-reward-icon" aria-hidden="true">✨</div>
                  <div className="tcg-gameover-reward-body">
                    <div className="tcg-gameover-reward-label">DUST</div>
                    <div className="tcg-gameover-reward-value">
                      <span className="tcg-gameover-reward-spin">⋯</span>
                    </div>
                  </div>
                </div>
              )}
              {xpReward ? (
                <div className={`tcg-gameover-reward xp ${xpReward.deltaXp >= 0 ? 'positive' : 'negative'}`}>
                  <div className="tcg-gameover-reward-icon" aria-hidden="true">⭐</div>
                  <div className="tcg-gameover-reward-body">
                    <div className="tcg-gameover-reward-label">XP EARNED</div>
                    <div className="tcg-gameover-reward-value">
                      <span className="tcg-gameover-reward-sign">{xpReward.deltaXp >= 0 ? '+' : ''}</span>
                      <AnimatedNumber to={Math.abs(xpReward.deltaXp)} />
                    </div>
                    {xpReward.leveledUp ? (
                      <div className="tcg-gameover-levelup">
                        🎉 LEVEL UP! <strong>{xpReward.oldLevel} → {xpReward.newLevel}</strong>
                      </div>
                    ) : (
                      <div className="tcg-gameover-reward-balance">
                        Level <strong>{xpReward.newLevel}</strong> · {xpReward.newXp.toLocaleString()} XP
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="tcg-gameover-reward xp pending">
                  <div className="tcg-gameover-reward-icon" aria-hidden="true">⭐</div>
                  <div className="tcg-gameover-reward-body">
                    <div className="tcg-gameover-reward-label">XP</div>
                    <div className="tcg-gameover-reward-value">
                      <span className="tcg-gameover-reward-spin">⋯</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Link href="/dashboard" className="tcg-gameover-cta">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

/** Roll-up counter: anima de 0 → `to` con easeOut en `duration` ms via RAF.
 * Si `to` cambia mid-animation, reinicia desde el valor actual hacia el nuevo target. */
function AnimatedNumber({ to, duration = 900 }: { to: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{value.toLocaleString()}</>;
}

function PlayerHud({ player, variant, catalog, profile, onHelp, onOpenVoid }: { player: PlayerSnapshot; variant: 'you' | 'opponent'; catalog?: CardCatalog; profile?: { displayName: string | null; avatarUrl: string | null; username: string }; onHelp?: () => void; onOpenVoid?: () => void }) {
  const lpPct = Math.max(0, Math.min(100, (player.lifePoints / 8000) * 100));
  const low = player.lifePoints < 2000;
  const stackDepth = Math.min(4, Math.max(1, Math.ceil(player.deckSize / 10)));
  const voidStackDepth = Math.min(4, Math.max(1, Math.ceil(player.graveyard.length / 4)));
  const topVoidCard = player.graveyard[player.graveyard.length - 1];
  const topVoidDef = topVoidCard && catalog ? catalog[topVoidCard.cardId] : undefined;
  const topVoidImg = topVoidDef && topVoidCard ? svgForCard({ ...topVoidDef, id: topVoidCard.cardId }) : null;
  return (
    <div className={`tcg-hud-wrap ${variant}`}>
      <div className={`tcg-hud ${variant}`}>
        <div className="tcg-hud-name">
          {variant === 'you' && profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="tcg-hud-avatar"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Google bloquea hotlinks cross-origin con 403 — ocultar img.
                // El fallback sibling no se mostrará, pero al menos no se ve un broken icon.
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : variant === 'you' ? (
            <span className="tcg-hud-avatar-fallback">
              {(profile?.displayName ?? profile?.username ?? player.username)[0]?.toUpperCase() ?? '?'}
            </span>
          ) : (
            <span className="tcg-hud-avatar-fallback opp">🤖</span>
          )}
          <span className="tcg-hud-name-text">
            {variant === 'you'
              ? (profile?.displayName ?? profile?.username ?? player.username)
              : player.username}
          </span>
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
            <span className="tcg-hud-stat-label">Cache</span>
          </div>
          <button
            type="button"
            className="tcg-hud-stat tcg-hud-stat-button"
            onClick={onOpenVoid}
            disabled={player.graveyard.length === 0 || !onOpenVoid}
            title={player.graveyard.length > 0 ? 'View The Void' : 'The Void is empty'}
          >
            <span className="tcg-hud-stat-value">{player.graveyard.length}</span>
            <span className="tcg-hud-stat-label">🪦 Void</span>
          </button>
        </div>
      </div>
      <div className={`tcg-deckstack ${variant}`} title={`${player.deckSize} cards in The Core`}>
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
      <button
        type="button"
        className={`tcg-voidstack ${variant} ${player.graveyard.length === 0 ? 'empty' : ''}`}
        onClick={onOpenVoid}
        disabled={player.graveyard.length === 0 || !onOpenVoid}
        title={player.graveyard.length > 0 ? `🪦 The Void (${player.graveyard.length}) — click to view` : '🪦 The Void — empty'}
        aria-label={`View The Void (${player.graveyard.length} cards)`}
      >
        {Array.from({ length: voidStackDepth }).map((_, i) => (
          <div
            key={i}
            className="tcg-voidcard"
            style={{
              transform: `translate(${i * -2}px, ${i * -2}px)`,
              zIndex: voidStackDepth - i,
            }}
          />
        ))}
        {topVoidImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={topVoidImg} alt="" className="tcg-voidcard-top" />
        ) : null}
        <div className="tcg-voidstack-count">{player.graveyard.length}</div>
        <div className="tcg-voidstack-label">🪦 Void</div>
      </button>
      {variant === 'you' && onHelp ? (
        <button
          type="button"
          className="tcg-help-button"
          onClick={onHelp}
          title="Class Triangle help"
          aria-label="Open class triangle help"
        >
          ?
        </button>
      ) : null}
    </div>
  );
}

/**
 * Card — wrapped with React.memo para evitar re-renders cuando los props no cambian.
 * Optimización clave: durante combat/hover/state changes, los slot wrappers re-render
 * pero las cards individuales solo re-renderean si SU card snapshot cambia.
 * Reduce CPU significativamente cuando hay muchas cards en pantalla (mano + 10 zonas).
 */
const Card = memo(function CardImpl({
  card,
  catalog,
  faceDown,
  faceMini,
  onHoverChange,
  onShowPreview,
  onHidePreview,
  ownedByMe,
}: {
  card: CardSnapshot;
  catalog: CardCatalog;
  faceDown?: boolean;
  faceMini?: boolean;
  onHoverChange?: (card: CardSnapshot | null) => void;
  /** Mobile-friendly: touch start invoca preview big-overlay. Si no se pasa, no hay preview en touch. */
  onShowPreview?: () => void;
  onHidePreview?: () => void;
  ownedByMe?: boolean;
}) {
  const def = catalog[card.cardId];
  const showFaceDown = faceDown || card.faceDown;
  const type = (def?.type ?? 'Monster').toLowerCase();
  const isMonster = def?.type === 'Monster';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isSpellOrTrap = def?.type === 'Spell' || def?.type === 'Trap';
  const attacked = card.hasAttacked;
  const isDef = card.position === 'DEF';

  if (showFaceDown) {
    // CARTAS DEL OPONENTE (face-down): back pattern uniforme premium.
    if (!ownedByMe) {
      return (
        <div className="tcg-card face-down">
          <div className="tcg-card-facedown-brand">Axie Duel</div>
          <div className="tcg-card-facedown-tag">Lunacia</div>
        </div>
      );
    }
    // MIS CARTAS SET (face-down): muestro la cara REAL con tinte oscuro + sello "SET" para
    // que SIEMPRE sepa qué seteé sin tener que hover. Color claro entre Spell/Trap/Monster.
    return (
      <div
        className={`tcg-card ${type} ${isDef ? 'def-position' : ''} ${def?.attribute ? `attr-${def.attribute.toLowerCase()}` : ''} mine-set`}
        onMouseEnter={() => onHoverChange?.(card)}
        onMouseLeave={() => onHoverChange?.(null)}
        onTouchStart={() => onShowPreview?.()}
        onTouchEnd={() => onHidePreview?.()}
        onTouchCancel={() => onHidePreview?.()}
      >
        {isMonster && def ? (
          <div className="tcg-card-stat-overlay" aria-hidden="true">
            {def.level ? (
              <div className="tcg-card-stat-overlay-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
            ) : null}
            <div className="tcg-card-stat-overlay-stats">
              <span className="atk">{(def.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</span>
              <span className="sep">/</span>
              <span className="def">{(def.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</span>
            </div>
          </div>
        ) : null}
        <div className="tcg-card-set-stamp">SET</div>
        <div className="tcg-card-type-tag">{def ? displayType(def.type)[0] : '?'}</div>
        <div className="tcg-card-name">{def?.name ?? card.cardId.slice(0, 8)}</div>
        <div className="tcg-card-art">
          {def ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveCardImage({ ...def, id: card.cardId }, def.imageUrl)}
              alt={def.name}
              className="tcg-card-art-img"
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = svgForCard({ ...def, id: card.cardId });
                if (img.src !== fallback) img.src = fallback;
              }}
            />
          ) : '?'}
        </div>
        {isMonster ? (
          <div className="tcg-card-stats">
            <span className="tcg-card-atk">⚔ {(def?.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</span>
            <span className="tcg-card-def">🛡 {(def?.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // Indicador visual: la carta está bajo CUALQUIER modificador (atkMod/defMod directo o aura).
  const totalAtkDelta = card.atkMod + (card.auraAtkBonus ?? 0);
  const totalDefDelta = card.defMod + (card.auraDefBonus ?? 0);
  const isAffected = isMonster && (card.affectedByAura || totalAtkDelta !== 0 || totalDefDelta !== 0);
  const affectedTooltipParts: string[] = [];
  if (totalAtkDelta !== 0) affectedTooltipParts.push(`${totalAtkDelta > 0 ? '+' : ''}${totalAtkDelta} ATK`);
  if (totalDefDelta !== 0) affectedTooltipParts.push(`${totalDefDelta > 0 ? '+' : ''}${totalDefDelta} DEF`);
  const affectedTooltip = affectedTooltipParts.length > 0
    ? `Affected by an effect: ${affectedTooltipParts.join(' · ')}`
    : 'Affected by an effect';

  return (
    <div
      className={`tcg-card ${type} ${attacked ? 'attacked' : ''} ${isDef ? 'def-position' : ''} ${def?.attribute ? `attr-${def.attribute.toLowerCase()}` : ''} ${isAffected ? 'is-affected' : ''}`}
      onMouseEnter={() => onHoverChange?.(card)}
      onMouseLeave={() => onHoverChange?.(null)}
      onTouchStart={() => onShowPreview?.()}
      onTouchEnd={() => onHidePreview?.()}
      onTouchCancel={() => onHidePreview?.()}
    >
      {isMonster && def ? (
        <div className="tcg-card-stat-overlay" aria-hidden="true">
          {def.level ? (
            <div className="tcg-card-stat-overlay-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
          ) : null}
          <div className="tcg-card-stat-overlay-stats">
            <span className="atk">{(def.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</span>
            <span className="sep">/</span>
            <span className="def">{(def.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</span>
          </div>
        </div>
      ) : null}
      <div className="tcg-card-type-tag">{def ? displayType(def.type)[0] : '?'}</div>
      {card.position ? <div className="tcg-card-pos">{card.position}</div> : null}
      {isAffected ? (
        <div className={`tcg-card-affected ${totalAtkDelta < 0 || totalDefDelta < 0 ? 'debuff' : 'buff'}`} title={affectedTooltip}>
          💧
        </div>
      ) : null}
      <div className="tcg-card-name">{def?.name ?? card.cardId.slice(0, 8)}</div>
      {isMonster && def?.level ? (
        <div className="tcg-card-stars">{'★'.repeat(Math.min(def.level, 8))}</div>
      ) : null}
      <div className="tcg-card-art">
        {def ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveCardImage({ ...def, id: card.cardId }, def.imageUrl)}
            alt={def.name}
            className="tcg-card-art-img"
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget;
              const fallback = svgForCard({ ...def, id: card.cardId });
              if (img.src !== fallback) img.src = fallback;
            }}
          />
        ) : isMonster ? '🐾' : '?'}
      </div>
      {isMonster ? (
        <div className="tcg-card-stats">
          <span className={`tcg-card-atk ${totalAtkDelta > 0 ? 'buffed' : totalAtkDelta < 0 ? 'debuffed' : ''}`}>
            ⚔ {(def?.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}
          </span>
          <span className={`tcg-card-def ${totalDefDelta > 0 ? 'buffed' : totalDefDelta < 0 ? 'debuffed' : ''}`}>
            🛡 {(def?.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}
          </span>
        </div>
      ) : null}
    </div>
  );
});

/**
 * Genera un SVG data URL temático por clase Axie. Usado como fallback cuando el CDN
 * oficial de Axie bloquea hotlinks (devuelve 403 desde browser sin auth).
 * Inline data URL → no depende de CDN externo, siempre carga.
 */
// placeholderSvgFor extraído a apps/web/src/lib/cardArt.ts (importado abajo).

/**
 * Parsea el msg del log buscando nombres de cards del catalog. Los wrappea en spans
 * clickables que disparan el preview overlay con esa carta.
 *
 * Match: nombres del catalog ordenados por longitud descendente (para que "Olek, the
 * Verdant Guardian" matchee antes que "Olek").
 */
function renderLogMessage(msg: string, catalog: CardCatalog, onCardClick: (cardId: string) => void): ReactNode {
  const entries = Object.entries(catalog).sort((a, b) => b[1].name.length - a[1].name.length);
  if (entries.length === 0) return msg;
  // Build regex de todos los nombres (escapados). Captura group por nombre.
  const pattern = entries.map(([, def]) => def.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${pattern})`, 'g');
  const parts = msg.split(re);
  const nameToId = new Map(entries.map(([id, def]) => [def.name, id]));
  return parts.map((part, idx) => {
    const cardId = nameToId.get(part);
    if (cardId) {
      return (
        <button
          key={idx}
          type="button"
          className="log-card-link"
          onClick={() => onCardClick(cardId)}
          title={`Click para ver ${part}`}
        >
          {part}
        </button>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

/* Map de códigos de error del server a títulos legibles para toasts. */
function friendlyErrorTitle(code: string): string {
  const map: Record<string, string> = {
    NOT_YOUR_TURN: 'Not your turn',
    WRONG_PHASE: 'Wrong phase',
    ALREADY_NORMAL_SUMMONED: 'Already deployed this turn',
    ZONE_FULL: 'Zone is full',
    NEEDS_TRIBUTES: 'Burn cost not met',
    CARD_NOT_IN_HAND: 'Card not found',
    TARGET_INVALID: 'Invalid target',
    CANT_ATTACK_FIRST_TURN: "Can't attack on first turn",
    ALREADY_ATTACKED: 'This unit already attacked',
    CONDITION_NOT_MET: 'Condition not met',
    EFFECT_NOT_IMPLEMENTED: 'Effect not implemented yet',
    INTERNAL_ERROR: 'Server error',
  };
  return map[code] ?? code;
}

/**
 * Flecha SVG visual del attacker (slot DOM) al cursor del mouse. Pointer-events: none
 * para no interferir clicks del usuario. Se actualiza con el state `mousePos` global.
 */
/**
 * IncomingAttackArrow — flecha visual roja del bot's attacker al user's target durante
 * el TRAP_RESPONSE_PROMPT pre-attack. Si target='DIRECT', apunta al PlayerHud del user.
 * Re-busca los slots cada 100ms (los anchors no cambian durante el prompt; basta con
 * 1 cálculo inicial + un re-fetch al montar para asegurar DOM listo).
 */
function IncomingAttackArrow({
  attackerInstanceId,
  targetInstanceId,
}: {
  attackerInstanceId: string;
  targetInstanceId: string | 'DIRECT';
}) {
  const [coords, setCoords] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  useEffect(() => {
    function compute() {
      const fromEl = document.querySelector<HTMLElement>(`[data-instance-id="${attackerInstanceId}"]`);
      let toEl: HTMLElement | null = null;
      if (targetInstanceId === 'DIRECT') {
        // Apuntar al PlayerHud del user (variant="you").
        toEl = document.querySelector<HTMLElement>('.tcg-hud-wrap:not(.opponent) .tcg-hud');
      } else {
        toEl = document.querySelector<HTMLElement>(`[data-instance-id="${targetInstanceId}"]`);
      }
      if (!fromEl || !toEl) return;
      const fromR = fromEl.getBoundingClientRect();
      const toR = toEl.getBoundingClientRect();
      setCoords({
        from: { x: fromR.left + fromR.width / 2, y: fromR.top + fromR.height / 2 },
        to: { x: toR.left + toR.width / 2, y: toR.top + toR.height / 2 },
      });
    }
    compute();
    // Re-compute al cambiar tamaño/scroll, por si algo se mueve.
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [attackerInstanceId, targetInstanceId]);

  if (!coords) return null;
  const isDirect = targetInstanceId === 'DIRECT';
  return (
    <svg className="tcg-incoming-attack-arrow" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tcg-incoming-arrow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff3b3b" stopOpacity="0.95" />
          <stop offset="100%" stopColor={isDirect ? '#ffd23f' : '#ff6b9d'} stopOpacity="1" />
        </linearGradient>
        <marker id="tcg-incoming-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={isDirect ? '#ffd23f' : '#ff6b9d'} />
        </marker>
      </defs>
      {/* Glow halo */}
      <line x1={coords.from.x} y1={coords.from.y} x2={coords.to.x} y2={coords.to.y}
        stroke="url(#tcg-incoming-arrow-grad)" strokeWidth="20" strokeLinecap="round" opacity="0.25" />
      {/* Línea sólida con arrowhead */}
      <line x1={coords.from.x} y1={coords.from.y} x2={coords.to.x} y2={coords.to.y}
        stroke="url(#tcg-incoming-arrow-grad)" strokeWidth="6" strokeLinecap="round"
        markerEnd="url(#tcg-incoming-arrowhead)" />
    </svg>
  );
}

function TargetingArrow({
  attackerInstanceId,
  mousePos,
  variant = 'attack',
}: {
  attackerInstanceId: string;
  mousePos: { x: number; y: number };
  variant?: 'attack' | 'spell';
}) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // Para attack: buscar el slot selected-monster. Para spell: buscar la card en mano o field con instanceId.
    let slotEl: HTMLElement | null = null;
    if (variant === 'attack') {
      slotEl = document.querySelector<HTMLElement>(`.tcg-slot.selected-monster`);
    } else {
      // Spell: buscar la card por instanceId — está o en hand o en spell/trap zone.
      // Más fácil: usar el centro inferior del viewport como origen visual del spell.
      const cards = document.querySelectorAll<HTMLElement>('.tcg-hand-card, .tcg-slot.spelltrap.has-card');
      for (const el of Array.from(cards)) {
        // No tenemos el instanceId en el DOM; aproximamos buscando una hand-card seleccionada o usamos el centro del footer.
        if (el.classList.contains('selected')) {
          slotEl = el;
          break;
        }
      }
    }
    if (!slotEl) {
      // Fallback: centro inferior del viewport
      setOrigin({ x: window.innerWidth / 2, y: window.innerHeight - 150 });
      return;
    }
    const r = slotEl.getBoundingClientRect();
    setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }, [attackerInstanceId, mousePos.x, mousePos.y, variant]);
  if (!origin) return null;
  const isSpell = variant === 'spell';
  const colorStart = isSpell ? '#4dd6c8' : '#FFD23F';
  const colorEnd = isSpell ? '#a569ff' : '#FF6B9D';
  // Dibuja línea + arrowhead amarillo→rosa hasta el cursor
  const dx = mousePos.x - origin.x;
  const dy = mousePos.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 20) return null; // muy cerca, no dibujar
  const gradId = `tcg-arrow-grad-${variant}`;
  const arrowheadId = `tcg-arrowhead-${variant}`;
  return (
    <svg className={`tcg-targeting-arrow tcg-targeting-arrow-${variant}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colorStart} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colorEnd} stopOpacity="0.95" />
        </linearGradient>
        <marker id={arrowheadId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={colorEnd} />
        </marker>
      </defs>
      <line x1={origin.x} y1={origin.y} x2={mousePos.x} y2={mousePos.y}
        stroke={`url(#${gradId})`} strokeWidth="14" strokeLinecap="round" opacity="0.35" />
      <line x1={origin.x} y1={origin.y} x2={mousePos.x} y2={mousePos.y}
        stroke={`url(#${gradId})`} strokeWidth="5" strokeLinecap="round"
        strokeDasharray="14 8" markerEnd={`url(#${arrowheadId})`} />
      <circle cx={origin.x} cy={origin.y} r="10" fill={colorStart} opacity="0.85" />
      <circle cx={origin.x} cy={origin.y} r="5" fill="#fff" />
    </svg>
  );
}

/**
 * Overlay full-screen con la carta en gigante. Para hover/tap-and-hold sobre cartas en mano.
 * Position fixed top-left con backdrop blur. Carta centrada ocupando ~70vh.
 */
function CardPreviewOverlay({ card, catalog, onClose }: { card: CardSnapshot; catalog: CardCatalog; onClose: () => void }) {
  const def = catalog[card.cardId];
  // Close on Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!def) return null;
  const isMonster = def.type === 'Monster';
  const tributesNeeded = isMonster ? ((def.level ?? 0) <= 4 ? 0 : (def.level ?? 0) <= 6 ? 1 : 2) : 0;
  const type = def.type.toLowerCase();
  const attrClass = def.attribute ? `attr-${def.attribute.toLowerCase()}` : '';
  return (
    <div className="tcg-preview-overlay" onClick={onClose}>
      <button
        type="button"
        className="tcg-preview-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close (Esc)"
        aria-label="Close preview"
      >
        ✕
      </button>
      <div className={`tcg-preview-card tcg-card ${type} ${attrClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="tcg-preview-header">
          <span className={`tcg-preview-rarity rarity-${def.rarity?.toLowerCase() ?? 'common'}`}>
            {def.rarity ?? 'Common'}
          </span>
          <span className="tcg-preview-typetag">{displayType(def.type)}{def.subType ? ` · ${def.subType}` : ''}</span>
        </div>
        <div className="tcg-preview-art">
          {def ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveCardImage({ ...def, id: card.cardId }, def.imageUrl)}
              alt={def.name}
              className="tcg-preview-art-img"
              onError={(e) => {
                const img = e.currentTarget;
                const fallback = svgForCard({ ...def, id: card.cardId });
                if (img.src !== fallback) img.src = fallback;
              }}
            />
          ) : (
            <span className="tcg-preview-art-emoji">?</span>
          )}
        </div>
        <div className="tcg-preview-info">
          <h2 className="tcg-preview-name">{def.name}</h2>
          {isMonster && def.level ? (
            <div className="tcg-preview-stars">
              {'★'.repeat(Math.min(def.level, 8))} <span className="tcg-preview-level">L{def.level}</span>
            </div>
          ) : null}
          {def.attribute ? <div className="tcg-preview-attr">{def.attribute}</div> : null}
          {isMonster ? (
            <div className="tcg-preview-statgrid">
              <div><span>ATK</span><strong>{(def.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</strong></div>
              <div><span>DEF</span><strong>{(def.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</strong></div>
              <div><span>Burns</span><strong>{tributesNeeded}</strong></div>
            </div>
          ) : null}
          {def.spellSpeed ? (
            <div className="tcg-preview-row">
              <span>Spell Speed</span><strong>{def.spellSpeed}</strong>
            </div>
          ) : null}
          {def.description ? <p className="tcg-preview-desc">{def.description}</p> : null}
          {def.effectDescription && def.effectDescription !== def.description ? (
            <div className="tcg-preview-effect">
              <strong>Effect ({def.effectKind ?? '—'}):</strong> {def.effectDescription}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
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
        <span className="tcg-tooltip-typetag">{displayType(def.type)}{def.subType ? ` · ${def.subType}` : ''}</span>
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
          <div><span>ATK</span><strong>{(def.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</strong></div>
          <div><span>DEF</span><strong>{(def.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</strong></div>
          <div><span>Burns</span><strong>{tributesNeeded}</strong></div>
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
          <strong>Effect ({def.effectKind ?? '—'}):</strong> {def.effectDescription}
        </div>
      ) : null}
      <div className="tcg-tooltip-foot">
        Position: {card.position || '—'}
        {card.faceDown ? ' · Face-down' : ''}
        {card.hasAttacked ? ' · Already attacked' : ''}
      </div>
    </div>
  );
}

/* Submenu contextual sobre la mano cuando hacés click en una carta. */
function HandActionMenu({
  card,
  catalog,
  onAction,
  onShowPreview,
  onClose,
}: {
  card: CardSnapshot;
  catalog: CardCatalog;
  onAction: (action: 'summon-atk' | 'summon-def' | 'set' | 'activate') => void;
  onShowPreview: () => void;
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
          <button
            type="button"
            className="tcg-handmenu-btn tcg-handmenu-btn-view"
            onClick={() => { onShowPreview(); onClose(); }}
          >
            🔍 View close-up
          </button>
          {isMonster ? (
            <>
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => onAction('summon-atk')}
              >
                ⚔ Normal Summon (ATK mode)
              </button>
              <button
                type="button"
                className="tcg-handmenu-btn"
                onClick={() => onAction('summon-def')}
              >
                🛡 Set (DEF mode)
              </button>
              {tooHighLevel ? (
                <div className="tcg-handmenu-hint">
                  Requires Burn {(def.level ?? 0) <= 6 ? 1 : 2} — click Deploy to select your sacrifice(s).
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
                ⌬ Set S/T (face-down)
              </button>
              {isQuickSpell ? (
                <button
                  type="button"
                  className="tcg-handmenu-btn"
                  onClick={() => onAction('activate')}
                >
                  ✦ Activate now
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

/* FieldCardMenu — popover para una carta en el campo: lupa + acciones contextuales. */
function FieldCardMenu({
  card,
  ownedByMe,
  catalog,
  phase,
  isMyTurn,
  onInspect,
  onAttack,
  onChangePosition,
  onClose,
}: {
  card: CardSnapshot;
  ownedByMe: boolean;
  catalog: CardCatalog;
  phase: string;
  isMyTurn: boolean;
  onInspect: () => void;
  onAttack: () => void;
  onChangePosition: () => void;
  onClose: () => void;
}) {
  const def = catalog[card.cardId];
  if (!def) return null;
  const isMonster = def.type === 'Monster';
  const canAttack = ownedByMe && isMyTurn && phase === 'BATTLE' && card.position === 'ATK' && !card.hasAttacked && isMonster;
  const canChangePos = ownedByMe && isMyTurn && (phase === 'MAIN_1' || phase === 'MAIN_2') && isMonster;
  return (
    <>
      <div className="tcg-menu-backdrop" onClick={onClose} />
      <div className="tcg-handmenu">
        <div className="tcg-handmenu-header">
          <strong>{def.name}</strong>
          <button className="tcg-handmenu-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="tcg-handmenu-actions">
          <button type="button" className="tcg-handmenu-btn tcg-handmenu-btn-inspect" onClick={onInspect}>
            🔍 Inspect (large preview)
          </button>
          {canAttack ? (
            <button type="button" className="tcg-handmenu-btn" onClick={onAttack}>
              ⚔ Select as attacker
            </button>
          ) : null}
          {canChangePos ? (
            <button type="button" className="tcg-handmenu-btn" onClick={onChangePosition}>
              🔄 Switch to {card.position === 'ATK' ? 'DEF' : 'ATK'}
            </button>
          ) : null}
        </div>
        {isMonster ? (
          <div className="tcg-handmenu-stats">
            <span>ATK <strong>{(def.atk ?? 0) + card.atkMod + (card.auraAtkBonus ?? 0)}</strong></span>
            <span>DEF <strong>{(def.def ?? 0) + card.defMod + (card.auraDefBonus ?? 0)}</strong></span>
            <span>{card.position}</span>
          </div>
        ) : null}
        {def.description ? <p className="tcg-handmenu-desc">{def.description}</p> : null}
      </div>
    </>
  );
}

/* DuelConnectingSplash — pantalla de conexión al game server con splash animado + skeleton del board. */
function DuelConnectingSplash() {
  return (
    <main className="duel-connecting" aria-busy="true">
      <div className="skeleton-splash">
        <div className="skeleton-splash-logo">AXIE DUEL</div>
        <div className="skeleton-splash-dots">
          <span></span><span></span><span></span>
        </div>
        <div className="skeleton-splash-sub">Connecting to the duel arena…</div>
      </div>
      <div className="duel-skeleton-board">
        <div className="duel-skeleton-side opp">
          <div className="skel duel-skel-hud" />
          <div className="duel-skeleton-zones">
            <div className="duel-skeleton-row">
              {[0,1,2,3,4].map((i) => <div className="skel duel-skel-slot" key={`os${i}`} />)}
            </div>
            <div className="duel-skeleton-row">
              {[0,1,2,3,4].map((i) => <div className="skel duel-skel-slot" key={`om${i}`} />)}
            </div>
          </div>
        </div>
        <div className="duel-skeleton-divider">
          <div className="skel duel-skel-banner" />
        </div>
        <div className="duel-skeleton-side me">
          <div className="duel-skeleton-zones">
            <div className="duel-skeleton-row">
              {[0,1,2,3,4].map((i) => <div className="skel duel-skel-slot" key={`mm${i}`} />)}
            </div>
            <div className="duel-skeleton-row">
              {[0,1,2,3,4].map((i) => <div className="skel duel-skel-slot" key={`ms${i}`} />)}
            </div>
          </div>
          <div className="skel duel-skel-hud" />
        </div>
        <div className="duel-skeleton-hand">
          {[0,1,2,3,4].map((i) => <div className="skel duel-skel-handcard" key={`h${i}`} style={{ animationDelay: `${i * 0.08}s` }} />)}
        </div>
      </div>
    </main>
  );
}

/* DestructionParticles — 8 partículas radiales con tint de la clase del Axie destruido. */
function DestructionParticles({ color }: { color: string }) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <div className="tcg-destruction-burst" aria-hidden="true">
      {angles.map((a) => (
        <span
          key={a}
          className="tcg-destruction-particle"
          style={{
            background: color,
            boxShadow: `0 0 8px ${color}, 0 0 16px ${color}80`,
            transform: `rotate(${a}deg) translateX(0)`,
          }}
        />
      ))}
      <span className="tcg-destruction-flash" />
    </div>
  );
}

/* ClassTriangleHelp — modal central explicando ventajas de clase. */
/* Helper: display label for card type. Monster type is rendered as "AXIE" to the player. */
function displayType(t: string): string {
  return t === 'Monster' ? 'AXIE' : t.toUpperCase();
}

/* Helper: icon glyph for each battle-log entry type. */
function logIcon(type: string): string {
  switch (type) {
    case 'combat': return '⚔';
    case 'action': return '⚡';
    case 'system': return '📜';
    case 'error':  return '⚠';
    case 'info':   return 'ℹ';
    default:       return '•';
  }
}

/* VoidContentsModal — Modal que muestra todas las cartas en el cementerio (The Void) de un player. */
function VoidContentsModal({
  ownerName,
  cards,
  catalog,
  onClose,
  onCardClick,
}: {
  ownerName: string;
  cards: CardSnapshot[];
  catalog: CardCatalog;
  onClose: () => void;
  onCardClick: (card: CardSnapshot) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [filter, setFilter] = useState<'all' | 'Monster' | 'Spell' | 'Trap'>('all');
  const filtered = filter === 'all' ? cards : cards.filter((c) => catalog[c.cardId]?.type === filter);
  return (
    <div className="tcg-void-backdrop" onClick={onClose}>
      <div className="tcg-void-modal" onClick={(e) => e.stopPropagation()}>
        <button className="tcg-help-close" onClick={onClose} type="button" aria-label="Close">✕</button>
        <h2 className="tcg-void-title">🪦 The Void · {ownerName}</h2>
        <p className="tcg-void-sub">{cards.length} card{cards.length === 1 ? '' : 's'} discarded this match.</p>
        <div className="tcg-void-filters">
          {(['all', 'Monster', 'Spell', 'Trap'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`builder2-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : displayType(f)}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="tcg-void-empty">No cards match this filter.</p>
        ) : (
          <div className="tcg-void-grid">
            {filtered.map((c) => {
              const def = catalog[c.cardId];
              if (!def) return null;
              const img = svgForCard({ ...def, id: c.cardId });
              return (
                <button
                  key={c.instanceId}
                  type="button"
                  className={`tcg-void-card type-${def.type.toLowerCase()}`}
                  onClick={() => onCardClick(c)}
                  title={def.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={def.name} />
                  <span className="tcg-void-card-name">{def.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassTriangleHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="tcg-help-backdrop" onClick={onClose}>
      <div className="tcg-help-modal" onClick={(e) => e.stopPropagation()}>
        <button className="tcg-help-close" onClick={onClose} type="button" aria-label="Close">✕</button>
        <h2 className="tcg-help-title">Class Triangle</h2>
        <p className="tcg-help-sub">Attacker class vs Defender class modifies effective ATK by ±15%.</p>
        <svg viewBox="0 0 460 400" className="tcg-help-triangle" aria-hidden="true">
          <defs>
            <marker id="arrowGreen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#34d399" />
            </marker>
          </defs>
          {/* Group A — top */}
          <g>
            <polygon points="230,40 295,140 165,140" fill="#1e293b" stroke="#60a5fa" strokeWidth="2" />
            <text x="230" y="30" textAnchor="middle" fill="#fbbf24" fontSize="14" fontWeight="800">GROUP A</text>
            <text x="230" y="85" textAnchor="middle" fill="#5eead4" fontSize="12" fontWeight="600">DUSK</text>
            <text x="230" y="105" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="700">PLANT</text>
            <text x="230" y="125" textAnchor="middle" fill="#a3e635" fontSize="12" fontWeight="600">REPTILE</text>
          </g>
          {/* Group B — bottom-right */}
          <g>
            <polygon points="370,230 435,330 305,330" fill="#1e293b" stroke="#60a5fa" strokeWidth="2" />
            <text x="370" y="355" textAnchor="middle" fill="#fbbf24" fontSize="14" fontWeight="800">GROUP B</text>
            <text x="370" y="275" textAnchor="middle" fill="#f472b6" fontSize="12" fontWeight="600">BIRD</text>
            <text x="370" y="295" textAnchor="middle" fill="#22d3ee" fontSize="14" fontWeight="700">AQUA</text>
            <text x="370" y="315" textAnchor="middle" fill="#c084fc" fontSize="12" fontWeight="600">DAWN</text>
          </g>
          {/* Group C — bottom-left */}
          <g>
            <polygon points="90,230 155,330 25,330" fill="#1e293b" stroke="#60a5fa" strokeWidth="2" />
            <text x="90" y="355" textAnchor="middle" fill="#fbbf24" fontSize="14" fontWeight="800">GROUP C</text>
            <text x="90" y="275" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="600">BUG</text>
            <text x="90" y="295" textAnchor="middle" fill="#fb923c" fontSize="14" fontWeight="700">BEAST</text>
            <text x="90" y="315" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">MECH</text>
          </g>
          {/* +15% arrows (cycle A → B → C → A). Reverse direction = -15% (in legend). */}
          <g stroke="#34d399" strokeWidth="2.5" fill="none" strokeLinecap="round">
            <line x1="298" y1="148" x2="362" y2="222" markerEnd="url(#arrowGreen)" />
            <line x1="300" y1="345" x2="160" y2="345" markerEnd="url(#arrowGreen)" />
            <line x1="93" y1="222" x2="162" y2="148" markerEnd="url(#arrowGreen)" />
          </g>
          {/* +15% labels positioned in clear empty space outside the arrows */}
          <g fontSize="15" fontWeight="800" fontFamily="system-ui">
            <text x="370" y="190" textAnchor="middle" fill="#34d399">+15%</text>
            <text x="230" y="385" textAnchor="middle" fill="#34d399">+15%</text>
            <text x="90" y="190" textAnchor="middle" fill="#34d399">+15%</text>
          </g>
        </svg>
        <ul className="tcg-help-rules">
          <li><strong style={{ color: '#34d399' }}>+15% Advantage:</strong> A→B, B→C, C→A</li>
          <li><strong style={{ color: '#f87171' }}>-15% Weak:</strong> reverse direction</li>
          <li><strong style={{ color: '#94a3b8' }}>Neutral:</strong> same group, no modifier</li>
        </ul>
      </div>
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
    turnDeadlineMs: typeof s.turnDeadlineMs === 'number' ? s.turnDeadlineMs : Number(s.turnDeadlineMs ?? 0),
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
      auraAtkBonus: c.auraAtkBonus ?? 0,
      auraDefBonus: c.auraDefBonus ?? 0,
      affectedByAura: c.affectedByAura ?? false,
    });
  });
  return out;
}
