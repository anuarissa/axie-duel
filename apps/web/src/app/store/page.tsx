'use client';

/**
 * Store / Packs — Mockup Web2.5 de la tienda de Booster Packs.
 *
 * NO tiene lógica de backend (los buy buttons abren un modal "Coming Soon").
 * Pre-Fase 6: las integraciones on-chain (Ronin Network, AXS/SLP burn) llegan
 * con la Beta Abierta.
 *
 * Vista: 3 sobres temáticos con gradients animados, hover-lift, paquete brillante.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, getJwt } from '../../lib/auth';
import { sound } from '../../lib/sound';
import { resolveCardImage, placeholderSvgFor } from '../../lib/cardArt';

interface PackOption {
  label: string;
  currency: 'SLP' | 'AXS' | 'Dust';
  price: number;
  bestValue?: boolean;
}

interface Pack {
  id: string;
  name: string;
  tagline: string;
  description: string;
  cardsPerPack: number;
  guaranteedRarity: string;
  emoji: string;
  gradient: string;
  glowColor: string;
  options: PackOption[];
}

interface StarterPreviewCard {
  quantity: number;
  card: {
    id: string;
    name: string;
    type: 'Monster' | 'Spell' | 'Trap';
    rarity: string;
    attribute: string | null;
    level: number | null;
    atk: number | null;
    def: number | null;
    imageUrl: string;
  };
}

interface StarterPreview {
  id: 'plant' | 'bird' | 'beast';
  name: string;
  axieClass: string;
  emoji: string;
  vibeEmojis: string[];
  tagline: string;
  description: string;
  playstyle: string;
  highlights: string[];
  strongVs: string[];
  weakVs: string[];
  totalCards: number;
  monsters: number;
  spells: number;
  traps: number;
  cards: StarterPreviewCard[];
}

interface UserStarterStatus {
  starterPicked: boolean;
  archetype: 'plant' | 'bird' | 'beast' | null;
}

const STARTER_PRICE_AXS = 5;
const STARTER_PRICE_DUST = 5000;
const STARTER_GRADIENT: Record<string, string> = {
  plant: 'linear-gradient(135deg, #14532d 0%, #16a34a 50%, #4ade80 100%)',
  bird:  'linear-gradient(135deg, #500724 0%, #be185d 50%, #f472b6 100%)',
  beast: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fbbf24 100%)',
};
const STARTER_GLOW: Record<string, string> = {
  plant: 'rgba(74, 222, 128, 0.55)',
  bird:  'rgba(244, 114, 182, 0.55)',
  beast: 'rgba(251, 146, 60, 0.55)',
};

const PACKS: Pack[] = [
  {
    id: 'lunacian-starter',
    name: 'Lunacian Starter',
    tagline: 'For the new duelist',
    description: 'A balanced mix of Common and Rare cards. Perfect way to expand your starter deck with reliable basics.',
    cardsPerPack: 5,
    guaranteedRarity: '1× Rare guaranteed',
    emoji: '✨',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #06b6d4 100%)',
    glowColor: 'rgba(59, 130, 246, 0.55)',
    options: [
      { label: '1 Pack', currency: 'SLP', price: 500 },
      { label: '5 Packs', currency: 'SLP', price: 2200, bestValue: true },
      { label: '1 Pack', currency: 'Dust', price: 500 },
    ],
  },
  {
    id: 'origin-expansion',
    name: 'Origin Expansion',
    tagline: 'Tactical depth unlocked',
    description: 'Curated set with elevated drop rates for Epic Spells & Traps. Includes the Sky Mavis Field & Lunacian Counterstrike pool.',
    cardsPerPack: 5,
    guaranteedRarity: '1× Epic guaranteed',
    emoji: '💳',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 35%, #fbbf24 100%)',
    glowColor: 'rgba(251, 191, 36, 0.6)',
    options: [
      { label: '1 Pack', currency: 'AXS', price: 5 },
      { label: '10 Packs', currency: 'AXS', price: 45, bestValue: true },
      // Dust option — Web2 path para Magic/Trap pack. Junto a las opciones AXS Web3.
      { label: '1 Pack', currency: 'Dust', price: 1000 },
    ],
  },
  {
    id: 'mystic-vault',
    name: 'Mystic Vault',
    tagline: 'Legendary draws',
    description: 'Premium pack with Legendary & Mystic drop chance. Only way to obtain the rarest Axie-linked cards. Limited supply per season.',
    cardsPerPack: 7,
    guaranteedRarity: '1× Legendary guaranteed · Mystic chance',
    emoji: '🔮',
    gradient: 'linear-gradient(135deg, #4c1d95 0%, #c026d3 50%, #ec4899 100%)',
    glowColor: 'rgba(192, 38, 211, 0.65)',
    options: [
      { label: '1 Pack', currency: 'AXS', price: 25 },
      { label: '5 Packs', currency: 'AXS', price: 110, bestValue: true },
      { label: '1 Pack', currency: 'Dust', price: 5000 },
    ],
  },
];

export default function StorePage() {
  const router = useRouter();
  const [comingSoonPack, setComingSoonPack] = useState<{ pack: Pack; option: PackOption } | null>(null);
  const [comingSoonStarter, setComingSoonStarter] = useState<{ preview: StarterPreview; currency: 'AXS' | 'Dust' } | null>(null);
  const [previewStarter, setPreviewStarter] = useState<StarterPreview | null>(null);
  const [userStatus, setUserStatus] = useState<UserStarterStatus | null>(null);
  const [starterPreviews, setStarterPreviews] = useState<StarterPreview[]>([]);
  const [startersLoading, setStartersLoading] = useState(true);
  const [dustBalance, setDustBalance] = useState<string>('0');

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    // 3 fetches paralelos: starter status, starter previews (cached 10min), user dust balance.
    void (async () => {
      try {
        const [statusRes, previewsRes, meRes] = await Promise.all([
          apiFetch<UserStarterStatus>('/starter/status').catch(() => ({ starterPicked: false, archetype: null } as UserStarterStatus)),
          apiFetch<{ previews: StarterPreview[] }>('/starter/previews').catch(() => ({ previews: [] as StarterPreview[] })),
          apiFetch<{ lunacianCoins: string }>('/users/me').catch(() => ({ lunacianCoins: '0' })),
        ]);
        setUserStatus(statusRes);
        setStarterPreviews(previewsRes.previews ?? []);
        setDustBalance(meRes.lunacianCoins ?? '0');
      } catch {
        // soft fail — section just won't render
      } finally {
        setStartersLoading(false);
      }
    })();
  }, [router]);

  function clickBuy(pack: Pack, option: PackOption) {
    sound.play('click');
    setComingSoonPack({ pack, option });
  }

  function clickBuyStarter(preview: StarterPreview, currency: 'AXS' | 'Dust') {
    sound.play('click');
    setComingSoonStarter({ preview, currency });
  }

  // Starters NO ownadas (los que el user no eligió, o todos si todavía no eligió ninguno).
  const starterDecksForSale = starterPreviews.filter((p) => !userStatus?.starterPicked || userStatus.archetype !== p.id);

  return (
    <main className="store-page">
      <header className="store-header">
        <Link href="/dashboard" className="store-back">
          ← Back to dashboard
        </Link>
        <div className="store-title-block">
          <h1 className="store-title">⚡ Tienda / Packs</h1>
          <p className="store-subtitle">Build your collection with thematic Booster Packs</p>
        </div>
        {/* Dust balance chip — visible mientras navegás la Tienda. Refresh al re-mount. */}
        <div className="store-dust-chip" title={`Tu saldo actual de Dust (off-chain currency)`}>
          <span className="store-dust-chip-icon">✨</span>
          <strong className="store-dust-chip-value">{Number(dustBalance).toLocaleString()}</strong>
          <span className="store-dust-chip-label">Dust</span>
        </div>
        <div className="store-roadmap-badge">🚧 BETA — Roadmap preview</div>
      </header>

      {/* ── Starter Decks (alternative archetypes) ───────────────────
       * Skeleton placeholder mientras carga (mismo shape que el final) → no hay
       * "delay shock" cuando los datos llegan. Server cachea 10min, así que en
       * visitas posteriores arriba en <50ms. */}
      {startersLoading ? (
        <section className="store-starters-section">
          <header className="store-starters-header">
            <h2>🃏 Starter Decks alternativos</h2>
            <p>Cargando archetypes…</p>
          </header>
          <div className="store-starters-grid">
            {[0, 1].map((i) => (
              <article key={`skel-${i}`} className="store-starter-card store-starter-skeleton">
                <div className="store-starter-art store-starter-skeleton-art" />
                <div className="store-starter-info">
                  <div className="store-starter-skeleton-line lg" />
                  <div className="store-starter-skeleton-line md" />
                  <div className="store-starter-skeleton-line sm" />
                  <div className="store-starter-skeleton-line sm" />
                  <div className="store-starter-skeleton-line sm" />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : starterDecksForSale.length > 0 ? (
        <section className="store-starters-section">
          <header className="store-starters-header">
            <h2>🃏 Starter Decks alternativos</h2>
            <p>
              {userStatus?.starterPicked
                ? `Ya elegiste ${userStatus.archetype}. Desbloqueá los otros ${starterDecksForSale.length} starter deck${starterDecksForSale.length > 1 ? 's' : ''} por 5 AXS cada uno.`
                : 'Probá los 3 archetypes. El primero es gratis (Reclamar starter), los otros se desbloquean por 5 AXS cada uno.'}
            </p>
          </header>
          <div className="store-starters-grid">
            {starterDecksForSale.map((preview) => (
              <article
                key={preview.id}
                className="store-starter-card"
                style={{
                  '--starter-glow': STARTER_GLOW[preview.id],
                } as React.CSSProperties}
              >
                <div
                  className="store-starter-art"
                  style={{ background: STARTER_GRADIENT[preview.id] }}
                >
                  <div className="store-starter-emoji">{preview.emoji}</div>
                  <div className="store-starter-vibes">
                    {preview.vibeEmojis.map((e, i) => (
                      <span key={i} style={{ animationDelay: `${i * 100}ms` }}>{e}</span>
                    ))}
                  </div>
                  <div className="store-starter-class-chip">{preview.axieClass}</div>
                  <div className="store-starter-card-count">{preview.totalCards} cards</div>
                </div>

                <div className="store-starter-info">
                  <h3 className="store-starter-name">{preview.name}</h3>
                  <p className="store-starter-tagline">{preview.tagline}</p>
                  <p className="store-starter-desc">{preview.description}</p>

                  <div className="store-starter-stats">
                    <span title="Axies">🐾 <strong>{preview.monsters}</strong></span>
                    <span title="Spells">✦ <strong>{preview.spells}</strong></span>
                    <span title="Traps">⚠ <strong>{preview.traps}</strong></span>
                  </div>

                  <ul className="store-starter-highlights">
                    {preview.highlights.slice(0, 3).map((h, i) => (
                      <li key={i}><span className="store-starter-dot">◆</span> {h}</li>
                    ))}
                  </ul>

                  <div className="store-starter-matchup">
                    <span className="store-starter-matchup-row strong">
                      <strong>⚔ Strong vs:</strong> {preview.strongVs.join(' · ')}
                    </span>
                    <span className="store-starter-matchup-row weak">
                      <strong>🛡 Weak vs:</strong> {preview.weakVs.join(' · ')}
                    </span>
                  </div>
                </div>

                <div className="store-starter-actions">
                  <button
                    type="button"
                    className="store-starter-preview-btn"
                    onClick={() => setPreviewStarter(preview)}
                  >
                    🔍 Ver cartas
                  </button>
                  <button
                    type="button"
                    className="store-starter-buy-btn"
                    onClick={() => clickBuyStarter(preview, 'AXS')}
                  >
                    💎 <strong>{STARTER_PRICE_AXS} AXS</strong>
                  </button>
                  <button
                    type="button"
                    className="store-starter-buy-btn dust-variant"
                    onClick={() => clickBuyStarter(preview, 'Dust')}
                  >
                    <span className="store-starter-dust-tag">✨ OFF-CHAIN</span>
                    <span className="store-starter-dust-label">
                      Comprar x {STARTER_PRICE_DUST.toLocaleString()} Dust
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="store-grid">
        {PACKS.map((pack) => (
          <article key={pack.id} className="store-pack" style={{ '--pack-glow': pack.glowColor } as React.CSSProperties}>
            <div className="store-pack-glow" style={{ background: pack.gradient }} />
            <div className="store-pack-art" style={{ background: pack.gradient }}>
              <div className="store-pack-emoji">{pack.emoji}</div>
              <div className="store-pack-shine" />
              <div className="store-pack-foil" />
              <div className="store-pack-card-count">{pack.cardsPerPack} cards</div>
            </div>

            <div className="store-pack-info">
              <h2 className="store-pack-name">{pack.name}</h2>
              <p className="store-pack-tagline">{pack.tagline}</p>
              <p className="store-pack-description">{pack.description}</p>
              <div className="store-pack-guarantee">
                <span className="store-pack-guarantee-icon">✓</span>
                <span>{pack.guaranteedRarity}</span>
              </div>
            </div>

            <div className="store-pack-options">
              {pack.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className={`store-pack-buy-btn ${opt.bestValue ? 'best-value' : ''} ${opt.currency === 'Dust' ? 'dust-variant' : ''}`}
                  onClick={() => clickBuy(pack, opt)}
                >
                  {opt.bestValue ? <span className="store-pack-best-value-tag">⭐ BEST VALUE</span> : null}
                  {opt.currency === 'Dust' ? <span className="store-pack-dust-tag">✨ OFF-CHAIN</span> : null}
                  <span className="store-pack-buy-label">
                    {opt.currency === 'Dust' ? `Comprar x ${opt.price.toLocaleString()} Dust` : opt.label}
                  </span>
                  {opt.currency !== 'Dust' ? (
                    <span className="store-pack-buy-price">
                      <strong>{opt.price.toLocaleString()}</strong> {opt.currency}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="store-info-strip">
        <div className="store-info-item">
          <span className="store-info-icon">🔗</span>
          <div>
            <strong>Ronin Network</strong>
            <span>On-chain card minting + tradeable NFTs</span>
          </div>
        </div>
        <div className="store-info-item">
          <span className="store-info-icon">🎁</span>
          <div>
            <strong>Daily Free Pack</strong>
            <span>Login bonus on Beta launch</span>
          </div>
        </div>
        <div className="store-info-item">
          <span className="store-info-icon">⚖</span>
          <div>
            <strong>Fair Drop Rates</strong>
            <span>Public odds, no hidden gacha</span>
          </div>
        </div>
      </section>

      {comingSoonPack ? (
        <ComingSoonModal
          pack={comingSoonPack.pack}
          option={comingSoonPack.option}
          onClose={() => setComingSoonPack(null)}
        />
      ) : null}

      {comingSoonStarter ? (
        <ComingSoonStarterModal
          preview={comingSoonStarter.preview}
          currency={comingSoonStarter.currency}
          onClose={() => setComingSoonStarter(null)}
        />
      ) : null}

      {previewStarter ? (
        <StarterCardListModal
          preview={previewStarter}
          onClose={() => setPreviewStarter(null)}
          onBuy={() => {
            setComingSoonStarter({ preview: previewStarter, currency: 'AXS' });
            setPreviewStarter(null);
          }}
        />
      ) : null}
    </main>
  );
}

/* Modal: lista TODAS las cartas del starter deck con quantities. */
function StarterCardListModal({
  preview,
  onClose,
  onBuy,
}: {
  preview: StarterPreview;
  onClose: () => void;
  onBuy: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="store-starter-list-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="store-starter-list-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="store-starter-list-close" onClick={onClose} aria-label="Close">✕</button>
        <header className="store-starter-list-header">
          <div
            className="store-starter-list-emoji"
            style={{ background: STARTER_GRADIENT[preview.id] }}
          >
            {preview.emoji}
          </div>
          <div>
            <h2>{preview.name}</h2>
            <p>{preview.totalCards} cards · 🐾 {preview.monsters} · ✦ {preview.spells} · ⚠ {preview.traps}</p>
          </div>
        </header>
        <div className="store-starter-list-grid">
          {preview.cards.map((entry) => {
            const c = entry.card;
            const artInfo = { id: c.id, name: c.name, type: c.type, attribute: c.attribute };
            return (
              <article key={c.id} className={`store-starter-card-item type-${c.type.toLowerCase()} rarity-${c.rarity}`}>
                <div className="store-starter-card-item-qty">×{entry.quantity}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveCardImage(artInfo, c.imageUrl)}
                  alt={c.name}
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget;
                    const fb = placeholderSvgFor(artInfo);
                    if (img.src !== fb) img.src = fb;
                  }}
                />
                <div className="store-starter-card-item-info">
                  <div className="store-starter-card-item-name">{c.name}</div>
                  <div className="store-starter-card-item-meta">
                    {c.type === 'Monster' ? (
                      <>
                        <span>{c.attribute}</span>
                        <span>⭐{c.level}</span>
                        <span>{c.atk}/{c.def}</span>
                      </>
                    ) : (
                      <span>{c.type === 'Spell' ? '✦ Spell' : '⚠ Trap'}</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <footer className="store-starter-list-footer">
          <button type="button" className="store-starter-list-cancel" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="store-starter-list-buy" onClick={onBuy}>
            💎 Comprar este deck · 5 AXS
          </button>
        </footer>
      </div>
    </div>
  );
}

/* Modal: "Coming Soon" para compra de starter deck. Reusa estilos de coming-soon.
 * Branch por currency: Dust → on-brand off-chain (amarillo dorado), AXS → Web3 Ronin (default). */
function ComingSoonStarterModal({
  preview,
  currency,
  onClose,
}: {
  preview: StarterPreview;
  currency: 'AXS' | 'Dust';
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDust = currency === 'Dust';

  return (
    <div className="coming-soon-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`coming-soon-modal ${isDust ? 'coming-soon-modal-dust' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="coming-soon-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="coming-soon-icon">{isDust ? '✨' : '🚧'}</div>
        <h2 className="coming-soon-title">
          {isDust ? '¡Apertura de starter decks en la Beta!' : '¡Funcionalidad en desarrollo!'}
        </h2>
        <p className="coming-soon-body">
          {isDust ? (
            <>
              ¡La compra de archetypes alternativos con <strong>Dust</strong> estará habilitada
              en la <strong>Beta</strong>! Sigue acumulando Dust en tus partidas para
              desbloquear los <strong>3 starter decks</strong>.
            </>
          ) : (
            <>
              La compra de starter decks alternativos con <strong>AXS</strong> estará disponible
              en la <strong>Beta Abierta</strong>. Por ahora podés probar el deck construyéndolo
              manualmente desde el catálogo.
            </>
          )}
        </p>
        <div className="coming-soon-pack-preview">
          <div className="coming-soon-pack-emoji">{preview.emoji}</div>
          <div>
            <strong>{preview.name}</strong>
            <span>
              {isDust
                ? `Starter Deck · Comprar x ${STARTER_PRICE_DUST.toLocaleString()} Dust · ${preview.totalCards} cards`
                : `Starter Deck · ${STARTER_PRICE_AXS} AXS · ${preview.totalCards} cards`}
            </span>
          </div>
        </div>
        <div className="coming-soon-roadmap">
          <h3>Próximo en el roadmap</h3>
          <ul>
            <li><span className="coming-soon-check">✓</span> Starter compositions con sinergias profundas</li>
            <li><span className="coming-soon-check">✓</span> Showcase de archetypes en dashboard + tienda</li>
            <li><span className="coming-soon-pending">○</span> {isDust ? 'Compra con Dust (off-chain, gameplay loop)' : 'Compra con AXS (Ronin Network)'}</li>
            <li><span className="coming-soon-pending">○</span> Animación de unboxing del starter</li>
            <li><span className="coming-soon-pending">○</span> Cards bonus exclusivas por archetype</li>
          </ul>
        </div>
        <button type="button" className="coming-soon-cta" onClick={onClose}>
          Got it — back to store
        </button>
      </div>
    </div>
  );
}

/* Modal: "Funcionalidad en desarrollo" — UX con CTA al roadmap.
 * Texto y emoji adaptados según currency:
 *   - Dust: copy on-brand acumulación PvE ("Sigue acumulando Dust...")
 *   - SLP/AXS: copy Web3 Ronin Network */
function ComingSoonModal({ pack, option, onClose }: { pack: Pack; option: PackOption; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDust = option.currency === 'Dust';

  return (
    <div className="coming-soon-backdrop" onClick={onClose}>
      <div className={`coming-soon-modal ${isDust ? 'coming-soon-modal-dust' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="coming-soon-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="coming-soon-icon">{isDust ? '✨' : '🚧'}</div>
        <h2 className="coming-soon-title">
          {isDust ? '¡Apertura de sobres en la Beta!' : '¡Funcionalidad en desarrollo!'}
        </h2>
        <p className="coming-soon-body">
          {isDust ? (
            <>
              ¡La apertura de sobres estará habilitada en la <strong>Beta</strong>!
              Sigue acumulando <strong>Dust</strong> en tus batallas para conseguir
              <strong> Magias y Trampas exclusivas</strong>.
            </>
          ) : (
            <>
              La apertura de sobres con integraciones en <strong>Ronin Network</strong> estará
              disponible en la <strong>Beta Abierta</strong>.
            </>
          )}
        </p>
        <div className="coming-soon-pack-preview">
          <div className="coming-soon-pack-emoji">{pack.emoji}</div>
          <div>
            <strong>{pack.name}</strong>
            <span>
              {isDust
                ? `Comprar x ${option.price.toLocaleString()} Dust`
                : `${option.label} · ${option.price} ${option.currency}`}
            </span>
          </div>
        </div>
        <div className="coming-soon-roadmap">
          <h3>Próximo en el roadmap</h3>
          <ul>
            <li><span className="coming-soon-check">✓</span> Diccionario de partes Axie con micro-efectos</li>
            <li><span className="coming-soon-check">✓</span> Cards <code>BASE</code> / <code>PACK_EXPANSION</code> / <code>AXIE_LINKED</code></li>
            <li><span className="coming-soon-pending">○</span> {isDust ? 'Pack opening con Dust (gameplay loop)' : 'Smart contract de minting en Saigon testnet'}</li>
            <li><span className="coming-soon-pending">○</span> Pack opening UX con animación de reveal</li>
            <li><span className="coming-soon-pending">○</span> {isDust ? 'Daily Dust quests + battle pass' : 'Marketplace P2P de cartas NFT'}</li>
          </ul>
        </div>
        <button type="button" className="coming-soon-cta" onClick={onClose}>
          Got it — back to packs
        </button>
      </div>
    </div>
  );
}
