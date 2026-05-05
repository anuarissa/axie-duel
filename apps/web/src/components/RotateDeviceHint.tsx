'use client';

import { useEffect, useState } from 'react';

/**
 * BLOCKING overlay: el juego SOLO se puede jugar en landscape mobile.
 * Si el user abre /play/pve en portrait <768px, esta pantalla bloquea
 * todo hasta que rote el dispositivo. NO hay "continuar igual" — la UI
 * de juego está optimizada solo para landscape.
 *
 * También intenta lock orientation via Screen Orientation API si el browser
 * lo soporta (requiere fullscreen previo en algunos browsers, no garantía).
 */
export function RotateDeviceHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => {
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      const isMobile = window.innerWidth < 900;
      setShow(isPortrait && isMobile);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    // Best-effort: intentar lock orientation a landscape. Falla silently en navegadores
    // que requieren fullscreen o no soportan la API. No es bloqueante.
    const screenObj = (typeof screen !== 'undefined' ? screen : null) as
      | (Screen & { orientation?: { lock?: (o: string) => Promise<void> } })
      | null;
    if (screenObj?.orientation?.lock) {
      screenObj.orientation.lock('landscape').catch(() => undefined);
    }

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!show) return null;
  return (
    <div className="rotate-hint-backdrop" role="dialog" aria-modal="true">
      <div className="rotate-hint-modal">
        <div className="rotate-hint-icon" aria-hidden="true">📱</div>
        <h2>Girá tu dispositivo</h2>
        <p>
          Axie Duel solo se puede jugar en <strong>horizontal</strong>.
          Rotá tu celular para continuar.
        </p>
        <div className="rotate-hint-pulse-arrow" aria-hidden="true">↻</div>
      </div>
    </div>
  );
}
