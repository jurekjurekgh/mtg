# Plan: M89 — zadania właściciela A/B + duży audyt testerem

Sesja `arena/019ffd38-mtg`. Po M88 (PR #51) właściciel zgłosił dwa
konkretne błędy UI i zlecił DUŻY audyt testerem „do oporu".

## START TUTAJ (stan po #51)

- `npm test` → **1524/0** zielonych.
- `npm run build` → 50 modułów / 1618.8 kB.
- Gałąź: `arena/019ffd38-mtg` (HEAD = 27a9aa2, czysty).
- Tester wymaga `npm i` w `tools/table-tester` (zrobione na starcie sesji).

## Zadanie 1 — uwagi właściciela

### A. Curate nie pokazuje dobrania karty w modalu ruchu bota

**Objaw:** bot rzuca Curate (Surveil 2 + Draw 1) — modal „Ruch przeciwnika"
pokazuje „Curate zostaje rozstrzygnięty" / wynik surveil, ale brak wpisu
„Nieprzyjaciel dobiera kartę" (efekt `draw_cards`).

**Root cause (sesja.js, noteBotMove):** `card_drawn` jest w `BOT_MOVE_NOISE`
(linia 844) — pomijane w modalu. Uzasadnienie było dobre dla kroku
`draw_step` (początek tury — szum), ale `draw_cards` z efektu czaru
(Curate, Phyrexian Rager, Evangel of Synthesis, Curiosity, Brass's
Bounty itd.) jest ISTOTNE — gracz chce wiedzieć, ile bot dobrał.

**Fix:** rozróżnienie źródła dobrania — flaga `source: 'draw_step' |
'effect'` na evencie `card_drawn`. `noteBotMove` przepuszcza
`source === 'effect'`, dalej pomija `draw_step` jako szum.

Pliki: `src/engine/effects.js` (`drawPlayerCards` — parametr `source`),
`src/engine/game-state.js` (komenda `draw_card` — `source: 'draw_step'`),
`src/table/session.js` (noteBotMove — warunek zamiast NOISE).

### B. Nakładki na karcie zachodzą na siebie

**Objaw:** `buildStateOverlay` w `render.js` — `.ovl` ma
`position: absolute; inset: 0; flex-direction: column;
justify-content: space-between` (linie 245–252). `.ovl-badges` ma
`flex-direction: column; gap: 2px`. Na kaflu z wieloma badge'ami
(obrażenia, choroba, licznik, zaczarowana, wyposażona) wiersze
nachodzą — `font-size: 8px` + padding `1px 4px` ≈ 12px każdy, 5 × 12
= 60px w kaflu `sm` (~50px wysokości). Pt u dołu nakłada się.

**Root cause:** brak `flex-wrap` na `.ovl-badges` — elementy nie
zawijają się, a `.ovl` z `space-between` rozpycha je między górę a dół.
Na małym kaflu z dużą liczbą badge'ów wiersze nachodzą.

**Fix (UX):** `.ovl-badges` dostaje `flex-wrap: wrap` (zawijanie
wierszy jeśli ich suma przekracza dostępną wysokość) + `max-width:
100%` + `line-height: 1.1` na `.ovl-badge` (kompaktowa wysokość).
Dodatkowo: `.ovl-pt` z `align-self: flex-end; margin-top: auto` (i tak
działa, ale zostawiam). Test: mały kafel z ≥4 badge'ami nie ma
nakładających się wierszy (offset-y kolejnych wierszy ≥ poprzedni+gap).

## Zadanie 2 — duży audyt testerem (wzorzec M80–M88)

Właściciel: „Rób to do momentu gdy zaobserwujesz błąd ... co 10 błędów
zrób test suite, benchmark i wypchnij commit. Następnie szukaj kolejnego
błędu. Jeśli jedna partia nie wystarczy to rozegraj kilka różnymi
kombinacjami talii. Kontynuuj bez przerywania do czasu aż nie będziesz
mógł znaleźć żadnego błędu."

**Procedura:**
1. Uruchom partię żywym testerem z realną talią (np. spellslinger,
   graveyard, tokens) vs inną talią.
2. Obserwuj transkrypt: co wyświetla modal ruchu bota, jakie
   etykiety akcji, czy UI jest zgodne z MtG.
3. Kiedy widzisz błąd (błędna etykieta, złe zachowanie, ukryty efekt,
   brak informacji) — zapisz objaw z transkryptu.
4. Napraw u root cause (nie maskuj).
5. Test regresyjny (RED→GREEN).
6. Co 10 błędów: `npm test` + `npm run benchmark` + commit + push.
7. Szukaj kolejnego.

**Kryterium stopu:** autor nie widzi już nic więcej do naprawienia w
danych partiach.

## Etapy

- [x] E0 — ten plan w repo (osobny commit PRZED kodem)
- [x] E1 — `npm test` 1524/0 (baseline)
- [x] E2 — `npm run build` 50 modułów / 1618.8 kB (baseline)
- [x] E3 — A. Curate: RED test w `test/curate-modal.test.js`
- [x] E4 — A. Curate: GREEN (source flag w `drawPlayerCards`,
        `noteBotMove` przepuszcza effect)
- [x] E5 — B. Overlay: RED test (helper renderujący badge przy
        różnych rozmiarach; asercja na offset-y)
- [x] E6 — B. Overlay: GREEN (flex-wrap + line-height)
- [x] E7 — commit A+B jako „M89: A. Curate modal + B. nakładki kart"
- [x] E8 — audyt: 1. seria 10+ błędów → commit + benchmark
- [x] E9 — audyt: 2. seria (jeśli są) → commit + benchmark
- [x] E10 — docs: PROJECT_STATE (M89) + HANDOFF + plan (odhacz)

## Kolejność commitów

1. ten plan
2. A. RED test (test/curate-modal.test.js)
3. A. GREEN (engine + session)
4. B. RED test (test/overlay-badges.test.js)
5. B. GREEN (CSS + ewentualnie render.js)
6. A+B commit + push (M89: A. Curate modal + B. nakładki kart)
7. audyt seria 1 (10+ bugów): co bug → fix + test → 1 commit
   zbiorczy na 10 + benchmark + push
8. audyt seria 2: analogicznie
9. docs + handoff

## Ryzyka

- `edit_file` psuje polskie znaki → **python3** Path.
- `npm test` ~170 s; `npm run build` ~3 s; benchmark ~870 s.
- Nie commituj bez `npm test` i `npm run build`.
- Tester działa na `dist/mtg-table.html` — po zmianach render.js
  trzeba przebudować.

## Kryterium ukończenia

- A. Curate pokazuje w modalu ruchu bota, że przeciwnik dobrał kartę.
- B. Nakładki na karcie nie zachodzą na siebie (test).
- Audyt: ≥10 błędów naprawionych, benchmark 0 regresji.
- Jeśli audyt nie znalazł więcej — zatrzymuję się, dokumentuję.
