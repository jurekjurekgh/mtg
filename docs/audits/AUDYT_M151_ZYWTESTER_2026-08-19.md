# Audyt M151 — Żywy Tester stołu, wcielenie w rolę gracza (2026-08-19)

**Zlecenie:** rozegraj partie istniejącymi taliami przeciw botowi, obserwuj stół
i zbierz **10 unikalnych błędów/usterek/niejasności/głupich zachowań bota**;
napraw je; z logu dodaj nowe reguły detektorów. Uwaga na nowo dodane karty
(Batch 35/36/37).

**Metoda (zgodnie z TESTER_STOLU.md):** `tools/table-tester/run-game.mjs` na
prawdziwym artefakcie (`npm run build` + `npm i` w `tools/table-tester`).
Rozegrano partie: black/green, mechanicy/red, azorius/black, spellslinger/green,
green/black, red/azorius, black/mechanicy, green/red, green/azorius,
red/graveyard — różne seedy i profile. Transkrypty analizowano ręcznie + przez
detektory.

⚠️ **Ważne (zgodnie z instrukcją właściciela):** transkrypt testera odwzorowuje
to, co tester MA ZAKODOWANE renderować — każdy objaw potwierdzono w kodzie
UI/engine (render.js, session.js, game-state.js), zanim uznano go za błąd.
Część to artefakty narzędzia (L: odróżniaj artefakt od błędu produktu).

## Znaleziska i naprawy (10)

### Produkt / UX

1. **Szum `mana_produced` w głównym logu gracza.** TESTER_STOLU.md dokumentuje
   go jako wyciszony, a `describeEvent` zwraca dla niego tekst → `apply()`/
   `streamAutoEvents()` wpisywały „Nieprzyjaciel przygotowuje manę (Swamp)”
   (18× w jednej partii). Naprawa: `MAIN_LOG_NOISE` w `session.js` filtruje
   `mana_produced` w obu ścieżkach logu (modal miał własną bramkę).
   Test: detektor `detectLogNoiseLeak` + testy.

2. **Szum `step_advanced` w głównym logu gracza.** Ten sam root cause:
   „— beginning/upkeep —”, „— combat/declare_attackers —” (140× w jednej
   partii) — udokumentowane jako wyciszone, a trafiały do logu. Naprawione
   tym samym `MAIN_LOG_NOISE`.

3. **Oferty rzutu z odbiciem/zawieszonego nieodróżnialne.** `resolve_rebound_cast`
   i `resolve_suspend_cast` enumerują osobną ofertę PER cel (suspendCastOffers),
   a etykieta „Rzuć z odbiciem: Ojutai's Breath (bez kosztu many)” nie pokazywała
   celu → 4 identyczne przyciski, gracz nie wie, w co celuje. Naprawa: etykiety
   dopisują „→ cel: X” (spójnie z `cast_spell`).

4. **Etykieta `suspend_card` pokazywała „koszt ?”.** Widok ręki nie niósł
   deskryptora `suspend`, więc label czytał `card?.suspend?.cost` = undefined → „?”.
   Naprawa: `suspend` dodane do widoku ręki w `playerView` (jak `plot`).

5. **Etykieta `suspend_card` miała złą odmianę „4 liczników”.** (2–4 → „liczniki”).
   Naprawa: `polishPluralCount(n,'licznik','liczniki','liczników')`.

6. **Koszt suspend wyświetlany jako generyczne {N} zamiast koloru.** Mindstab
   Suspend 4—{B} pokazywało „koszt 1” (= {1}) zamiast „{B}”. `suspend.cost` to
   liczba jednostek many, `suspend.colors` narzuca kolory. Naprawa: render pipów
   kolorów + pozostałą część generyczną (to samo kodowanie co koszt czaru).

7. **Przeciek surowego identyfikatora `resolve_exploit_choice`** do panelu akcji
   (Silumgar Butcher — Exploit). `REASONING_ACTION_LABELS` nie miało wpisu →
   fallback na `cmd.type`. Naprawa: czytelna etykieta „Exploit (wybór poświęcenia)”.

8. **Stos pokazywał „→ cel: <źródło>” dla bezcelowych zdolności/permanentów.**
   „Ghoulcaller's Bell (rzuca: Nieprzyjaciel) → cel: Ghoulcaller's Bell”,
   „Goblin Picker → cel: Goblin Picker”, „Incubator → cel: Incubator” itd.
   Root cause: `activatedEntry.targets` to `[sourceId]` (slot dla applyEffect),
   a widok eksponował go jako „cel”. Naprawa: PlayerView ujawnia `activatedEntry.targets`
   tylko, gdy zdolność je faktycznie ma (`ability.targets?.length`).
   Test: `test/stack-targetless-m151.test.js` (bezcelowa nie niesie celu; z celem
   zachowuje — anty-over-fix).

### Tester (narzędzie)

9. **Tester zatrzymywał się na akcjach „Poświęć: …”, „Rzuć z odbiciem: …”,
   „Rzuć zawieszone: …”.** `pickAction` nie znał tych wzorców → `[STOP]` w oknie,
   w którym człowiek po prostu kliknąłby. Naprawa: wzorce dodane do `mandatory`.
   To blokowało dalszy audyt (Liliana's Triumph zmusza do poświęcenia; Ojutai's
   Breath odbija się).

10. **Detektor `detectFalseNoEffect` zgłaszał fałszywe alarmy** (Veiled Ascension
    „zerowy wynik” + osobny pump Akrasan Squire w tym samym oknie → konflacja
    dwóch niezależnych triggerów). Naprawa: okno POJEDYNCZE tylko naprzód — legalny
    przypadek L24 ma skutek jako następny wpis, inny trigger wchodzi między nie
    innymi zdarzeniami. Test regresyjny w `m138-detektory`.

## Nowe reguły detektorów (prośba właściciela)

- **`detectLogNoiseLeak`** (`info`) — strażnik nawrotu klas 1–2: zgłasza
  „przygotowuje manę” / „— faza/krok —” w logu gracza. Wykrywa w starych
  transkryptach (g1: 3, g4c: 5), milczy po naprawie. Testy w `m138-detektory`.

## Weryfikacja

- `npm run test:all`: **2405/2405** (było 2390; +15 nowych: 2× stack-targetless,
  suspenda/rebound/exploit, 3× detektor log-noise, detektor Z4-M151, itd.).
- `npm run build`: 51 modułów / ~2034 kB.
- Partia po naprawach (`red vs graveyard`, seed 41): stos bez „→ cel: <źródło>”,
  log bez szumu many/faz, suspend „koszt B, 4 liczniki czasu”.
