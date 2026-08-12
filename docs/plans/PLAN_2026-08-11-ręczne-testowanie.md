# Plan: Poprawki z ręcznych testów (A–E)

Sesja `arena/019ff280-mtg` (PR #44). Po audycie żywym testerem (diamentowa
odznaka) właściciel wykonał ręczne testy i zgłosił 5 uwag (A–E). Wszystkie
naprawiamy u root cause.

## Uwagi i root cause

- **A. Cellar Door bez ilustracji** — `imageUri` w `card-data.js`
  (`c2dd2c2a-...`) nie zgadza się z plikiem Scryfall (`97bdfb00-...`); zły UUID
  → obraz 404 → syntetyczna twarz. Fix: poprawny UUID. Dodano strażnik:
  `imageUri` każdej karty = UUID z `docs/cards/scryfall-*.json` (test w
  `card-data.test.js`).
- **B. Ptaszek wyciszenia ma za mały obszar aktywny** — klik obok ptaszka
  rzucał instanta na cały przycisk. Fix: ptaszek w `<label class="action-ignore">`
  z paddingiem (1–2 spacje wokół), klik w label nie propaguje do przycisku.
- **C. Wizardy walki** — (atak, obrona) przy każdym stwórze + klik w nazwę
  otwiera fullscreen karty. Fix: `creaturePT(view,id)` + `onOpenCard` w
  `renderCombatWizard` (wpięte w main.js).
- **D. Odrzucenie karty przy limicie ręki** — 3 problemy:
  1. niegramatyczny komunikat → poprawiony (także rozróżnienie powodu
     „jako koszt / przy limicie ręki / efektem");
  2. „Ruch przeciwnika" dla decyzji CZŁOWIEKA → root cause: `noteBotMove`
     rejestrował zdarzenia człowieka podczas auto-passu faz człowieka w
     `advance()` (isBotAdvancing=true). Fix: nowa flaga `botActing` — prawda
     tylko w gałęzi BOTA; botMoves zbierają wyłącznie ruch bota.
  3. modal pokazywał powtórzone „Odrzucenie karty" (bez nazw kart) → brak
     `commandLabel` dla `resolve_discard_choice`. Fix: „Odrzuć: <nazwa>".
- **E. Auto-pass zatrzymał się w Głównej 2 („Brak akcji")** po wyciszeniu
  opcji — root cause: gałęzie auto-passu faz CZŁOWIEKA w `advance()`
  (`resolve_combat`, `pass_priority`) pauzowały na zdarzeniach (`pauseOnBotMoves
  && significant`) jak przy ruchu bota. Fix: pauza tylko w gałęzi BOTA.

## Weryfikacja

- `npm test`: 1380/1380 (+nowe testy: imageUri Scryfall, combat wizard P/T +
  onOpenCard, discard label/gramatyka, botMoves bez decyzji człowieka,
  auto-pass nie utyka).
- Build: 50 modułów / ~1484 kB.
- Quick B0 (1620 meczów): 0 crashy, heuristic ~78.1% (próg 0.78 utrzymany;
  bot bez zmian).
- Tester: wizard atakujących pokazuje „(1/1)" itd.; brak decyzji człowieka
  w modalu „Ruch przeciwnika".
