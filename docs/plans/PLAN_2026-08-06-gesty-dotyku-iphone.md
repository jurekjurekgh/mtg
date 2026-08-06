# PLAN zadania 2026-08-06: naprawa gestów dotyku na iPhonie (double-tap + swipe=tap)

Zadanie właściciela z 2026-08-06 (sesja `arena/019fd83f-mtg`). Zgodnie z zasadą
z AGENTS.md („Start zadania: rozpoznanie, plan, mini-roadmapa PRZED kodowaniem")
ten dokument jest mapą pracy — etapy odhaczamy kolejnymi commitami, a po awarii
sesji nowy agent odczytuje plan i stan PR i kontynuuje od pierwszego
nieodhaczonego etapu.

## Rozpoznanie (stan wejścia)

- Suita: **867/867 testów zielonych**, build **48 modułów / 889.2 kB**.
- `main` zawiera M36–M38 (PR #29 scalony); poprzednie poprawki dotyku
  (PR #28/#29) dotyczyły „mrugnięcia" (odprysk gestu otwierającego) —
  ten plan dotyczy DWÓCH nowych zgłoszeń z iPhone'a:
  1. **double-tap na kartach nadal nie działa** („nie kwestia czasu między tapnięciami");
  2. **swipe = tap** — gest przesunięcia rozpoczęty na karcie otwiera modal
     po puszczeniu palca.

### Diagnoza (dowody z kodu, potwierdzone w tej sesji)

- **Bug 2 — PEWNE.** `installTapGesture` (src/table/gestures.js): handler
  `touchend` nie sprawdza ruchu palca wcale — każdy `touchend` gestu
  rozpoczętego na kaflu uzbraja timer pojedynczego tapa (420 ms) albo liczy
  się do `lastTap`. iOS wysyła `touchcancel` tylko gdy scroll ruszył przed
  puszczeniem palca; przy krótkim przesunięciu `touchend` dociera → strzał
  modala. `touchcancel` nie jest w ogóle obsługiwany.
- **Bug 1 — przebudowa DOM (główna przyczyna).** Stan gestu (`lastTap`,
  `tapTimer`) siedzi w domknięciu **per-element** (gestures.js:29–33), a
  `renderTableView` czyści strefy i odbudowuje kafle od zera przy każdym
  rerenderze (render.js:927 `clear(...)`, `clear = textContent=''`; kafle =
  świeże divy w `tile()`). `rerender()` leci po każdej komendzie sesji, a
  podczas tury bota + pauz to strumień. Między dwoma tapami element jest
  niemal zawsze wymieniony → drugie `touchend` trafia na NOWY węzeł z
  `lastTap = 0` → liczone jako PIERWSZE tapnięcie → po 420 ms menu.
  Single-tap „działa", bo timer w domknięciu przeżywa wymianę węzła — co
  przy okazji daje „duchy tapnięć".
- **Zoom:** `user-scalable=yes` w viewporcie (index.html:5) włącza
  double-tap ZOOM iOS na kaflach — konkuruje z gestem double-tapa.
- **Pobocznie:** `renderExile` nie przekazuje `onCardDoubleClick` do
  `tile()` (render.js:1179) — z exile nie otworzysz pełnego ekranu.

## Roadmapa i stan

### Część 1 — mini-roadmapa (ten commit)

- [x] Ten dokument jako pierwszy commit PR sesji.

### Część 2 — Bug 2: slop (swipe ≠ tap) w `installTapGesture`

- [x] `touchstart` zapisuje współrzędne (pasywnie); `touchmove` z ruchem
      > 10 px albo `touchcancel` ⇒ `moved = true` + `cancelPendingTap()` +
      reset `lastTap`; `touchend` przy `moved` wychodzi bez uzbrajania
      timera i bez liczenia do `lastTap`, a ewentualny syntetyczny `click`
      po swipe jest tłumiony (suppressClick).
- [x] Testy: swipe nie odpala onTap ani nie łączy się w double-tap; ruch
      ≤ 10 px to nadal tap; `touchcancel` anuluje wiszący timer.

### Część 3 — Bug 1: stan double-tapa poza DOM-em

- [x] Wariant A (minimalny, wg handoffu): modułowa mapa `tapStates`
      kluczowana opcjonalnym `stateKey` zamiast domknięcia per-element;
      `tile()` i kafle stosu przekazują `stateKey` z `objectId` (spell.id);
      przed `fireTap` sprawdzenie `element.isConnected` — timer po
      przebudowie z odłączonym węzłem nie strzela (koniec „duchów").
- [x] Testy: rerender między tapami (podmiana węzła, ten sam stateKey) daje
      onDoubleTap; timer po przebudowie z odłączonym węzłem nie strzela;
      istniejące kontrakty dotyku bez zmian.

### Część 4 — Zoom + poboczne

- [x] `touch-action: manipulation` na `.tile`, `.stack-item.clickable`
      i warstwie `.fullscreen` (łagodniejsza opcja z handoffu — double-tap
      zoom wyłączony tam, gdzie działa gest; pinch zoom i dostępność
      pozostają; twarde `user-scalable=no` zostaje decyzją właściciela).
- [x] `renderExile` przekazuje `onCardDoubleClick` do `tile()`.
- [x] Przegląd gałęzi `fullscreenSwipedAt`/`fullscreenOpenedAt` w main.js:
      bramki pozostają (slow double-tap po auto-otwarciu), slop czyni
      guard swipe'a redundantnym, ale nieszkodliwym.

### Część 5 — domknięcie sesji

- [x] `docs/PROJECT_STATE.md` (wpis M39) + `docs/setup/HANDOFF_2026-08-06.md`
      z wpisem o naprawie; opis PR kumulatywnie.
- [ ] Weryfikacja na iPhonie (właściciel): double-tap podczas tury bota
      (strumień rerenderów) otwiera pełny ekran; swipe z karty nie otwiera
      modala; single-tap menu po ~420 ms; karuzela fullscreen dalej działa.

## Podsumowanie wykonania (2026-08-06 wieczór)

Wszystkie części 1–4 zamknięte zielonymi commitami (5 commitów, PR #30):
- slop w `installTapGesture` (touchstart/touchmove/touchcancel, 10 px);
- modułowa mapa `tapStates` + `stateKey` (`tile:${objectId}`,
  `stack:${spell.id}`) + `element.isConnected` w `fireTap`;
- `touch-action: manipulation` na `.tile`, `.stack-item.clickable`,
  `.fullscreen` (łagodniejsza opcja — twarde `user-scalable=no` NIE wdrożone,
  decyzja właściciela);
- `renderExile` przekazuje `onCardDoubleClick` (regresja w
  `test/table-card-art.test.js`);
- przegląd `fullscreenSwipedAt`/`fullscreenOpenedAt`: bramki pozostają
  (slow double-tap po auto-otwarciu), slop czyni guard swipe'a
  redundantnym, ale nieszkodliwym — main.js bez zmian.
Stan: **875/875 testów**, build **48 modułów / 893,5 kB**. Benchmark B0
niewymagany (zadanie nie dotyka botów). Weryfikacja na iPhonie pozostaje
dla właściciela.

## Ryzyka / pułapki

- Testy używają `mock.timers.enable({ apis: ['setTimeout', 'Date'] })` —
  nowy kod musi pozostać w tych dwóch API (żadnych `performance.now`).
- MiniEl w testach nie ma `isConnected` — sprawdzenie w `fireTap` musi być
  `element.isConnected === false` (tylko jawny `false` tłumi), żeby stare
  testy nie zależniały od DOM.
- `touchmove` musi zostać pasywny (nie blokować scrolla stołu/ręki).
- `stateKey` nie może kolidować między strefami: prefiks `tile:` / `stack:`.
- Zadanie nie dotyka botów ⇒ benchmark B0 niewymagany.
- GitHub miał wczoraj incydent „job not acquired by hosted runner" (3 runy
  z rzędu cancelled) — sprawdzić adnotację runa, zanim uznać CI za czerwone.
