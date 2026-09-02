# Backlog — pomysły na przyszłość

**Czym ten plik JEST, a czym NIE JEST** (decyzja właściciela, 2026-08-17):

> „Pełni on rolę bardziej pomysłów, które kiedyś mogą się przydać, a nie
> rzeczy do zrobienia."

To **zbiór pomysłów**, nie kolejka zadań i nie lista zobowiązań. Wpis tutaj
nie znaczy „do zrobienia" — znaczy „gdyby kiedyś okazało się potrzebne, tu
jest rozpoznanie". Nic z tego pliku nie jest podejmowane bez decyzji
właściciela; sesja bierze się za pozycję dopiero, gdy zostanie wskazana.

Zadania na bieżącą sesję przychodzą wprost od właściciela w czacie, a ich
ślad zostaje w `docs/PROJECT_HISTORY.md`, planie sesji i commicie.

Plik jest trwałą pamięcią pomysłów — czat i kontekst sesji bywają
kompaktowane, repo nie.

## 1. Karty (lista właściciela)

- **Karty wielocelowe (cele >1) — podstawa pod audyt na żywo** (pomiar w
  `docs/audits/AUDYT_PR92_2026-09-02.md` §13.8 i §15): spośród 443 kart wspieranych
  tylko 7 deklaruje >1 celu, a talie testowe są w całości rozdzielone (ADR 0023:
  każda wspierana karta w dokładnie jednej talii, kart wolnych = 0), więc nie da się
  ułożyć talonu pod kreator celów bez nowych kart.
  **START w turze 11 (M291): weszły dwie** — Coordinated Assault (CLU 128, {R},
  „up to two target creatures each get +1/+0 and gain first strike") oraz Dual Shot
  (SOI 153, {R}, „deals 1 damage to each of up to two target creatures"): ten sam
  deskryptor `allTargets`, dwa różne efekty (pump+grant oraz czyste obrażenia). Zapisana
  nauka: talii NIE układamy ręcznie, tylko nadajemy karcie `plan` i puszczamy
  `node tools/generate-plan-decks.mjs` (on jest źródłem prawdy przydziału; diff:
  jeden plik na pierwszą kartę, trzy na drugą, bo przy drugiej generator przestawił też
  Blazing Torch między połówkami Innistradu). Zostały 2-4 karty z listy właściciela; przydatny
  kształt to „up to N" (picker z opcją pominięcia) i „each of" (patrz niżej).
  Przy braku egressu: `docs/cards/HOW_TO_ADD_CARD.md` zezwala ściągnąć te same URL-e
  `fetch_page`em i zapisać snapshot — to zadziałało w turze 11, nie czekamy na sieć.
  Uwaga silnikowa (L123): „each of up to N" ma fan-out osobno w torze triggerów
  (`applyTriggerEffects`) i osobno w torze czaru (`allTargets`, M291) — każda nowa
  karta wielocelowa musi mieć test na DWU celach w tym torze, którym realnie gra.

_(pusto — batch 34 zamknięty w całości: 10 z 10 kart, M113–M116.
Następna lista właściciela wchodzi tutaj.)_

## 2. Silnik i reguły

- **Z6/Z7 z audytu M119 — do decyzji właściciela:**
  - „Bierzesz mulligan (1)” — liczba bez jednostki (czy zmienić brzmienie na
    „mulligan nr 1 (ręka 7 kart, odłożysz 1)”?);
  - panel oferuje kontrczar we WŁASNY czar gracza (legalne wg CR 115.4, ale
    to pewna strata). Odfiltrowanie odebrałoby legalny ruch — alternatywą
    jest ostrzeżenie w etykiecie („cel: TWÓJ czar”).

- **Ochrona przed jakością** — obsłużone D (obrażenia), E (załączniki),
  B (bloki), T (celowanie). Do przemyślenia przy pierwszej karcie, która tego
  wymaga: ochrona przed jakością dla EFEKTÓW nieceowanych („can't be dealt
  damage by" itd.).
- **Kopie czarów wielocelowych** — działa wybór celu slot po slocie; brak UI
  dla kopii czarów MODALNYCH (kopia dziedziczy tryb oryginału).
- **Puste kolejki decyzji** — przegląd, czy każda blokująca decyzja ma opis
  w logu (lekcja L24) i wycenę w bocie (żeby nie brał zawsze pierwszej oferty).

- **[zamknięte w PR #93, `766ef89`]** tag `trigger.groupPer` w danych karty
  + jeden `mayFireGrouped` w rdzeniu; `leftBattlefield` i obie ścieżki
  obrażeniowe czytają tag, katalog pilnuje testem. Przy okazji wyszedł
  prawdziwy błąd: `combat_damage_to_you` scalał się po graczu i kasował
  drugą instancję zdolności (CR 603.3) — naprawione. Historia (rozpoznanie
  z audytu PR #92, 2026-09-02). Znalezisko 4 naprawił klucz w
  `any_combat_damage_to_player`; ta sama forma (jeden trigger na kontrolera na
  ZDARZENIE, a nie na INSTANCJĘ zdolności — CR 603.3) została w
  `leftBattlefield` i w kilku innych grupach w `src/engine/triggers.js`.
  Żeby to ruszyć: policzyć per grupa, czy istnieją karty, które SLUSZNIE chcą
  jednego odpalenia na kontrolera (to by znaczyło, że klucz jest celowy) —
  bez tej listy zmiana jest ryzykowna i nie powinna iść przy okazji.
- **[zamknięte w PR #93, `49bfe25`]** `TREASURE_TOKEN_EFFECT` w
  `src/engine/tokens.js` (3 miejsca w rdzeniu), zdolność Skarbu wreszcie w
  definicji `token_treasure`, a `test/audyt-treasure-katalog.test.js` pilnuje
  zgodności obu źródeł (skan katalogu, pin anty-vacuous). Cień danych
  zniknął w turze 3 (`5d7b3f4`): kolory są DANĄ definicji tokena, koszyk
  skarbowy czyta deskryptor zdolności (`treasureManaAbilityOf`), a pula many
  niesie własne kolory — §10 raportu. Historia: Treasure z `resolve_exile_cast` (Vaan)
  składany ręcznie
  (`applyEffect({ type: 'create_token' })` z własnoręcznie złożonym obiektem)
  zamiast z katalogu tokenów — kopia opisu tokenu poza źródłem prawdy
  (klasa L107). Dziś działa; pomysł: wspólny `createToken(state, 'Treasure')`.
- **[zamknięte w PR #93, `3d07dc0`]** po decyzji właściciela „oczywiście
  obsłużyć": `castSpell(..., kicked)` z pipami kickera w wymaganiach,
  `wasKicked` na stosie i `kicked` w `spell_cast`; oferta i UI dorobione,
  ścieżki modalna/X/Fireball dostają jawny błąd. W katalogu nie ma jeszcze
  instanta z nadrukowanym kickeriem — testy idą na deskryptorze
  wstrzykniętym w obiekt. Historia: silnik nie ogarnia kosztu dodanego
  „Kicker" przy czarach innych niż creature w tej samej kolejce płatności
  (Merfolk Falconer z batchu 52 ma trigger czytający `ev.kicked` ∪
  `object.wasKicked`, więc sama reakcja jest gotowa). Decyzja o zakresie obsługi
  należy do właściciela (ADR 0022).
- **[zamknięte w PR #93, `a072ae4`]** `tools/fetch-card-rulings.mjs` (przez
  `fetch_page`, bo `curl` z sandboxa nie ma egressu), `rulings` w 9
  snapshotach batchu 52, punkt kontrolny w `HOW_TO_ADD_CARD.md`; pusta lista
  oznacza „ściągnięto, WotC nie ma nic". Historia: snapshoty Scryfall bez
  `rulings` — `docs/cards/scryfall-*.json` niosą
  `text`, ale nie rulingi WotC, więc audyt „zgodne z Rulingami" nie da się
  wykonać offline (egress z sandboxa zablokowany). Pomysł: narzędzie
  dopisujące `rulings` do snapshotów + test porównujący ograniczenia kart z
  listą rulingów.
- **[tura 4, decyzja właściciela jeszcze nie zapadła]** czy dociągać rulingi do
  reszty katalogu (441 snapshotów, `rulings` ma 10, w tym 4 puste = „ściągnięto,
  WotC nie ma nic"). Stanowisko sesji: **nie hurtowo** — Scryfall nie ma ścieżki
  masowej (odpowiedź `/cards/search` zwraca tylko `rulings_uri`, sprawdzone
  2026-09-02), w sandboxie nie ma egressu z `bash`, więc 429 kart to 429
  wywołań `fetch_page` na dziurę, której nie widać. Zamiast tego: (1) zasada
  „przy kartce" już obowiązuje (ADR 0022 + `HOW_TO_ADD_CARD.md`), więc pokrycie
  rośnie samo na kartach dotykanych; (2) kolejka priorytetu: `limitations`
  niepuste, mechaniki spięte nietypowym CR, karty z ustaleń Żywego Testera;
  (3) jeśli ma być gwarancja liczbową — test pokrycia „każda karta
  z `support.limitations` ma `rulings` w snapshocie (choćby pustą listę)", ~30
  kart. Narracja i pomiary: §11.5 raportu `docs/audits/AUDYT_PR92_2026-09-02.md`.

- **[zamknięte w PR #93, `9d0ba7b`]** ogon `castSpell` to jeden obiekt
  `options`, nie sześć flag pozycyjnych. Historia: każda kolejna ability-grant
  dokładała argument, a pomyłka w kolejności jest niema (`undefined` zamiast
  błędnego typu). Pomysł był w §9 raportu z tury 2.
- **[zamknięte w PR #93, `5d7b3f4`]** Skarb przestaje być nazwą karty w rdzeniu
  (kolory w danych definicji, predykat zdolnościowy zamiast `cardId ===`,
  `player.treasureManaColors` zamiast literału pięciu kolorów, wpis z
  `MANA_SOURCE_MAP` usunięty). Historia: klasa ADR 0002; zgłoszenie właściciela
  „Skarby składamy z katalogu tokenów".
- **[zamknięte w PR #93, `62e03e6`]** rodzina pól `playableUntilTurn` /
  `playableWithoutPaying` w `tools/family-audit.mjs` + choke point
  `src/engine/impulse-window.js`. Historia: siedem zapisów w dwóch plikach i
  trzynaście odczytów w czterech, żadnego właściciela (wątek 4 z HANDOFF tury 2).
- **[zamknięte w PR #93, `9f1c37c`]** kontrzenie zdolności: Stifle (CNS #108) z
  typem celu `ability_on_stack`, efektem `counter_ability` i `abilityEffects` w
  `playerView`. Historia: `counterStackObject` umiał zdjąć wpis zdolności, ale
  nikt go o to nie prosił, więc pytanie o `pendingExileCast` Vaana przy kontrze
  całego triggeru było nie-do-udowodnienia (§9 pkt 3 raportu z tury 2).

## 3. Bot

- **B4/B5 z `docs/BOT_ROADMAP.md`** (kolejne progi jakości gry).
- **Wycena decyzji blokujących** poza trybami modalnymi: scry/surveil,
  wybór celu triggera, rozdzielanie obrażeń — dziś w większości „pierwsza
  oferta".
- **Inne gałęzie z własnym modelem świata** (pokłosie M288/C, L28): equip miał
  dwa modele — rzut pytał „co sprzęt daje", przeniesienie tylko „kto większy".
  Przejrzeć gałęzie, które liczą premię lokalnie, mając obok wywołanie wspólnej
  wyceny: `grep -n "score +=\|score -=" src/controllers/heuristic-bot.js` i
  porównać z dostępnymi `*Valuation`/predykatami. Każda taka rozbieżność to
  decyzja podejmowana bez części danych (klasa L119).
- **ZAMKNIĘTE w turze 10 (M289).** Waga „spożytkowania" w
  `equipValuation` (zgłoszone w §13.6 raportu): ładunek sprzętu był liczony od pompy
  i nowo grantowanych keywordów, a nie od tego, co nosiciel umie z nią zrobić —
  pompowany 3/2 vanilla i 3/2 z defenderem były dla drabiny równoważne, więc sprzęt
  zakotwiczał się na tym drugim. Naprawione połową wagi siły dla ciał, które nie
  atakują (albo których obrażenia zapobiega ochrona blokerów); bramowane
  `test/uwagi-tura9-bot-rowne-ciala-equip.test.js` (8/8) i benchmarkiem A/B (§13.7).
  **ZAMKNIĘTE w turze 11 (M290):** ta sama waga rozróżnia teraz ciała RÓWNE co do
  siły, jeśli jedno ma ewazję omijającą ścianę — pompa na nosicielu z lataniem (albo
  `cantBeBlocked`) przy blokerach bez latania/reacha dostaje +1 do wagi każdego punktu
  siły. Zmierzone na parze o identycznych statystykach (gorehorn-minotaurs 3/3 vanilla
  vs angel-of-the-dawn 3/3 latacz): −4,00/−4,00 → **+7,00 / −4,00**; z wrogim reachem
  premia znika (wraca −4,00), więc to nagroda za stan, nie za kartę. Benchmark A/B
  `--seeds 24`: heuristic 1723 → 1724 na 2016, aggro 248 → 247 na 1008 — zero regresu.
  Strażnik: `test/uwagi-tura11-bot-jakosc-ciala-equip.test.js` (9 testów, w tym
  antysymetria na siatce 6 ciał × 2 sprzętów i T11/8 — jedno miejsce definicji premii).
  **Zostaje otwarte (decyzja właściciela):** gałąź FRESH (pierwsze założenie sprzętu)
  nadal liczy od mocy nosiciela i dla pary latacz 3/3 vs vanilla 3/2 daje remis
  18,00/18,00 — ruszenie jej rusza kilkadziesiąt pinów equipu, więc idzie osobnym
  commitem z osobnym A/B (pin stanu: T11/7).
- **Ergonomia dotykowa pozostałych kontrolek** (po M129, lekcja L35): wizardy
  walki i obrażeń mają już cel dotyku >= 44 px. Do przejrzenia tym samym
  kątem: wizard scry/surveil (chipy `.look-wizard-card`), przyciski stref
  i menu kontekstowe — właściciel gra na telefonie.

- **Sondowanie kroku kolejności w wizardzie surveil** — decyzja pośrednia nie
  ma jeszcze klucza sondy (komenda nie jest wtedy jeszcze znana).
- **Rozdzielanie obrażeń (damage wizard)** — poza osią „noop" (jak walka
  przed M112).
- **Sprzątanie kontraktu `addObject`** (lekcja L21: pola spoza kontraktu giną
  po cichu — dorobić walidację albo jawną listę pól).
- **Reszta ekranów wyboru na `picker.js`** (po M288/A): wspólny wiersz wyboru ma
  już kreator celów wielokrotnych, wybór atakujących/bloków i koszt escape
  (`.escape-exile-*` też nie miały ani jednej reguły CSS — dostały ją razem z
  rodziną `.picker-*`). Do przejścia tym samym kątem: chipy `.look-wizard-card`
  (scry/surveil/look), steppery podziału obrażeń, `mana-wizard`. Kryterium:
  czy ekran ma „pozycje do zapunktowania", bo wtedy picker daje mu natywny
  `<input>` (dotyk 44 px) i klik w nazwę = pełny ekran karty.
- **Talia pod picker nie powstanie przez tasowanie** (tura 10, §13.8): próba
  `decks/wielocelowa.txt` wpadła w `test/m132-proporcje-landow.test.js` (lądy) i
  `test/repo-decks.test.js` (M178/ADR 0023 — 11 z 12 kart już gdzieś leżało).
  Przenoszenie kart między taliami odrzucone świadomie: `decks/*.txt` karmią
  benchmark i audyt remisów, a zmiana składu par unieważnia porównania A/B.
  **Droga, która działa (tura 11):** nowa karta + `plan` + `generate-plan-decks.mjs`.
  Rykosz odnotowany w §15 raportu: od commitu M291 talia `ravnica` ma inny skład, więc
  porównania A/B z tur 7-10 liczą się od nowego baseline'a.
- **Kontrakt testera na markup pickera** — `tools/table-tester/run-game.mjs`
  klika `.multi-target-toggle` i czyta `checked` (fallback na tekst „[x]"), a
  nazwę bierze z `.picker-name`. Jeśli picker zmieni strukturę wiersza, tester
  musi zmienić się w tym samym comicie (inaczej kreatorzy znikają z zasięgu
  audytu — klassa M206).

## 5. Dług dokumentacyjny
- **Ścieżki-widma w `docs/PROJECT_HISTORY.md`** (pomierzone `find`+`git log` przy
  M288): `test/m213-nazwy-kart-z-danych.js`, `docs/TODO.md`,
  `test/bot-reasoning.test.js` — wpisy historyczne wskazują pliki, których w repo nie
  ma. Nie kasować treści: poprawić odnośnik na istniejący odpowiednik albo dopisać
  „(plik wycofany w MNNN)". Zasada cytowania: `ls test/<plik>` przed wpisem (errata
  §13.5 raportu z tury 8).

- Przegląd starych wpisów `notes` (58 kart) — czy któryś nie opisuje jednak
  luki wobec Oracle (wtedy przenieść do `limitations` i naprawić).
- ~~Karty dwustronne bez `oracle_text` w pliku źródłowym~~ — **zrobione
  (M118)**: pliki DFC ujednolicone do kanonicznego `card_faces`, a strażnik
  porównuje teraz tekst każdej strony osobno (layout `transform`).

### 6.4 Audyt bota #2 (2026-09-02) — jedna zmiana wagowa do benchmarku

Z pomiaru remisów (`tools/bot-tie-audit.mjs`, M286) zostały cztery groźby; trzy
są zamknięte (ląd naprawiony, block = polityka), jedna czeka na decyzję liczbową:

- **`attack`: płaska wycena na drobnych różnicach.** `attack[]` (0) ex aequo z
  atakiem 1/1 w blokerów (0) oraz dwa zestawy o sile 3 vs 4 i obronie w domu 3 vs 2
  ex aequo (6). Propozycja: kara za wystawianie stwora, który ginie pod blokiem,
  liczona względem obrażeń, które i tak dopinają — ale **tylko przez benchmark**
  (`node tools/benchmark.mjs` przed/po, próg przyjęcia = brak regresji; ADR 0018
  profil quick na start). Bez tej weryfikacji zmiana jest gustem, nie wynikiem.
- **ZAMKNIĘTE w turze 7 (M287).** `cast_permanent` nie znał kosztu many — naprawione
  `creatureManaCostWeight`, zaakceptowane benchmarkiem 2016 meczów (heuristic 85,5%).
  Projekcje doszły dla `cast_*` i `activate_ability`: 0 groźb, czyli pomiar już nie milczy.
- **Projektowanie projekcji dalszych klas:** `cast_spell` 5,
  `activate_ability` 8, `resolve_discard_choice` 7 — dziś `bez-danych` = `akcyjne`,
  czyli pomiar o nich milczy. Wzorzec: `tieProjection` w `heuristic-bot.js` +
  grzechotka w teście (patrz `test/audyt-bot-walka-remisy.test.js`).

