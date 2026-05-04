'use client';

/**
 * SoundControls — Mini popover con mute toggle + master SFX slider + BGM slider.
 *
 * Variantes:
 *   - "compact" (default): solo el botón 🔊/🔇 + popover con sliders al click
 *   - "expanded": botón + slider inline (para dashboard)
 *
 * Uso:
 *   <SoundControls />                 // compact
 *   <SoundControls variant="expanded" />
 */

import { useEffect, useState } from 'react';
import { sound } from '../lib/sound';

export function SoundControls({ variant = 'compact' }: { variant?: 'compact' | 'expanded' | 'full' }) {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  // Subscribe to engine state changes (so all instances stay in sync).
  useEffect(() => {
    const unsub = sound.subscribe(() => force((n) => n + 1));
    return unsub;
  }, []);

  const muted = sound.muted;
  const vol = Math.round(sound.volume * 100);
  const bgmVol = Math.round(sound.bgmVolume * 100);
  const icon = muted ? '🔇' : vol >= 60 ? '🔊' : vol >= 20 ? '🔉' : '🔈';

  const button = (
    <button
      type="button"
      className={`sound-controls-btn ${muted ? 'muted' : ''}`}
      onClick={() => {
        if (variant === 'compact') setOpen((v) => !v);
        else sound.toggleMute();
      }}
      title={muted ? 'Unmute (M)' : 'Sound options'}
      aria-label={muted ? 'Unmute' : 'Sound options'}
    >
      {icon}
    </button>
  );

  const slider = (
    <input
      type="range"
      min={0}
      max={100}
      value={vol}
      onChange={(e) => sound.setVolume(Number(e.target.value) / 100)}
      className="sound-controls-slider"
      aria-label="SFX volume"
      title={`SFX volume: ${vol}%`}
    />
  );

  const bgmSlider = (
    <input
      type="range"
      min={0}
      max={100}
      value={bgmVol}
      onChange={(e) => sound.setBgmVolume(Number(e.target.value) / 100)}
      className="sound-controls-slider"
      aria-label="Music volume"
      title={`Music volume: ${bgmVol}%`}
    />
  );

  if (variant === 'expanded') {
    return (
      <div className="sound-controls-inline">
        {button}
        {slider}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className="sound-controls-full">
        {button}
        <div className="sound-controls-full-row">
          <span className="sound-controls-full-label" title="SFX volume">🔊</span>
          {slider}
        </div>
        <div className="sound-controls-full-row">
          <span className="sound-controls-full-label" title="Music volume">🎵</span>
          {bgmSlider}
        </div>
      </div>
    );
  }

  return (
    <div className="sound-controls">
      {button}
      {open ? (
        <>
          <div className="sound-controls-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="sound-controls-popover" role="dialog" aria-label="Sound settings">
            <div className="sound-controls-row">
              <button
                type="button"
                className="sound-controls-mute"
                onClick={() => sound.toggleMute()}
              >
                {muted ? '🔇 Unmute' : '🔇 Mute all'}
              </button>
            </div>
            <div className="sound-controls-row">
              <label className="sound-controls-label">SFX</label>
              {slider}
              <span className="sound-controls-value">{vol}%</span>
            </div>
            <div className="sound-controls-row">
              <label className="sound-controls-label">Music</label>
              {bgmSlider}
              <span className="sound-controls-value">{bgmVol}%</span>
            </div>
            <div className="sound-controls-hint">
              Music loads from <code>/sounds/bgm.mp3</code> if present.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
