'use client';

/**
 * Welcome tutorial modal — carrusel de 5 slides explicando el juego.
 *
 * Trigger automático: aparece en /dashboard cuando user.starterPicked=true
 * AND user.tutorialCompleted=false. Forzado (no se cierra tap-fuera).
 *
 * Replay manual: desde /rules con prop `isReplay={true}`. Tap-fuera SÍ cierra,
 * "Got it!" cierra sin tocar la DB (la flag ya es true).
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/auth';

const SLIDES = [
  {
    icon: '⚔',
    title: 'Welcome to Axie Duel!',
    body: 'A tactical card game blending the depth of classic TCGs with Axie\'s iconic universe and Web3 digital ownership. Reduce your opponent\'s Life Points (LP) from 8000 to 0 to win.',
    bullets: [
      'You start with 5 cards in hand and 8000 LP',
      '5 monster zones + 5 spell/trap zones per side',
      'Win condition: opponent LP = 0 OR they run out of cards (Deck out)',
    ],
  },
  {
    icon: '⏳',
    title: 'Game Phases',
    body: 'Each turn cycles through 6 phases. The active player advances them with the ▶ phase wheel button.',
    bullets: [
      'Extraction (Draw): draw 1 card from your deck',
      'Sync (Standby): triggered effects fire',
      'Tactical Phase 1: deploy axies, set spells/traps, activate effects',
      'Combat: declare attacks with your monsters',
      'Tactical Phase 2: more deploys/spells after combat',
      'Resolution (End): turn ends, hand limit 6 enforced',
    ],
  },
  {
    icon: '⚡',
    title: 'Combat Math',
    body: 'When you declare an attack, ATK and DEF stats determine the outcome.',
    bullets: [
      'ATK vs ATK: lower stat destroyed, owner takes (their ATK − attacker ATK) damage',
      'ATK vs DEF: only destroys if attacker ATK > defender DEF; no LP damage',
      'Direct attack: only when opponent has no monsters; full ATK damage to LP',
      'Burns (sacrifices): Level 5-6 axies need 1 burn, L7-8 need 2',
    ],
  },
  {
    icon: '🔺',
    title: 'Class Triangle',
    body: 'Each axie has a class. The triangle of advantages multiplies effective ATK by ±15%.',
    bullets: [
      'Group A (Reptile, Plant, Dusk) beats Group B (+15% ATK)',
      'Group B (Aqua, Bird, Dawn) beats Group C (+15%)',
      'Group C (Beast, Bug, Mech) beats Group A (+15%)',
      'Same group → neutral. Inverse → −15% ATK (disadvantage)',
    ],
  },
  {
    icon: '🃏',
    title: 'Deck Rules',
    body: 'Build smart, play smart.',
    bullets: [
      'Main deck: 40 to 60 cards',
      'Maximum 3 copies of any single card',
      'Hand limit: 6 cards at end of turn (you must discard the excess)',
      'Build your deck from /decks/builder, choose your active deck before each match',
    ],
  },
];

export function TutorialWelcomeModal({
  isReplay = false,
  onClose,
}: {
  isReplay?: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Esc cierra solo en replay (forced no se cierra con Esc).
    if (!isReplay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isReplay, onClose]);

  const slide = SLIDES[step]!;
  const isLast = step === SLIDES.length - 1;
  const isFirst = step === 0;

  async function handleFinish() {
    if (isReplay) {
      // Replay desde /rules: NO tocar la DB, solo cerrar.
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/users/me/tutorial-complete', { method: 'POST' });
    } catch (err) {
      // Aun si falla el endpoint, cerramos el modal localmente — el user no quiere
      // quedarse trabado. La próxima vez al login verificamos el flag y reabrimos.
      console.error('tutorial-complete failed', err);
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <div
      className="tutorial-welcome-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tutorial"
      onClick={(e) => {
        // Tap fuera del modal: cierra solo en replay.
        if (isReplay && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tutorial-welcome-modal">
        <div className="tutorial-welcome-progress">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`tutorial-welcome-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>
        <div className="tutorial-welcome-icon">{slide.icon}</div>
        <h2 className="tutorial-welcome-title">{slide.title}</h2>
        <p className="tutorial-welcome-body">{slide.body}</p>
        <ul className="tutorial-welcome-bullets">
          {slide.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
        <div className="tutorial-welcome-actions">
          {!isFirst ? (
            <button
              type="button"
              className="tutorial-welcome-btn back"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              ← Back
            </button>
          ) : <span />}
          {!isLast ? (
            <button
              type="button"
              className="tutorial-welcome-btn next"
              onClick={() => setStep((s) => Math.min(SLIDES.length - 1, s + 1))}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="tutorial-welcome-btn next"
              onClick={handleFinish}
              disabled={submitting}
            >
              {submitting ? '⏳ Saving…' : isReplay ? '✓ Close' : '✓ Got it! Start playing'}
            </button>
          )}
        </div>
        {isReplay ? (
          <p className="tutorial-welcome-replay-hint">Tap outside or press Esc to close.</p>
        ) : null}
      </div>
    </div>
  );
}
