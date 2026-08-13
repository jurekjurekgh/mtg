# Plan: M88 — naprawa transkryptu testera stołu

Sesja `arena/019ffd38-mtg`. PR #50 (dac692a) zamknięty — plan M87 wykonany
(plan + E1–E3 + M87 częściowo: A/B/C z commitami `// M87:` w choice-request,
render, spells). Następna sesja czyta ten plan i robi M88.

## START TUTAJ (stan po #50)

- `npm test` → **1518/0** zielonych.
- `npm run build` → 50 modułów / 1618.8 kB.
- Gałąź: `arena/019ffd38-mtg` (HEAD = dac692a, czysty).
- Tester wymaga `npm i` w `tools/table-tester` (zrobione na starcie sesji).
- B0: bez zmian bota → progi 0.78/0.57 utrzymane (tylko UI/tester).

## Cel M88

Kontynuacja wzorca M80–M87: wciel się w gracza przez Żywego Testera
(`tools/table-tester/run-game.mjs`), rozegraj partie różnymi taliami i
napraw wykryte błędy UI/logów/etykiet. Tester jest wrażliwy na
**formatowanie DOM `textContent`**, więc wyłapuje zarówno:

1. **Prawdziwe bugi UI** (kafle/etykiety zlepione wizualnie),
2. **Bugi testera** (zlepia wpisy DOM w jedno zdanie — w realnej przeglądarce
   wygląda OK, ale tester zgłasza to jako błąd).

## Twarde ustalenia z audytu (przed kodem)

Partie rozegrane: `green vs red 19`, `wiedzmin vs azorius 101`,
`green vs red 19 (kolejna)`. Wzorce obserwowane w transkryptach:

### Bugi testera (NIE UI — tester zgłasza fałszywie)

A. `closeBotMove` używa `text()` (reggex `/\s+/g → ' '`) i `slice(0, 400)`
   na `bot-move-body`. W DOM każdy wpis to OSOBNY `<div.bot-move-line>`;
   tester łączy je spacją i obcina. **Fix:** dedykowany ekstraktor
   `extractBotMoves()` zwracający `[{title, entries: [text, ...]}]` —
   każdy wpis modala jako osobna linia transkryptu (z prefiksem ` • `).
B. `resolveModal` robi to samo z `intro.slice(0, 120)` + pojedynczy
   `chosen.text.slice(0, 80)` — traci kontekst. **Fix:** pełne intro,
   lista opcji, wybrana opcja wyróżniona.
C. `snapshot` zlepia `tiles()` przez `text()` (zamienia `\n` na spację) —
   na kaflach „Vow of Wildness3VEnchantment" to artefakt, ale na stole
   kafle wyglądają normalnie. **Fix:** tekst kafla z separatorem
   `·` między polami (`.fname`, `.fcost`, `.ftype`, `.fbox`).

### Bugi UI (rzeczywiste, zgłoszone właścicielowi wcześniej)

D. Modal „Ruch przeciwnika" traktuje dwie akcje tego samego czaru (np.
   `Garruk's Companion wchodzi na bitwisko` + `Garruk's Companion zostaje
   rozstrzygnięty`) jako osobne wpisy — DOM dostaje 2 `<div>` obok siebie.
   Na stole to wygląda OK (CSS je rozdziela), ale log gry w `console.log`
   widzi dublety i tester zgłasza szum. **Fix:** sensowne grupowanie
   `permanent_entered_battlefield` + `permanent_cast` (jeśli to ten sam
   obiekt) i `spell_resolved` (jeśli to ten sam czar co cast). Bez
   zmiany treści — tylko eliminacja szumu.

### Nie-bugi (poza zakresem)

- Brakujące etykiety modalne (np. „Ruch przeciwnika" tylko z tytułem
  modala, bez nazwy gracza) — to świadoma decyzja (M18 + M73b).
- Podwójne „Mana Production" (tapping for mana) — pomijane świadomie
  przez `BOT_MOVE_NOISE`.

## Etapy

- [x] E0 — ten plan w repo (osobny commit PRZED kodem)
- [x] E1 — `npm test` 1518/0 (baseline)
- [x] E2 — `npm run build` 50 modułów / 1618.8 kB (baseline)
- [x] E3 — RED testy testera (6 testów w `test/table-tester-output.test.js`)
- [x] E4 — `extractBotMoves()` + `extractModalChoice()` + `extractTileText()`
        w `tools/table-tester/extract.mjs`; czytelne linie transkryptu
- [x] E5 — RED→GREEN: 6 testów (extractBotMoves nie zlepia, extractModalChoice
        oznacza ▶, extractTileText rozdziela kafle separatorem `·`)
- [x] E6 — 3 partie (green/red 19, wiedzmin/az 101, soj/inn 44, blk/tok 66):
        transkrypt czytelny, brak zlepień
- [x] E7 — `npm test` **1524/0** + `npm run build` 50/1618.8 kB
- [x] E8 — docs: PROJECT_STATE (M88) + HANDOFF + plan (ten plik — odhacz)

## Kolejność commitów

1. ten plan
2. RED test `test/table-tester-output.test.js` (asercja na ekstraktor)
3. `extractBotMoves/extractModalChoice/extractTileText` + snapshot
4. Weryfikacja 3 partiami (osobny commit: snapshot transkryptów)
5. `docs/PROJECT_STATE.md` M88 + `HANDOFF_2026-08-13-m88.md`

## Ryzyka

- `edit_file` psuje polskie znaki → **python3 Path**.
- `npm test` ~170 s.
- Tester działa na `dist/mtg-table.html` — przebudowa po każdej zmianie
  render.js wymaga `npm run build`.
- Nie commituj bez `npm test` i `npm run build`.

## Kryterium ukończenia

- Transkrypt testera czytelny: każdy wpis modala w osobnej linii, kafle
  z separatorem `·` między polami, modale z pełnym intro i listą opcji.
- Testy zielone (1518 → 1519+).
- Brak regresji w B0 (bot nietknięty).
