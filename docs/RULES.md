# Reglas de Axie Duel

Versión: Fase 0 — borrador. Refleja la sección 4 del MASTER_PROMPT.

## 1. Setup de la partida

| Parámetro                | Valor                                       |
| ------------------------ | ------------------------------------------- |
| Life Points iniciales    | **8000**                                    |
| Mazo principal           | 40-60                                       |
| Extra Deck               | 0-15 (Fusion / Synchro-like)                |
| Side Deck                | 0-15 (entre rondas BO3)                     |
| Mano inicial             | 5                                           |
| Mano máxima              | 7 (descarte forzado al fin de turno)        |
| Copias por carta en mazo | Máximo **3**                                |
| Tiempo por turno         | 90s + banco de 60s                          |
| Formato                  | BO3 en ranked, BO1 en casual                |

## 2. Zonas del campo (por jugador)

- **Deck Zone** (boca abajo)
- **Extra Deck Zone**
- **Hand** (privada)
- **Monster Zone** (5 espacios)
- **Spell/Trap Zone** (5 espacios)
- **Field Spell Zone** (1)
- **Graveyard** (público)
- **Banished Zone** (desterrado)

## 3. Fases del turno

```
Draw → Standby → Main 1 → Battle → Main 2 → End
```

- **Draw:** roba 1. El primer jugador del turno 1 NO roba.
- **Standby:** efectos de mantenimiento.
- **Main 1:** invocar / set / activar magias y trampas / cambiar posición.
- **Battle:** declarar ataques. El primer jugador del turno 1 NO puede atacar.
- **Main 2:** mismas acciones que Main 1 (con restricciones).
- **End:** descarte si hay >7 cartas; resolución de "hasta el final del turno".

## 4. Tipos de carta

### 4.1 Monstruos (los Axies)

- Niveles 1-12.
- Niveles 1-4: invocación normal sin sacrificios.
- Niveles 5-6: 1 sacrificio.
- Niveles 7+: 2 sacrificios.
- 1 invocación normal por turno. Las especiales no cuentan al límite.

### 4.2 Magias (Spell)

`Normal | Continuous | Quick-Play | Equip | Field | Ritual` — comportamiento estándar Yu-Gi-Oh!.

### 4.3 Trampas (Trap)

`Normal | Continuous | Counter`. Deben colocarse boca abajo (Set) y solo se activan en el siguiente turno o después.

## 5. Sistema de cartas (3 capas)

1. **Axie como Monster:** sus 6 partes son el "build" de la carta.
2. **Cada parte → habilidad:** dos Axies con stats parecidos pero partes distintas son cartas diferentes.
3. **Skill Cards (Magia/Trampa):** habilidades clásicas de Axie Origins. Algunas requieren controlar un Axie de cierta clase.

## 6. Combate

- **ATK vs ATK:** menor ATK destruido. Diferencia de ATK = LP perdidos por el defensor.
- **ATK vs DEF arriba:** ATK > DEF → defensor destruido sin daño. ATK < DEF → atacante recibe diferencia. ATK == DEF → nada.
- **ATK vs DEF abajo:** se voltea (flip), aplica regla anterior.
- **Daño directo:** sin monstruo defensor, ATK del atacante = LP perdidos.

## 7. Cadena (Chain) y Spell Speed

- **Speed 1:** Magias normales, efectos de monstruos ignición.
- **Speed 2:** Magias rápidas, trampas normales, efectos rápidos de monstruo.
- **Speed 3:** Trampas Contraefecto.
- Resolución **LIFO** (último en activar, primero en resolver).
- Ventana de respuesta: **15s** tras cada activación.

## 8. Condiciones de victoria

1. LP del oponente = 0.
2. Deck-out.
3. Condición especial de carta.
4. Rendición o desconexión > 60s en ranked.

## 9. Mulligan

Al iniciar la partida, cada jugador puede rebarajar la mano inicial **una vez**.

## 10. Modos

- **PvE:** Campaña, Daily Trials, Practice.
- **PvP Casual:** sin ELO, BO1.
- **PvP Ranked:** ELO, BO3.
- **PvP Ranked Premium:** requiere ≥3 Axies NFT, recompensas en cripto.
