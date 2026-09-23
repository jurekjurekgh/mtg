# Plan — follow-upy po sesji uwag z gry: F1 v2 (cloak) i audyt H (koszt w ofertach)

Dwie sprawy zlecone przez właściciela po raporcie z sesji 2026-09-23c:

1. **F1 v2 — Veiled Ascension**: bot ma ZAWSZE wybierać „may” (cloak w upkeepie),
   chyba że biblioteka jest blisko wyczerpania (**< 10 kart**).
2. **H — audyt kosztów**: pytanie właściciela, czy sprawdzono INNE czary /
   instanty / sorcery / aury / zdolności aktywowane / wybory pod kątem
   pokazywania kosztu, ile ścieżek naprawiono i czy wszystko idzie jedną
   wspólną funkcją ofert. Odpowiedź „jedna wspólna funkcja” jest dopuszczalna,
   ale musi być **udowodniona** (liczba, nie zawołanie).

Obowiązują zasady stałe: plan doc przed kodem, test RED→GREEN per pozycja,
commit + push po etapie, zero warunków po nazwie karty (ADR 0002), jedna
przyczyna u źródła (L41), jedna sesja = jeden branch = jeden PR (ADR 0020),
karty kompletne w katalogu (ADR 0022/M419).

## I. Stan obecny (zweryfikowany pomiarem 2026-09-23d)

- **F1 v2**: `resolve_optional_trigger_choice` (`heuristic-bot.js:7703`) ma
  gałąź self-millu (M167/B: `−60 / +45 / −35`) i fallback
  `finish(cmd.fire ? 50 : 0)`. Strażnik kar bibliotecznych
  (`libraryDrainTax`, ~`:1749`) czyta `pending.effects` i przepuszcza je przez
  `LIBRARY_DRAIN_EFFECTS` (`:1529` = `mill_cards`, `draw_cards`,
  `draw_then_discard`, `mill_from_bottom`) — **`cloak` nie jest w zbiorze**,
  więc dziś trigger cloaka przy bibliotece 3 kart dalej ma +50 vs 0 i bot
  odpala go zawsze. Pomiar sondą (`lib = 30/12/10/9/5/3`): za każdym razem
  `fire=true` (score 50 vs 0), efekt widoczny w widoku jako
  `pendingOptionalTrigger = { sourceCardId, effect: { type: 'cloak' },
  effects: [{ type: 'cloak' }] }`.
- **Uzasadnienie reguły**: cloak przenosi kartę z biblioteki na pole bitwy
  twarzą w dół (CR 701.56a) jako 2/2 z wardem {2} — karta NIE ginie (inaczej
  niż przy millu/dobraniu), więc „you may” jest opłacalne zawsze; jedyne realne
  ryzyko to deck-out (CR 121.4), dlatego kara ma wchodzić dopiero pod progiem
  biblioteki.
- **H — warstwa ofert** (zmierzona):
  - typów komend: **90** (`src/protocol/types.js:25`),
  - etykiet pojedynczych ofert: **44** gałęzie `case` w `commandLabel`
    (`src/table/render.js:2853`); w **7** gałęziach kod etykiety nie dotyka
    żadnego tokenu kosztu — sprawdzone pojedynczo, wszystkie 7 to akcje/ wybory
    DARMOWE (`resolve_index_choice`, `resolve_damage_assignment`, `draw_card`,
    `pass_priority`, `concede`, `resolve_combat`, `resolve_fabricate`),
  - tytuły GRUP decyzji: `choiceSourceTitle` (`:2230`), `choiceGroupTitle`
    (`:2563`), `choiceGroupLabel` (`:2633`) — po naprawie C+H (`7eb1633`)
    korzystają ze WSPÓLNYCH formaterów kosztu `cardCostHtml` /
    `abilityCostHtmlOf` / `abilityCostSuffix`, więc koszt karty i zdolności ma
    jedno źródło w warstwie UI,
  - strona silnika: oferta z kosztem powstaje WYŁĄCZNIE po jego opłacalności —
  jednym predykatem `canPayColoredCost` (`src/engine/resources.js:1311`),
  wołanym w **59** miejscach (abilities 27, game-state 11, spells 15,
  triggers 2, resources 4).
- Luka do domknięcia w H: brak **pinu** (testu) na inwariant „etykieta oferty
  bez kosztu ⇔ oferta darmowa” dla całej listy typów komend — dotąd pilnowały
  tego testy punktowe C+H (7/7) i przeglądy sesyjne.

## II. Etapy

### E1 — F1 v2: cloak wyceniany po TYPIE efektu (nie po nazwie karty)

- `heuristic-params.js`: nowe pokrętła (właściciel podał próg):
  `cloakLibraryFloor: 10` (biblioteka < próg ⇒ „pass”) oraz
  `cloakThinLibraryPenalty: 60` (> bazowe 50 „fire” ⇒ przewaga „pass”).
- `heuristic-bot.js`: zbiór typów efektów przenoszących kartę z biblioteki na
  pole bitwy twarzą w dół (`cloak`, `manifest`) + wspólny czytnik efektów
  decyzji `pendingOptionalEffects(view)` (pełna tablica `effects`, fallback
  `effect` — ta sama konwencja co O2 w `libraryDrainTax`); użyty zarówno przez
  nową gałąź wyceny, jak i przez strażnik kar bibliotecznych (L41 — jedno
  źródło kształtu).
- Wycena: `fire` z cloakiem = **zawsze 50**, a pod progiem biblioteki
  `−cloakThinLibraryPenalty` (schodzi pod 0 = „pass”).
- Test `test/uwaga-z-gry-2026-09-23d-veiled-ascension-cloak-may.test.js`:
  biblioteka 30/10 → `fire`, biblioteka 9/1 → `pass_priority`; pin kontraktu
  widoku (`{ sourceCardId, effect, effects }`, bez `ability`), pin nadpisania
  progu parametrem (L41), brak regresji na drenażu biblioteki (Murder of
  Crows) i anty-over-fix: „may” innego typu (Grazing Gladehart) przy
  bibliotece 1 karty nadal odpala.

**Wykonane (2026-09-23d, `E1`)**: `cloakLibraryFloor: 10`,
`cloakThinLibraryPenalty: 60`, wspólny czytnik `pendingOptionalEffects(view)`
(strażnik `libraryDrainTax` + wycena cloaków), test 6/6 (RED przed fixem:
1 fail na granicy 10/9), `npm test` **6296/6296** (0 fail, ~231 s).

### E2 — H: odpowiedź liczbowa + pin inwariantu

Zmierzone (2026-09-23d, na tym commicie):

| Miara | Wartość |
|---|---|
| typy komend (`COMMAND_TYPES`) | 90 (7 × `cast_*`, 69 × `resolve_*`, 2 × `turn_*_face_up`, 12 pozostałych) |
| typy z własną gałęzią etykiety w `commandLabel` | **89 / 90** |
| typ bez gałęzi | `move_object` — komenda protokołu/replayów, nigdy nie powstaje jako oferta (`legalCommands`) |
| funkcje etykiet ofert | 4: `commandLabel` (pojedyncza oferta) + `choiceSourceTitle` / `choiceGroupTitle` / `choiceGroupLabel` (tytuły i wpisy grup) |
| wspólne formatery kosztu | `cardCostHtml`, `abilityCostHtmlOf`, `abilityCostSuffix` — po **jednej** definicji; plus jeden renderer ikon `manaCostHtml` (`mana-icons.js`, importowany) |
| bramka opłacalności w silniku | `canPayColoredCost` — **59** wywołań (abilities 27, spells 15, game-state 11, resources 4, triggers 2) |
| testy pinujące warstwę etykiet/kosztów | **54** pliki (`grep commandLabel|choiceGroup*|buildActionEntries` × `koszt`) |

Zmierzone zachowania (pin H/3, H/4): rzut za {R} bez many → BRAK oferty;
z jednym Mountain → oferta z „(koszt {R})”; zdolność Forecast {2}{W} przy
jednej Plains → BRAK oferty, przy trzech → oferta z „(koszt {2}{W})”.

**Znalezisko audytu (naprawione w tym etapie)**: F3 z sesji 2026-09-23c
(„etykieta obrotu twarzą do góry niesie koszt”) czytał koszt z OBJEKTU WIDOKU,
a `playerView` nie projektuje `cloakTurnUpCost`/`manifestTurnUpCost`
(informacja właściciela zakrytej karty — FoW). Test F3 przechodził, bo podawał
koszt w ręcznie zbudowanym widoku; w prawdziwej partii oferta dalej milczała
(`Obróć twarzą do góry (Cloak): Goblin Piker (Cloak 1)`), a
`turn_manifest_face_up` nie miała kosztu nigdy. Naprawa: odczyt ze STANU —
ten sam co kreator płatności (M327, `main.js`) — w jednym helperze
`uncoverCostOf` dla obu etykiet (L41).

- Test `test/audyt-h-koszt-w-ofertach-pelny.test.js` (8/8): H/1 pokrycie typów
  (nowy typ komendy bez etykiety ⇒ czerwony), H/2 jedna funkcja (liczby
  definicji + referencje w obu warstwach), H/3/H/3b bramka opłacalności,
  H/4/H/4b koszt obrotu **z prawdziwego widoku** (RED przed fixem: 2 fail),
  H/4c darmowe akcje bez kosztu, H/5 FoW (widok przeciwnika nie niesie kosztu
  ani prawa obrotu).

### E3 — domknięcie

Pomiary (`npm test`), wpis M-serii, README/handoff, odhaczenie etapów w tym
planie, aktualizacja PR #134 (bez merge — ADR 0020).

**Wykonane (2026-09-23d)**: `npm test` **6304/6304** (0 fail, ~242 s), pełna
brama `node tools/run-tests.mjs all` **6314/6314** (0 fail, ~416 s), build
**59 modułów / 4124,0 kB**; wpis **M422** w `docs/PROJECT_HISTORY.md`
i `docs/ENGINE_MILESTONES.md`; handoff `docs/setup/HANDOFF_2026-09-23d.md`;
README „Bieżący stan”; PR #134 opisany na nowo (ten sam branch — ADR 0020).

## Zasady wykonania

- Test RED przed fixem; poprawka u źródła (L41), nie w objawie.
- Wycena i etykiety sterowane DANYMI (typ efektu / typ komendy), nigdy nazwą
  karty (ADR 0002).
- Po każdym etapie: `npm test`, commit (`git commit -F`), push na
  `arena/01a0ceb4-mtg`.
