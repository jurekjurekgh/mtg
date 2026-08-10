# PLAN 2026-08-10 — Daybound/Nightbound jako globalny znacznik (M68)

Data: 2026-08-10. Sesja: `arena/019fe7ec-mtg` (PR #39). Zlecenie właściciela:
„czy daybound wilkołaków jest w engine? powinien być globalny znacznik — specjalna
karta na stole (img day/night ze Scryfall), transformująca wg MtG; globalne
mechanizmy (Inicjatywa/Lochy) powinny być spójne".

## Rozpoznanie (wykonane przed planem)

- **Inicjatywa + Lochy: JUŻ JEST (M24)** — `state.initiativePlayerId` +
  `state.undercityProgress`, `renderUndercity` (render.js) pokazuje globalną kartę
  The Undercity (img ze Scryfall tclb/20), znacznik „Inicjatywa: <gracz>", pokoje
  per gracz (current/done). Spójny wzorzec „globalna karta + znacznik".
- **Daybound/Nightbound: BRAK** (grep po `daybound|nightbound|dayNight` pusty).
- **Civilized Scholar // Homicidal Brute (ISD 2011) to zwykły transform DFC**, NIE
  daybound — jego przemiana zależy od odrzucenia stwora / ataku. To samo dotyczy
  obecnych wilkołaków (grizzled-outcasts, scorned-villager — transform upkeep).
  Day/night NIE może ich ruszać.
- Token „Day // Night" (TVOW 21) pobrany ze Scryfall (front/back large).

## Mechanika (CR 708.9, minimalnie-poprawna, generyczna)

- `state.dayNight: null | 'day' | 'night'` — GLOBALNY znacznik gry (jak inicjatywa).
- `lastTurnSpellsCastByPlayer` — czary poprzedniej tury PER GRACZ (kopiowane przy
  zmianie tury z spellsCastThisTurnByPlayer).
- Wyzwalacze (w processTriggers / resolvePermanentSpell):
  1. Wejście permanenta z keywordem `daybound` przy `dayNight === null` → staje się
     `day` (CR 708.9c).
  2. Wejście daybound przy `night` → wchodzi jako nightbound („Permanents enter the
     battlefield nightbound" — transform przed skanem ETB).
  3. Rzut czaru (spell_cast/permanent_cast/aura_spell_cast): gdy `dayNight !== 'night'`
     i na bitwisku jest permanent z `daybound` → staje się `night` (CR 708.9d —
     „first time ... after a daybound permanent entered"; warunek dayNight!=night
     naturalnie ogranicza do pierwszego rzutu) + transform wszystkich daybound.
  4. Upkeep aktywnego gracza: gdy `night` i aktywny nie rzucił czarów w SWOJEJ
     poprzedniej turze (`lastTurnSpellsCastByPlayer[active] === 0`) → `day`
     (CR 708.9f) + transform wszystkich nightbound.
- `setDayNight(state, designation)` — ustawia znacznik, transformuje in-place
  (jak efekt transform) wszystkie permanenty z keywordem `daybound` (→ night) /
  `nightbound` (→ day), emituje `day_night_changed`.
- Transformacja NIE dotyka kart bez daybound/nightbound (stary transform DFC —
  Civilized Scholar itd. zostają nietknięte).
- PlayerView: `dayNight` (publiczna informacja globalna, jak initiativePlayerId).
- Fingerprint: `dayNight` (determinizm replay).

## UI (spójne z renderUndercity)

- `renderDayNight(els, session, view)` — karta Day//Night (img front/back wg
  designation, TVOW 21), status „Dzień" / „Noc"; ukryta gdy `dayNight === null`.
  Panel obok lochu (ten sam wzorzec CSS).
- index.html: `#daynight` + style (reuse .undercity-panel); main.js: els.daynight.

## Testy (syntetyczne obiekty — brak realnych kart daybound w katalogu)

`test/daybound-nightbound.test.js`:
- wejście daybound przy null → day;
- rzut czaru przy daybound na stole → night + transform daybound → nightbound
  (cardId/P/T); brak daybounda → brak zmiany;
- upkeep aktywnego w nocy bez czaru w jego poprzedniej turze → day + transform wstecz;
  z czarem → zostaje night;
- wejście daybound w nocy → wchodzi jako nightbound;
- stary transform (civilized-scholar) NIE rusza się przy day/night;
- PlayerView niesie dayNight (obaj gracze); fingerprint obejmuje dayNight (replay).

## Etapy (commity w PR #39, każdy zielony)

1. **Plan** — ten plik.
2. **Engine** — game-state (dayNight, lastTurnSpellsCastByPlayer, setDayNight),
   triggers (wyzwalacze 1/3/4), spells.resolvePermanentSpell (wejście nightbound),
   protocol (day_night_changed), PlayerView, fingerprint.
3. **UI** — renderDayNight + index.html + main.js (els.daynight).
4. **Testy** — test/daybound-nightbound.test.js.
5. **Benchmark + docs** — B0 1080 (procesTriggers zmienione — bez zmian botów),
   ENGINE_MILESTONES M68, PROJECT_STATE, ROADMAP, HANDOFF_2026-08-10a, opis PR.

## Pułapki

- `edit_file` psuje PL → python3; commit msg przez /tmp.
- Transform in-place (id zostaje, cardId się zmienia) — testy po cardId.
- Day/night NIE dotyka starych transformów (warunek po keywordach daybound/nightbound).
- Wyzwalacz rzutu: tylko gdy dayNight !== 'night' (naturalny „first time").
- Upkeep: PER GRACZ (lastTurnSpellsCastByPlayer), nie globalny lastTurnSpellsCast.
- Wejście nightbound: transform przed processTriggers (ETB odpala się na nightbound
  stronie) — w resolvePermanentSpell.
- DayNight to informacja publiczna (jak inicjatywa) — PlayerView bez FoW.
- Benchmark 1080 wystarczy (boty/talie bez zmian); pełne B0 tylko jeśli coś się zmieni.
