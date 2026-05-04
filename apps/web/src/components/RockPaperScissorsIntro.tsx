'use client';

/**
 * RockPaperScissorsIntro — Pre-match Roshambo (rock/paper/scissors) contest estilo Yu-Gi-Oh.
 *
 * Flujo:
 *   1. pick → user elige rock/paper/scissors. Bot muestra placeholder cycling.
 *   2. reveal → ambas picks slam down con countdown 3-2-1.
 *   3a. tie → toast + retry (back to pick). MAX 3 ties consecutivos: si se alcanza, el sistema
 *       elige random (Math.random) y procede sin más empates.
 *   3b. user wins → choose-order: "Play first" o "Play second".
 *   3c. bot wins → opponent-chose: bot pick mostrado con countdown 3s, después llama onResult.
 *
 * Solo client-side (PvE). Para PvP futuro irá server-mediated.
 */

import { useEffect, useRef, useState } from 'react';
import { sound } from '../lib/sound';

export type RpsPick = 'rock' | 'paper' | 'scissors';

const PICK_LABELS: Record<RpsPick, { emoji: string; name: string }> = {
  rock:     { emoji: '🪨', name: 'Rock' },
  paper:    { emoji: '📄', name: 'Paper' },
  scissors: { emoji: '✂️', name: 'Scissors' },
};

const PICKS: RpsPick[] = ['rock', 'paper', 'scissors'];

/** Después de N empates consecutivos, el sistema fuerza un ganador aleatorio para evitar
 * loops infinitos. 3 = sweet spot UX (suficiente para sentirse equitativo, no frustrante). */
const TIE_LIMIT = 3;

function evaluate(user: RpsPick, bot: RpsPick): 'user' | 'bot' | 'tie' {
  if (user === bot) return 'tie';
  if (
    (user === 'rock' && bot === 'scissors') ||
    (user === 'paper' && bot === 'rock') ||
    (user === 'scissors' && bot === 'paper')
  ) return 'user';
  return 'bot';
}

interface RpsProps {
  onResult: (firstPlayer: 'me' | 'opponent') => void;
}

export function RockPaperScissorsIntro({ onResult }: RpsProps) {
  const [phase, setPhase] = useState<'pick' | 'reveal' | 'choose-order' | 'opponent-chose'>('pick');
  const [userPick, setUserPick] = useState<RpsPick | null>(null);
  const [botPick, setBotPick] = useState<RpsPick | null>(null);
  const [botShuffle, setBotShuffle] = useState<RpsPick>('rock');
  const [winner, setWinner] = useState<'user' | 'bot' | 'tie' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [opponentChoice, setOpponentChoice] = useState<'me' | 'opponent' | null>(null);
  const [tieCount, setTieCount] = useState(0);
  const [forcedResolve, setForcedResolve] = useState(false);
  const shuffleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Set de timeouts pendientes — todos limpiables al unmount/reset para evitar memory leaks. */
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  /** Helper para crear un setTimeout tracked: se auto-clean al unmount. */
  function trackedTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timeoutsRef.current.delete(t);
      fn();
    }, ms);
    timeoutsRef.current.add(t);
    return t;
  }

  /** Cleanup de TODOS los timeouts pendientes — al unmount o al reiniciar phase. */
  function clearAllTimeouts() {
    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current.clear();
  }

  // Cleanup al unmount: previene callbacks colgando + memory leaks.
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
    };
  }, []);

  // Bot shuffle animation while user is picking.
  useEffect(() => {
    if (phase !== 'pick') {
      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
      return;
    }
    shuffleTimerRef.current = setInterval(() => {
      setBotShuffle((prev) => {
        const next = PICKS[(PICKS.indexOf(prev) + 1) % 3]!;
        return next;
      });
    }, 90);
    return () => {
      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
    };
  }, [phase]);

  function handlePick(pick: RpsPick) {
    sound.play('click');
    setUserPick(pick);
    const bot = PICKS[Math.floor(Math.random() * 3)]!;
    setBotPick(bot);
    setWinner(evaluate(pick, bot));
    setPhase('reveal');
    // Countdown 3-2-1
    setCountdown(3);
    trackedTimeout(() => setCountdown(2), 700);
    trackedTimeout(() => setCountdown(1), 1400);
    trackedTimeout(() => {
      setCountdown(null);
      sound.play('attackHit');
      const w = evaluate(pick, bot);
      if (w === 'tie') {
        setTieCount((prev) => {
          const next = prev + 1;
          if (next >= TIE_LIMIT) {
            // Tie limit reached → forzar ganador random + proceder sin más empates.
            sound.play('phaseAdvance');
            setForcedResolve(true);
            // Ganador aleatorio 50/50 entre user/bot.
            const forcedWinner: 'user' | 'bot' = Math.random() < 0.5 ? 'user' : 'bot';
            setWinner(forcedWinner);
            trackedTimeout(() => {
              if (forcedWinner === 'user') {
                sound.play('victory');
                setPhase('choose-order');
              } else {
                const botChooses: 'me' | 'opponent' = Math.random() < 0.7 ? 'opponent' : 'me';
                setOpponentChoice(botChooses);
                sound.play('defeat');
                setPhase('opponent-chose');
              }
            }, 1200);
            return 0; // reset el contador para próximas partidas
          }
          // Tie pero todavía bajo el límite → retry normal.
          trackedTimeout(() => resetForRetry(), 1400);
          return next;
        });
      } else if (w === 'user') {
        setTieCount(0); // reset contador en cualquier resolución no-tie
        trackedTimeout(() => {
          sound.play('victory');
          setPhase('choose-order');
        }, 900);
      } else {
        setTieCount(0);
        // Bot won — bot decides (70% prefiere ir primero).
        const botChooses: 'me' | 'opponent' = Math.random() < 0.7 ? 'opponent' : 'me';
        // 'me' = user va primero, 'opponent' = bot va primero
        // Si el bot ganó y elige 'opponent' (bot primero), el user juega segundo.
        setOpponentChoice(botChooses);
        trackedTimeout(() => {
          sound.play('defeat');
          setPhase('opponent-chose');
        }, 900);
      }
    }, 2100);
  }

  function resetForRetry() {
    setPhase('pick');
    setUserPick(null);
    setBotPick(null);
    setWinner(null);
    setCountdown(null);
  }

  // Auto-progression when bot chose order.
  useEffect(() => {
    if (phase !== 'opponent-chose' || !opponentChoice) return;
    const t = setTimeout(() => onResult(opponentChoice), 2600);
    return () => clearTimeout(t);
  }, [phase, opponentChoice, onResult]);

  function handleOrderChoice(choice: 'me' | 'opponent') {
    sound.play('phaseAdvance');
    onResult(choice);
  }

  return (
    <div className="rps-backdrop">
      <div className="rps-container">
        <header className="rps-header">
          <h1 className="rps-title">⚔ Roshambo</h1>
          <p className="rps-sub">
            {phase === 'pick' && (tieCount > 0
              ? `Tie ${tieCount}/${TIE_LIMIT} — pick again. After ${TIE_LIMIT} ties the system decides.`
              : 'Pick your hand to decide who plays first.')}
            {phase === 'reveal' && (forcedResolve
              ? `${TIE_LIMIT} ties reached — random tiebreaker incoming…`
              : winner === 'tie' ? "It's a tie! Replaying…" : winner === 'user' ? 'You win the toss!' : 'Opponent wins the toss.')}
            {phase === 'choose-order' && (forcedResolve
              ? '🎲 Random tiebreaker: YOU won! Choose your turn order.'
              : 'You won! Choose your turn order.')}
            {phase === 'opponent-chose' && (forcedResolve
              ? '🎲 Random tiebreaker: opponent won.'
              : '🤖 The opponent decided.')}
          </p>
        </header>

        {/* Picks display: opponent (top) vs user (bottom) */}
        <div className="rps-picks">
          <div className={`rps-side rps-side-opponent ${phase === 'reveal' && winner === 'bot' ? 'winner' : ''}`}>
            <div className="rps-side-label">🤖 OPPONENT</div>
            <div className={`rps-pick-card ${phase === 'reveal' ? 'reveal' : ''}`}>
              <span className="rps-pick-emoji">
                {phase === 'pick' ? PICK_LABELS[botShuffle].emoji : botPick ? PICK_LABELS[botPick].emoji : '?'}
              </span>
            </div>
            {botPick && phase !== 'pick' ? (
              <div className="rps-pick-name">{PICK_LABELS[botPick].name}</div>
            ) : null}
          </div>

          <div className="rps-vs">
            {countdown !== null ? <div className="rps-countdown">{countdown}</div> : <div className="rps-vs-label">VS</div>}
          </div>

          <div className={`rps-side rps-side-user ${phase === 'reveal' && winner === 'user' ? 'winner' : ''}`}>
            <div className="rps-side-label">👤 YOU</div>
            <div className={`rps-pick-card ${phase === 'reveal' ? 'reveal' : ''}`}>
              <span className="rps-pick-emoji">
                {userPick ? PICK_LABELS[userPick].emoji : '?'}
              </span>
            </div>
            {userPick ? (
              <div className="rps-pick-name">{PICK_LABELS[userPick].name}</div>
            ) : null}
          </div>
        </div>

        {/* Phase-specific footer */}
        {phase === 'pick' ? (
          <div className="rps-buttons">
            {PICKS.map((p) => (
              <button
                key={p}
                type="button"
                className="rps-btn"
                onClick={() => handlePick(p)}
                aria-label={`Pick ${PICK_LABELS[p].name}`}
              >
                <span className="rps-btn-emoji">{PICK_LABELS[p].emoji}</span>
                <span className="rps-btn-name">{PICK_LABELS[p].name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {phase === 'reveal' && winner === 'tie' && !forcedResolve ? (
          <div className="rps-result-banner tie">🤝 TIE {tieCount}/{TIE_LIMIT} — replay incoming</div>
        ) : null}
        {phase === 'reveal' && forcedResolve ? (
          <div className="rps-result-banner tie">🎲 {TIE_LIMIT} ties reached — coin flip!</div>
        ) : null}
        {phase === 'reveal' && winner === 'user' && !forcedResolve ? (
          <div className="rps-result-banner win">🏆 YOU WIN!</div>
        ) : null}
        {phase === 'reveal' && winner === 'bot' && !forcedResolve ? (
          <div className="rps-result-banner lose">💀 OPPONENT WINS</div>
        ) : null}

        {phase === 'choose-order' ? (
          <div className="rps-order">
            <button type="button" className="rps-order-btn rps-order-first" onClick={() => handleOrderChoice('me')}>
              <span className="rps-order-icon">⚡</span>
              <span className="rps-order-label">
                <strong>Play FIRST</strong>
                <span>Initiative · No draw on turn 1</span>
              </span>
            </button>
            <button type="button" className="rps-order-btn" onClick={() => handleOrderChoice('opponent')}>
              <span className="rps-order-icon">🛡</span>
              <span className="rps-order-label">
                <strong>Play SECOND</strong>
                <span>Reactive · Draw a card on turn 1</span>
              </span>
            </button>
          </div>
        ) : null}

        {phase === 'opponent-chose' && opponentChoice ? (
          <div className="rps-opponent-decision">
            <div className="rps-opponent-decision-text">
              🤖 Opponent chose to play <strong>{opponentChoice === 'opponent' ? 'FIRST' : 'SECOND'}</strong>
            </div>
            <div className="rps-opponent-decision-sub">Get ready…</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
