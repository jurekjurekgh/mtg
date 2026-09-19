# Batch 57 — karty właściciela 64, 66, 70, 77, 80, 82, 85, 88, 90, 125 (2026-09-19)

Zlecenie właściciela (2026-09-19, zgłoszenie 15): „Nowy batch kart: 64DTK
Lightwalker, 66KTK Hooting Mandrills, 70GRN Capture Sphere, 77OTJ Annie Flash,
the Veteran, 80MOM Merciless Repurposing, 82ARB Messenger Falcons, 85APC
Phyrexian Rager, 88TDC Baral and Kari Zev, 90M20 Tranquil Cove, 125HOB
Ordinary Bear. Rozplanuj to sobie dokładnie, przeczytaj dokumentację, ściągnij
dane z sieci, podziel na etapy i powoli je realizuj, z commitem i pushem po
każdym etapie."

Gałąź sesji: `arena/01a0b8fe-mtg` (PR #130). Baza pomiarowa: `7878d28`
(P9/H2 poprzedniego zakresu) — zweryfikowana `git log -1` + `git status` przed
pierwszym kodem.

Stan wyjścia **zmierzony**, nie przepisany z handoffu (2026-09-19):

| Miara | Wartość |
|---|---|
| `npm test` | 5926/5926 (0 fail) |
| katalog kart | 532 (477 `supported` realnych + tokeny/basic/i `limited`) |
| karty z `artId` (`withArt`) | 485 (pin `test/art-ids-tool.test.js`) |
| arkusz kolekcji (`tools/collection-art-ids.csv`) | 563 wiersze |
| `npm run build` | 64 moduły / 3884,5 kB |

Dane kart: Scryfall **set-aware** (`/cards/named?exact=…&set=…`, ADR 0010 §2a)
— druk z arkusza właściciela, nie domyślny reprint; snapshoty
`docs/cards/scryfall-*.json` + rulingi pobrane 2026-09-19 (ADR 0028: po kartce,
w kolejności batcha; bez hurtu).

## Lista i rozpoznanie (Oracle + rulingi pobrane online 2026-09-19, ADR 0030)

| artId / plan | Karta | Druk (Scryfall) | Co wnosi | Status mechaniki |
|---|---|---|---|---|
| 64 DTK | Lightwalker | dtk/24 | `{1}{W}` 2/1 Human Warrior: „has flying as long as it has a +1/+1 counter" | istnieje **bliźniak**: Ainok Artillerist (DTK, artId 321) — statyk `condition.hasCounter: '+1/+1'` + `keywords: ['flying']` |
| 66 KTK | Hooting Mandrills | ktk/137 | `{5}{G}` 4/4 Ape: Delve + Trample | **NOWA: Delve (CR 702.66)** — obniżka kosztu przez wygnanie DOWOLNEJ liczby kart z grobu, każda płaci `{1}` kosztu GENERICZNEGO, decyzja w trakcie rzucania |
| 70 GRN | Capture Sphere | grn/31 | `{3}{U}` Aura: Flash, ETB tapnij zaczarowanego, nie odkręca | istnieje **bliźniak**: Containment Protocol (TMC, artId 30) 1:1 + `keywords: ['flash']` (wzorzec Benevolent Blessing) |
| 77 OTJ | Annie Flash, the Veteran | otj/190 | `{3}{R}{G}{W}` legendarny 4/5 Human Rogue, Flash; ETB **if you cast it**: powrót permanentu MV≤3 z własnego grobu **tapnięty**; „becomes tapped": wygnaj **dwie** wierzchnie karty, możesz je zagrać w tej turze | częściowo: `condition.ifCast` (Geological Appraiser), `return_permanent_from_graveyard` (Zoraline), `self_becomes_tapped` (Nanoform Sentinel), okno impulsu `this_turn` (Caves). **NOWE**: `allowLands` + `entersTapped` na powrocie z grobu; `amount: 2` na wygnaniu wierzchnich kart |
| 80 MOM | Merciless Repurposing | mom/117 | `{4}{B}{B}` Instant: exile target creature + **Incubate 3** | istnieje: `exile_permanent` + efekt `incubate` (Tiller of Flesh, M109) — 1:1 ten sam zestaw |
| 82 ARB | Messenger Falcons | arb/145 | `{2}{G/U}{W}` 2/2 Bird: Flying, ETB dobierz kartę | mechaniki istnieją (`flying`, `draw_cards`); **NOWA reguła narzędziowa**: pipy HYBRYDOWE `{G/U}` w rozkładzie landów talii (`coloredPips` w `tools/generate-plan-decks.mjs` — dziś pomija hybrydy → talia bez źródła jednego z kolorów; usterka ukryta na Esper Stormblade) |
| 85 APC | Phyrexian Rager | apc/49 | `{2}{B}` 2/2 Phyrexian Horror: ETB dobierz kartę i tracisz 1 życie | mechanika **już jest**; to **DRUGI DRUK** karty — arkusz ma oba druki (75DMU Dominaria + 85APC Mirrodin), więc katalog dostaje osobny wpis `phyrexian-rager-apc` z własnym planem/snapshotem/talią, a wpis `phyrexian-rager` (DMU, artId 75, Dominaria) **zostaje bez zmian** — wzorzec Curate (`curate` BRO + `curate-stx` STX, Batch 47) |
| 88 TDC | Baral and Kari Zev | tdc/282 | `{1}{U}{R}` legendarny 2/4 Human: First strike, Menace; „first instant or sorcery each turn": możesz rzucić z RĘKI za darmo czar o MNIEJSZEJ MV współdzielący typ karty; jeśli nie — token First Mate Ragavan 2/1 z haste | **NOWE**: licznik „pierwszy instant/sorcery w turze" per gracz; darmowy rzut z RĘKI z filtrem (lesser MV + wspólny typ); token Ragavan + haste EOT |
| 90 M20 | Tranquil Cove | m20/259 | Land: wchodzi tapnięty, ETB +1 życie, `{T}`: `{W}` lub `{U}` | istnieje **bliźniak**: Dismal Backwater (M20, artId 197) / Thornwood Falls (B56, artId 60) |
| 125 HOB | Ordinary Bear | hob/133 | `{3}{G}` 4/5 Bear — **vanilla** (brak tekstu Oracle) | mechanik nie potrzeba (sanity: brak zdolności) |

Żaden plan nie przekracza progu 15 wspieranych kart w tym batchu (mirrodin
42+2, tarkir 46+2, alara 27+1, śródziemie 23+1, kaladesh 18+1, kamigawa 7+1,
arcavios 3+1, thunder junction 7+1) → **brak auto-awansu M181**; talie
regeneruje generator w etapie B7.

## Nazwane brakujące reguły (generyczne, ADR 0002 — zero warunków na nazwę karty)

1. **Delve (CR 702.66)** — koszt niealternatywny: przy rzucaniu czaru gracz
   wygania DOWOLNĄ liczbę kart ze swojego grobu, każda pokrywa `{1}` kosztu
   genericznego. Rulingi KTK (2021-03-19): delve **nie zmienia** mana value ani
   kosztu czaru (Treasure Cruise nadal MV 8 — liczy się dla triggerów i dla
   „lesser mana value"), nie wolno wygnać więcej kart niż wynosi część
   genericzna, wolno łączyć z kosztami alternatywnymi (flashback).
   Wzorzec do rozszerzenia: **escape** (Sweet Oblivion, CR 702.138) ma już
   blokującą decyzję `pendingEscapeExile` (`resolve_escape_exile`), ale
   z FIXED `exileCount`; delve potrzebuje liczby ZMIENNEJ (0..generic) i
   obniżki `effectiveSpellManaCost` o liczbę wygnanych kart. Ścieżki, które
   muszą to widzieć: oferta `legalSpellCasts`, walidacja `castSpell`, wizard
   many (koszt po obniżce), etykieta oferty, wycena bota, `fingerprint`
   (stan decyzji musi być w odcisku).
2. **Pipy hybrydowe w rozkładzie landów** (`coloredPips`,
   `tools/generate-plan-decks.mjs`) — symbol `{G/U}` płaci JEDEN z dwóch
   kolorów, więc talia musi mieć co najmniej jedno źródło któregoś z nich;
   dziś regex `\{([WUBRG])\}` hybrydę gubi (Esper Stormblade `{W/B}{U}` w
   `decks/alara.txt` dostał tylko wyspy). Nowa reguła: hybryda wnosi wymóg
   „min. 1 źródło z pary", rozstrzygany deterministycznie (kolejność WUBRG),
   proporcja liczona jak dotąd.
3. **Powrót z grobu z filtrem i wejściem tapniętym** —
   `return_permanent_from_graveyard` (Zoraline) odrzuca `kind === 'land'` i
   kładzie permanent odkręcony. „Permanent card with mana value 3 or less"
   (ruling OTJ 2024-04-12: permanent card = artifact/battle/creature/
   enchantment/land/planeswalker; `{X}` liczy się jako 0) wymaga dwóch
   generycznych opcji efektu: `allowLands` i `entersTapped`. Aura wracająca
   tą drogą wybiera gospodarza PRZED wejściem (ruling) — jeśli w grobie jest
   sama aura bez legalnego gospodarza, zostaje w grobie.
4. **Wygnanie N wierzchnich kart grywalnych w tej turze** —
   `exile_top_playable_until_next_turn` wygania JEDNĄ kartę; Annie Flash
   wygania DWIE, obie z tym samym oknem (`window: 'this_turn'`, istnieje od
   zgłoszenia G) i obie z uprawnieniem rzutu za pełny koszt (ruling: „You pay
   all costs and follow all normal timing rules" — land tylko w swojej fazie
   głównej przy pustym stosie).
5. **„Pierwszy instant/sorcery w turze" + darmowy rzut z ręki** (Baral and
   Kari Zev) — nowy trigger z licznikiem per gracz (dziś jest tylko globalny
   `spellsCastThisTurn` i `spellsCastThisTurnByPlayer` bez rozbicia na typ
   karty) oraz nowa blokująca decyzja „darmowy rzut z RĘKI" z filtrem
   (lesser mana value + wspólny typ karty), wzorowana na `pendingGraveFreeCast`
   (darmowy rzut z grobu) i `pendingDiscover`. Rulingi: liczy się KAŻDY
   instant/sorcery zagrany w turze, także przed wejściem Barala (trigger nie
   odpali); rzut wchodzi na stos w trakcie rozstrzygania triggera i rozstrzyga
   się PRZED czarem, który go wywołał; `{X}` = 0 przy darmowym rzucie; nie
   wolno wybrać kosztu alternatywnego, wolno płacić koszty dodatkowe.
   „If you don't" → token First Mate Ragavan (2/1 legendarny Monkey Pirate,
   haste do końca tury) z `all_parts` tdc/282.

## Etapy — każdy = osobny, samodzielnie zielony commit (push od razu)

Zasady wspólne (bez powtarzania w każdym punkcie):

- **Testy RED przed implementacją**, potem GREEN; dla każdej karty scenariusz
  **legalny i nielegalny** (ADR 0010 §koszty).
- **Dowiązania nowego deskryptora (L84)** przed pierwszym pełnym `npm test`:
  `EVENT_TYPES` + opis zdarzenia (`session.js`), etykieta PL (`render.js`,
  strażnik M122), wycena bota albo `REVIEWED_UNVALUED` (M157),
  `gameObjectDataOf` (`materialize.js`) **oraz** jawna lista pól
  `installDeck` (`src/engine/deck.js`, M379), a dla nowych pól stanu
  `fingerprint`.
- **Karty wchodzą do talii wyłącznie generatorem** (ADR 0023/0024):
  `node tools/generate-plan-decks.mjs` po nadaniu `supported`.
- **Golden master**: każdy churn talii = świadoma regeneracja z **atrybucją**
  (która talia, dowód izolacji: ten sam kod na starej talii odtwarza starą
  wartość), bez zmian wag/progów (L124).
- Liczności pinowane w testach (arkusz 563, `withArt` 485) aktualizowane
  w etapie, w którym rosną.
- Po KAŻDYM etapie: `git log --oneline -1` + `git status` (ENVIRONMENT §2
  profilaktyka), `npm test`, `npm run build`, commit, push.

- [x] **B0a — plan** (ten dokument): commit + push przed pierwszym kodem.
- [x] **B0b — dane źródłowe**: 10 snapshotów `docs/cards/scryfall-*.json`
  (Oracle + `rulings` + `rulingsSource`/`rulingsPobrano`), 10 wierszy arkusza
  (64DTK…125HOB → 573), 10 nowych kosztów w `MANA_COSTS` (w tym osobny wpis
  `phyrexian-rager-apc`; `phyrexian-rager` DMU już miał), definicje 10 kart
  jako `in-development` (dane bez mechaniki; wyjątek: Tranquil Cove dostaje
  deskryptor produkcji `{W}{U}` już tutaj — precedens Thornwood Falls z B56,
  strażnik M193/A parsuje Oracle „{T}: Add …" po całym katalogu i wymaga
  zakodowanych kolorów w dniu dodania) oraz **drugi druk Phyrexian Ragera**:
  osobny wpis `phyrexian-rager-apc` (APC/85, plan Mirrodin) obok
  niezmienionego `phyrexian-rager` (DMU/75, plan Dominaria) — wzorzec Curate,
  z własnym snapshotem `scryfall-phyrexian-rager-apc.json` (ADR 0029: druk
  właściciela = osobny egzemplarz kolekcji, nie podmiana).

  Piny: arkusz 563→573, `withArt` 485→495 (9 nowych kart + drugi druk Ragera).
  **Churn talii = jedna linia (atrybucja L124)**: sam wpis `in-development`
  generatora nie rusza, ale dwuznaczna NAZWA w katalogu wymusza sufiks setu
  w talii, w której karta już jest — `decks/dominaria-brg.txt`:
  `1x Phyrexian Rager` → `1x Phyrexian Rager (DMU)` (dokładnie jak
  `1x Curate (BRO)`); liczności bez zmian, więc golden-master wycen i tabela
  w README zostają nietknięte (dowód izolacji: `git checkout -- decks/` +
  regeneracja odtwarza tę samą, jednolinijkową różnicę).
- [ ] **B1 (M388) — proste bliźniaki**: **64 Lightwalker** (warunkowy flying
  licznikiem +1/+1), **90 Tranquil Cove** (gainland — bliźniak Dismal
  Backwater), **125 Ordinary Bear** (vanilla bez zdolności), **70 Capture
  Sphere** (flash aura + `tap_enchanted_permanent` + `doesntUntap`),
  **85 Phyrexian Rager** (weryfikacja mechaniki na druku APC). Testy: sanity
  danych (Oracle = definicja, `imageUri`/`artId`); flying wchodzi ze
  licznikiem i znika po jego zdjęciu (przeliczanie przy odczycie); ląd
  wchodzi tapnięty, daje 1 życie i produkuje `{W}`/`{U}` (`{B}` nielegalny);
  Bear nie ma żadnej zdolności; Capture Sphere rzucana w turze przeciwnika
  (flash), tapnie gospodarza i nie odkręci go w untapie; Rager: +1 karta
  i −1 życie, a przy 1 życiu przegrywa (SBA).
- [ ] **B2 (M389) — hybryda i dobranie**: **82 Messenger Falcons**
  (`coloredPips` rozumie `{G/U}`: talia ma źródło któregoś z kolorów pary;
  proporcja i minima pozostałych kolorów bez zmian; dowód izolacji na
  Esper Stormblade z `alara.txt`) + ETB dobierz kartę. Testy: rozkład landów
  dla talii z hybrydą, koszt `{2}{G/U}{W}` płacony `{G}` albo `{U}`
  (i odrzucany, gdy brak obu), dobranie karty z pustą biblioteką nie wywraca
  stanu.
- [ ] **B3 (M390) — usunięcie z inkubacją**: **80 Merciless Repurposing**
  (`exile_permanent` + `incubate 3` + token Incubator z 3 licznikami).
  Testy: wygnanie stwora i token Incubator z trzema licznikami; przemiana
  tokenu w 0/0 Phyrexian; `{2}`: transformacja tylko tokenu; brak celu = brak
  oferty; nielegalny cel przy rozstrzyganiu = brak efektu i **brak inkubacji**
  (ruling MOM 2023-04-14).
- [ ] **B4 (M391) — Delve**: **66 Hooting Mandrills** (`{5}{G}` → wygnanie
  kart z grobu, każda `{1}`; „you may", liczby 0..5). Testy: rzut bez delve
  (pełny koszt), z 1/2/5 kartami (koszt maleje, karty w exile), odmowa wygnania
  więcej niż generic (nielegalna), **mana value się nie zmienia** (ruling),
  walka z flashbackiem (koszt alternatywny + delve), Trample działa,
  wizard many pokazuje koszt PO obniżce, bot wycenia.
- [ ] **B5 (M392) — Annie Flash**: **77 Annie Flash, the Veteran** — powrót
  permanentu MV≤3 z własnego grobu (`allowLands`, `entersTapped`), trigger
  `self_becomes_tapped` → wygnaj 2 wierzchnie karty grywalne w tej turze,
  Flash, `condition.ifCast`. Testy: ETB z ręki wraca permanent tapnięty;
  **nie odpala przy wejściu bez rzutu** (ruling: reanimacja/token); land MV 0
  wraca (ruling „permanent card"); MV 4 odrzucone; aura bez gospodarza zostaje
  w grobie; tapnięcie (atak/zdolność) wygania DOKŁADNIE dwie karty i pozwala
  zagrać obie w tej turze (w tym land tylko w main), a w następnej turze
  uprawnienie wygasa.
- [ ] **B6 (M393) — Baral and Kari Zev**: **88 Baral and Kari Zev** — licznik
  „pierwszy instant/sorcery w turze" per gracz, darmowy rzut z ręki (lesser MV
  + wspólny typ karty, bez kosztów alternatywnych, `{X}` = 0), alternatywa
  „If you don't" → token First Mate Ragavan 2/1 z haste. Testy: pierwszy
  instant/sorcery odpala ofertę, drugi już nie; oferta zawiera TYLKO czary
  o mniejszej MV i wspólnym typie (instant dla instantu, sorcery dla
  sorcery); „nie znajduję karty" (odmowa) → token Ragavan; rzut wchodzi na stos
  i rozstrzyga się przed czarem wywołującym; czar zagrany przed wejściem
  Barala w tej samej turze nie odpala triggera (ruling); Menace + First strike.
- [ ] **B7 — talie i dokumentacja**: `node tools/generate-plan-decks.mjs`
  (atrybucja churnu per talia), `test/repo-decks.test.js` bez zmian treści
  poza liczbami, `docs/PROJECT_HISTORY.md` + `docs/ENGINE_MILESTONES.md`
  (M388–M393), finalne `npm test` + `npm run build`, opis w PR #130.

## Ryzyka rozpoznane z góry

1. **Delve to najszersza zmiana batcha** — dotyka kosztu (wizard many
   i etykieta oferty), oferty i walidacji oraz bota. Zabezpieczenie: etap
   osobny (B4), testy RED na pełnym koszcie vs po obniżce, mutacje na
   „wygnano → koszt nie spadł" i „delve zmienia MV".
2. **Baral and Kari Zev** — dwie nowe reguły w jednej karcie (licznik per typ
   + darmowy rzut z ręki). Jeśli okaże się zbyt duży na jeden commit,
   dzielimy go na B6a (licznik + oferta darmowego rzutu) i B6b (token Ragavan
   jako ścieżka „If you don't") — każdy commit zielony osobno.
3. **Drugi druk Phyrexian Ragera** (APC/85) musi przejść trzy strażniki
   naraz: A/4 (arkusz ↔ katalog — dopasowanie po `artId`, więc wpis APC musi
   mieć numer 85, a DMU nadal 75), M197/K4 (plan czytany z kolekcji per set)
   oraz `art-ids-tool` (liczba `withArt` rośnie o 10, bo oba druki mają
   numery). Kolejność w B0b: najpierw wiersz `85APC` w arkuszu, potem wpis
   w katalogu, potem snapshot. Wpis DMU (artId 75, Dominaria) zostaje
   NIETKNIĘTY — podmiana druku w miejscu byłaby błędem klasy Curiosity,
   bo zabrałaby kartę z talii Dominarii (zgłoszenie właściciela 15).
4. **Pipy hybrydowe** zmieniają rozkład landów istniejącej talii
   (`alara.txt`, Esper Stormblade) — to NIE jest zmiana karty, tylko naprawa
   rozkładu; regeneracja z atrybucją i dowodem izolacji (ten sam kod na
   `tarkir-bg.txt` → identyczna treść).
5. **Bot**: jeśli darmowy rzut z ręki (Baral) albo oferta delve wymuszą gałąź
   w `src/controllers/heuristic-bot.js`, obowiązkowy pomiar B0
   (`node tools/benchmark.mjs`) i aktualizacja progów
   `test/bot-benchmark.test.js` (Krok 7 procedury). Preferencja: nowy efekt
   bez zmian w kontrolerze, wycena w `REVIEWED_UNVALUED` z uzasadnieniem.
