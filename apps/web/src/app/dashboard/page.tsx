'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearJwt, getJwt, ApiError } from '../../lib/auth';

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

  useEffect(() => {
    if (!getJwt()) {
      router.replace('/login');
      return;
    }
    void loadAll();
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
      }

      if (decksR.status === 'fulfilled') setDecks(decksR.value.decks);
      else errors.push(`/decks: ${decksR.reason instanceof Error ? decksR.reason.message : String(decksR.reason)}`);

      if (questsR.status === 'fulfilled') setQuests(questsR.value.quests);
      else errors.push(`/quests: ${questsR.reason instanceof Error ? questsR.reason.message : String(questsR.reason)}`);

      if (notifsR.status === 'fulfilled') setNotifs(notifsR.value);
      else errors.push(`/notifications: ${notifsR.reason instanceof Error ? notifsR.reason.message : String(notifsR.reason)}`);

      if (errors.length > 0) setError(errors.join('\n'));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearJwt();
    router.replace('/login');
  }

  async function claimQuest(questId: string) {
    try {
      await apiFetch(`/quests/${questId}/claim`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function markAllRead() {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    await loadAll();
  }

  if (loading) {
    return <main className="loading-screen">Cargando dashboard…</main>;
  }

  if (!me) {
    return (
      <main className="dashboard">
        <div className="card-section" style={{ background: 'rgba(255,118,118,0.08)' }}>
          <strong style={{ color: '#ff7676' }}>No se pudo cargar tu perfil.</strong>
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
              Logout y volver a login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      {/* Header con perfil */}
      <header className="dashboard-header">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt={me.username} className="dashboard-avatar" />
        ) : (
          <div className="dashboard-avatar-fallback">{me.username[0]?.toUpperCase()}</div>
        )}
        <div className="dashboard-userinfo">
          <strong>{me.displayName ?? me.username}</strong>
          <span>
            @{me.username} · {me.email}
            {me.isAdmin ? ' · 👑 admin' : ''}
            {me.walletAddress ? ` · 🔗 ${me.walletAddress.slice(0, 6)}…` : ''}
          </span>
        </div>
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <strong>🪙 {Number(me.lunacianCoins).toLocaleString()}</strong>
            <span>LC</span>
          </div>
          <div className="dashboard-stat">
            <strong>{Number(me.axsBalance).toLocaleString()}</strong>
            <span>AXS</span>
          </div>
          <div className="dashboard-stat">
            <strong>{me.eloRanked}</strong>
            <span>ELO</span>
          </div>
          <div className="dashboard-stat">
            <strong>{me.level}</strong>
            <span>LVL</span>
          </div>
        </div>
        <button className="dashboard-logout" onClick={logout}>
          Logout
        </button>
      </header>

      {/* Banner sticky para reclamar starter deck si todavía no eligió */}
      {!me.starterPicked ? (
        <div className="starter-banner">
          <div className="starter-banner-text">
            <strong>🎁 Reclamá tu mazo inicial</strong>
            <span>Elegí entre Plant, Bird o Beast — incluye +50 Lunacian Coins gratis.</span>
          </div>
          <Link href="/starter" className="starter-banner-cta">
            Elegir mazo →
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="card-section" style={{ background: 'rgba(255,118,118,0.08)' }}>
          <strong style={{ color: '#ff7676' }}>Error: </strong>
          {error}
        </div>
      ) : null}

      {/* Acciones rápidas */}
      <div className="card-section">
        <h2>Jugar</h2>
        <div className="action-buttons">
          <Link href="/play/pve" className="btn-primary">
            🤖 Jugar vs Bot (PvE)
          </Link>
          <button className="btn-primary" disabled title="Próximamente">
            ⚔️ Buscar partida casual (PvP)
          </button>
          <Link href="/cards" className="btn-secondary">
            📚 Ver catálogo
          </Link>
          <Link href="/decks/builder" className="btn-secondary">
            🛠️ Crear mazo
          </Link>
        </div>
      </div>

      <div className="dashboard-grid">
        <div>
          {/* Mazos */}
          <section className="card-section">
            <h2>Mis mazos ({decks.length})</h2>
            {decks.length === 0 ? (
              <p className="section-empty">
                Aún no tenés mazos.{' '}
                <Link href="/decks/builder">Crear el primero →</Link>
              </p>
            ) : (
              decks.map((d) => (
                <div key={d.id} className={`deck-item ${d.isActive ? 'is-active' : ''}`}>
                  <div>
                    <div className="deck-name">{d.name}</div>
                    <div className="deck-meta">
                      {d.format} · {d.cards.reduce((sum, c) => sum + c.quantity, 0)} cartas
                      {d.isActive ? ' · ⭐ activo' : ''}
                    </div>
                  </div>
                  <Link href={`/decks/${d.id}`} className="btn-secondary">
                    Ver
                  </Link>
                </div>
              ))
            )}
          </section>

          {/* Notificaciones */}
          <section className="card-section">
            <h2>
              Notificaciones {notifs.unreadCount > 0 ? `(${notifs.unreadCount} sin leer)` : ''}
              {notifs.unreadCount > 0 ? (
                <button
                  className="btn-secondary"
                  style={{ float: 'right', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                  onClick={markAllRead}
                >
                  Marcar todas leídas
                </button>
              ) : null}
            </h2>
            {notifs.notifications.length === 0 ? (
              <p className="section-empty">Sin notificaciones todavía.</p>
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
            <h2>Quests del día</h2>
            {quests.length === 0 ? (
              <p className="section-empty">Sin quests activas.</p>
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
                      Premio: <strong>{q.rewardAxs} AXS</strong>
                    </div>
                    {q.completed && !q.claimed ? (
                      <button className="quest-claim" onClick={() => claimQuest(q.id)}>
                        Reclamar {q.rewardAxs} AXS
                      </button>
                    ) : null}
                    {q.claimed ? (
                      <button className="quest-claim" disabled>
                        ✓ Reclamada
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
