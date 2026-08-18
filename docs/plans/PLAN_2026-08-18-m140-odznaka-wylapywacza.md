# PLAN M140 — challenge „brązowa odznaka wyłapywacza błędów”

**Cel właściciela:** znaleźć i naprawić **5 unikalnych** błędów / uproszczeń /
ograniczeń niezgodnych z zasadami MtG. Znaleziska mają być WŁASNE — inne sesje
przeorały już wiele obszarów, powtórka cudzego znaleziska się nie liczy.

## Metoda

Trzy niezależne narzędzia, żeby nie powielać cudzych ścieżek:

1. **Fuzzer regułowy** (`/tmp/fz/fuzz.mjs`) — headless mecze bot vs bot na
   parach talii z `decks/`, po każdej komendzie sprawdza inwarianty CR
   (704.5f/g, 302.6, 122.3, 208.1, 205.1, 104.3b, 118, 106, 508.1a, 509.1a,
   110.6/120.3/121.2/301.5c) + bilans obiektów. 168 partii, 0 crashy.
2. **Audyt pokrycia deskryptorów** — każdy typ efektu użyty w kartach musi mieć
   obsługę w `effects.js`; odwrotnie: obsługiwane, a nieużywane = martwy kod.
3. **Testy izolowane per reguła** — SBA, cleanup, stos/priorytet, mana pool,
   walka, strefy.

Każde trafienie fuzzera MUSI zostać zreprodukowane w izolacji przed zgłoszeniem
(checki na stanie PO komendzie dają fałszywe alarmy).

## Znaleziska

### BUG #1 — craft/transform tworzy stwora BEZ liczbowego P/T
- **Objaw:** ożywiony artefakt (np. Lodestone Needle animowany przez Skilled
  Animator do 5/5) po `craft_transform` + `resolve_craft_exile` ma
  `kind='creature'`, `types=['Artifact','Creature']`, ale `power=null`,
  `toughness=null`. Stwór bez P/T łamie CR 208.1 i jest **nieśmiertelny wobec
  SBA** (CR 704.5f: `null <= 0` to `false`).
- **Root cause:** transformacja tworzy NOWY obiekt (CR 400.7, CR 611.2c), więc
  musi porzucić efekty animacji. `resolve_craft_exile`
  (`src/engine/game-state.js` ~L2700) kopiuje `power`/`toughness` z drugiej
  strony, ale nie resetuje `kind`/`types` po animacji.
- **Ten sam defekt w 3 lokalizacjach** (jedna naprawa, nie 3 bugi):
  `game-state.js` `resolve_craft_exile`; `spells.js` L1465–1487
  (daybound→nightbound); `effects.js` L2683 (ma `types`, brak `kind`).
  Wzorzec poprawny: `effects.js` L1703–1732.
- Repro: `/tmp/craft-bug.mjs`. Opis: `/tmp/bugs/B1.md`.

### BUG #2 — token pozostaje w grobie (brak SBA CR 704.5e / CR 111.7)
- **Objaw:** token, który umiera, zostaje w `zones.graveyard` jako pełnoprawny
  obiekt. CR 111.7: token poza bitwiskiem przestaje istnieć.
- **Skutek:** `spells.js:694/700` (`creature_in_graveyard`, `card_in_graveyard`)
  i `abilities.js:592` NIE filtrują tokenów — **Barkform Harvester** oferuje
  ducha tokena jako legalny cel, a `reanimate_under_your_control` wskrzesza go
  z grobu. Inne miejsca filtrują poprawnie przez `name == null`
  (`effects.js:2404`, `game-state.js:717`, `triggers.js:287`) — czyli deskryptor
  „token = `name != null`” już istnieje, brakuje tylko SBA.
- **Root cause:** brak reguły stanu w `src/engine/state-based.js`.
- Repro: `/tmp/tokrean.mjs`, `/tmp/bug2.mjs` (pełna ścieżka przez PlayerView).
  Opis: `/tmp/bugs/B2.md`.

**STATUS BUG #1 i #2: NAPRAWIONE** (commit `9b4363a`).
Naprawa wspólna: `permanents.js` `transformedCharacteristics()`, `materialize.js`
niesie `kind` drugiej strony, SBA CR 704.5e w `state-based.js`, jawny deskryptor
`isToken`. Konsekwencja CR 603.10: `creature_destroyed` niesie LKI obiektu.
`npm run test:all` = **2241/2241**; benchmark 63,1 / 90,5 / **76,8 %** (1918/2496,
odniesienie 1917) — bez regresji. 9 nowych testów: `test/m140-odznaka-wylapywacza.test.js`.

### BUG #3 — goad błędnie zabraniał blokowania (CR 701.38b) — NAPRAWIONE
Reguła nakłada wyłącznie wymogi ATAKU i wprost zaznacza, że goad nie jest
zdolnością; o blokowaniu nie mówi nic. Silnik blokował to w 3 miejscach
(walidacja, `canBlock`, enumeracja), odbierając OBROŃCY legalne bloki.
Test `bug-hunt-2026-08-13.test.js` BUG5 utrwalał błąd — odwrócony.

### BUG #4 — zakryty permanent zdradzał tożsamość (CR 708.2) — NAPRAWIONE
Widok ukrywał `cardId` i typy, ale wysyłał `subtypes` i deskryptor `morph`
(koszt + KOLORY). Wszystkie 5 morphów w rejestrze było rozpoznawalnych.
Test regresyjny wymusza NIEROZRÓŻNIALNOŚĆ zakrytych permanentów.

### BUG #5 — token-kopia dziedziczyła animację (CR 707.2) — NAPRAWIONE
Kopiowalne są wartości z KARTY; efekt „until end of turn" nim nie jest.
Kopia ożywionego artefaktu rodziła się jako stwór 5/5 i po wygaśnięciu
animacji oryginału zostawała trwałym stworem.

## WYNIK RUNDY: 5/5 znalezisk naprawionych
`npm run test:all` **2248/2248**; 16 testów regresyjnych; benchmark
63,1 / 90,5 / **76,8 %** (1918/2496) — bez regresji; fuzzer 288 partii, 0 naruszeń.

## Obszary sprawdzone i CZYSTE (nie zgłaszać ponownie)

Persist + `noMinusCountersWhenDied` (CR 702.79), Fake Your Own Death (grant
triggera `dies` działa — trigger ląduje na stosie), stun countery (CR 122.1b),
channel Greater Tanuki (land wchodzi tapped), Fireball (podział „evenly,
rounded down” + {1} za cel ponad pierwszy), Consume Spirit („spend only black
mana on X”), cleanup CR 514.2 (obrażenia + efekty until-EOT), mana pool CR 500.4,
stos/priorytet CR 117.3b/405.5 (LIFO, okno odpowiedzi), legend rule CR 704.5j,
aura bez hosta CR 704.5m, equipment na nie-stworze CR 704.5n, anihilacja
liczników CR 704.5i, indestructible + toughness 0 (CR 704.5f), deathtouch 0
obrażeń (CR 702.2b), `lethalOf` z deathtouch = 1, trample (CR 702.19b),
przegrane CR 104.3a/104.3c/704.5c + remis CR 104.4b, regeneracja,
`damagedThisTurn`, `animatePermanentUntilEndOfTurn`, exile→return czyści stan
(CR 400.7).

## Wymogi wykonania

- Naprawa u ROOT CAUSE + test regresyjny na każdy bug.
- Reguły generyczne po DESKRYPTORACH, nigdy po nazwach kart (ADR 0002).
- `npm run test:all` w całości zielony.
- Benchmark bez regresji (`node tools/benchmark.mjs`, profil szybki).
- Wnioski → `docs/PROJECT_STATE.md`, lekcje → `docs/LESSONS.md`.
