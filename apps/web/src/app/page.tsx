export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            margin: '0 0 1rem',
            letterSpacing: '-0.03em',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #f9b9ff 0%, #6b8eff 50%, #00d2ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          AXIE DUEL
        </h1>
        <p style={{ fontSize: '1.125rem', opacity: 0.75, maxWidth: 560, margin: '0 auto 2rem', lineHeight: 1.7 }}>
          TCG por turnos estilo Yu-Gi-Oh! ambientado en Axie Infinity, sobre Ronin Chain. Fase 0
          del monorepo lista. Frontend completo en Fase 5 del roadmap.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.875rem' }}>
          <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.875rem', borderRadius: '0.5rem' }}>
            game-server :2567
          </code>
          <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.875rem', borderRadius: '0.5rem' }}>
            api :3001
          </code>
          <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.875rem', borderRadius: '0.5rem' }}>
            web :3000
          </code>
        </div>
      </div>
    </main>
  );
}
