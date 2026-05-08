'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleSignIn, type BackendUser } from '../../components/GoogleSignIn';
import { placeholderSvgFor } from '../../lib/cardArt';

/**
 * Login — primera cara para los players. Hero animado + value prop + features +
 * roadmap teaser + CTA prominente. Diseño "Web3 premium" usando el lenguaje
 * visual del juego: gradients shimmer, floating axie cards, glows.
 */

interface FeatureCard {
  icon: string;
  title: string;
  body: string;
  accent: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: '⚔',
    title: 'Tactical TCG',
    body: 'Classic TCG mechanics with summons, traps, spells & combat phases. Class triangle for ±15% damage shifts.',
    accent: '#fbbf24',
  },
  {
    icon: '🪙',
    title: 'Earn Dust',
    body: 'Win matches to earn Dust. Spend on packs, cosmetics, future Battle Pass tiers. 100% off-chain for now.',
    accent: '#34d399',
  },
  {
    icon: '🔮',
    title: 'Web3 Ready',
    body: 'Built for Ronin Network. NFT card minting & marketplace land in Beta. AXS / SLP integration on roadmap.',
    accent: '#c084fc',
  },
  {
    icon: '🎮',
    title: 'Free to Play',
    body: 'Pick a starter deck (Plant / Bird / Beast), beat the AI, climb. No paywall to enjoy the core game.',
    accent: '#22d3ee',
  },
];

// Cards de muestra para el background floating — usan los SVG temáticos.
const SHOWCASE_CARDS = [
  { id: 'mon_beast_001',  name: 'Buba, the Frostfang',     type: 'Monster' as const, attribute: 'Beast' },
  { id: 'mon_aqua_001',   name: 'Tidecaller Nyra',         type: 'Monster' as const, attribute: 'Aquatic' },
  { id: 'mon_plant_001',  name: 'Olek, the Verdant Guardian', type: 'Monster' as const, attribute: 'Plant' },
  { id: 'spl_005',        name: 'Lunacian Blessing',       type: 'Spell' as const,   attribute: null },
  { id: 'trp_002',        name: 'Mirror Web',              type: 'Trap' as const,    attribute: null },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function handleSuccess(_user: BackendUser) {
    router.replace('/dashboard');
  }

  return (
    <main className="login-v2-page">
      {/* Animated background — 5 floating cards orbiting */}
      <div className="login-v2-bg" aria-hidden="true">
        <div className="login-v2-bg-glow login-v2-bg-glow-1" />
        <div className="login-v2-bg-glow login-v2-bg-glow-2" />
        <div className="login-v2-bg-glow login-v2-bg-glow-3" />
        {SHOWCASE_CARDS.map((card, i) => (
          <div
            key={card.id}
            className={`login-v2-floating-card login-v2-floating-card-${i}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={placeholderSvgFor(card)} alt="" />
          </div>
        ))}
      </div>

      <div className="login-v2-container">
        {/* Top bar */}
        <header className="login-v2-topbar">
          <div className="login-v2-brand">
            <span className="login-v2-brand-dot" />
            <span className="login-v2-brand-text">AXIE DUEL</span>
          </div>
          <div className="login-v2-version-pill">v0.1 BETA</div>
        </header>

        {/* Hero: logo gigante + tagline + CTA */}
        <section className="login-v2-hero">
          <h1 className="login-v2-logo">AXIE DUEL</h1>
          <p className="login-v2-tagline">
            The <strong>tactical TCG</strong> built on <strong>Ronin</strong> · Modern combat, classic depth
          </p>

          <div className="login-v2-cta-card">
            <div className="login-v2-cta-card-header">
              <h2>Welcome, duelist</h2>
              <p>Sign in to claim your starter deck and your first <strong>50 Dust</strong> bonus.</p>
            </div>

            <div className="login-v2-cta-button">
              <GoogleSignIn onSuccess={handleSuccess} onError={setError} />
            </div>

            {error ? (
              <div className="login-v2-error">
                <strong>⚠ Error</strong>
                <pre>{error}</pre>
              </div>
            ) : null}

            <div className="login-v2-cta-providers">
              <span className="login-v2-cta-providers-label">SOON</span>
              <span className="login-v2-cta-providers-list">
                <span title="Microsoft">🪟</span>
                <span title="Facebook">📘</span>
                <span title="Ronin Wallet">🔗 Ronin Wallet</span>
              </span>
            </div>

            <div className="login-v2-cta-trust">
              <span>🔒 Google OAuth (no passwords stored)</span>
              <span>⚡ Free · No credit card</span>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="login-v2-features">
          <h3 className="login-v2-section-title">What's inside</h3>
          <div className="login-v2-features-grid">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="login-v2-feature"
                style={{ '--feature-accent': f.accent } as React.CSSProperties}
              >
                <div className="login-v2-feature-icon">{f.icon}</div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Roadmap teaser */}
        <section className="login-v2-roadmap">
          <h3 className="login-v2-section-title">Roadmap</h3>
          <div className="login-v2-roadmap-row">
            <div className="login-v2-roadmap-step done">
              <span className="login-v2-roadmap-marker">✓</span>
              <strong>Beta interna</strong>
              <span>PvE bot · Starter decks · Dust economy</span>
            </div>
            <div className="login-v2-roadmap-step pending">
              <span className="login-v2-roadmap-marker">○</span>
              <strong>Booster Packs</strong>
              <span>Pack opening · Card drops · Marketplace</span>
            </div>
            <div className="login-v2-roadmap-step pending">
              <span className="login-v2-roadmap-marker">○</span>
              <strong>PvP Ranked</strong>
              <span>ELO matchmaking · Tournaments · Replays</span>
            </div>
            <div className="login-v2-roadmap-step pending">
              <span className="login-v2-roadmap-marker">○</span>
              <strong>Ronin Mainnet</strong>
              <span>NFT minting · AXS rewards · Mavis Hub</span>
            </div>
          </div>
        </section>

        {/* Footer with IP disclaimer + Builders Program link */}
        <footer className="login-v2-footer">
          <div className="login-v2-disclaimer">
            <strong>Fan-made project</strong> leveraging Axie Infinity's public APIs.
            <em>Not officially affiliated with Sky Mavis.</em> All Axie Infinity branding & NFTs belong to Sky Mavis Pte. Ltd.
          </div>
          <div className="login-v2-footer-meta">
            <span>© 2026 · Working title · Built with ❤️ for the Lunacian community</span>
            <a href="https://github.com/anuarissa/axie-duel" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="/rules">Rules</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
