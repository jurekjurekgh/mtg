# Plan sesji 2026-09-24c — batch 59 (kolekcja 126–142), 10 kart

**Gałąź:** `arena/01a0d408-mtg` · **PR:** #136 (ten sam PR sesji, opis uzupełniany kumulatywnie)
**Zlecenie właściciela (2026-09-24):** lista 11 wpisów = **10 kart**, w tym jedna
dwustronna (`126MID`/`127MID` to przód i tył tej samej karty). Standardowy batch
to 10 kart (5 kart = „50 batchy temu", potwierdzone przez właściciela).

## Lista kart (artId z arkusza kolekcji, `tools/collection-art-ids.csv` — nowe wiersze)

| artId | karta | set | plan (arkusz) | typ | mechaniki |
| --- | --- | --- | --- | --- | --- |
| 126 MID | Bird Admirer // **Wing Shredder** | MID | Eldraine | DFC transform | reach, daybound/nightbound |
| 129 DMU | Charismatic Vanguard | DMU | Dominaria | Creature 3/2 W | {4}{W}: drużyna +1/+1 do końca tury |
| 130 THB | Scavenging Harpy | THB | Wiedźmin | Creature 2/1 B | flying, ETB: wygnaj kartę z grobu PRZECIWNIKA |
| 131 ISD | Memory's Journey | ISD | Kamigawa | Instant | tasowanie do 3 kart z grobu do biblioteki + flashback {G} |
| 134 ALA | Waveskimmer Aven | ALA | Forgotten Realms | Creature 2/4 GWU | flying, exalted |
| 135 BOK | Kumano's Blessing | BOK | Kamigawa | Aura {2}{R} | flash, enchant creature, efekt zastępczy śmierci → wygnanie |
| 138 MID | Join the Dance | MID | Eldraine | Sorcery {G}{W} | dwa tokeny 1/1 Human + flashback {3}{G}{W} |
| 139 TMT | Slithering Cryptid | TMT | Teenage Mutant Ninja Turtles | Creature 2/3 (G/U) | hybryda {2}{G/U}, ETB: token Mutagen |
| 141 RIX | Sun-Collared Raptor | RIX | Ixalan | Creature 1/2 R | trample, {2}{R}: +3/+0 do końca tury |
| 142 ALA | Savage Hunger | ALA | Kaldheim | Aura {2}{G} | +1/+0 i trample, cycling {2} |

Uwaga do arkusza: kolumna „plan" w arkuszu właściciela nie zawsze zgadza się
z krainą setu (np. `599MID Candlegrove Witch` = „Wiedźmin", `131ISD` = „Kamigawa")
— **przepisujemy ją dosłownie**, bo `plan` to etykieta organizacyjna kolekcji
(filtr katalogu w `src/table/deck-builder.js`), a nie nazwa krainy; precedens:
batch 58 (komentarz `artId: 265, plan: 'Zendikar'` dla OGW).

## Etap G0 — dane (WYKONANY przed tym plikiem)

- [x] Scryfall `named?exact` + `set=` per karta (ADR 0010 §2a, bez `set=` byłby
      zły druk — zgłoszenie A z 2026-09-12); sandbox blokuje `curl`, dane
      pobrane narzędziem `fetch_page` (jak opisuje HOW_TO_ADD_CARD).
- [x] 10 snapshotów z `pobrano: 2026-09-24` (pole `rulings`, źródło Scryfall).
      **KOREKTA (zmierzona w G1.1, potwierdzona w G1.5):** snapshot NIE może
      leżeć w `docs/cards/` przed swoją kartą — D/14 i OW/6 czytają CAŁY
      katalog plików i wymagają, by każda nazwa `scryfall-<id>.json` była id
      karty rejestru (albo obiektu wsparcia). Status `in-development` z batchy
      55/57 jest dziś niemożliwy (M419/B dopuszcza wyłącznie
      `supported`/`token`/`back`). Dlatego **snapshot wchodzi w tym samym
      commicie co definicja karty**, a pliki czekające leżą POZA repozytorium
      (katalog roboczy `/home/user/batch59-snapshots/`); w drzewie zostało
      8 snapshotów wdrożonych kart (G0 → G1.1–G1.8), 2 czekają na G1.9–G1.10.
      **KOREKTA (G1.8):** katalog roboczy `/home/user/batch59-snapshots/` nie
      istnieje (środowisko go nie zachowało) — snapshot G1.8 pobrano ponownie
      (`fetch_page`: `cards/named` + `/rulings`) i zapisano OD RAZU w
      `docs/cards/scryfall-memory-s-journey.json`; tak samo zrobić dla G1.9/G1.10.
      Precedens i pełne uzasadnienie: PLAN_2026-09-23b (batch 58, KOREKTA B1).
- [x] **Rulingi „przy kartce" (ADR 0028)** — pobrane dla każdej karty, także puste
      (`[]` = „sprawdzono, WotC nic nie ma"): Bird Admirer (9, day/night),
      Memory's Journey (11, m.in. „you must target a player", „player still
      shuffles"), Join the Dance (6, flashback), Savage Hunger (1, cycling),
      Slithering Cryptid (2, Mutagen), Waveskimmer Aven (6, exalted);
      Charismatic Vanguard / Scavenging Harpy / Kumano's Blessing /
      Sun-Collared Raptor — puste.
- [x] Weryfikacja wstępna: które mechaniki już są w silniku (grep `src/engine/`).

## Rozpoznanie mechanik (stan silnika przed kodowaniem)

| mechanika | stan | dowód |
| --- | --- | --- |
| transform DFC + daybound/nightbound | **jest** | `tireless-hauler`/`dire-strain-brawler`, `transformTo`, `game-state` dzień/noc |
| drużyna „get +1/+1 until end of turn" | **jest** | karty 7105/8354 w `card-data.js` (efekt z `scope`) |
| pump „+3/+0 do końca tury" | **jest** | `effect.type === 'pump'` + `untilEndOfTurnBuffs` |
| flying, reach, trample, flash, enchant creature | **jest** | keywords + aury |
| exalted | **jest** | `effect.type === 'exalted_pump'` + trigger po `exalted` na źródle |
| flashback | **jest** | `flashback: { cost, colors }` (karty 5718/7184/8846) |
| cycling (w tym `{2}`) | **jest** | `cycling: { drawCards: 1 }` |
| cel „karta w grobie kontrolera" | **jest** | `card_in_graveyard` (`spells.js:341`) |
| cel „karta w grobie PRZECIWNIKA" | **BRAK** | dziś `card_in_graveyard` wymaga `controllerId === casterId` |
| „pos tasuj grób → biblioteka" | **BRAK** | są tylko `graveyard_*_to_library_top_choice` (na wierzch, nie tasowanie) |
| efekt zastępczy „wygnaj zamiast śmierci" | **część** | `exile_if_dies_this_turn` (efekt jednorazowy na obiekcie); Kumano działa CIĄGLE z aury i kluczem „obrażenia zadane przez ZACZAROWANEGO tego turnieju" |
| token z własną zdolnością aktywowaną | **część** | `TREASURE_TOKEN_ABILITY` + `createBattlefieldToken({ abilities })`; Mutagen to nowy typ predefined |
| hybrydowy pip `{G/U}` | **do sprawdzenia** | komentarz M389 w `card-data.js:11496` |

## Etap G1 — implementacja, jedna karta = jeden zielony commit (ADR 0020 C/D)

**KOREKTA (zmierzona w G1.1, uzgodniona w G1.5):** etykiety `G1.x` znaczą
**kolejność wdrożenia**, nie numerację z listy powyżej (pierwotny plan zaczynał
od najtrudniejszych mechanik). Zaczęto od kart o ISTNIEJĄCYCH mechanikach
(domykają się razem z pinami i strażnikami), a nowe mechaniki silnika idą na
koniec. Wszystkie artefakty (ten plan, nagłówek sekcji „Batch 59"
w `src/cards/card-data.js`, komentarze w `src/engine/tokens.js`, nazwy testów
w `test/real-cards-batch59.test.js`) używają odtąd JEDNEJ numeracji — poniżej.

- [x] **G1.1 Charismatic Vanguard** (129 DMU) — `buff_creatures_you_control`
      `{4}{W}` + zbiór z CR 611.2c. Commit `44dc8eb` (razem z G1.2).
- [x] **G1.2 Sun-Collared Raptor** (141 RIX) — trample + `pump` `{2}{R}` +3/+0
      bez limitu aktywacji. Commit `44dc8eb`.
- [x] **G1.3 Savage Hunger** (142 ALA) — Aura +1/+0 i trample, cycling `{2}`
      (zdolność aktywowana z ręki). Commit `e135540` (razem z G1.4).
- [x] **G1.4 Join the Dance** (138 MID) — dwa tokeny 1/1 W Human, flashback
      `{3}{G}{W}` → wygnanie po rozstrzygnięciu. Commit `e135540`.
- [x] **G1.5 Waveskimmer Aven** (134 ALA) — flying + exalted (`attacks_alone`),
      ruling ALA 2008-10-01: liczy się DEKLARACJA atakujących.
- [x] **G1.6 Slithering Cryptid** (139 TMT) — pierwsza HYBRYDA `{2}{G/U}`
      w katalogu (parser `mana-cost.js`), ETB: predefined token **Mutagen**
      (`token_mutagen` w katalogu + lustro `MUTAGEN_TOKEN_EFFECT`
      w `src/engine/tokens.js`, równość pinowana testem; L41).
      **Etap G1.5–G1.6 domknął też strażniki i piny**, które nowe karty
      odsłoniły: wiersze arkusza kolekcji 126–142 (CSV 502 → 513 pozycji,
      `withArt` 502 → 508), grafika `token_mutagen` (M202/K, M369/I),
      etykieta logu `buff_creatures_you_control` (M255/C1), klasyfikacja
      dublowania na stosie (M179/B1), licznik tokenów 43 → 44 (M419/B),
      rozjazd etykiet etapów i literówka E5/1 w tym planie.
- [x] **G1.7 Scavenging Harpy** (130 THB) — nowy typ celu
      `card_in_opponent_graveyard` (generyczny, ADR 0002) + efekt
      `exile_graveyard_card`; pin: cel z własnego grobu ODRZUCONY, pusty grób
      przeciwnika = trigger bez celu (M106/Z2). Snapshot w
      `/home/user/batch59-snapshots/` wchodzi w tym commicie. **Commit
      `2987d3b`** (5 testów G1.7; `withArt` 508 → 509; `npm test` 6490/6490).
- [x] **G1.8 Memory's Journey** (131 ISD) — generyczny mechanizm ZALEŻNYCH
      pozycji celu (`graveyardOfSlot` → `graveyardOwnerId`: pula pozycji 1–3
      liczy się po wybraniu gracza w pozycji 0) + wspólny enumerator
      `legalTargetCombos` (zastąpił `cartesian` w `spells.js` i
      `cartesianTargetPools` w `game-state.js`: grupy wg `targetWord`, brak luk
      przy pozycjach opcjonalnych, cap wariantów w panelu) + efekt
      `shuffle_graveyard_cards_into_library` z osobnym zdarzeniem
      `library_shuffled` (M134) + zakaz celowania w SAMĄ SIEBIE dla czarów
      (ruling ISD 2011-09-22, „it can't target itself") + wycena u bota (M157).
      Pin na rulingi: gracz-cel obowiązkowy, brak wskazanych kart → gracz i tak
      tasuje, karta nielegalna w chwili rozstrzygnięcia → nie wchodzi (CR
      608.2b). Bramy: `npm test` 6498/6498 (0 fail), build 60 modułów.
- [ ] **G1.9 Kumano's Blessing** (135 BOK) — ciągły efekt zastępczy z aury:
      „stwór, któremu ZACZAROWANY zadał obrażenia w tej turze, zamiast umrzeć →
      wygnaj”. Wymaga znacznika „obrażenia od tego źródła w tej turze” na
      ścieżce śmierci (`destruction.js`/`deathZoneFor`) + resetu (L166/L167).
- [ ] **G1.10 Bird Admirer // Wing Shredder** (126/127 MID) — DFC
      daybound/nightbound (wzorzec `tireless-hauler`), artId 126 (przód) i 127
      (tył, `status: 'back'`).
- [ ] **G1.11** — talie singleton (Krok 5, generator ADR 0023/0024) +
      regeneracja `decks/*` + `docs/` (M427, handoff).
- [ ] **G1.12** — domknięcie: `npm test` + `npm run test:all` + `npm run build`,
      wpis M427, handoff, opis PR #136.

## Bramy i zasady

- Po każdym kroku: `node --test test/real-cards-batch59.test.js` (nowe piny),
  `npm test`, `npm run build`; push po każdym zielonym kroku.
- Nowa mechanika = nowy test KLASOWY (nie tylko pin karty) — L5/L39.
- Każdy cytat CR wobec dosłownego tekstu wydania 2026-09-25 (ADR 0030);
  nowy numer → `node tools/cr-numery.mjs --zapisz` po weryfikacji.
- Bez `limitations` na mechanikach (decyzja właściciela 2026-08-03) — karta
  wchodzi wyłącznie w 100% gotowa; tył DFC ma status `back` (jak `tireless-hauler`).
- Sandbox: mutacje na kopiach (`/tmp`), nigdy `git checkout` na niezacommitowanej
  pracy (L136); commit + push po każdym kroku (ENVIRONMENT §2).
