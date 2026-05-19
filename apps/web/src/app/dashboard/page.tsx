'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearJwt, getJwt, ApiError } from '../../lib/auth';
import { SoundControls } from '../../components/SoundControls';
import { TutorialWelcomeModal } from '../../components/TutorialWelcomeModal';
import { sound } from '../../lib/sound';
import { HERO_PRESETS, resolveAvatar, levelTier } from '../../lib/heroAvatar';

interface UserMe {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  hasNFTAxies: boolean;
  isAdmin: boolean;
  eloRanked: number;
  level: number;
  xp: number;
  axsBalance: string;
  lunacianCoins: string;
  starterPicked: boolean;
  starterArchetype: 'plant' | 'bird' | 'beast' | null;
  tutorialCompleted: boolean;
}

interface DeckSummary {
  id: string;
  name: string;
  format: string;
  isActive: boolean;
  cards: Array<{ quantity: number; zone: string }>;
}

interface QuestProgress {
  id: string;
  kind: string;
  description: string;
  current: number;
  target: number;
  rewardAxs: string;
  completed: boolean;
  claimed: boolean;
}

interface Notification {
  id: string;
  kind: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/** ¿El error es de red (API inalcanzable / timeout / offline) vs un fallo lógico (401/500)?
 *  fetch() lanza TypeError("Failed to fetch") cuando no puede contactar al server.
 *  ApiError (clase nuestra) sólo se construye en respuestas !ok con status — eso NO es de red. */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiError) return false; // ya hubo respuesta HTTP, no es red caída
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /failed to fetch|networkerror|load failed|aborted|timeout/i.test(err.message)) return true;
  return false;
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [quests, setQuests] = useState<QuestProgress[]>([]);
  const [notifs, setNotifs] = useState<{ unreadCount: number; notifications: Notification[] }>({
    unreadCount: 0,
    notifications: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [claimToast, setClaimToast] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);
  /** Trigger automático del welcome tutorial cuando user pickeó starter pero no completó tutorial. */
  const [showTutorialWelcome, setShowTutorialWelcome] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [levelUpPopup, setLevelUpPopup] = useState<{ oldLevel: number; newLevel: number } | null>(null);
  const [web3Modal, setWeb3Modal] = useState<{ kind: 'wallet' | 'nft' } | null>(null);
  /** API caído: cuando los 4 endpoints fallan con error de red (no 401/500), mostramos card de mantenimiento + auto-retry. */
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    void loadAll();
    // BGM: arranca al primer click/keydown del usuario (browsers requieren gesture).
    sound.startBgmOnFirstGesture();

    // Auto-sync: refetch when tab becomes visible OR when another page (play) signals a balance update.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadAll();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'axie:lc-updated') void loadAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('storage', onStorage);

    // Level-up popup: si el play page persistió un level-up al terminar la partida,
    // mostrarlo al volver al dashboard. Una sola vez (consume y limpia la flag).
    try {
      const raw = window.localStorage.getItem('axie:level-up-pending');
      if (raw) {
        const parsed = JSON.parse(raw) as { oldLevel?: number; newLevel?: number; ts?: number };
        // Sólo si tiene < 5 minutos de antigüedad (evita popups stale).
        const age = Date.now() - (parsed.ts ?? 0);
        if (parsed.oldLevel && parsed.newLevel && parsed.newLevel > parsed.oldLevel && age < 5 * 60 * 1000) {
          setLevelUpPopup({ oldLevel: parsed.oldLevel, newLevel: parsed.newLevel });
          sound.play('victory');
        }
        window.localStorage.removeItem('axie:level-up-pending');
      }
    } catch { /* noop */ }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const errors: string[] = [];
    try {
      const [meR, decksR, questsR, notifsR] = await Promise.allSettled([
        apiFetch<UserMe>('/users/me'),
        apiFetch<{ decks: DeckSummary[] }>('/decks'),
        apiFetch<{ quests: QuestProgress[] }>('/quests'),
        apiFetch<{ unreadCount: number; notifications: Notification[] }>('/notifications'),
      ]);

      // /users/me es crítico: si falla con 401, redirigir a login
      if (meR.status === 'rejected') {
        const err = meR.reason;
        if (err instanceof ApiError && err.status === 401) {
          clearJwt();
          router.replace('/login');
          return;
        }
        errors.push(`/users/me: ${err instanceof Error ? err.message : String(err)}`);
      } else {
        setMe(meR.value);
        // FORCE starter pick: nuevos users van directo a /starter, sin opción a dashboard.
        if (!meR.value.starterPicked) {
          router.replace('/starter');
          return;
        }
        // FORCE tutorial: si pickeó starter pero no completó tutorial → modal forzado.
        if (meR.value.starterPicked && !meR.value.tutorialCompleted) {
          setShowTutorialWelcome(true);
        }
      }

      if (decksR.status === 'fulfilled') setDecks(decksR.value.decks);
      else errors.push(`/decks: ${decksR.reason instanceof Error ? decksR.reason.message : String(decksR.reason)}`);

      if (questsR.status === 'fulfilled') setQuests(questsR.value.quests);
      else errors.push(`/quests: ${questsR.reason instanceof Error ? questsR.reason.message : String(questsR.reason)}`);

      if (notifsR.status === 'fulfilled') setNotifs(notifsR.value);
      else errors.push(`/notifications: ${notifsR.reason instanceof Error ? notifsR.reason.message : String(notifsR.reason)}`);

      if (errors.length > 0) setError(errors.join('\n'));
      else setError(null);

      // Detectar API caído: TODOS los endpoints rechazados con error de red (TypeError "Failed to fetch")
      // = API inalcanzable, mostramos modo mantenimiento (auto-retry, mensaje amable) en vez del log técnico.
      const settled = [meR, decksR, questsR, notifsR];
      const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      const allFailedNetwork =
        rejected.length === settled.length &&
        rejected.every((r) => isNetworkFailure(r.reason));
      setMaintenanceMode(allFailedNetwork);
    } finally {
      setLoading(false);
    }
  }

  /** Auto-retry mientras estemos en maintenanceMode: cuenta regresiva 30s y vuelve a llamar loadAll(). */
  useEffect(() => {
    if (!maintenanceMode) {
      setRetryCountdown(0);
      return;
    }
    setRetryCountdown(30);
    const id = window.setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          void loadAll();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenanceMode]);

  function logout() {
    clearJwt();
    router.replace('/login');
  }

  async function claimQuest(questId: string) {
    if (claimingQuestId) return;
    setClaimingQuestId(questId);
    try {
      const quest = quests.find((q) => q.id === questId);
      await apiFetch(`/quests/${questId}/claim`, { method: 'POST' });
      setClaimToast({ kind: 'success', text: `+${quest?.rewardAxs ?? ''} AXS claimed!` });
      sound.play('coinReward');
    } catch (err) {
      // 422 RULE_VIOLATION = quest already claimed (likely a stale UI). Treat as success
      // and just refresh — the user's intent (claim) is already satisfied.
      if (err instanceof ApiError && err.status === 422) {
        setClaimToast({ kind: 'info', text: 'Already claimed — refreshing.' });
      } else {
        setClaimToast({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      await loadAll();
      setClaimingQuestId(null);
      setTimeout(() => setClaimToast(null), 3500);
    }
  }

  async function markAllRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    await loadAll();
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!me) {
    // Caso A: API totalmente caído / sin conexión → modo mantenimiento (auto-retry, mensaje amable).
    if (maintenanceMode) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return (
        <main className="dashboard">
          <div className="dashboard-maintenance" role="status" aria-live="polite">
            <div className="dashboard-maintenance-icon" aria-hidden="true">🔧</div>
            <h1 className="dashboard-maintenance-title">
              {offline ? 'Sin conexión a Internet' : 'Servicio en mantenimiento temporal'}
            </h1>
            <p className="dashboard-maintenance-body">
              {offline
                ? 'Verificá tu conexión Wi-Fi o datos móviles. Vamos a reintentar automáticamente cuando vuelvas online.'
                : 'Estamos restaurando la conexión con nuestros servidores. Volvemos en unos minutos — tu progreso está a salvo.'}
            </p>
            <div className="dashboard-maintenance-countdown">
              Reintentando automáticamente en <strong>{retryCountdown}s</strong>
            </div>
            <div className="dashboard-maintenance-actions">
              <button className="btn-primary" onClick={() => loadAll()}>
                Reintentar ahora
              </button>
              <a
                className="btn-secondary"
                href="https://status.railway.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver estado del servicio ↗
              </a>
              <button className="btn-secondary" onClick={logout}>
                Cerrar sesión
              </button>
            </div>
            {error ? (
              <details className="dashboard-maintenance-details">
                <summary>Detalles técnicos (debug)</summary>
                <pre>{error}</pre>
              </details>
            ) : null}
          </div>
        </main>
      );
    }

    // Caso B: error no-mantenimiento (ej. fallo individual de /users/me con 500 raro) → card técnica original.
    return (
      <main className="dashboard">
        <div className="card-section" style={{ background: 'rgba(255,118,118,0.08)' }}>
          <strong style={{ color: '#ff7676' }}>No pudimos cargar tu perfil.</strong>
          {error ? (
            <pre style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.85 }}>
              {error}
            </pre>
          ) : null}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={() => loadAll()}>
              Reintentar
            </button>
            <button className="btn-secondary" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Level progression: derive XP-in-level + threshold from total xp.
  // Formula matches apps/api/src/services/LevelService.ts.
  const xpForLevelStart = (lvl: number) => (lvl <= 1 ? 0 : (100 * lvl * (lvl - 1)) / 2);
  const xpForNext = me.level * 100;
  const xpInLevel = Math.max(0, me.xp - xpForLevelStart(me.level));
  const progressRatio = Math.min(1, Math.max(0, xpInLevel / xpForNext));

  return (
    <main className="dashboard">
      {claimToast ? (
        <div className={`claim-toast claim-toast-${claimToast.kind}`} role="status">
          <span>{claimToast.kind === 'success' ? '🎉' : claimToast.kind === 'info' ? 'ℹ️' : '⚠️'}</span>
          <span>{claimToast.text}</span>
        </div>
      ) : null}
      {levelUpPopup ? (
        <LevelUpPopup
          oldLevel={levelUpPopup.oldLevel}
          newLevel={levelUpPopup.newLevel}
          onClose={() => setLevelUpPopup(null)}
        />
      ) : null}
      {web3Modal ? (
        <Web3ComingSoonModal
          kind={web3Modal.kind}
          onClose={() => setWeb3Modal(null)}
        />
      ) : null}
      {editingProfile && me ? (
        <ProfileEditModal
          user={me}
          onClose={() => setEditingProfile(false)}
          onSaved={(msg) => {
            setEditingProfile(false);
            setClaimToast({ kind: 'success', text: msg });
            setTimeout(() => setClaimToast(null), 3000);
            void loadAll();
          }}
        />
      ) : null}
      {/* Header con perfil — clickable para editar */}
      <header className="dashboard-header">
        <button
          type="button"
          className="dashboard-profile-btn"
          onClick={() => setEditingProfile(true)}
          title="Click to edit your profile"
          aria-label="Edit profile"
        >
          {(() => {
            const heroSrc = resolveAvatar(me.avatarUrl);
            const tier = levelTier(me.level);
            return (
              <div
                className={`hero-frame ${tier.frameClass}`}
                title={`Level ${me.level} · ${tier.name}`}
              >
                {heroSrc && !avatarLoadFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroSrc}
                    alt=""
                    className="dashboard-avatar"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <div className="dashboard-avatar-fallback">{me.username[0]?.toUpperCase()}</div>
                )}
                <span className="hero-frame-lvl">{me.level}</span>
              </div>
            );
          })()}
          <div className="dashboard-userinfo">
            <strong>{me.displayName ?? me.username}<span className="dashboard-edit-hint">✎</span></strong>
            <span>
              @{me.username} · {me.email}
              {me.isAdmin ? ' · 👑 admin' : ''}
              {me.walletAddress ? ` · 🔗 ${me.walletAddress.slice(0, 6)}…` : ''}
            </span>
          </div>
        </button>
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <strong>🪙 {Number(me.lunacianCoins).toLocaleString()}</strong>
            <span>Dust</span>
          </div>
          <div className="dashboard-stat">
            <strong>{Number(me.axsBalance).toLocaleString()}</strong>
            <span>AXS</span>
          </div>
          <div className="dashboard-stat">
            <strong>{me.eloRanked}</strong>
            <span>ELO</span>
          </div>
        </div>
        <div className="dashboard-hero-lvl" title={`${xpInLevel} / ${xpForNext} XP to Level ${me.level + 1}`}>
          <div className="dashboard-hero-lvl-side">
            <span className="dashboard-hero-lvl-label">LEVEL</span>
            <strong className="dashboard-hero-lvl-number">{me.level}</strong>
          </div>
          <div className="dashboard-hero-lvl-progress">
            <div className="dashboard-hero-lvl-meta-top">
              <span className="dashboard-hero-lvl-pct">{Math.round(progressRatio * 100)}%</span>
              <span className="dashboard-hero-lvl-next">to Level {me.level + 1}</span>
            </div>
            <div className="dashboard-hero-lvl-track">
              <div className="dashboard-hero-lvl-fill" style={{ width: `${Math.round(progressRatio * 100)}%` }} />
            </div>
            <div className="dashboard-hero-lvl-meta-bottom">
              <span>{xpInLevel.toLocaleString()} / {xpForNext.toLocaleString()} XP</span>
              <span className="dashboard-hero-lvl-needed">+{(xpForNext - xpInLevel).toLocaleString()} more</span>
            </div>
          </div>
        </div>
        <div className="dashboard-header-controls">
          <button
            type="button"
            className="dashboard-ronin-btn"
            onClick={() => setWeb3Modal({ kind: 'wallet' })}
            title="Connect your Ronin Wallet"
          >
            <span className="dashboard-ronin-icon">🔗</span>
            <span className="dashboard-ronin-label">Connect Ronin Wallet</span>
          </button>
          <SoundControls variant="full" />
          <button className="dashboard-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Banner sticky para reclamar starter deck si todavía no eligió */}
      {!me.starterPicked ? (
        <div className="starter-banner">
          <div className="starter-banner-text">
            <strong>🎁 Claim your starter deck</strong>
            <span>Pick Plant, Bird or Beast — includes +50 Dust free.</span>
          </div>
          <Link href="/starter" className="starter-banner-cta">
            Pick deck →
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="dashboard-error-banner">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {/* Acciones rápidas */}
      <div className="card-section">
        <h2>Play vs Bot — choose your challenge</h2>
        <div className="pve-ladder">
          <Link href="/play/pve?diff=novato" className="pve-tier pve-tier-novato">
            <div className="pve-tier-badge">TIER 1</div>
            <div className="pve-tier-icon">🤖</div>
            <div className="pve-tier-name">Rookie</div>
            <div className="pve-tier-desc">Learn the fundamentals. Bot plays near-random.</div>
            <div className="pve-tier-rewards">
              <span>+50 XP</span>
              <span>+10 Dust</span>
            </div>
          </Link>
          <Link href="/play/pve?diff=avanzado" className="pve-tier pve-tier-avanzado">
            <div className="pve-tier-badge">TIER 2</div>
            <div className="pve-tier-icon">⚔</div>
            <div className="pve-tier-name">Veteran</div>
            <div className="pve-tier-desc">Bot evaluates board state and prioritizes class-advantage targets.</div>
            <div className="pve-tier-rewards">
              <span>+150 XP</span>
              <span>+50 Dust</span>
            </div>
          </Link>
          <Link href="/play/pve?diff=experto" className="pve-tier pve-tier-experto">
            <div className="pve-tier-badge">TIER 3</div>
            <div className="pve-tier-icon">👑</div>
            <div className="pve-tier-name">Master</div>
            <div className="pve-tier-desc">Meta deck. Strategy: defensive fodder + tributes for high-level summons.</div>
            <div className="pve-tier-rewards">
              <span>+500 XP</span>
              <span>+200 Dust</span>
            </div>
          </Link>
        </div>
        <div className="action-buttons">
          <button className="btn-secondary dashboard-action-btn dashboard-pvp-btn" disabled title="Coming soon">
            ⚔️ Find casual match (PvP)
          </button>
          <button
            type="button"
            className="btn-secondary dashboard-action-btn dashboard-tournaments-btn"
            disabled
            title="Coming in Phase 2 — when PvP ladder ships"
          >
            🏆 Tournaments
            <span className="dashboard-phase-tag">Phase 2</span>
          </button>
          <Link href="/rules" className="btn-secondary dashboard-action-btn dashboard-rules-btn">
            📖 How to play
          </Link>
          <Link href="/cards" className="btn-secondary dashboard-action-btn dashboard-catalog-btn">
            📚 View catalog
          </Link>
          <Link href="/decks/builder" className="btn-secondary dashboard-action-btn dashboard-builder-btn">
            🛠️ Build deck
          </Link>
          <Link
            href="/my-axies"
            className="btn-secondary dashboard-action-btn dashboard-nft-btn dashboard-web3-cta"
            title="See your Axies (or demo Axies) rendered as unique playable cards"
          >
            🌐 My Axies → Cards
            <span className="dashboard-web3-badge">Web3</span>
          </Link>
          <Link href="/store" className="btn-store">
            <span className="btn-store-emoji">✨</span>
            <span className="btn-store-label">
              <strong>Tienda / Packs</strong>
              <span>Booster Packs · Web3 economy</span>
            </span>
            <span className="btn-store-arrow">→</span>
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div>
          {/* Mazos */}
          <section className="card-section">
            <h2>My decks ({decks.length})</h2>
            {decks.length === 0 ? (
              <p className="section-empty">
                No decks yet.{' '}
                <Link href="/decks/builder">Build your first →</Link>
              </p>
            ) : (
              decks.map((d) => (
                <div key={d.id} className={`deck-item ${d.isActive ? 'is-active' : ''}`}>
                  <div>
                    <div className="deck-name">{d.name}</div>
                    <div className="deck-meta">
                      {d.format} · {d.cards.reduce((sum, c) => sum + c.quantity, 0)} cards
                      {d.isActive ? ' · ⭐ active' : ''}
                    </div>
                  </div>
                  <Link href={`/decks/${d.id}`} className="btn-secondary">
                    View
                  </Link>
                </div>
              ))
            )}
          </section>

          {/* Notificaciones */}
          <section className="card-section">
            <h2>
              Notifications {notifs.unreadCount > 0 ? `(${notifs.unreadCount} unread)` : ''}
              {notifs.unreadCount > 0 ? (
                <button
                  className="btn-secondary"
                  style={{ float: 'right', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                  onClick={markAllRead}
                >
                  Mark all as read
                </button>
              ) : null}
            </h2>
            {notifs.notifications.length === 0 ? (
              <p className="section-empty">No notifications yet.</p>
            ) : (
              notifs.notifications.slice(0, 8).map((n) => (
                <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
                  <div className="notif-kind">{n.kind}</div>
                  {n.message}
                </div>
              ))
            )}
          </section>
        </div>

        <div>
          {/* Quests */}
          <section className="card-section">
            <h2>Daily Quests</h2>
            {quests.length === 0 ? (
              <p className="section-empty">No active quests.</p>
            ) : (
              quests.map((q) => {
                const pct = Math.min(100, (q.current / q.target) * 100);
                return (
                  <div key={q.id} className="quest-item">
                    <div className="quest-header">
                      <span>{q.description}</span>
                      <strong>{q.current}/{q.target}</strong>
                    </div>
                    <div className="quest-progress-bar">
                      <div
                        className={`quest-progress-fill ${q.completed ? 'completed' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                      Reward: <strong>{q.rewardAxs} AXS</strong>
                    </div>
                    {q.completed && !q.claimed ? (
                      <button
                        className="quest-claim"
                        onClick={() => claimQuest(q.id)}
                        disabled={claimingQuestId !== null}
                      >
                        {claimingQuestId === q.id ? '⏳ Claiming…' : `Claim ${q.rewardAxs} AXS`}
                      </button>
                    ) : null}
                    {q.claimed ? (
                      <button className="quest-claim" disabled>
                        ✓ Claimed
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>

      {/* Tutorial welcome modal — forzado al primer login post-starter (no se cierra tap-fuera). */}
      {showTutorialWelcome ? (
        <TutorialWelcomeModal
          onClose={() => {
            setShowTutorialWelcome(false);
            // Refrescar el me para tener tutorialCompleted: true en el state local.
            setMe((curr) => curr ? { ...curr, tutorialCompleted: true } : curr);
          }}
        />
      ) : null}
    </main>
  );
}

/* ProfileEditModal — edita username (3-20 lowercase alphanum_), displayName, avatarUrl. */
function ProfileEditModal({ user, onClose, onSaved }: {
  user: UserMe;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setError(null);
    // Client-side validation matches the Zod schema in apps/api/src/routes/user.routes.ts
    const usernameRe = /^[a-z0-9_]+$/i;
    if (username.length < 3 || username.length > 20 || !usernameRe.test(username)) {
      setError('Username: 3–20 chars, only letters / numbers / underscore.');
      return;
    }
    if (displayName && (displayName.length < 1 || displayName.length > 40)) {
      setError('Display name: 1–40 chars.');
      return;
    }
    if (avatarUrl && avatarUrl.length > 500) {
      setError('Avatar URL too long (max 500).');
      return;
    }
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl) && !/^hero:[a-z0-9-]+$/.test(avatarUrl)) {
      setError('Avatar must be an http(s) URL or a chosen hero preset.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (username !== user.username) body.username = username;
      if (displayName !== (user.displayName ?? '')) body.displayName = displayName;
      if (avatarUrl !== (user.avatarUrl ?? '')) body.avatarUrl = avatarUrl;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      onSaved('Profile updated!');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Username already taken — pick another.');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-edit-backdrop" onClick={onClose}>
      <div className="profile-edit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-edit-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="profile-edit-title">Edit your profile</h2>
        <p className="profile-edit-sub">Customize how you appear to other duelists.</p>

        <div className="profile-edit-preview">
          {(() => {
            const previewSrc = resolveAvatar(avatarUrl);
            const tier = levelTier(user.level);
            return (
              <div className={`hero-frame ${tier.frameClass}`} title={`Level ${user.level} · ${tier.name}`}>
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    className="dashboard-avatar"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="dashboard-avatar-fallback">{(displayName || username)[0]?.toUpperCase()}</div>
                )}
                <span className="hero-frame-lvl">{user.level}</span>
              </div>
            );
          })()}
          <div>
            <strong>{displayName || username}</strong>
            <span className="profile-edit-preview-handle">@{username}</span>
            <span className="profile-edit-preview-tier">{levelTier(user.level).name} · Lv {user.level}</span>
          </div>
        </div>

        <div className="profile-edit-field">
          <span>Choose your hero</span>
          <div className="hero-preset-grid">
            {HERO_PRESETS.map((p) => {
              const val = `hero:${p.id}`;
              const selected = avatarUrl === val;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`hero-preset-btn ${selected ? 'is-selected' : ''}`}
                  onClick={() => setAvatarUrl(val)}
                  title={p.label}
                  aria-pressed={selected}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveAvatar(val)!} alt={p.label} />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
          <small>9 class-themed heroes · your frame upgrades automatically as you level up</small>
        </div>

        <label className="profile-edit-field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={20}
            placeholder="lowercase_letters_numbers"
          />
          <small>3–20 chars · only letters / numbers / underscore</small>
        </label>

        <label className="profile-edit-field">
          <span>Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="How others will see you"
          />
          <small>1–40 chars · spaces and emojis allowed</small>
        </label>

        <label className="profile-edit-field">
          <span>Avatar URL (optional)</span>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            maxLength={500}
            placeholder="https://example.com/your-photo.png"
          />
          <small>Public image URL · leave empty for letter avatar</small>
        </label>

        {error ? <div className="profile-edit-error">⚠️ {error}</div> : null}

        <div className="profile-edit-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? '⏳ Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Dashboard skeleton — mirror del layout real con shimmer pulse + AXIE DUEL splash. */
function DashboardSkeleton() {
  return (
    <main className="dashboard dashboard-skeleton" aria-busy="true">
      <div className="skeleton-splash">
        <div className="skeleton-splash-logo">AXIE DUEL</div>
        <div className="skeleton-splash-dots">
          <span></span><span></span><span></span>
        </div>
        <div className="skeleton-splash-sub">Loading your duel hub…</div>
      </div>
      <header className="dashboard-header">
        <div className="skel skel-avatar" />
        <div className="dashboard-userinfo">
          <div className="skel skel-line skel-line-w-md" />
          <div className="skel skel-line skel-line-w-sm" />
        </div>
        <div className="dashboard-stats">
          {[0, 1, 2, 3].map((i) => (
            <div className="dashboard-stat" key={i}>
              <div className="skel skel-stat" />
              <div className="skel skel-line skel-line-w-xs" />
            </div>
          ))}
        </div>
        <div className="skel skel-button" />
      </header>
      <div className="card-section">
        <div className="skel skel-line skel-line-w-sm" />
        <div className="action-buttons">
          {[0, 1, 2, 3].map((i) => (<div className="skel skel-action" key={i} />))}
        </div>
      </div>
      <div className="dashboard-grid">
        <div>
          <section className="card-section">
            <div className="skel skel-line skel-line-w-md" />
            {[0, 1, 2].map((i) => (<div className="skel skel-row" key={i} />))}
          </section>
          <section className="card-section">
            <div className="skel skel-line skel-line-w-md" />
            {[0, 1].map((i) => (<div className="skel skel-row" key={i} />))}
          </section>
        </div>
        <div>
          <section className="card-section">
            <div className="skel skel-line skel-line-w-md" />
            {[0, 1, 2].map((i) => (<div className="skel skel-quest" key={i} />))}
          </section>
        </div>
      </div>
    </main>
  );
}

/* Popup celebratorio: el user subió de nivel en su última partida.
   Mostrado al volver al dashboard (la flag se persiste en localStorage desde /play/pve). */
function LevelUpPopup({
  oldLevel,
  newLevel,
  onClose,
}: {
  oldLevel: number;
  newLevel: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const levelDelta = newLevel - oldLevel;

  return (
    <div className="levelup-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="levelup-modal" onClick={(e) => e.stopPropagation()}>
        {/* Confetti */}
        <div className="levelup-confetti" aria-hidden="true">
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="levelup-confetti-piece"
              data-color={['cyan', 'gold', 'pink', 'purple', 'green', 'orange'][i % 6]}
              data-pos={i % 12}
              data-delay={i % 8}
            />
          ))}
        </div>

        <button type="button" className="levelup-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="levelup-icon">🎉</div>
        <h2 className="levelup-title">¡FELICIDADES!</h2>
        <p className="levelup-subtitle">
          Subiste de nivel{levelDelta > 1 ? ` ×${levelDelta}` : ''}
        </p>

        <div className="levelup-progression">
          <div className="levelup-level-box old">
            <span className="levelup-level-label">ANTES</span>
            <strong className="levelup-level-number">{oldLevel}</strong>
          </div>
          <div className="levelup-arrow">→</div>
          <div className="levelup-level-box new">
            <span className="levelup-level-label">AHORA</span>
            <strong className="levelup-level-number">{newLevel}</strong>
          </div>
        </div>

        <p className="levelup-message">
          Tu duelista creció con la experiencia de la última batalla. Seguí entrenando para
          desbloquear nuevos challenges y rewards.
        </p>

        <button type="button" className="levelup-cta" onClick={onClose}>
          ¡Sigamos! →
        </button>
      </div>
    </div>
  );
}

/* Modal "Coming Soon" para integración Ronin Network — wallet + NFT gallery.
   Mismo patrón que ComingSoonModal del store, pero con mensaje específico de Ronin. */
function Web3ComingSoonModal({
  kind,
  onClose,
}: {
  kind: 'wallet' | 'nft';
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isWallet = kind === 'wallet';
  return (
    <div className="coming-soon-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="coming-soon-modal web3-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="coming-soon-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="coming-soon-icon web3-icon">{isWallet ? '🔗' : '🔮'}</div>
        <h2 className="coming-soon-title">
          {isWallet ? '¡Conexión con Ronin Network!' : '¡NFT Gallery próximamente!'}
        </h2>
        <p className="coming-soon-body">
          ¡Conexión con <strong>Ronin Network</strong> disponible en la <strong>fase Beta</strong>!
          Aquí podrás sincronizar tus <strong>Axies NFT</strong> y desbloquear sus
          <strong> cartas exclusivas</strong>.
        </p>
        <div className="coming-soon-pack-preview web3-preview">
          <div className="coming-soon-pack-emoji">{isWallet ? '🔗' : '🎴'}</div>
          <div>
            <strong>{isWallet ? 'Ronin Wallet integration' : 'Sync NFT Axies → Cards'}</strong>
            <span>{isWallet ? 'Sky Mavis · Saigon testnet → Mainnet' : 'Each owned Axie unlocks its lore-accurate card'}</span>
          </div>
        </div>
        <div className="coming-soon-roadmap">
          <h3>Próximo en el roadmap</h3>
          <ul>
            <li><span className="coming-soon-check">✓</span> Diccionario de partes Axie con micro-efectos</li>
            <li><span className="coming-soon-check">✓</span> Starter decks lore-accurate (Plant / Bird / Beast)</li>
            <li><span className="coming-soon-pending">○</span> Smart contract de minting en Saigon testnet</li>
            <li><span className="coming-soon-pending">○</span> Wallet auth + signature (Ronin SDK)</li>
            <li><span className="coming-soon-pending">○</span> Sync NFT Axie collection → unlock cartas</li>
            <li><span className="coming-soon-pending">○</span> Marketplace P2P de cartas NFT</li>
          </ul>
        </div>
        <button type="button" className="coming-soon-cta" onClick={onClose}>
          Got it — back to dashboard
        </button>
      </div>
    </div>
  );
}
