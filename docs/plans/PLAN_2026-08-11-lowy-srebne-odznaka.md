# Plan 2026-08-11 — łowy błędów vs CR (próba srebrnej odznaki)

## Cel
Systematyczny przegląd mechanik silnika vs Comprehensive Rules na stanie po
Sherlocku (M70). Znaleźć, udowodnić behawioralnie (testy RED) i naprawić (GREEN)
twarde błędy vs CR — tak jak w poprzednich sesjach odznak (brązowa/srebrna/złota).

## Metoda
1. Skanowanie obszarów core (combat/damage/triggery/state-based) pod kątem
   reguł CR; każdy kandydat najpierw jako mini-probe (node), potem test
   behawioralny RED → fix → GREEN.
2. Testy w `test/bug-hunt-2026-08-11.test.js` (styl jak `bug-hunt-2026-08-10`).
3. Pełne `npm test` przed każdym commitem; push po commicie; strażnik formy.

## Znalezione błędy

### BUG 1 — Pierwszy przebieg obrażeń ginie przy rozdzielaniu (CR 510.4/510.5)
`resolveCombatDamage` używa `startPass = resume.pass` (boolean `true`/`false`)
jako INDEKSU tablicy `passes = [true, false]`. `passes[true]` koercjuje do
`passes[1]` = `false`, więc wznowienie decyzji first-strike pomija CAŁY przebieg
first strike (CR 510.4) — stwór z first strike zablokowany wieloma blokerami
albo z trample NIE zadaje obrażeń w pierwszym przebiegu (w zwykłym przebiegu
stwór z first strike nie zadaje — CR 510.5). Konsekwencja: Porcelain Legionnaire
(3/1 first_strike) zablokowany dwoma 1/1 nie zadaje NIC; first-strike trample
traci nadmiar. Realne karty: porcelain-legionnaire, ainok-tracker, True
Conviction (double_strike+lifelink).

### BUG 2 — Lifelink dostaje obrażenia zapobiegnięte przez protection (CR 702.16d + 702.15)
W `assignDamageToBlockers` i ścieżce bloker→atakujący w `processCombatPass`
kwota lifelink/deathtouch liczona jest z `dealt` PRZED prewencją protection
(prewencja zachodzi dopiero wewnątrz `markDamage`). Gdy bloker (po blokach)
dostanie protection od koloru atakującego (np. Benevolent Blessing — aura z
flash) albo atakujący dostanie protection od koloru blokera, obrażenia są
zapobiegnięte (CR 702.16d), a kontroler źródła z lifelink i tak zyskuje życie
(CR 702.15: tylko za FAKTYCZNIE zadane obrażenia). Osiągalne: aura z flash
rzucona po deklaracji bloków.

## Kolejność commitów
1. plan (docs/plans) — osobny commit.
2. testy RED (bug-hunt-2026-08-11) — commit pokazujący RED.
3. fix BUG 1 (combat.js: numeryczny startIndex) — commit.
4. fix BUG 2 (combat.js: kwoty po prewencji protection) — commit.
5. dokumentacja (PROJECT_STATE / ENGINE_MILESTONES) — commit.

## Ryzyka / pułapki
- `edit_file` psuje PL → python3 Path.read_text/write_text.
- Po każdym commicie `git push` (sandbox potrafi cofnąć HEAD do main).
- Pełne `npm test` (1281) przed każdym commitem (~90 s).
- Benchmark quick B0 (1080 meczów) po zmianach combat — brak crashy.

## Aktualizacja (w trakcie sesji)

Znalezione i NAPRAWIONE (testy behawioralne RED → GREEN, `test/bug-hunt-2026-08-11.test.js`):

- **BUG 1 (naprawiony)** — CR 510.4/510.5: `resolveCombatDamage` używał `startPass =
  resume.pass` (boolean) jako INDEKSU `passes=[true,false]` → `passes[true]=passes[1]=false`
  pomijało przebieg first strike przy wznowieniu decyzji rozdzielania (first/double strike
  z trample albo wielu blokerów). Fix: numeryczny `startIndex` (true→0, false→1).
- **BUG 2 (naprawiony)** — CR 702.16d+702.15: lifelink/deathtouch liczyły `dealt` SPRZED
  prewencji protection (markDamage prewencjonował w środku). Fix: kwoty po prewencji
  protection w `assignDamageToBlockers` i ścieżce bloker→atakujący.
- **BUG 3 (naprawiony)** — CR 702.16b: check protection-celowania w `validateTargets`
  brał kolory GRACZA (zawsze puste) → był martwy; czar/zdolność źródła chronionego koloru
  mogła celować w chronionego permanentu. Fix: `sourceColors` (kolory źródła) przekazywane
  przez wszystkie miejsca wywołania `validateTargets`/`collectLegalTargets`.

## Aktualizacja 2 — zgłoszenia właściciela A–D z testów (2026-08-11)

Oprócz 3 znalezionych błędów właściciel zgłosił 4 nowe obserwacje z rozgrywki.
Zbadane i naprawione (root cause, nie maskowanie):

- **B (bot): boty „skipowały szukanie\" Secret Entrance (Undercity, pokój 1)** —
  `resolve_search_choice` był w kategorii 'ability' z domyślną punktacją 0,
  a oferta rezygnacji (`found: null`) jest PIERWSZA → oba boty brały fail-to-find.
  Fix: `case 'resolve_search_choice'` w heuristic (znalezienie > fail-to-find;
  land premiowany) + specjalny wariant w aggro (`found != null`). Testy 6–7.
- **C (log): „? ginie\" przy wzajemnym zabiciu w walce** — zdarzenie
  `creature_destroyed` nie niosło `cardId`, a `nameOfObject(fromId)` nie znajdował
  obiektu (nowe id w grobie). Fix: `cardId` w evencie + render przez `nameOf`.
  Test 5.
- **D (engine): „walka rozstrzygnęła się dwukrotnie\"** — to TEN SAM bug co BUG 1
  (boolean jako indeks `passes`): na wznowieniu decyzji przebiegu zwykłego
  `passes[false]=passes[0]` (first strike) → niezablokowani atakujący ponownie
  zadawali obrażenia. Naprawione fixem BUG 1; regresja: test 4.
- **A (UI): karta Undercity nie dała się otworzyć na pełnym ekranie** — miniaturka
  lochu (`renderUndercity`) nie miała nasłuchu kliknięcia. Fix: `onUndercityClick`
  → `openUndercityFullscreen()` w main.js (renderCardFullscreen printu lochu).
  Test w table-ui.test.js.

Nowe testy: `test/bug-hunt-2026-08-11.test.js` (1a–1c, 2a–2b, 3, 4, 5, 6, 7) +
`table-ui.test.js` (renderUndercity klik). Po zmianie zachowania bota hunter seed
delirium przelosowany 25 → 48 (table-session.test.js).
