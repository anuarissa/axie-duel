/**
 * BrandedLoadingScreen — Splash animado AXIE DUEL para usar en cualquier página
 * mientras carga data inicial. Mismo lenguaje visual que el dashboard skeleton +
 * splash de conexión al duel server.
 *
 * Uso:
 *   if (loading) return <BrandedLoadingScreen subtitle="Loading the catalog…" />;
 */

export function BrandedLoadingScreen({ subtitle }: { subtitle?: string }) {
  return (
    <main className="branded-loading" aria-busy="true">
      <div className="skeleton-splash branded-loading-splash">
        <div className="skeleton-splash-logo">AXIE DUEL</div>
        <div className="skeleton-splash-dots">
          <span></span><span></span><span></span>
        </div>
        <div className="skeleton-splash-sub">{subtitle ?? 'Loading…'}</div>
      </div>
    </main>
  );
}
