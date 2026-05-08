# HOWTO — Grabar y subir el video walkthrough a YouTube

> **Objetivo**: producir un video de **5 minutos exactos** mostrando Axie Duel en vivo, subido a YouTube como **No listado**, con link listo para pegar en el pitch deck y el email a Sky Mavis.
>
> **Tiempo estimado total**: 60–90 minutos (incluyendo 2-3 takes de práctica).
>
> **Es tu primera vez**: tomalo con calma. Hacé un take de prueba primero. Si quedó decente, no lo retoques — perfecto es enemigo de bueno.

---

## Antes de empezar — checklist (5 min)

### Físico
- [ ] Auriculares **con micrófono** (no el del notebook — saca eco). Si solo tenés el del notebook, igual sirve para una primera versión.
- [ ] Cuarto silencioso. Cerrá ventanas, apagá ventilador, avisá que no te interrumpan.
- [ ] Vaso de agua a mano (la voz se seca después de leer 5 min seguidos).

### PC y entorno
- [ ] **Modo "No molestar" de Win11**: clickeá en el reloj abajo a la derecha → "No molestar". Esto silencia notificaciones de Discord/WhatsApp/Slack/Outlook.
- [ ] **Cerrá apps innecesarias**: Spotify, Discord, WhatsApp, Slack, juegos. Liberá RAM.
- [ ] **Hide tray icons**: ocultá iconos de notificación del system tray para que no aparezcan en el video.
- [ ] **Wallpaper**: usá uno neutro o color sólido oscuro. Nada con info personal o memes.

### Navegador (Chrome)
- [ ] Abrí Chrome en una **ventana nueva** sin extensiones visibles
- [ ] Cerrá todas las pestañas que no sean del juego
- [ ] **Logueate** en `https://axie-duel.vercel.app` con una cuenta de prueba
- [ ] Pone el zoom en **100%** (Ctrl + 0 lo resetea)
- [ ] Verificá que `/my-axies` carga y "Run demo" funciona (≈ 2 segundos para 5 cards)
- [ ] Bookmark bar: ocultalo (Ctrl+Shift+B)

### El guión — IMPRIMILO en papel
- [ ] Abrí [`pitch/VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md) (o su `.pdf` en `pitch/exports/`)
- [ ] **Imprimílo o pegalo en una segunda pantalla / tablet**. NO lo leás mientras grabás del mismo monitor — se ve cuando estás leyendo del navegador y rompe la inmersión.
- [ ] Marcá con resaltador las **palabras clave** de cada sección. Vas a leer las palabras clave, no el texto literal.

---

## Camino A — OBS Studio (RECOMENDADO — gratis, calidad pro)

> Ya está instalado en `C:\Program Files\obs-studio\bin\64bit\obs64.exe`. Página oficial: https://obsproject.com/ · Versión: 32.1.2.

### Setup primera vez (5 min, una sola vez)

1. **Abrir OBS** desde el menú Inicio
2. **Auto-Configuration Wizard** salta automáticamente la primera vez:
   - "What do you want to use OBS for?" → **Optimize just for recording** (NOT streaming)
   - Resolution: **1920 × 1080**
   - FPS: **30**
   - Click "Apply Settings"
3. **Agregar tu pantalla como fuente**:
   - En la sección **Sources** (parte inferior izquierda): click **+** → **Display Capture** → OK
   - "Display": Monitor 1 (tu pantalla principal) → OK
   - Vas a ver tu escritorio en el preview de OBS
4. **Configurar el micrófono**:
   - En **Audio Mixer** (parte inferior central): debería aparecer "Mic/Aux"
   - Si no aparece o está apagado: **Settings (engranaje arriba a la derecha) → Audio → Mic/Auxiliary Audio Device → seleccionar tu micrófono real** (ej. "Headphones (Realtek)")
   - **Importante**: silenciá "Desktop Audio" si no querés que se escuche música de fondo o sonidos del sistema en el video
5. **Configurar la salida**:
   - **Settings → Output → Recording Path**: poné `C:\Users\Anuar\Videos\AxieDuel\` (creá la carpeta antes en Explorer)
   - **Recording Format**: **mp4** (NO mkv — YouTube prefiere mp4)
   - Click "Apply" → "OK"
6. **(Opcional pero recomendado) Hotkeys**:
   - **Settings → Hotkeys**:
     - "Start Recording" → **F9**
     - "Stop Recording" → **F10**
     - Apply → OK
   - Ahora podés grabar/parar sin alt-tabbear a OBS.

### Grabar el video walkthrough

1. **Abrí Chrome** con `axie-duel.vercel.app` ya logueado, en la página de inicio
2. **Volvé a OBS** → click **"Start Recording"** (o presioná **F9**)
3. **Esperá 2 segundos en silencio**, contá mentalmente "tres, dos, uno…"
4. **Alt + Tab** a Chrome
5. **Empezá a leer el guión** de [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md) en voz **clara y pausada** mientras navegás
6. **Si te equivocás**:
   - Pausá 3 segundos en silencio (eso te da una marca limpia para editar después)
   - Repetí la frase
   - O detenés todo (F10), volvés a empezar
7. **Al final del video**: pausá 2 segundos en silencio, después F10 (Stop Recording)
8. **El archivo** se guarda automáticamente en `C:\Users\Anuar\Videos\AxieDuel\<fecha-hora>.mp4`

### Tips para que se vea pro

- **Mostrar cursor**: OBS ya lo muestra por defecto. Si no, en la fuente Display Capture click derecho → Properties → marcá "Capture Cursor"
- **Resaltar el cursor** (opcional, lo hace ver más pro): instalar [Cursor Effects](https://cursoreffects.com/) o usar el built-in de Win11: Settings → Bluetooth & devices → Mouse → Mouse pointer → activar "Enhance pointer precision"
- **Cerrar pestañas** que no usás antes de grabar
- **Hablá un 20% más lento** de lo normal — la gente perdona ritmo lento, no entonación entrecortada

---

## Camino B — ShareX (alternativa más simple)

> Ya está instalado. Página oficial: https://getsharex.com/ · Versión: 20.1.0.

1. ShareX corre en el system tray (ícono rojo abajo a la derecha)
2. Click derecho en el icono → **Capture → Screen recording → Custom region**
3. Marcás el área a grabar (toda la ventana de Chrome)
4. Empieza a grabar automáticamente — vas a ver una barra roja en la pantalla
5. Click en **Stop** cuando termines (o usás el hotkey por defecto: **Ctrl+Shift+PrtScn** para parar)
6. El video queda en `Documents\ShareX\Screenshots\<fecha>\` como `.mp4`

ShareX es más simple pero **no tiene preview en vivo del audio** — es difícil saber si tu mic se está captando. Por eso OBS es mejor para la primera vez.

---

## Camino C — Snipping Tool (Win11 built-in, último recurso)

Solo si OBS y ShareX dieron problemas. Limitado: sin captura de cursor highlight, sin overlay control, sin audio del sistema.

1. **Win + Shift + R** abre la herramienta
2. Click en el ícono de **cámara** (grabación de pantalla)
3. Marcá el área a grabar
4. Click en **"Empezar"**
5. Cuando termines: click en el botón de stop
6. Se guarda en `Videos\Capturas de pantalla\`

---

## Camino D — PowerPoint (si tenés Office)

1. Abrí PowerPoint con una presentación nueva
2. Tab **Insertar → Grabación de pantalla**
3. PowerPoint se minimiza, marcás el área
4. Click en grabar
5. Click en stop → vuelve a PowerPoint con el video embebido
6. Click derecho en el video → **Guardar multimedia como** → exportar `.mp4`

---

## Subir a YouTube — paso a paso

> Tu cuenta de Google ya tiene YouTube habilitado por default.

### 1. Ir a YouTube Studio

- Abrí https://studio.youtube.com en Chrome
- Si pide login: usá tu cuenta de Google (probablemente la misma que `anuarissa117@gmail.com`)
- Si es la primera vez que subís un video: YouTube te va a pedir crear un canal. Aceptá usar tu nombre real ("Anuar Issa" o similar).

### 2. Subir el video

- Click en el botón **"Crear"** arriba a la derecha (ícono de cámara con un +)
- Click en **"Subir videos"**
- **Arrastrá** el archivo `.mp4` desde el Explorador de Windows a la ventana de YouTube, o click en "Seleccionar archivos"
- Empieza a subir mientras llenás los datos (el upload se hace en paralelo)

### 3. Llenar los datos del video

**Pestaña "Detalles"**:

- **Título**: `Axie Duel — Sky Mavis Builders Program submission walkthrough (5 min)`
- **Descripción** — copiá y pegá esto:

```
Axie Duel is a tactical card game where every Axie NFT becomes a unique
playable card via a deterministic algorithm.

· Live: https://axie-duel.vercel.app
· Repo: https://github.com/anuarissa/axie-duel
· Pitch deck + docs in the repo

Submission to the Sky Mavis Builders Program (May 2026).

00:00 Opening hook
00:25 The killer demo (parts → card algorithm)
01:15 Onboarding flow (Web 2.5 — Google sign-in to first match)
01:55 Core game loop (PvE match)
03:00 Deck builder + catalog
03:45 Tournaments + 90/10 burn economy
04:20 Tech under the hood
04:50 Close

Contact: anuarissa117@gmail.com
```

- **Miniatura**: dejá la que YouTube genera por default (después podés subir una custom, no es prioridad)
- **Lista de reproducción**: ninguna
- **Audiencia**: marcá **"No, no es contenido para niños"**
- Scrolleá hasta abajo → click en **"MOSTRAR MÁS"**:
  - **Etiquetas**: pegá `axie infinity, ronin, web3 gaming, tcg, sky mavis, builders program, axie duel, blockchain games, card game`
  - Idioma del video: **Spanish** o **English** según hayas grabado

Click en **"SIGUIENTE"** abajo a la derecha.

**Pestaña "Elementos del video"**: skip — click en **"SIGUIENTE"**.

**Pestaña "Comprobaciones"**: YouTube revisa por copyright. Esperá unos segundos, debería decir "No se encontraron problemas". Click en **"SIGUIENTE"**.

**Pestaña "Visibilidad"**:

- **CRÍTICO**: marcá **"No listado"** (NOT "Público", NOT "Privado")
- "No listado" = solo accesible con el link directo. No aparece en búsquedas. Perfecto para mandar a Sky Mavis sin exponerlo público.
- Click en **"GUARDAR"** abajo a la derecha

### 4. Copiar el link

- En YouTube Studio vas a ver tu video en la lista
- Click en el botón **Compartir** (ícono de flecha hacia adentro y afuera) → click "Copiar"
- El link va a ser tipo `https://youtu.be/abc123XYZ` o `https://www.youtube.com/watch?v=abc123XYZ`
- **Pegalo inmediatamente** en:
  1. Slide 5 de [`pitch/PITCH_DECK.md`](./PITCH_DECK.md) (busca `[YouTube unlisted link]` y reemplazalo)
  2. El email final que vas a mandar (template #1 en [`pitch/EMAIL_TEMPLATE.md`](./EMAIL_TEMPLATE.md))
  3. La descripción del repo en GitHub (opcional)

---

## Errores comunes y cómo arreglarlos

| Síntoma | Causa | Fix |
|---|---|---|
| Voz muy baja en el video | Mic mal configurado en OBS | OBS → Settings → Audio → Mic/Auxiliary → seleccionar el dispositivo correcto. Probá con un audio test antes de grabar. |
| Cursor invisible en el video | Display Capture sin "Capture Cursor" | OBS → click derecho en Display Capture → Properties → marcar "Capture Cursor" |
| Video sale gigante (> 500 MB) | Bitrate muy alto, o resolución 4K | OBS → Settings → Output → Recording → Bitrate: 8000 Kbps (más que suficiente para 1080p) |
| YouTube tarda 30+ min en procesar | Resolución 4K + duración larga | Bajá a 1080p antes de subir, o esperá. Para "No listado" igual podés mandar el link aunque YouTube esté procesando — funciona. |
| Audio se escucha con eco | Estás usando el mic del notebook + parlantes | Usá auriculares (cualquier auricular suprime el eco) |
| El navegador se ve "raspado" | Resolución de la pantalla menor que 1080p | Settings de Win11 → Pantalla → Escala 100% y Resolución 1920×1080 mínimo |
| Te equivocás varias veces leyendo | Estás leyendo el guión literal mientras grabás | Marcá palabras clave con resaltador y leelas como referencia, no el texto entero. Hablá natural, no monótono. |

---

## Checklist final antes de mandar el video a Sky Mavis

- [ ] El video dura entre **4:30 y 5:30** (cerca de 5 min, no menos no más)
- [ ] El audio se escucha clarito sin distorsión
- [ ] No hay notificaciones visibles en pantalla
- [ ] Se ve el cursor todo el tiempo
- [ ] **Visibilidad: "No listado"** confirmada en YouTube Studio
- [ ] **Capítulos** activos (los `00:00`, `00:25`, etc. de la descripción se ven como capítulos en YouTube)
- [ ] Probaste el link en una **ventana incógnito** y carga sin pedir login
- [ ] Pegaste el link en el pitch deck y en el email

Cuando estos 8 ítems están ✓, estás listo para Day 0 → Day 1 del plan de envío. Ver [`HOWTO_SEND_TO_SKY_MAVIS.md`](./HOWTO_SEND_TO_SKY_MAVIS.md).
