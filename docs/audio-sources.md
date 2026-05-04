# Audio sources — Axie Duel

## Estado actual

- **SFX (sound effects)**: 100% sintetizados con Web Audio API en
  `apps/web/src/lib/sound.ts`. Cero archivos, cero licencias, cero round-trips.
  Reproducen instantáneamente al disparar (`sound.play('attackHit')` etc).
  Cada SFX usa oscillators / noise / envelopes generados en runtime.
- **Background music (BGM)**: NO incluida por defecto. El engine intenta cargar
  `apps/web/public/sounds/bgm.mp3` (o `.ogg`) lazy en `sound.startBgm()`.
  Si el archivo no existe, los SFX siguen funcionando — la música es opcional.
- **Controles**: `<SoundControls>` montado en dashboard header + play page toolbar.
  Slider master SFX, slider música, mute toggle. Persiste en `localStorage`.

## ¿Por qué NO usamos la música/SFX de Axie Infinity?

- **Copyright**: Sky Mavis es dueño de toda la música y SFX de Axie Infinity /
  Axie Origins / Axie Infinity Origin. Usar esos assets sin licencia es
  infracción incluso para "test interno" — basta con que un build se filtre
  o el repo sea público (o se haga deploy a un dominio público) para tener problemas.
- **Plan**: cuando avancemos a partnership con Sky Mavis (Mavis Hub submission,
  Fase 7), pedimos licencia de los assets oficiales como parte del deal. Hasta
  entonces, royalty-free.

## Recomendaciones royalty-free para la BGM

### Opción A — Free Music Archive (FMA) / OpenGameArt.org

Buscar en [opengameart.org/art-search-advanced](https://opengameart.org/) por:
- "Anime fantasy battle loop" (CC0 / CC-BY)
- "JRPG menu theme"
- "Tactical RPG combat"

Filtros: License = CC0 (no atribución requerida) o CC-BY (basta con créditos).
Formato: OGG o MP3, 1–3 min, loopable.

Bajar el archivo y dropearlo como:
```
apps/web/public/sounds/bgm.mp3
```
El engine lo detecta automáticamente — no requiere cambios de código.

### Opción B — Pixabay Music (license-free)

[pixabay.com/music/search/anime%20battle/](https://pixabay.com/music/search/anime%20battle/) tiene
tracks marcados "Pixabay Content License" (uso libre comercial, sin créditos).
Filtros recomendados:
- Genre: Game / Cinematic / Anime
- Mood: Epic / Mystical / Adventure
- Duration: 1–3 min
- Loopable: yes

Tracks que dan vibra estilo Axie (mascot/anime):
- "Tavern Music" (medieval ambient)
- "Battle of the Dragons" (epic JRPG)
- "Magical Forest" (mystical chill)

### Opción C — Kevin MacLeod (incompetech.com)

[incompetech.com/music/royalty-free/](https://incompetech.com/music/royalty-free/) — CC-BY 3.0,
requiere crédito en los créditos del juego (ej: "Music: 'Adventure Meme' by
Kevin MacLeod, CC-BY 3.0"). Géneros: Game / Action / Adventure.

## Recomendaciones para SFX adicionales (si se quieren reemplazar los sintéticos)

- [freesound.org](https://freesound.org/) con filtro "License: Creative Commons 0".
  Buscar: "card flip", "sword clash", "magic spell", "coin pickup".
- [zapsplat.com](https://zapsplat.com/) — gratis con cuenta, licencia royalty-free.

Si se reemplazan los sintéticos por archivos reales:
1. Drop archivos en `apps/web/public/sounds/sfx/` (ej: `attack-hit.mp3`).
2. En `lib/sound.ts`, en cada `case 'attackHit':` etc, en vez de llamar
   `synthClash`, instanciar `new Audio('/sounds/sfx/attack-hit.mp3')` con
   pre-carga al boot.
3. Mantener fallback al sintético si el fetch falla (o si el master volume está en 0).

## Checklist legal antes de release pública (Fase 6/7)

- [ ] Verificar licencia de cada asset de audio (CC0 / Pixabay / CC-BY con crédito).
- [ ] Si CC-BY, agregar créditos en `apps/web/src/app/credits/page.tsx`.
- [ ] No usar tracks de YouTube / Spotify / streaming services.
- [ ] No usar SFX rippeados de juegos comerciales (Yu-Gi-Oh Master Duel, Hearthstone, Axie Infinity, etc).
- [ ] Si se piensa monetizar (sobres pagos, NFTs), que la licencia permita uso comercial — CC0 sí, CC-BY-NC NO.
