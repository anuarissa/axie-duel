'use client';

import { useEffect, useState } from 'react';

/**
 * Soft overlay que sugiere rotar el dispositivo a landscape cuando se está jugando
 * /play/pve en portrait <768px. No bloquea — el usuario puede continuar igual.
 *
 * Persiste el dismiss en sessionStorage para que no aparezca en cada reload.
 */
export function RotateDeviceHint() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('rotate-dismissed') === '1') {
      setDismissed(true);
      return;
    }
    const check = () => {
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      const isMobile = window.innerWidth < 768;
      setShow(isPortrait && isMobile);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  function dismiss() {
    sessionStorage.setItem('rotate-dismissed', '1');
    setDismissed(true);
  }

  if (!show || dismissed) return null;
  return (
    <div className="rotate-hint-backdrop" role="dialog" aria-modal="true">
      <div className="rotate-hint-modal">
        <div className="rotate-hint-icon" aria-hidden="true">📱</div>
        <h2>Girá tu dispositivo</h2>
        <p>El campo de batalla se ve mejor en horizontal. Rotá el celular para una experiencia óptima.</p>
        <button type="button" onClick={dismiss}>Continuar igual</button>
      </div>
    </div>
  );
}
