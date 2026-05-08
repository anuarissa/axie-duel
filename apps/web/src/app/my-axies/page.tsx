'use client';

/**
 * /my-axies — Web3 demo page.
 *
 * THE KILLER DEMO for Sky Mavis pitch:
 * - Connect Ronin Wallet → query Axie GraphQL → fetch your Axies
 * - Apply deterministic parts → card algorithm V1
 * - Render unique cards with stats, class, effect
 *
 * Demo mode: visitors without auth/wallet can preview 5 example Axies as cards.
 * This is the page Sky Mavis evaluators land on to see the Web3 hook in action.
 *
 * Spec: docs/PARTS_ALGORITHM.md
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { partsToCard, tokenIdToHue, type AxieInput, type AxieCardStats, type AxieClass } from '../../lib/axie-card-algorithm';
import { fetchAxiesByOwner, DEMO_AXIES } from '../../lib/axie-graphql-client';
import { getJwt } from '../../lib/auth';

const CLASS_GRADIENT: Record<AxieClass, string> = {
  Beast:   'linear-gradient(135deg, #fb923c, #c2410c)',
  Plant:   'linear-gradient(135deg, #34d399, #166534)',
  Aqua:    'linear-gradient(135deg, #22d3ee, #0e7490)',
  Bird:    'linear-gradient(135deg, #f472b6, #be185d)',
  Reptile: 'linear-gradient(135deg, #a3e635, #4d7c0f)',
  Bug:     'linear-gradient(135deg, #ef4444, #991b1b)',
  Mech:    'linear-gradient(135deg, #cbd5e1, #475569)',
  Dawn:    'linear-gradient(135deg, #c084fc, #6b21a8)',
  Dusk:    'linear-gradient(135deg, #5eead4, #115e59)',
};

const CLASS_EMOJI: Record<AxieClass, string> = {
  Beast: '🐺', Plant: '🌿', Aqua: '🌊', Bird: '🐦', Reptile: '🐉',
  Bug: '🪲', Mech: '🤖', Dawn: '🌅', Dusk: '🌆',
};

const RARITY_COLOR: Record<string, string> = {
  Common: '#94a3b8',
  Rare: '#22d3ee',
  Epic: '#c084fc',
  Legendary: '#fbbf24',
};

export default function MyAxiesPage() {
  const [mode, setMode] = useState<'unauthed' | 'no-wallet' | 'loading' | 'demo' | 'live' | 'error'>('unauthed');
  const [cards, setCards] = useState<Array<{ input: AxieInput; card: AxieCardStats }>>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [walletInput, setWalletInput] = useState<string>('');

  useEffect(() => {
    const jwt = getJwt();
    if (!jwt) {
      setMode('unauthed');
      return;
    }
    setMode('no-wallet');
  }, []);

  function loadDemo() {
    setMode('demo');
    const generated = DEMO_AXIES.map((input) => ({ input, card: partsToCard(input) }));
    setCards(generated);
  }

  async function loadLiveByAddress(address: string) {
    setMode('loading');
    setErrorMsg(null);
    try {
      const axies = await fetchAxiesByOwner(address);
      if (axies.length === 0) {
        setMode('error');
        setErrorMsg('No Axies found for this address. Check the wallet or try the Demo mode.');
        return;
      }
      const generated = axies.slice(0, 24).map((input) => ({ input, card: partsToCard(input) }));
      setCards(generated);
      setMode('live');
    } catch (err) {
      setMode('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="my-axies-page">
      <header className="my-axies-header">
        <Link href="/dashboard" className="my-axies-back">← Back to dashboard</Link>
        <h1 className="my-axies-title">🌐 Your Axies, as Cards</h1>
        <p className="my-axies-sub">
          Each Axie NFT generates a <strong>unique playable card</strong> via our deterministic parts → stats algorithm.
          Same Axie = same card, always. No randomness, server-signed for anti-cheat.
        </p>
        <div className="my-axies-spec-link">
          📄 <Link href="https://github.com/anuarissa/axie-duel/blob/main/docs/PARTS_ALGORITHM.md" target="_blank" className="my-axies-link">
            Read the algorithm spec on GitHub
          </Link>
        </div>
      </header>

      <section className="my-axies-mode-section">
        <h2 className="my-axies-section-title">Try it</h2>
        <div className="my-axies-mode-grid">
          <button
            type="button"
            className="my-axies-mode-card my-axies-mode-demo"
            onClick={loadDemo}
            disabled={mode === 'loading'}
          >
            <div className="my-axies-mode-icon">🎮</div>
            <h3>Demo mode</h3>
            <p>See 5 example Axies as cards instantly. No wallet, no login required. Best for evaluators.</p>
            <span className="my-axies-mode-cta">▶ Run demo</span>
          </button>

          <div className="my-axies-mode-card my-axies-mode-live">
            <div className="my-axies-mode-icon">🔌</div>
            <h3>Live wallet</h3>
            <p>Paste any Ronin address to fetch their Axies live from the Axie GraphQL Gateway.</p>
            <input
              type="text"
              placeholder="0xabc... or ronin:abc..."
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              className="my-axies-wallet-input"
            />
            <button
              type="button"
              className="my-axies-load-btn"
              onClick={() => walletInput.trim() && loadLiveByAddress(walletInput.trim())}
              disabled={mode === 'loading' || !walletInput.trim()}
            >
              {mode === 'loading' ? '⏳ Loading…' : '🔍 Fetch Axies'}
            </button>
          </div>
        </div>

        {errorMsg ? (
          <div className="my-axies-error">⚠ {errorMsg}</div>
        ) : null}
      </section>

      {cards.length > 0 ? (
        <section className="my-axies-cards-section">
          <h2 className="my-axies-section-title">
            {mode === 'demo' ? '🎮 Demo Axies' : '🔌 Live Axies'}
            <span className="my-axies-count">· {cards.length} card{cards.length !== 1 ? 's' : ''}</span>
          </h2>
          <div className="my-axies-cards-grid">
            {cards.map(({ input, card }) => {
              const hue = tokenIdToHue(input.tokenId);
              return (
                <article
                  key={card.cardId}
                  className={`my-axies-card my-axies-card-rarity-${card.rarity.toLowerCase()}`}
                  style={{
                    background: CLASS_GRADIENT[card.classType],
                    boxShadow: `0 6px 24px hsla(${hue}, 65%, 50%, 0.4), 0 0 0 1px ${RARITY_COLOR[card.rarity]}`,
                  }}
                >
                  <div className="my-axies-card-rarity" style={{ color: RARITY_COLOR[card.rarity] }}>
                    {card.rarity.toUpperCase()}
                  </div>
                  <div className="my-axies-card-emoji">{CLASS_EMOJI[card.classType]}</div>
                  <div className="my-axies-card-name">{card.name}</div>
                  <div className="my-axies-card-class-row">
                    <span className="my-axies-card-class">{card.classType}</span>
                    <span className="my-axies-card-level">★{card.level}</span>
                  </div>
                  <div className="my-axies-card-stats">
                    <div className="my-axies-stat">
                      <span className="my-axies-stat-label">ATK</span>
                      <strong>{card.atk}</strong>
                    </div>
                    <div className="my-axies-stat">
                      <span className="my-axies-stat-label">DEF</span>
                      <strong>{card.def}</strong>
                    </div>
                    <div className="my-axies-stat">
                      <span className="my-axies-stat-label">Burns</span>
                      <strong>{card.burns}</strong>
                    </div>
                  </div>
                  {card.effect ? (
                    <div className="my-axies-card-effect">
                      <span className="my-axies-effect-label">⚡ Effect</span>
                      <p>{card.effect.description}</p>
                    </div>
                  ) : (
                    <div className="my-axies-card-effect my-axies-card-effect-none">
                      <em>Vanilla — no special effect (parts unmapped in V1)</em>
                    </div>
                  )}
                  <div className="my-axies-card-token">
                    Source Axie #{card.sourceTokenId} · v{card.algorithmVersion}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="my-axies-info-section">
        <h2 className="my-axies-section-title">How it works</h2>
        <ol className="my-axies-info-steps">
          <li><strong>Read</strong> Axie data on-chain via viem (Ronin) + Axie GraphQL Gateway (parts metadata).</li>
          <li><strong>Apply</strong> deterministic algorithm: 6 parts × class synergy → ATK/DEF/Level/Effect.</li>
          <li><strong>Sign</strong> resulting card on the game-server with HMAC — clients can&apos;t modify stats.</li>
          <li><strong>Play</strong>: your unique cards enter your collection alongside earned cards. Same skill ceiling for everyone.</li>
        </ol>
        <p className="my-axies-info-note">
          <strong>F2P fairness:</strong> NFT cards are <em>side-grades</em>, not upgrades. Top ladder reachable without spending.
          See <Link href="/rules" className="my-axies-link">Rules → F2P Balance</Link>.
        </p>
      </section>
    </main>
  );
}
