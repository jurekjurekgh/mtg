# PLAN 2026-09-15f — Dźwięki czarów + ikonki toggle w belce

Zlecenie właściciela (sesja, 2026-09-15): efekty dźwiękowe z ikonką
włącz/wyłącz w górnej belce + zamiana ptaszka „trybu wysoko-graficznego"
na ikonkę toggle. Dźwięk w momencie analogicznym do pokazania warstwy
(FOT/KON/Scryfall), nastrojowy, INNY dla każdego typu czaru (summon,
instant, sorcery itd.). Domyślnie: dźwięki WYŁĄCZONE, hi-gfx WŁĄCZONY.

## Decyzje (E0, rozpoznanie zrobione)

- **Synteza Web Audio, nie pliki wav.** „wavem/dźwiękiem" — bierzemy drugą
  opcję: 7 nastrojowych brzmień (oscylatory + szum + obwiednie) w czystym
  module, zero binariów w repo, działa offline, testowalne headless przez
  wstrzyknięty fake-AudioContext. Struktura (tabela RECIPES za fasadą
  `play(key)`) pozwala podłożyć sample wav później jedną funkcją.
- **Dwa niezależne przełączniki.** Dźwięk gra w chwili POKAZANIA warstwy
  (hook w `openArtShowcase`, więc kolejka M254/C gra porcjami razem
  z obrazem — bez rozjazdu). Gdy warstwy nie będzie (hi-gfx OFF albo karta
  bez artId), dźwięk gra NATYCHMIAST w chwili rzutu — to jest „moment
  analogiczny". Ukryty rzut bota (FoW, M257 r3): ani warstwy, ani dźwięku.
- **Mapowanie typ→dźwięk** (audyt 988 tablic `types` w card-data.js):
  Instant→instant, Sorcery→sorcery, Creature→creature (=summon),
  Enchantment/Aura/Saga/Curse→enchantment, Artifact/Equipment/Vehicle/…→
  artifact, Land/Basic/…→land; 343 tablice z gołymi podtypami
  (`['Angel']`, `['Zombie']`…) → creature; puste/`['Token']` → default.
  Priorytet wielotypów: Instant > Sorcery > Creature > Enchantment >
  Artifact > Land. (Planeswalker/Battle nie występują w danych.)
- **Przycisk, nie checkbox.** Oba przełączniki jako `<button>` z inline
  SVG (głośnik / głośnik ×, obrazek / obrazek ×), `aria-pressed`, stan
  w CSS. Id `hi-gfx` ZACHOWANE (mniej churnu w `els`). Preferencje
  w localStorage (`mtg-table-prefs-v1`, precedens: autosave) — domyślnie
  `{ sounds: false, hiGfx: true }` (zmiana: hi-gfx był domyślnie OFF, M232).
- **Czyste moduły** (ADR 0011): `src/table/spell-sounds.js` (mapowanie +
  receptury + odtwarzacz z wstrzykiwanym kontekstem) i
  `src/table/topbar-toggles.js` (bind/przechowywanie/stan, testowane
  na MiniEl). Wiring w `main.js` to jednolinijkowce w istniejących
  funkcjach; build (`tools/build.mjs`, entry `main.js`) zbiera importy sam.

## Mini-roadmapa

- [x] E0: rozpoznanie (belka, kolejka M254/C, typy, build, wzorce testów).
- [x] E1: RED — `test/owner-spell-sounds.test.js` (20): mapowanie, odtwarzacz
      na fake-AC (7 różnych sygnatur, limity głośności/czasu), toggles na
      MiniEl, pin-y HTML (buttony + SVG z modułu) i importu w main.js.
      Start: ERR_MODULE_NOT_FOUND.
- [x] E2: GREEN — 20/20; mutacja (mapowanie zawsze default) → 5 RED.
      `spell-sounds.js` (mapowanie + 7 receptur + odtwarzacz),
      `topbar-toggles.js` (bind/aria/pamięć), `index.html` (buttony + SVG +
      CSS), wiring `main.js` (dźwięk w `openArtShowcase` + ścieżki
      natychmiastowe; `hiGfxToggle` usunięte z `els`).
- [x] E3: triage — 3 faile, JEDNA przyczyna (intended): domyślne hi-gfx ON
      pauzuje click-through w `table-ui.test.js` (warstwa czeka na
      zamknięcie). Fix po stronie harnessu: `setAttribute` w MiniEl
      (wierność stubu) + preset prefów hiGfx:false przed bootem
      (poprzedni implicit-OFF stał się jawny). 71/71; produkcja bez zmian.
      Bramka test:all dorzuciła 2 kolejne (też intended): bundle-smoke stub
      bez setAttribute (dogoniony jak MiniEl) i M212 (JSDoc z `['Zombie']`
      + brak 'Powerstone' w SLOWNIKU_REGUL — dopisany jak Treasure/Food).
- [x] E4: bramki ZMIERZONE: `npm test` 5542/5542, `test:all` 5552/5552,
      build 61/3709,0 kB (+15,4 kB vs 45b0a62); quick pominięty (silnik
      nietknięty).
- [x] Domknięcie: README (5542/5552/3709,0 + notka), PROJECT_HISTORY
      (dopisek), HANDOFF_2026-09-15c (dopisek 2), PR #123 (komentarz;
      edit tytułu/body nadal blokuje GraphQL), BEZ nowej lekcji (prosty
      ficzer, zero nowej klasy).
- [x] Blok przekazania w czacie (ADR 0013).

Commity: `15f/E1+E2` (test + implementacja), `15f/E4` (domknięcie).
Gałąź: `arena/01a0a5a7-mtg` (sesja ją wymusza) → zakres PR #123 rośnie
o dźwięki; właściciel scala squashem całość albo mówi „wydziel".

## Ryzyka / pułapki

- Autoplay: AudioContext tworzony leniwie + `resume()` na gestach (klik
  w toggle to gest — tam też resume). Brak audio (Node/SSR) = cichy no-op.
- Rozjazd dźwięk–obraz przy kolejce: dźwięk TYLKO w `openArtShowcase`
  (sukces) i w ścieżkach bez-warstwy — nigdy w `push`.
- Podwójny dźwięk: `openArtShowcase` wołane wyłącznie z kolejki
  (zweryfikowane grepem) — obie ścieżki rozłączne z konstrukcji.
- Strażnik budżetu lektury: bez nowej lekcji, o ile nie wyjdzie nowa klasa.
- QA odsłuchu jest ręczne (headless nie zagra) — właściciel odpala i słucha.
