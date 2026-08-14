# Bieżący stan projektu

- **Ostatnia aktualizacja:** 2026-08-14 (M95: brązowa odznaka — audyt vs CR)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90…M95)
- **M95 — polowanie na błędy vs Comprehensive Rules (6 znalezisk):**
  1. **CR 104.4b** — brak REMISU: pętla SBA kończyła grę na pierwszym
     przegranym i ogłaszała drugiego zwycięzcą (o wyniku decydowała kolejność
     w `state.players`). Teraz `winnerId: null` + `state.isDraw`.
  2. **CR 400.3/110.2a** — karta opuszczająca bitwisko zachowywała
     `controllerId` złodzieja: skradziony stwór po śmierci trafiał do grobu
     ZŁODZIEJA na stałe. Niespójność: `bounce` miał korektę, `destroy`/`exile`
     nie. Fix u root cause w `moveObjectDirectly`.
  3. **CR 110.6b/400.7** — `tapped` przechodziło przez zmianę strefy:
     reanimowany/odbity stwór wracał na stół tapnięty. Ślad maskowania:
     12 miejsc ręcznie zerowało to pole.
  4. **UI remisu** — baner pokazywałby „wygrywa: ?"; dodane komunikaty
     w `render.js`, `main.js`, `session.js` + `isDraw` w PlayerView.
  5. **CR 400.7** — `damagedThisTurn` przeciekało (Fathom Fleet Cutthroat
     mógł celować w nietknięty obiekt).
  6. **CR 400.7** — `attackedThisTurn` przeciekało (Homicidal Brute nie
     transformowała się). Przy okazji: attacking, blocking, saddled,
     monstrous, damagedByDeathtouch, abilityResolvedThisTurn.
  - **Świadomy wyjątek (strażnik):** `formerCounters`, `formerZone`,
    `formerAbilityGrants`, `isBlockingThisCombat` to celowe LKI (CR 603.10).
  - **Metoda i obszary sprawdzone-poprawne:** patrz
    `docs/plans/PLAN_2026-08-14-m95-brazowa-odznaka.md` (ok. 50 sond CR +
    4 skany automatyczne) oraz lekcja **L11** w `docs/LESSONS.md`.
- **Stan:** `npm test` **1619/0** (1599 → 1619, +20), build 50 modułów /
  **1641.4 kB**, bot-benchmark 7/0. Benchmark 6 seedów: heuristic
  **95.4% vs random**, **66.6% vs aggro** — bez regresji.

- **Ostatnia aktualizacja:** 2026-08-14 (M94: ENVIRONMENT.md — pułapki środowiska jako dokument trwały)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92 + M93 + M94)
- **M94 — trwała wiedza o środowisku** (uwaga właściciela: „nowa sesja nie ma
  dostępu do plików lokalnych starej sesji, tylko do main i handoffa w formie
  wiadomości tekstowej"; „wszystkie pułapki — typu cofanie HEAD"):
  - **[docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md)** — nowy dokument
    trwały zbierający to, co dotąd było powtarzane w sekcjach „Pułapki"
    kilkunastu handoffów i przepadało razem z nimi: izolacja sesji (co
    NAPRAWDĘ przetrwa: `main` + tekst pierwszego promptu), reset workspace
    w trakcie sesji wraz z procedurą odzyskania (`reflog` → `fetch` →
    `reset --hard` → `cherry-pick`), pułapki gita (`git checkout` cofający
    własne zmiany, wygasanie `GH_TOKEN`, obejście `gh pr edit`), sieć
    (zablokowany egress, Scryfall przez `fetch_page`), polskie znaki
    w `edit_file`, limity czasu operacji, checklisty startu i końca sesji.
  - **`docs/LESSONS.md`** — nowe lekcje **L9** (praca istnieje dopiero po
    `git push`) i **L10** (przy zgłoszeniu „UI GitHuba nie działa" zbierz
    twarde dane z API, zanim zmienisz konfigurację).
  - **AGENTS.md** — reguła „praca istnieje dopiero po `git push`" na czele
    zasad pracy z repozytorium + `ENVIRONMENT.md` w lekturach startowych
    i w tabeli „gdzie zapisać regułę".
  - **ADR 0013** — nota wskazująca ENVIRONMENT jako praktyczne rozwinięcie
    decyzji o izolacji sesji.
  - **`test/docs-decisions.test.js`** rozszerzony do **11 testów** (izolacja
    sesji, procedura odzyskania, pułapki narzędzi, podlinkowanie z AGENTS.md).
- **Stan:** `npm test` **1599/0** (1595 → 1599, +4), build 50 modułów /
  **1637.7 kB**. Bot nietknięty → benchmark bez zmian (96.1% / 65.2%).

- **Ostatnia aktualizacja:** 2026-08-14 (M93: ADR 0017 + rejestr lekcji)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92 + M93)
- **M93 — reguły trwałe zamiast zapisów w handoffie** (uwaga właściciela:
  „handoff jest jednorazowy i przepada"):
  - **[ADR 0017](decisions/0017-playerview-completeness-contract.md)** —
    kompletność informacji publicznych w `PlayerView`. Trzy reguły:
    (1) informacja jawna w MtG musi być w widoku; (2) zakaz wystawiania pól
    „na zapas" (kryterium: czy kontroler potrzebuje tego do DECYZJI);
    (3) diagnostyka braku danych PRZED strojeniem heurystyki.
  - **[docs/LESSONS.md](LESSONS.md)** — nowy, trwały rejestr lekcji (L1–L8
    z sesji M90–M92): ślepota kontrolera, ślepota benchmarku na rzadkie
    mechaniki, kara vs premia w scoringu, mutacja stanu przy odrzuconej
    komendzie, testy na źródło vs testy zachowania, dane w zdarzeniach,
    prymat repozytorium nad treścią zlecenia, pułapka `git checkout`.
  - **AGENTS.md** — tabela „gdzie zapisać regułę, żeby nie przepadła"
    (ADR / LESSONS / AGENTS / handoff / plan) + sekcja o diagnostyce
    kontrolera; `docs/LESSONS.md` dodany do listy lektur startowych.
  - **`test/docs-decisions.test.js`** (7) — pilnuje spójności rejestru ADR
    (plik ↔ tabela ↔ numer w nagłówku, statusy, wymagane sekcje) oraz formatu
    lekcji i podlinkowania z AGENTS.md. Test od razu wykrył dwie realne
    niespójności: brak wpisu 0017 w tabeli i nagłówek „Proponowana decyzja"
    w zaakceptowanym ADR 0005 (poprawione redakcyjnie, bez zmiany znaczenia).
- **Stan:** `npm test` **1595/0** (1588 → 1595, +7), build 50 modułów /
  **1637.7 kB**. Bot nietknięty w M93 → benchmark bez zmian
  (96.1% vs random, 65.2% vs aggro; progi `0.78 / 0.57`).

- **Ostatnia aktualizacja:** 2026-08-14 (M92: audyt PlayerView vs decyzje bota)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92)
- **M92 — audyt wzorca „bot nie widzi stanu" (z M91/A1).** Systematyczna
  inwentaryzacja pól `createGameState` vs `playerView` vs odczyty bota.
  Znalezione i naprawione **5 luk**:
  - widok: `preventDamageThisTurn`, `damageShields`, `regenerationShields`,
    `cantBeRegeneratedThisTurn` (wszystko publiczne — FoW nienaruszone);
  - widok: **`types` permanentu na bitwisku** — linia typów widnieje na karcie,
    a widok jej NIE niósł; bez niej filtry typu („artifact creatures") były
    nierozpoznawalne po stronie kontrolera (face-down nadal ukryty, CR 708.2);
  - bot: czar obrażeniowy w cel z pełną prewencją/tarczą oraz
    `destroy_permanent` w cel z tarczą regeneracji to zagrania jałowe (−70
    i pominięcie premii); atakujący objęty prewencją nie ginie w bloku →
    atak darmowy.
  - **Świadomie poza zakresem:** liczniki turowe (`spellsCastThisTurn`,
    `creatureDiedThisTurn`, `dealtDamageToOpponentThisTurn`,
    `cardsDrawnThisTurn`) — wpływają na triggery rozstrzygane przez engine,
    nie na wybór komendy.
  - Test: `test/bot-view-prevention-gaps.test.js` (13, w tym 5 strażników
    przed nadgorliwą karą).
  - **Wniosek metodyczny:** pełny benchmark NIE wykrywa takich błędów (karty
    z prewencją są rzadkie, różnica ginie w uśrednieniu) — potrzebny jest
    audyt kontraktu widok↔kontroler. Inwentaryzację warto powtarzać po każdym
    batchu wnoszącym nowe pole stanu.
- **Stan:** `npm test` **1588/0** (1575 → 1588, +13), build 50 modułów /
  **1637.7 kB**. Benchmark 12 seedów: heuristic **96.1% vs random**,
  **65.2% vs aggro** (bez zmian — karty z prewencją tylko w jednej talii);
  benchmark ukierunkowany na talie z Withstand (20 seedów): heuristic
  **69.8% vs aggro**, **97.3% vs random**. Progi `0.78 / 0.57` utrzymane.
- **Plan:** `docs/plans/PLAN_2026-08-14-m92-audyt-playerview-bot.md`.

- **Ostatnia aktualizacja:** 2026-08-14 (M91: uwagi z testów właściciela A–D)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91)
- **M91 A — Inspire Awe (dwa błędy heurystyki):**
  - A1: `state.preventCombatExceptEnchanted` NIE było w PlayerView, więc bot
    (kontroler dostaje widok, nie stan) nie mógł zauważyć, że jego atak zada
    0 obrażeń — wysyłał wszystkie stwory w prewencję i tapował je. Widok niesie
    flagę; heurystyka zeruje ocenę takiego ataku.
  - A2: globalny fog działa na OBIE strony — we własnej turze kasuje własny
    atak. Kara −80 w swojej turze, premia w turze przeciwnika skalowana mocą
    atakujących. PlayerView oznacza atakujących (`attacking`, informacja
    publiczna). Test: `test/bot-combat-prevention.test.js` (7).
- **M91 B — ptaszek pomijania dla czarów z opcjami:** panel rysował ptaszek
  tylko dla pojedynczych komend, więc Village Rites / Bone Splinters / czary
  modalne (jeden przycisk „Wybierz:") nie dało się wyciszyć z panelu. Przycisk
  grupy ma ptaszek wyciszający WSZYSTKIE warianty naraz.
  Test: `test/choice-group-ignore.test.js` (4).
- **M91 C — bot niszczył własny permanent (Shatter na własny Great Furnace):**
  scoring nie miał wyceny efektów usuwających, więc czar dostawał domyślne
  50 pkt niezależnie od tego, czyj jest cel. Reguła generyczna: własny
  permanent −90, przeciwnika +22 + wartość celu.
  Test: `test/bot-no-self-removal.test.js` (4).
- **M91 D — tryb czaru modalnego w logu (Ruinous Rampage):** zdarzenia
  `spell_cast`/`spell_resolved` niosą `modeName`; log i modal „Ruch
  przeciwnika" pokazują „— tryb: X". Test: `test/modal-spell-log.test.js` (4).
- **Stan:** `npm test` **1575/0** (1556 → 1575, +19), build 50 modułów /
  **1633.6 kB**. Benchmark 12 seedów po zmianach bota (A+C): heuristic
  **96.1% vs random** (przed: 95.8%), **65.2% vs aggro** (przed: 63.5%) —
  zmiany podniosły siłę gry; progi `0.78 / 0.57` utrzymane.
- **Plan:** `docs/plans/PLAN_2026-08-14-m91-uwagi-testow.md`.
  Handoff: `docs/setup/HANDOFF_2026-08-14-m90.md` (M90) + sekcja M91 niżej.

- **Ostatnia aktualizacja:** 2026-08-14 (M90: bugi z iPhone'a A–E + 2 crashe z benchmarku)
- **PR sesji:** `arena/01a000df-mtg`
- **M90 rozpoznanie:** handoff zakładał, że wszystkie fixy „M89 cd." przepadły
  z working tree poprzedniej sesji. Audyt `main` (10fe8b7) wykazał, że A
  (viewport `maximum-scale=1.0` + `overscroll-behavior: none`), C2
  (`token_created` w `BOT_MOVE_CARD_EVENTS`), D (ptaszek w `renderChoiceRequest`)
  i E (chump `perAttacker = -10`) SĄ w `main` wraz z testami — realnie otwarte
  były tylko **B** i **C1**.
- **M90 B — Forever Young → „Poddaj walkę" / `not_priority`:** `session.apply()`
  kasował bufor modala i `awaitingBotAck` PRZED `execute()`. Odrzucona komenda
  (priorytet miał bot wstrzymany pauzą) zostawiała gracza bez pauzy i bez
  „▶ Wznów grę bota" — w `legalCommands` zostawało samo `concede`. Fix: stan
  sesji zmienia wyłącznie UDANA komenda. Test: `test/session-bot-pausa.test.js`.
- **M90 C1 — brak okna na instant w odpowiedzi (Carrion Call), CR 117.3c/117.4:**
  `state.turn.passes` zerowany był tylko przy zmianie kroku i po rozstrzygnięciu
  stosu, nie po AKCJI. Sekwencja „człowiek pass → bot rzuca instant → bot pass"
  liczyła się jako pełna runda passów i czar rozstrzygał się, zanim gracz
  dostał priorytet. Fix: `accepted()` zeruje `passes` dla każdej komendy
  ≠ `pass_priority`. Test: `test/priority-after-action.test.js`.
- **M90 crash 1 (był w `main`) — „Ta karta nie ma drugiej strony (craft)",
  CR 707.8a:** `create_copy_token` (Cogwork Assembler) kopiował zdolności
  artefaktu wraz z craftem, ale nie deskryptor drugiej strony DFC (Lodestone
  Needle) — aktywacja craftu na tokenie rzucała wyjątkiem i przerywała partię.
  Fix: `effects.js` przekazuje `transformTo`, `tokens.js` przyjmuje je
  w kontrakcie tokenu. Test: `test/copy-token-dfc.test.js`.
- **M90 crash 2 (był w `main`) — „Nieprawidłowy cel obrażeń", CR 608.2b:**
  zdolność celowana (Ballista Wielder), której cel przestał być legalny w oknie
  odpowiedzi, po rewalidacji wykonywała efekty z PUSTĄ listą celów
  (`markDamage(undefined)`). Fix: `resolveActivatedAbilityEntry` fizzluje
  (`ability_resolved{fizzled:true}`). Test: `test/ability-fizzle-no-target.test.js`.
- **M90 bug D (wzmocnienie):** dotychczasowe testy ptaszka pomijania sprawdzały
  wyłącznie OBECNOŚĆ kodu (regexy na źródle). Dodane 3 testy funkcjonalne na
  harnessie DOM (`test/choice-request-ui.test.js`); weryfikacja mutacyjna
  potwierdziła, że łapią regresję.
- **Stan:** `npm test` **1556/0** (1544 → 1556, +12), build 50 modułów /
  **1627.5 kB**. Benchmark: pełna macierz na 12 seedach przechodzi BEZ
  przerwania (wcześniej crash) — heuristic **95.8% vs random**, **63.5% vs
  aggro**, aggro **92.0% vs random**; progi `0.78 / 0.57` utrzymane. Bot
  nietknięty. Żywy Tester: 5 partii do końca, zero odrzuceń.
- **Plan:** `docs/plans/PLAN_2026-08-14-m90-bugi-iphone.md`.
  Handoff: `docs/setup/HANDOFF_2026-08-14-m90.md`.

- **Ostatnia aktualizacja:** 2026-08-13 (M89: Curate modal + overlay badges + audyt testerem)
- **PR sesji:** `arena/019ffd38-mtg`
- **M89 A. Curate:** modal „Ruch przeciwnika" pokazuje teraz dobranie z `draw_cards`
  (Curate Surveil 2 + Draw 1, Phyrexian Rager, Evangel, Curiosity itd.).
  Root cause: `card_drawn` z `BOT_MOVE_NOISE` obejmowało wszystkie dobrania
  (włącznie z krokiem draw). Fix: pole `source: 'draw_step' | 'effect'` w
  evencie `card_drawn`, `BOT_MOVE_NOISE` pomija tylko `draw_step`,
  `BOT_MOVE_CARD_EVENTS` zawiera `card_drawn` (ilustracja dobranej karty).
  Pliki: `src/engine/effects.js` `drawPlayerCards(state, playerId, amount, source = 'effect')`,
  `src/engine/game-state.js` `draw_card` ustawia `source: 'draw_step'`,
  `src/table/session.js` `isCardDrawnNoise(e)`.
- **M89 B. nakładki na karcie:** wiersze (np. „Choroba" + aury) nachodziły na siebie.
  Fix CSS: `.ovl-badges { flex-wrap: wrap; max-height: 100%; }` +
  `.ovl-badge { line-height: 1.1; }`. `buildStateOverlay` wyeksportowany
  (testowalny headless). Testy: `test/overlay-badges.test.js` (3 testy jsdom).
- **M89 C. Stomping Slabs modal „ułóż karty":** w transkrypcie modala
  były tylko pozycje (1, 2, 3...). Root cause: `cardIds` w `pendingRevealOrder`
  to objectIds (spójne z resztą engine i testami), ale commandLabel mapował
  pozycje zamiast czytać nazwy. Fix: pole `revealedNames` (cardIds kart)
  w pendingRevealOrder, commandLabel mapuje objectId→cardId i czyta
  `session.nameOf`. Pliki: `src/engine/effects.js`, `src/table/render.js`,
  `src/engine/game-state.js` (playerView). Testy: `test/stomping-slabs-order.test.js` (RED→GREEN).
- **Audyt testerem:** trwający (15+ błędów z transkryptów). Naprawione
  po 5 błędach: Stomping Slabs modal (powyżej). Pozostałe zidentyfikowane:
  Epic Experiment „zakończ" (tester nie klika), Sweet Oblivion Escape modal
  (32 warianty za dużo), Brute Force modal podczas ruchu gracza (false positive
  w streamAutoEvents), tester atakował tylko Rustwing Falcon.
- **M88 PR #51:** naprawa transkryptu modala Żywego Testera (extractBotMoves,
  extractModalChoice, extractTileText w `tools/table-tester/extract.mjs`).
  Zamknięty PR; 1524/0, build 50 modułów / 1618.8 kB.
- **Stan:** `npm test` **1531/0** (po M89 fixes: 1524 → 1531, +7 testów:
  curate-modal ×3, overlay-badges ×3, stomping-slabs-order ×1), build
  50 modułów / 1621.1 kB, bot nietknięty (B0 niewymagany).

- **Ostatnia aktualizacja:** 2026-08-13 (audyt PR #47 + CR 502.2 day/night)
- **PR sesji:** `arena/019ffc52-mtg`
- **Audyt #47:** Batch 32 zgodny z Oracle; 3 twarde błędy naprawione (day/night, Soulbright {R}×8, onNthResolve).
- **Testy:** 1485/0, build 50 / 1602.5 kB, bot-benchmark 7/0 (bez pełnego B0).
- **Kolejka:** Batch 33 czeka na listę właściciela; Jwari/Awaken „you may" nadal deterministyczne.

- **Ostatnia aktualizacja:** 2026-08-13 (Batch 32 + brązowa odznaka ×5 CR)
- **Brąz 2:** flashback exile ze stosu; search minMV; Soulbright you may; Ballista ifDealtDamage; tarcza ≠ damagedThisTurn.
- **PR sesji:** `arena/019ffb43-mtg` (#47)
- **Batch 32:** 10 kart (Dream Twist flashback, Voice shield, Constellation, Fathom damaged-this-turn, Fierce Empath search, Soulbright 3rd resolve, Rustvine oil, Arynx Saddle, Nature's Embrace creature_or_land, Ballista daybound). Testy 1464/0 bez bot-benchmark (bot nietknięty). Build 50 / 1599.5 kB.
- **Faza:** Etapy 1–4 zamknięte na katalogu syntetycznym; M5–M7 wdrożone — przez
  stołowy HTML można rozegrać pełną partię człowiek–bot. **M6: zdolności aktywowane
  i tworzenie tokenów wpięte w engine. M7: nowy układ stołu** — karty jako kolorowe
  kafelki (syntetyczna twarz), stół na całą szerokość (wróg u góry, Ty na dole, ręka
  na samym dole), strefy w modalnym inspektorze, podgląd hover i klik, rozwijane panele.
  **M8–M17: osiem batchy REALNYCH kart w katalogu** (28 kart: Highland Game, Kappa
  Tech-Wrecker, Segmented Krotiq, Grizzled Outcasts, Entrancing Lyre, Zoraline,
  Rupture Spire, Leafcrown Dryad, Prismari Campus, Gloomfang Mauler, Serra's
  Embrace, Cloak of the Bat, Midnight Guard, Holdout Settlement, Skyclave
  Geopede, Soulmender, Illusory Demon, Jyoti, Moag Ancient) — blokada braku
  prawdziwego katalogu (Etap 2/3)
  częściowo zniesiona. Batch 4 wniósł do engine: **menace, haste, backup
  (decyzja `resolve_backup`), typecycling, czyste aury i equipment** (załączniki
  uogólnione z bestow); Batch 5: **triggery wejścia (untap/landfall),
  trample, koszt „tap stwora"**; Batch 6: **trigger „when you cast a spell",
  land creatures, trigger beginning_of_combat**; Batch 7 (5 kart):
  **liczniki -1/-1, granty zdolności do końca tury, LKI, persist,
  reanimacja ze zmianą kontroli, opóźnione triggery, tokeny nie-stwory,
  koszt „Sacrifice this", atomowe koszty, zmiana typu podstawowego landa**;
  Batch 8: **dobieranie i odrzucanie kart z efektów, licznik dobrań w turze,
  zdolności statyczne warunkowe, trigger odejścia permanentów, scry poza
  własną turą, fateful hour, zwykły morph**. **B0: harness pomiarowy bota wdrożony**
  — każda kolejna zmiana bota (B1+) jest mierzona macierzą win-rate z
  `tools/benchmark.mjs` ([docs/BOT_ROADMAP.md](BOT_ROADMAP.md)).
  **M12: ilustracje realnych kart na stole** — kafle renderują druk ze Scryfalla,
  syntetyczna twarz jest fallbackiem.
- **Kod produkcyjny:** headless engine (`src/engine/`, `src/protocol/`), warstwa kart
  (`src/cards/`) z syntetycznym katalogiem i taliami w `decks/`, bot heurystyczny
  (`src/controllers/`), stół (`src/table/`) publikowany przez Pages
- **M19/B4 (2026-08-03):** dodano jawne, walidowane wagi rodzin decyzji bota
  (`mana=1.1`, `permanent=0.9`, pozostałe `1.0`) oraz offline'owy,
  deterministyczny hill-climbing (`tools/tune-bot.mjs`) na harnessie B0.
  Pełna macierz 13 talii / 50 seedów / 27 300 meczów / 0 niedokończonych:
  heuristic **77.9% vs random**, **64.0% vs aggro**, aggro **75.5% vs random**;
  próbka regresji: **75.1% / 67.6%**, progi `0.60 / 0.52`.
- **M20 (2026-08-03):** kreator talii w UI zgodny z ADR 0012: pokazuje wyłącznie
  karty `supported`, filtruje po Planie, secie i nazwie, liczy kopie, kolory,
  landy i pozostałe karty, waliduje limit 4 kopii (Basic Land bez limitu),
  generuje wspólny tekst `# nazwa talii` / `Nx Karta` oraz oferuje kopiowanie
  i pobranie pliku `.txt`. Stan kreatora nie trafia do `localStorage`.
  Po zmianie: **475/475** testów, artefakt **41 modułów / 396.5 kB**.
- **M21 (2026-08-03):** dodano modalny adapter `ChoiceRequest` w UI. Warianty
  celu, wartości X oraz scry/backup są grupowane z `legalCommands`, a po wyborze
  UI waliduje odpowiedź przez protokół i wysyła wybraną legalną komendę. Engine
  zachowuje dotychczasową enumerację komend jako świadome ograniczenie przejściowe.
  Po zmianie: **477/477** testów, artefakt **42 moduły / 401.8 kB**.
- **M22 / Batch 9 (2026-08-03):** dodano Kor Cartographer, Scorpion Sentinel,
  Dunland Crebain, Dragonbroods' Relic i Secluded Steppe. Generyczne mechaniki
  obejmują wyszukanie Plains na bitwisko, statyczny warunek liczby landów,
  amass Orcs/Army, sorcery-speed sacrifice z tokenem ETB damage oraz zwykły
  cycling dobierający kartę. Wszystkie karty są `supported`, mają dane Scryfalla,
  artId i testy legalnych/nielegalnych interakcji. Pełna macierz B0 po Batchu 9:
  14 talii / 31 500 meczów / 0 niedokończonych — heuristic **78.9% vs random**,
  **65.4% vs aggro**, aggro **76.6% vs random**; próbka regresji **76.3% / 68.6%**,
  progi `0.61 / 0.53`. Stan: **498/498** testów, artefakt **42 moduły / 416.1 kB**.
- **M23 / Batch 10 (2026-08-03):** dodano Goblin Piker, Angel of the Dawn,
  Armored Skaab, Tumbleweed Rising i Dawntreader Elk. Generyczne mechaniki:
  globalny buff stworów do cleanup, mill, plot, dynamiczny token X/X oraz
  sacrifice/search Basic Land. Korekta combat zachowuje status „blocked" po
  opuszczeniu bitwy przez blockera; tylko trample może wtedy zadać nadmiar. Wszystkie karty mają dane Scryfalla, artId,
  testy i talię `decks/real-batch10.txt`. Pełna macierz 15 talii / 36 000 meczów
  / 0 niedokończonych: heuristic **81.0% vs random**, **64.3% vs aggro**,
  aggro **78.7% vs random**; próbka **79.1% / 67.2%**, progi `0.64 / 0.53`.
  Stan: **517/517** testów, artefakt **42 moduły / 429.3 kB**.
- **M24 / Batch 11 (2026-08-03):** dodano Underdark Explorer (CLB),
  Angel's Feather (M11), Release the Ants (MOR), Porcelain Legionnaire (NPH),
  Curate (BRO) i Canonized in Blood (LCI) — sześć kart z listy właściciela
  (odstępstwo od „5 na batch"). **Pełne mechaniki w 100% (decyzja właściciela
  2026-08-03):** **inicjatywa** (znacznik + przejmowanie przez combat damage)
  z **loch Undercity w całości wykonywanym** — wszystkie 9 pokoi działa
  (Secret Entrance szuka landa, Forge liczniki, Lost Well scry, Trap! utrata
  życia, Arena goad, Stash Treasure, Archives dobranie, Catacombs Skeleton,
  Throne stwór z 3× +1/+1 i hexproof), a **karta „The Undercity" jest na
  stole z zaznaczeniem pokoju** (druk ze Scryfalla jak w legacy — ID 990006);
  trigger **„a player casts a white spell"**, **clash** z realnym wyborem
  wierzch/spód obu graczy, **phyrexian mana z wyborem gracza** (mana albo
  2 życia — warianty cast_permanent), **first strike** (dwa przebiegi),
  **surveil** z wyborem kart do grobu ORAZ kolejności reszty, **descended**
  + trigger end step, a **wybory celów pokoi lochu (Forge/Arena/Trap!/Throne)
  są decyzjami GRACZA** (resolve_room_target z listą legalnych celów; boty
  odpowiadają deterministycznie). Wszystkie karty mają dane Scryfalla, artId
  (Curate = 302BRO po secie), testy i talię `decks/real-batch11.txt`.
  Pełna macierz 16 talii / 40 800 meczów / 0 niedokończonych: heuristic
  **83.1% vs random**, **62.3% vs aggro**, aggro **81.2% vs random**; próbka
  **81.3% / 65.9%**, progi `0.66 / 0.53` bez zmian. Stan: **563/563** testów,
  artefakt **42 moduły / 510.2 kB**.
- **M25 (2026-08-03, tylko UX):** nowy panel stołu **„Przebieg tur (dla AI)"**
  obok „Rozumowania bota" — co robili **Czarodziejka** (gracz) i
  **Nieprzyjaciel** (bot) w poprzedniej pełnej turze albo w dwóch ostatnich,
  jako gotowy blok tekstu dla modelu AI (fabularny opis partii). Przełącznik
  1/2 ostatnich tur, guzik „Kopiuj do schowka" (Clipboard API z fallbackiem
  dla `file://`), licznik ukończonych tur. Tura „pełna" = zakończona
  (`turn_started` następnej); bieżąca dołącza po końcu partii. Engine i
  protokół nietknięte. Testy `test/table-turn-history.test.js`; 551/551
  zielonych, artefakt **42 moduły / 472.8 kB**.
- **M26 (2026-08-03, tylko UX, zgłoszenie właściciela z iPada):** poprawka
  gestów dotyku — wspólny kontrakt `installTapGesture` w nowym module
  `src/table/gestures.js` (kaflе stołu i warstwa pełnego ekranu). **Double-tap
  znów otwiera pełny ekran:** iOS wysyła syntetyczny `click` po każdym
  tapnięciu i stary kod kończył zawsze „pojedynczym" (menu kontekstowe
  przykrywało pełny ekran); teraz pojedynczy klik na dotyku jest odroczony
  o okno 300 ms (double-tap może go anulować), a `click` po double-tapie jest
  tłumiony. **Pełny ekran zamyka ten sam gest:** tap albo double-tap w
  dowolnym miejscu (także na karcie), z odpryskiem gestu otwierającego
  ignorowanym (350 ms). Mysz bez zmian (click/dblclick). Testy
  `test/table-touch-gestures.test.js` (8, `mock.timers`); engine i boty
  nietknięte — bez pomiaru benchmarku. Stan: **571/571** testów, artefakt
  **43 moduły / 513.3 kB**.
- **M27 / Batch 12 (2026-08-03):** dodano Grave Exchange (AVR), Hysterical
  Blindness (ISD), Barkform Harvester (BLB), Undead Servant (ORI — druk
  Origins wg słownika kolekcji) i Rage of Purphoros (THS). Wszystkie mają
  pełne mechaniki (ADR 0010 §2a), artId ze słownika, talię
  `decks/real-batch12.txt` i testy. Nowe generyczne mechaniki: **czary
  wielocelowe** (Grave Exchange — iloczyn kartezjański celów w legalSpellCasts,
  efekty mapowane na cele po `targetIndex`, CR 608.2b), **cel „player"**,
  **cel „creature/card in your graveyard"**, **powrót stwora-karty z grobu do
  ręki**, **„target player sacrifices a creature of their choice"** — realna,
  blokująca decyzja `resolve_sacrifice_choice` (jak scry/surveil; boty
  odpowiadają deterministycznie — najsłabszy stwór), **globalny modyfikator
  stworów przeciwnika do końca tury** (Hysterical Blindness: -4/-0),
  **położenie karty z grobu na spód biblioteki** (Barkform) oraz **tokeny
  za liczbę kart o danej nazwie w grobie** (Undead Servant). Przy okazji
  naprawione dwa generyczne błędy odsłonięte przez nowe karty: (1) scry jako
  OSTATNI efekt czaru nie dokańczał czaru po `resolve_scry` (Rage of Purphoros
  zostawał na stosie z `pendingSpell` na zawsze — `pendingScry` nie wołało
  `finishPendingSpell`, jak robi to `pendingSurveil`); (2) ujemna moc (po
  -4/-0) próbowała zadać ujemne obrażenia combat — teraz moc ≤ 0 zadaje
  0 obrażeń (CR 510.1). Pełna macierz B0 (17 talii, 50 seedów, 45 900 meczów,
  0 niedokończonych): heuristic **84.2% vs random**, **62.3% vs aggro**,
  aggro **82.2% vs random**; próbka regresji **82.5% / 66.7%**, progi
  `0.66 / 0.53` bez zmian (wartości tylko w górę). Stan: **585/585** testów,
  artefakt **43 moduły / 530.2 kB**.
- **M28 / Batch 13 (2026-08-03):** dodano Scorned Villager (DKA — transform
  DFC na Moonscarred Werewolf, zdolność many {T}: Add {G} + trigger upkeep
  „if no spells were cast last turn"), Curse of the Pierced Heart (ISD — AURA
  **„Enchant player"**: zaczarowany gracz wybierany przy rzucaniu, upkeep
  zaczarowanego gracza → 1 obrażeń), Emissary Escort (EOE — statyczne
  **+X/+0**, X = największa mana value wśród INNYCH artefaktów kontrolera,
  CR 604.3), Snarling Wolf (VOW — aktywowane {1}{G}: +2/+2, **„activate only
  once each turn"**) i Negate (M20 — **counter target noncreature spell**,
  cel czaru na stosie). Wszystkie mają pełne mechaniki (ADR 0010 §2a), artId
  ze słownika, talię `decks/real-batch13.txt` i testy. Nowe generyczne
  mechaniki w engine: **aura zaczarowująca gracza** (enchantPlayer — nowy
  typ aury obok bestow/czystej; rzucanie z wyborem gracza jako celu,
  `enchantedPlayerId` na permanencie, trigger w upkeep zaczarowanego gracza),
  **kontrczar z celem na stosie** (`noncreature_spell_on_stack` — czar
  niebędący stworem; `counter_spell` usuwa go bez rozstrzygania),
  **dynamiczna statyczna moc** (`greatest_mana_among_other_artifacts`),
  **limit aktywacji „once per turn"** (`oncePerTurn` w `createAbility`,
  tracking `state.abilityActivatedThisTurn`, reset co turę). Naprawiony
  przy okazji generyczny błąd odsłonięty przez nowe mechaniki: `castAuraSpell`
  walidował cel stworа DOPIERO PO wydaniu many i przeniesieniu na stos —
  teraz walidacja celu przed jakąkolwiek mutacją (CR 601.2h). Pełna macierz
  B0 (18 talii, 50 seedów, 51 300 meczów, 0 niedokończonych): heuristic
  **84.1% vs random**, **63.0% vs aggro**, aggro **81.0% vs random**; próbka
  regresji **81.8% / 66.5%**, progi `0.66 / 0.53` bez zmian (dodanie kart,
  nie zmiana bota). Stan: **599/599** testów, artefakt **43 moduły / 543.9 kB**.
- **M29 / Batch 14 (2026-08-04):** dodano Ainok Tracker (KTK), Spectral Prison
  (AVR), Raucous Carnival (DSK), Cloudbound Moogle (FIN), Insatiable Appetite
  (ELD), Stirring Bard (CLB), Hunter's Blowgun (LCI), Geological Appraiser
  (LCI), Lodestone Needle // Guidestone Compass (LCI — DFC transform) i Panic
  Spellbomb (SOM) — dziesięć kart z listy właściciela. Nowe generyczne mechaniki:
  **defender**, **flash**, **stun counters**, **deathtouch w walce**,
  **conditional keywords wg tury**, **warunkowe entersTapped** (life ≤13),
  **Food tokens** + blokująca decyzja `resolve_food_choice`,
  **discover** (blocking choice `resolve_discover_choice`),
  **explore** (blocking choice `resolve_explore_choice`),
  **craft transform**, **„can't block this turn"** (`cantBlock`),
  **trigger „aura host targeted by spell"**, **„if you cast it"** (`wasCast`),
  **grant keywords until end of turn** effect. Karty z `artId`: **67**.
  Stan: **633/633** testów, artefakt **43 moduły / 589.5 kB**.
- **M30 / Batch 15 (2026-08-04):** dodano Howl of the Night Pack (M10),
  Goblin Picker (DMU), Dragon Arch (APC), Trigon of Corruption (SOM),
  Aerith Rescue Mission (FIN), Esper Stormblade (ARB), Forge Devil (DKA),
  Shatter (SOM), Sweet Oblivion (THB) i Village Rites (M21) — dziesięć kart
  z listy właściciela. Nowe generyczne mechaniki w engine: **tokeny za liczbę
  landów danego podtypu** (`lands_with_subtype_you_control` — Howl: Wolf za
  każdy Forest), **koszt zdolności „Discard a card"** (`discardCard`), **koszt
  zdolności „Remove a counter"** (`removeCounter` — Trigon: charge counters),
  **„destroy target artifact"** (`destroy_permanent` + cel `artifact` — Shatter),
  **obrażenia w kontrolera** (`damage_to_controller` — Forge Devil), **mill
  celu-gracza** (Sweet Oblivion: „Target player mills four"), **warunek statyczny
  „inny wielokolorowy permanent"** (`controlsAnotherMulticolored` — Esper
  Stormblade), **dodatkowy koszt rzutu „sacrifice a creature"** (Village Rites),
  **modal „Choose one"** ze zmienną liczbą celów (Aerith Rescue Mission),
  **Escape** — rzucanie czaru z cmentarza za koszt escape + wygnanie kart
  (Sweet Oblivion; komenda `cast_escape`) oraz **„put a multicolored creature
  from hand onto battlefield"** z blokującą decyzją gracza (Dragon Arch;
  `resolve_hand_creature`). Hybrid mana `{W/B}{U}` redukuje się do bezbarwnej
  puli many (jak każda karta). Karty z `artId`: **77**. Talia
  `decks/real-batch15.txt`, testy `test/real-cards-batch15.test.js`.
  Stan: **663/663** testów, artefakt **43 moduły / 627.6 kB**.
- **M31 (2026-08-04):** **(A) Używalny kreator talii** — „Dodaj po 1 (z filtrów)"
  (`addFilteredToDeck`), „Wyczyść talię" (`clearDeck`), statystyki talii
  (`deckStatistics`: typy, kolory, krzywa many, śr. mana), podstawowe landy na
  górze listy (`sortBuilderCards`) oraz **biblioteka talii w IndexedDB**
  (`src/table/deck-store.js`): load/save/save-as/delete nazwanych talii +
  wczytywanie talii z `decks/` (`REPO_DECKS`). IndexedDB to cache — trwałość
  gwarantuje eksport do `decks/` (Safari/ITP). **(B) Filtr Plan** — kolumna „Plan /
  Setting" arkusza kolekcji (setting/plane) to plan karty; wyciągnięta przez
  `tools/fetch-plans.mjs` (kompaktowy eksport `&range=A:D`, set-aware dla duplikatów
  nazw jak Curate STX/BRO), wpisana do kart (`plan:`) i jako nowa kolumna Plan do
  `tools/collection-art-ids.csv`. Filtr Plan w kreatorze grupuje teraz realne karty
  (Tarkir, Innistrad, Wiedźmin, Dominaria…). Narzędzie służy do odświeżania. **(C) Bot B0 + strojenie** — pełna
  macierz (19 talii, 50 seedów, 63 000 meczów): heuristic **83.2% vs random,
  60.8% vs aggro** (Batch 14: 84.1/63.0 — lekki spadek: nowe karty dodają
  złożoność). Diagnoza **2 niedokończonych gier** (long-game: generatory tokenów
  → board-stall + boty tapują wszystkie landy co turę; gry kończą się taliczeniem
  ~tura 60) → `maxCommands` 3000→5000 (test dopuszcza); 0 niedokończonych.
  **Strojenie B4** (`tools/tune-bot.mjs`, 15 ewaluacji): żaden kandydat nie
  poprawił wag M19 (mana=1.1, permanent=0.9) — wagi pozostają optymalne przy 74
  kartach (bez zmiany bota → progi `0.66 / 0.53` bez zmian).
  Stan: **672/672** testów, artefakt **44 moduły / 643.0 kB**.
- **M32 (2026-08-04): zmiana paradygmatu talii na singleton.** Skasowano wszystkie
  dotychczasowe talie (real-batch1..15, synthetic-*) i wprowadzono nowe zasady:
  **max 1 kopia karty** (lądy podstawowe bez limitu) + **minimum 15 kart
  nielandowych** (`validateDeck`: `maxCopies=1`, `minNonland=15`; kreator talii
  też singleton). Stworzono **6 nowych talii hybrydowych** (3 kolor + 3 plan):
  `green`, `black`, `red` (mono-kolorowe) + `innistrad`, `azorius`, `wiedzmin`
  (planowe) — każda 15–16 nielandowych + lądy podstawowe dopasowane do kolorów;
  pokrywają 69 realnych kart nielandowych. Pełny benchmark B0 (6 talii, 50 seedów,
  6300 meczów, 0 niedokończonych): heuristic **95.0% vs random, 74.1% vs aggro**,
  aggro 91.9% vs random. Format singleton wyraźnie faworyzuje heurystykę (było
  83.2/60.8 na starych taliach) — wagi M19 pozostają silne, **re-strojenie
  odkładam** (opcjonalne). Progi regresji podniesione: **0.78 / 0.53**.
  Stan: **639/639** testów, artefakt **44 moduły / 638.0 kB**.
- **M33 / Batch 16 (2026-08-04): dziesięć realnych kart — Station, Saga,
  Metalcraft i prewencja obrażeń.** Dodano Alaborn Trooper (P02), Wedgelight
  Rammer (EOE), Jill, Shiva's Dominant // Shiva, Warden of Ice (FIN — DFC),
  Ethersworn Shieldmage (ARB — druk potwierdzony przez właściciela 2026-08-05),
  Fiery Fall (MM2), Plague Reaver (CMR), Greatsword of Tyr (CLB), Ramroller
  (ORI), Marut (CLB) i Stoic Rebuttal (SOM). Generyczne mechaniki: **Station**
  (koszt „Tap another creature\", liczniki charge, próg ≥ 9 → artefaktowy
  stwór ze słowami z deskryptora + `station_status_changed`), **Saga CR 714**
  (liczniki lore przy wejściu i po kroku dobierania, rozdziały, poświęcenie
  CR 714.4, efekty „cant be blocked\", „tap all lands\", „exile + return
  transformed\" — wspólny z DFC kod transformu), **Metalcraft** (`costReduction`
  na czarze przy ≥ 3 artefaktach), **„Counter target spell\"** (cel
  `spell_on_stack` — dowolny czar), **prewencja obrażeń „this turn\"** z
  filtrem typów (flash ETB, wygasanie w cleanup, łagodzi deathtouch),
  **śledzenie many ze Skarbów** (pula `treasureMana` + znacznik
  `manaFromTreasureSpent` — ETB Maruta liczy Skarby), **must-attack
  statyczne** (CR 508.1c), **warunek „controls another artifact\"**, trigger
  na sprzęcie **„equipped creature attacks\"**, koszt **„Discard N cards\" +
  sacrifice** z efektem z obiektu w grobie i **opóźniony trigger „next
  upkeep\"** (CR 603.7, ping-pong kontroli). Naprawione bugi core: podwójne
  dopisywanie zdarzeń triggerów do logu (`processTriggers`), przesłonięty
  parametr w koszcie `tapOtherCreature`, **nieaktualni kandydaci pokoju
  lochu** (`illegal_room_target` — oferta i walidacja celu spójne; decyzja
  bez legalnych celów gaśnie zamiast blokować grę; regresja:
  `test/room-targets-staleness.test.js`). Karty dopisane do talii singleton:
  azorius +5, black +2, red +2, wiedzmin +1 (liczniki lądów podstawowe
  podniesione) — zgodnie z nowym przepływem M32 (nie tworzymy talii
  batchowych). Bot bez zmian (bez re-strojenia): pełny B0 informacyjnie
  6300 meczów, 0 niedokończonych — heuristic **89.9% vs random, 74.1% vs
  aggro** (progi 0.78/0.53 bez zmian).
  Stan: **685/685** testów, artefakt **44 moduły / 693.3 kB**.
- **M34 / UX ze stołu Pages (2026-08-05): siedem tematów właściciela z rozgrywki
  na iPadzie — wszystkie zamknięte.** (1) Tyły kart dwustronnych nie trafiają
  już do talii/ręki jako backside (CR 711.4; `parseDeckText` podmienia nazwę
  tyłu na front, 4 tyły DFC mają status `limited`). (2+3) Rzucone zostało
  wymaganie ręcznego tapowania lądów: rzuty i zdolności są OFEROWANE wg many
  **produkowalnej** (pula + nietapnięte landy), a `spendMana` — jedyny punkt
  konsumpcji many — sam do-tapuje brakujące landy w deterministycznej
  kolejności (zwykłe landy przed land creatures; Skarby zostają ręczną
  decyzją; land-źródło z kosztem `{T}` nie płaci samo sobie, CR 601.2h).
  `tap_for_mana` zniknął z oferty (bot nie tapuje już „bez powodu"), komenda
  zostaje legalna w protokole. Zmiana przestrzeni komend botów = pełny B0:
  6300 meczów, 0 niedokończonych — heuristic **87.4% vs random, 72.1% vs
  aggro** (ruch ~2 p.p. to wzmocnienie random/aggro, nie regresja heurystyki;
  progi 0.78/0.53 bez zmian). (4) Log stołu pokrywa wszystkie typy zdarzeń
  pełnymi polskimi opisami (koniec surowych identyfikatorów i „(?)";
  `ability_activated` niesie `cardId` i `effectTypes`, mapa opisów efektów).
  (5) Mirror match dozwolony — ta sama talia dla gracza i bota. (6) Pauza po
  każdym istotnym zagraniu bota (rzut, ląd, zdolność, zmiana strefy) z
  wznowieniem na klik „Rozumiem"; rozjazd `runBot`/auto-pass zastąpiony
  jedną pętlą `advance()` — fingerprint rozgrywki z pauzami == bez pauz;
  rozstrzygnięcia stosu przy auto-passie trafiają teraz do logu i przebiegu
  tur. (7) Pełnoekranowa ilustracja karuzeluje kartami strefy swipem ←/→
  (plus strzałki/Esc na desktopie, pozycja „2 / 7"); warstwa swipe
  rejestrowana przed tap — szybkie swipe'y nie zamykają podglądu.
  Stan: **699/699** testów, artefakt **44 moduły / 713.7 kB**.
- **M35 / Batch 17 — DOKOŃCZENIE (2026-08-05):** PR #26 (scalony) wniósł do
  engine'u mechaniki Batchu 17 (infect, cleave, indestructible, animacja lądu,
  `any_creature_dies`, `draw_cards` both players) i pliki Scryfall dla 10 kart,
  **ale bez definicji kart, testów, dopisania do talii i benchmarku** — liczba
  `supported` utknęła na 90. Ta sesja **dokończyła** batch: 10 kart zdefiniowanych
  w `card-data.js` (Maritime Guard, Carrion Call, Garruk's Companion, Lunar
  Rejection, Selhoff Occultist, Reclusive Artificer, Captain's Call, Your Temple
  Is Under Attack, Crested Herdcaller, Silvanus's Invoker — wszystkie w kolekcji,
  z `artId` i planem), 3 tokeny (`token_insect`/`token_soldier`/`token_dinosaur`),
  testy `test/real-cards-batch17.test.js` (24) i `test/batch17-engine-fixes.test.js` (8).
  **Generyczne naprawy engine'u** odkryte przy kompletowaniu (wszystkie ADR 0002,
  uśpione do wejścia kart do talii): `freezeSpell` zachowuje deskryptor `cleave`;
  `resolveTopOfStack` rozstrzyga cleave wg `cleave.targets`; `legalTargetCandidates`
  obsługuje `creature_with_subtypes`; modalny `liveChosen` zachowuje cel-gracza;
  `destroy_permanent` respektuje `indestructible`; `EVENT_TYPES` ←
  `permanent_animated`/`poison_counters_added`; `createBattlefieldToken` propaguje
  kolory; `mill_cards` chroni karty przeglądane przez pending scry/surveil/clash/
  explore (trigger mill mógł psuć pending-decyzje); `addCounter` toleruje 0 jak
  `markDamage` (infect o mocy 0). Karty dopisane do talii singleton (green +4,
  innistrad +3, azorius +2, wiedzmin +1 + liczniki lądów). Pełna macierz B0
  (6 talii, 50 seedów, 6300 meczów, 0 niedokończonych): heuristic **88.0% vs
  random, 70.2% vs aggro**, aggro 93.0% vs random; próbka regresji 95.2% / 67.3%;
  progi **0.78 / 0.53** bez zmian. Stan: **731/731** testów, artefakt
  **44 moduły / 740,9 kB**.
- **M36 / Batch 18 (2026-08-06): dziesięć realnych kart z listy właściciela
  2026-08-05, PR #29** — Ainok Artillerist (reach warunkowy licznikiem),
  Kin-Tree Nurturer (**endure**), Gorger Wurm (**devour**), Bone Splinters
  (koszt sacrifice + destroy), Brute Force (+3/+3), Forever Young (karty z
  grobu na wierzch biblioteki + draw), Trostani Discordant (hymn „other",
  ETB 2× Soldier lifelink, end step „kontrola do właścicieli" — `ownerId`,
  CR 108.3), Fear of Burning Alive (ETB 4 dmg przeciwnikom + **delirium**),
  Jeskai Windscout (**prowess**), Hobble (aura ograniczająca atak/blok).
  Wszystkie `supported` w 100% mechaniki z Oracle; dane Scryfall pobrane
  PRZED kodowaniem (ADR 0010 §2a). 50 testów w `test/real-cards-batch18.
  test.js` (legalny + nielegalny scenariusz każdej karty, sanity Scryfall
  z `fs.readFileSync`, interakcje, determinizm replay). Generycznie do
  engine'u: `ownerId` + `control_to_owners_all_creatures`, zakres hymnów
  (fix: `staticBonuses` nie buffuje już własnego źródła zdolności ze scope),
  warunek `hasCounter`, ograniczenia załączników cantAttack/cantBlock,
  **prowess**, **delirium** z wyborem celu i intervening-if, **devour** /
  **endure** (kolejki decyzji + auto-close), efekt `damage_each_opponent`,
  `graveyard_creatures_to_library_top_choice`. **Naprawa cz. 4a:** oferty
  decyzji w playerView to jeden łańcuch w kolejności zamykania execute() —
  dwie zakolejkowane decyzje naraz (scry + devour) wywracały wcześniej
  benchmark błędem `scry_unresolved`. Boty odpowiadają deterministycznie na
  5 nowych typów komend; pełny B0 (6 talii, 6300 meczów, 0 niedokończonych):
  heuristic **87.7% vs random, 68.2% vs aggro**, próbka 88.7% / 71.4% —
  próg vs aggro podniesiony **0.53 → 0.56**, vs random 0.78 bez zmian.
  Karty dopisane do talii singleton (green +1, black +3, red +2, azorius
  +2, innistrad +2); UI: polskie etykiety dla 9 komend decyzji (4 nowe +
  5 drive-by). Ograniczenia jawne: brak prawa legend (pre-istniejące,
  dotyczy też Trostani) i jednoprzebiegowe triggery (obrażenia ETB Fear nie
  odpalają jego delirium). Znane pre-istniejące uszkodzenie: uszkodzony
  JSON w scryfall-dunland-crebain.json. Stan: **781/781** testów, artefakt
  **47 modułów / 819,9 kB**.
- **M37 / naprawa ograniczeń silnika + poprawki UX A–E z testowania
  (2026-08-06, PR #29)** — na życzenie właściciela naprawione WSZYSTKIE
  ograniczenia jawne z wpisu M36: (1) **prawo legend CR 704.5j** — state-based
  skan duplikatów legendarnych kontroler wybiera blokującą decyzją
  `resolve_legend_choice{keepId}`, którą permanent zatrzymać (reszta do grobów);
  (2) **wieloprzebiegowe triggery CR 603.2** — `processTriggers` z kolejką FIFO
  zdarzeń (cap 512) reskanuje agregat po rozstrzygnięciu każdego triggera, więc
  obrażenia ETB Fear odpalają jego delirium; (3) uszkodzony
  `scryfall-dunland-crebain.json` odświeżony (jedyny wadliwy ze 105 plików —
  zwalidowane wszystkie). Przy okazji naprawione dwa crashe benchmarku:
  `pendingBackups` przejmuje priorytet decydenta (`restorePriorityTo`, seed
  2027) i centralne planowanie blokujących decyzji w `accepted()` — priorytet
  zawsze u gracza z pierwszą decyzją w kolejności bramek execute (seed 1020,
  regresja w real-cards-batch18). Poprawki UX artefaktu A–E: **A** double-tap
  na iOS — handler `dblclick` respektuje `ignoreClick`, pełny ekran ignoruje
  stuknięcia przez 350 ms po otwarciu, tła modali chronione `MODAL_OPEN_GUARD_MS`
  = 450 (koniec „mrugnięcia" otwórz-zamknij); **B** modal „Ruch przeciwnika"
  pokazuje ilustracje lądów (`land_played` w `BOT_MOVE_CARD_EVENTS`); **C**
  nazwy kart na stosie klikalne → pełnoekranowy podgląd tekstu; **D** pełny
  ekran z karty cmentarza renderuje się NAD modalem (z-index 2600/2601);
  **E** flow rzucania z wyborem gracza: sekwencyjny **kreator płatności many**
  (`src/table/mana-wizard.js` — przy ≥2 wariantach źródła tapowane PO JEDNYM
  „tapnij x/y/z" z doliczaniem do sumy, solver jednoznaczności
  `countPaymentVariants`, Anuluj, rewalidacja przed rzutem; jednoznaczny wybór
  zostaje auto-tapem M34) i sekwencyjny **wizard scry/surveil** (najpierw
  przeglądnięte karty, potem decyzja dla KAŻDEJ karty osobno grób/wierzch —
  bez listy wszystkich kombinacji; protokół silnika bez zmian, FINALNA komenda
  budowana po krokach). Log gry: polskie etykiety zdarzeń Batchu 18 (devour/
  endure/delirium/wierzch z grobu). Nowa zasada procesowa w AGENTS.md: każde
  zadanie = rozpoznanie + mini-roadmapa (`docs/plans/PLAN_<data>-<slug>.md`)
  jako PIERWSZY commit PR przed kodowaniem; nowa sesja obowiązkowo sprawdza
  ostatni PR i podejmuje niedokończone zadanie w miejscu odhaczenia. Testy:
  legend-rule (10), table-mana-wizard (12), +2 integracyjne mana-wizard,
  4 zamrożone seedy decyzji w table-session. Pełny B0 (6300 meczów, 0
  niedokończonych): heuristic **87.5% vs random, 67.7% vs aggro**, aggro 93.0%
  vs random; próbka regresji 88.7% / 72.6% — próg vs aggro podniesiony
  **0.56 → 0.57**, vs random 0.78 bez zmian. Stan: **820/820** testów,
  artefakt **48 modułów / 860,1 kB**.
- **M38 / Batch 19 — 10 kart (2026-08-06, PR #29)** — Illvoi Operative
  (trigger „drugi czar w turze"), Grounded (aura `losesKeywords`),
  Ruinous Rampage (sorcery modalny: dmg / pierwszy bezcelowy `exile_all`
  z filtrem MV), Tellah, Great Sage (legendary; progi WYDANEJ many 4+/8+
  na triggerze noncreature — pierwszy kontekst `manaSpent` na zdarzeniach
  rzutu), Etherium Sculptor (pierwszy statyczny modyfikator kosztu
  Z PERMANENTA, CR 601.2f — redukcja tylko generycznej z capem, jeden
  choke point `effectiveSpellManaCost`), Boros Challenger (**mentor** CR
  702.133 — 17. blokująca decyzja, cel liczony dynamicznie przy
  rozstrzygnięciu, intervening wygasza wpis), Pilgrim's Eye (ETB basic
  land do ręki), Dementia Bat (pierwszy discard NA CELU-graczu),
  Seer's Lantern (mana {C} + aktywowane scry 1), You're Confronted by
  Robbers (modalny instant; variableTargets z pustym podzbiorem). Fix
  `effectiveSpellManaCost` (guard na brak Metalcraft przy redukcji z
  permanenta). Talie singleton (azorius/green/black/red/innistrad/wiedzmin),
  4 seedy etykiet przelosowane hunterem po zmianie tasowania, polityka
  session-bot-pausa z fallbackiem na obowiązkowy krok. Boty wybierają cel
  mentora deterministycznie; **kreator many płaci koszt efektywny**
  (effectiveGeneric z pełnego stanu sesji). Pełny B0 (6300 meczów, 0
  niedokończonych): heuristic **87.3% vs random, 64.1% vs aggro** — progi
  0.78/0.57 bez zmian. Stan: **867/867** testów, artefakt
  **48 modułów / 889,2 kB**.
- **M39 / naprawa gestów dotyku na iPhonie (2026-08-06, PR #30)** — dwa
  zgłoszenia właściciela: (1) **„swipe = tap"** — `installTapGesture`
  (`src/table/gestures.js`) śledzi ruch palca (pasywne `touchstart`/
  `touchmove`): ruch > 10 px albo `touchcancel` (iOS przejmuje gest — scroll)
  oznaczają „to nie tap": kasują wiszący timer pojedynczego tapa i `lastTap`,
  a `touchend` swipa nie uzbraja timera ani nie liczy do lastTap (syntetyczne
  clicki po swipe tłumione); (2) **„double-tap nigdy nie działa"** — stan
  gestu (`lastTap`, `tapTimer`) wyniesiony z domknięcia per-element do
  modułowej mapy kluczowanej `stateKey` = objectId karty (`tile:${objectId}`
  w kaflach, `stack:${spell.id}` na stosie). `renderTableView` czyści strefy
  i odbudowuje kafle przy każdym rerenderze (tura bota = strumień), więc
  drugie tapnięcie trafiało na nowy węzeł z pustym stanem — teraz double-tap
  przeżywa podmianę węzła; timer single-tapa przed odpaleniem sprawdza
  `element.isConnected` (koniec „duchów tapnięć" po przebudowie). Do tego
  `touch-action: manipulation` na `.tile`, `.stack-item.clickable` i warstwie
  `.fullscreen` (wyłącza double-tap zoom iOS tam, gdzie działa gest; pinch
  zoom i dostępność bez zmian — twarde `user-scalable=no` zostaje decyzją
  właściciela), a `renderExile` przekazuje `onCardDoubleClick` (dwuklik
  z exile otwiera pełny ekran). Testy: 16 kontraktów gestów
  (`test/table-touch-gestures.test.js`) + regresja exile
  (`test/table-card-art.test.js`). Stan: **875/875** testów, artefakt
  **48 modułów / 893,5 kB**. Zadanie nie dotyka botów — B0 niewymagany.
- **M40 / rozszerzenie kreatora many E.3a (2026-08-06, PR #31)** — zamknięcie
  dwóch świadomych ograniczeń kreatora płatności many (M37) z handoffu
  („Co dalej"): **(B) tryby kosztu** — `paymentDescriptorOf` rozpoznaje
  `cast_cleave`, `cast_escape` i `cast_permanent` w wariantach `bestow`/`morph`,
  więc niejednoznaczna kolorowa płatność za te rzuty otwiera kreator (zamiast
  cichego auto-tapu M34). Całkowity koszt alternatywny to liczba z deskryptora
  (BEZ obniżek CR 601.2f — castCleave/castEscape/castAuraSpell z bestow nie
  redukują), wymagania kolorów z bazowego `MANA_COSTS[cardId]` (spójnie z
  `hasColorForObject`). Morph (CR 702.36) bezbarwny → puste wymagania. Escape
  czyta koszt z `session.state` (widok grobów nie niesie `spell.escape`), jak
  `effectiveGeneric`. **(A) źródła nie-lądowe** — kreator oferuje oprócz landów
  nietapnięte permanenty z aktywną zdolnością many (Apprentice Wizard,
  Seer's Lantern, Dragonbroods' Relic, Scorned Villager/Moonscarred Werewolf,
  token Treasure); gracz tapuje je jak landy, a kreator wysyła `activate_ability`
  (nie `tap_for_mana`). `manaSourcesOf` buduje połączoną listę z `legalCommands`
  (gwarancja legalności) + `abilityInfo` z pełnego stanu; każde źródło niesie
  NET zysk = produkcja − koszt aktywacji (Apprentice {U},{T}:+{C}{C}{C} → 2).
  `wizardProgress` liczy pokrycie kolorów ze źródeł TAPNIĘTYCH w sesji kreatora
  (`committed`) — manę płaci się TAPUJĄC źródło, nie samym jego kontrolowaniem
  (jak forestwalk); main.js prowadzi listę `committed`. Render pokazuje „+N"
  przy źródle o netGain ≠ 1. UWAGA (resztowe ograniczenie engine): statyczny
  check kolorów engine (`hasColorForObject`/`allControlledManaSources`, pula many
  bezbarwna) nadal liczy też źródła tapnięte — konieczne dla przepływu
  „tapuj-potem-rzuć" kreatora; auto-tap M34 może zatem opłacić pip koloru z
  generycznego źródła, gdy kolorowe nie jest pierwsze w kolejności. Kreator
  tego nie powiela (wymusza tapnięcie kolorowego źródła); naprawa auto-tapu
  (priorytetyzacja kolorowych źródeł w `spendMana`) — osobne zadanie. Naprawa poboczna (produkcyjna): `startGame`
  zamyka kreator — nowa gra resetuje wstrzymany rzut (deskryptor odnosił się do
  starej sesji). Kreator leży na ścieżce gracza (`main.js:play`); boty idą przez
  `session.apply` → **bez wpływu na benchmark B0, progi 0.78/0.57 bez zmian**.
  Testy: +12 w `test/table-mana-wizard.test.js` (tryby kosztu, `manaSourcesOf`
  z dorkami i netGain, `controlledManaSourcesOf`, dork tworzy wariant, render
  +N) + poprawka harnessu `test/table-ui.test.js` (`pickActionButton` prowadzi
  otwarty kreator — część A poszerza zbiór rzutów otwierających kreator).
  Stan: **887/887** testów, artefakt **48 modułów / 901,6 kB**. Roadmapa:
  `docs/plans/PLAN_2026-08-06-kreator-many-e3a.md`.
- **M41 / kolorowa pula many — MtG-correct (2026-08-06, PR #31)** — na wyraźną
  decyzję właściciela („zdecydowanie 1") naprawiono root cause nonsensu many:
  bezbarwną pulę (M2) zastąpiono KOLOROWĄ. `player.mana` zostaje liczbą (total),
  a równolegle `player.manaPool` śledzi jednostki many po profilu kolorów
  (`manaUnitKey`: `U`, `UR` dwubarwny, `WUBRG` dowolny, `` bezbarwna).
  **Castability (MtG, PRZED tapnięciem):** `canPayColoredCost` — pip(y) kolorowe
  dopasowalne do jednostek (kolorowa pula + NIETAPNIĘTE źródła) — do rzutu trzeba
  źródeł, których MOŻNA UŻYĆ, a nie zużytych. **Płatność:** `spendMana(amount,
  requirements)` konsumuje z puli po pipach, auto-tap tapuje kolorowopasujące
  źródła najpierw. **Produkcja:** `tapLandForMana`/`add_mana` produkują KOLOR
  źródła. Pełna poprawność dla dual-landów (U|R opłaca U lub R, nie G) i Skarbów.
  Kreator many czyta kolorową pulę (bandaż „committed" z M40 usunięty).
  **ADR 0015.** Poboczna naprawa: `drawPlayerCards` chroni karty pending
  scry/surveil/explore/clash (jak `mill_cards`) — pre-istniejący utajony błąd.
  `addMana` bez `colors` → default „dowolny kolor" (wygoda testów; realna gra
  zawsze podaje jawny `colors`). Bot rzuca mniej czarów (MtG: potrzeba
  nietapniętych kolorowych źródeł) — pełny B0 (6300 meczów, 0 niedokończonych):
  heuristic **86.8% vs random, 63.9% vs aggro**, aggro 93.4% vs random — progi
  **0.78/0.57** utrzymane. Roadmapa: `docs/plans/PLAN_2026-08-06-kolorowa-pula-many.md`.
  Stan: **894/894** testów, artefakt **48 modułów / 908,7 kB**.
- **M42 / Batch 20 — 10 kart (2026-08-06, PR #31)** — Chittering Rats (DST),
  Coralhelm Guide (BFZ), Rustwing Falcon (M19), Caravan Vigil (ISD), Gorehorn
  Minotaurs (MM2), Moonlit Meditation (EOE), Goldmeadow Nomad (ECL), Fear of
  Abduction (DSK), Monastery Flock (KTK), Death-Hood Cobra (2XM). Wszystkie
  `supported` w 100% mechaniki z Oracle. Nowe generyczne mechaniki: **cantBeBlocked**
  (Coralhelm — nowy znacznik nieblokowalności w combacie), **Morbid** (Caravan Vigil —
  creatureDiedThisTurn tracker), **Bloodthirst** (Gorehorn — dealtDamageToOpponentThisTurn
  tracker + liczniki ETB), **aktywacja z grobu** (Goldmeadow Nomad — fromGraveyard w
  legalActivatedAbilities + exileFromGraveyard), **banish+link** (Fear of Abduction —
  additionalCost.exileCreature na permanencie + exile_opponent_creature + return_banished_to_hand),
  **replacement effect + klonowanie** (Moonlit Meditation — nowy typ celu aury artifact_or_creature
  + replacement pierwszego tokenu w turze → kopie zaczarowanego permanentu + tracker
  moonlitUsedThisTurn), **opponent_hand_card_to_top** (Chittering Rats — deterministyczna),
  **findTriggerTarget type:'opponent'** (triggers.js). Karty dopisane do talii singleton
  (green +2, black +1, red +1, azorius +6). Pełny B0 (6300 meczów, 0 niedokończonych):
  heuristic **89.9% vs random, 66.1% vs aggro**, aggro 95.0% vs random — progi
  **0.78/0.57** utrzymane. 3 nowe talie tematyczne: **spellslinger** (U/R, prowess+czary), **graveyard**
  (B/G, cmentarz), **tokens** (W/G/U, generowanie tokenów+Moonlit Meditation).
  Naprawa root cause: klon Moonlit Meditation filtruje triggery transformacji
  (tokeny nie są DFC). Stan: **911/911** testów, artefakt **48 modułów / 933,4 kB**.

- **M43 / Batch 21 — 10 kart (2026-08-07, PR #32)** — Servant of the Scale
  (DTK), Gray Slaad (CLB), Ember Beast (GTC), Kor Sanctifiers (HOP),
  Irontread Crusher (AER), Skilled Animator (CMR), Withstand (GPT),
  Nightshade Harvester (CMR), True Conviction (SOM), Disa the Restless (M3C).
  Wszystkie `supported` w 100% mechaniki z Oracle; dane Scryfall pobrane
  PRZED kodowaniem (11 plików + token Tarmogoyf). Nowe generyczne mechaniki:
  **Adventure** (CR 715 — cast_adventure z ręki → exile → cast_adventure_creature
  z exile), **Kicker** (CR 702.33 — wariant `kicked` cast_permanent + wasKicked),
  **Crew/Vehicle** (CR 701.36 — tap dowolnej liczby stworów o łącznej mocy ≥ N),
  **double strike** (obrażenia w obu przebiegach combat) i **lifelink**
  (zysk życia od obrażeń), **tarcze prewencji** „prevent the next N damage"
  (Withstand — `state.damageShields`), **can't attack/block alone** (Ember
  Beast — walidacja i oferty spójne), **linked animation** „as long as this
  creature remains on the battlefield" (Skilled Animator — cofanie przy
  odejściu źródła w moveObjectDirectly), triggery `land_entered_under_opponent_control`
  (Nightshade), `card_put_into_graveyard_from_nonbattlefield` z filtrem podtypu
  i `any_combat_damage_to_player` (Disa) oraz **token Tarmogoyf** z dynamicznym
  P/T = liczba typów kart we wszystkich grobach (+1 do wytrzymałości).
  Naprawy root cause: `tryFire` przekazuje kontekst zdarzenia do efektów;
  `createGameObject`/`addObject` niosą kicker/adventure (łańcuch fieldów);
  oferta equipu wyklucza źródło (CR 702.6a — animowany sprzęt). Karty
  dopisane do talii singleton (green/black/red/azorius/graveyard/tokens;
  graveyard dostał Mountains pod Disę). Pełny B0 (9 talii, 50 seedów,
  13500 meczów, 0 niedokończonych): heuristic **90.2% vs random, 63.9% vs
  aggro**, aggro **93.2% vs random** — progi 0.78/0.57 bez zmian (dodanie
  kart, nie zmiana bota). Stan: **935/935** testów, artefakt
  **48 modułów / 985,5 kB**.

- **M44 / poprawki przed scaleniem PR #32 (2026-08-07, zgłoszenia właściciela):**
  **A** autosave partii w localStorage: wznowienie nie nadpisuje już zapisu
  świeżą grą (root cause: `startGame`→`autosave` klobrował replay PRZED
  `resumeReplayText`), a **bootstrap sam wznawia partię po odświeżeniu**
  (`resumeOrStart` — stan wraca do punktu po ostatnim ruchu; replay jest
  deterministyczny, bot deterministyczny, więc kontynuacja identyczna).
  **B** przycisk **„Tasuj talię"** obok „Rozpocznij partię" — podmienia
  seed na losowy (`crypto.getRandomValues`, fallback `Math.random`).
  **C** Goldmeadow Nomad — zdolność „z grobu" nie jest już oferowana ani
  aktywowalna na bitwisku (root cause: `legalActivatedAbilities`/
  `activateAbility` ignorowały `fromGraveyard` dla obiektów na battlefield).
  **D** auto-pass bez fałszywych okien: `hasMeaningfulDecision` ufa
  WYŁĄCZNIE `legalCommands` engine — heurystyka „potencjału" (mana za
  nietapnięte landy BEZ kolorów) zatrzymywała grę w oknach z samym passem
  (np. biała karta w ręce przy samych górach); od M34/M41 oferty rzutów są
  kompletne (auto-tap + kolorowa walidacja), więc heurystyka była zbędna
  i szkodliwa. **D2** modal „Ruch przeciwnika" pokazuje DOKŁADNIE JEDNĄ
  ilustrację na kartę (duży skan ostatniego zagrania bez mini-kafla tej
  samej karty na liście — wcześniej ląd bota dublował się na dwa obrazy).
  **E** Porcelain Legionnaire — literówka w `imageUri` (uuid `4c63`→`4e63`
  wg pliku Scryfall) — karta znów ma grafikę ze Scryfalla. Testy: +6
  (Tasuj talię, autosave+wznowienie, świeży start, Nomad na bitwisku,
  okna bez samych passów, jedna ilustracja w modalu). Stan: **941/941**
  testów, artefakt **48 modułów / 986,0 kB**. Bot nietknięty — B0 bez zmian
  (90.2% / 63.9% / 93.2%, progi 0.78/0.57).

- **M45 / Weryfikacja reguł MtG vs Comprehensive Rules (2026-08-07, challenge
  właściciela: „żadnych uproszczeń — traktuj Jawne Ograniczenia jako błędy").**
  Audyt 134 kart + engine znalazł i naprawił 6 tematów u root cause:
  **T1 kolorowe koszty zdolności/cykli/płatności triggerów** (CR 118.2/601.2f)
  — `cost.colors` w 14 definicjach (Boros Challenger {2}{R}{W}, Coralhelm,
  Snarling Wolf, Apprentice Wizard, Dementia Bat, Goldmeadow Nomad, Panic
  Spellbomb, Death-Hood Cobra, Dragonbroods' Relic, Canonized in Blood, Jill,
  Secluded Steppe, Fiery Fall), walidacja `canPayColoredCost` w ofercie
  i aktywacji, `spendMana` z pipami; opcjonalne płatności triggerów
  (`payMana`/`payColors`) są faktycznie WYDAWANE (Panic Spellbomb miał darmowe
  dobranie); **błąd kosztu: Dawntreader Elk {G}=1 (było 2)**.
  **T2 finality = „would die → exile" dla KAŻDEJ przyczyny** (CR 122.1b):
  destroy, sacrifice, koszty czarów, prawo legend (wcześniej tylko zgony SBA).
  **T3 triggery dies/leaves_battlefield** (CR 603.6c/700.4): dies odpala się
  przy poświęceniu i zniszczeniu efektem — root cause: handlery
  cast_spell/cleave/escape/adventure nie włączały zdarzeń zagnieżdżonych
  (koszty dodatkowe) do skanu triggerów; Fear of Abduction reaguje na
  `leaves_battlefield` (bounce/exile), nie tylko dies.
  **T4 wybory gracza przy odrzucaniu i „karta na wierzch"** (CR 701.18 „of
  their choice"): `resolve_discard_choice` (koszt — Goblin Picker/Plague
  Reaver, kontroler; efekt — Dementia Bat, cel; Evangel, kontroler;
  sekwencyjnie) i `resolve_hand_top_choice` (Chittering Rats — cel);
  aktywacja z kosztem-discard czeka (`performActivation`).
  **T5 Unstable Frontier** (CR 305.7): wybór podstawowego typu przez gracza
  (`resolve_land_type_choice`) + produkcja many z PODTYPÓW podstawowych
  (CR 305.6 — land jako Forest produkuje {G}, getSourceForObject czyta
  effectiveSubtypes).
  Usunięte limitationy 13 kart. Testy: **959/959** (18 nowych w
  `test/mtg-rules-fixes.test.js`). Pozostałe świadome luki (kolejne tematy):
  deterministyczne „you may" przy szukaniu w bibliotece (Kor Cartographer,
  Pilgrim's Eye, Dawntreader Elk, cykle z szukaniem, Caravan Vigil, Secret
  Entrance), Moonlit Meditation „you may" (replacement), Rupture Spire
  auto-płatność, deterministyczne cele triggerów bez wymogu (Forge Devil,
  Reclusive Artificer itd.), Entrancing Lyre X, Puppeteer Clique cel.
  Pełny B0 po zmianie botów (9 talii, 50 seedów, 13500 meczów, 0
  niedokończonych): heuristic **90.0% vs random, 63.8% vs aggro**, aggro
  **93.1% vs random** — progi 0.78/0.57 utrzymane.

- **M46 / Srebrna odznaka — weryfikacja reguł MtG cz. 2 (2026-08-07, Tematy
  6-10) + stały wskaźnik tury.** Kolejne uproszczenia „decyzja gracza →
  determinizm" naprawione u root cause:
  **T6 „You may search your library"** (CR 701.19b) — gracz wybiera KARTĘ
  albo rezygnuje (fail to find): nowa decyzja `resolve_search_choice` dla
  Kor Cartographer, Pilgrim's Eye, Dawntreader Elk, Caravan Vigil,
  typecycling (Fiery Fall, Cloudbound Moogle, Swampcycling) i Secret
  Entrance (loch); tasowanie po każdym przeszukaniu.
  **T7 Rupture Spire** — „zapłać {1} albo poświęć" to decyzja kontrolera
  (`resolve_pay_or_sacrifice`); wcześniej automatyczna płatność.
  **T8 opcjonalne płatności triggerów** („you may pay ... When you do ...")
  — decyzja gracza (`resolve_optional_pay_choice`): Panic Spellbomb {R},
  Zoraline {W}{B} i 2 życia (payColors dodane; wcześniej płatność celowanych
  triggerów była DARMOWA — Zoraline reanimowała bez kosztu!).
  **T9 Moonlit Meditation** — „you may instead create copies"
  (`resolve_moonlit_choice`); wcześniej automatycznie kopie.
  **T10 Entrancing Lyre** — {X} wybiera gracz (X ≥ moc celu, oferty
  X=1..mana z walidacją maxPowerX); wcześniej X = moc celu.
  **UI:** stały wskaźnik „Tura N, <gracz>, <faza>" w lewym górnym rogu
  (z-index poniżej fullscreenu — nie zasłania ilustracji kart).
  Testy: **967/967** (8 nowych); artefakt 48 modułów / 1025,4 kB.
  Pełny B0 (13500 meczów, 0 niedokończonych): heuristic **89.4% vs random,
  62.4% vs aggro**, aggro 92.8% vs random — progi 0.78/0.57 utrzymane.
  Pozostałe świadome luki:
  deterministyczne cele triggerów (Forge Devil, Reclusive Artificer,
  Puppeteer Clique itd. — wybór celu przez gracza), „you may" Moonlit przy
  triggerze Zoraline „you may pay" dla BOTA bez puli (zachowanie celowe),
  „activate only as a sorcery" Zoraline itd.

- **M47 / Złota odznaka — Tematy 11-15 (2026-08-07) + ikony many w UI.** Pięć
  RÓŻNYCH klas reguł MtG naprawionych u root cause:
  **T11 hexproof** (CR 702.11) — permanent przeciwnika z hexproof nie może być
  celem czarów, zdolności ani triggerów (wcześniej hexproof NIE DZIAŁAŁ —
  Throne of the Dead Three dawał keyword bez efektu); root fix: activateEquip
  nie przekazywał casterId do walidacji.
  **T12 choroba przywołania a {T}** (CR 302.6) — stwór bez haste nie aktywuje
  zdolności z {T} w turze wejścia (wcześniej Apprentice Wizard mógł tapnąć
  od razu); oferta i walidacja spójne.
  **T13 limit ręki 7** (CR 514.1) — cleanup odrzuca nadmiar decyzją gracza
  (purpose 'hand_size'), zanim tura przejdzie dalej (wcześniej brak limitu).
  **T14 pierwsza tura bez draw** (CR 103.7a) — startujący gracz pomija draw
  step w 1. turze (wcześniej dobierał).
  **T15 anihilacja liczników** (CR 122.3) — +1/+1 i -1/-1 na tym samym
  permanencie anihilują się w SBA (wcześniej liczone tylko jako delta).
  **UI:** ikony symboli many zamiast tekstu {U}/{B} — moduł `mana-icons.js`
  (span.ms z kolorami MtG, hybrydy, phyrexian), użyty w kreatorze many
  (intro/postęp/źródła) i etykietach akcji (koszty z MANA_COSTS); CSS w
  index.html; przyciski akcji przeszły na innerHTML (nazwy escape'owane).
  Testy: **974/974** (+8: T11-T15); artefakt 49 modułów / ~1035 kB.
  Pełny B0 (13500 meczów, 0 niedokończonych): heuristic **89.1% vs random,
  63.3% vs aggro**, aggro 92.7% vs random — progi 0.78/0.57 utrzymane.

- **M48 / Brylant — Tematy 16-20 (2026-08-07) + zgłoszenia UX A/B/C.** Pięć
  kolejnych, RÓŻNYCH klas reguł MtG:
  **T16 rozdział obrażeń w walce** (CR 510.1c) — wcześniej pełna siła trafiała
  KAŻDEGO blokera (5/5 vs dwa 3/3 = 5+5); teraz przydział po lethal
  (deathtouch = 1), nadmiar tylko z trample przechodzi na gracza.
  **T17 pula many** (CR 106.4) — opróżnia się na końcu każdego kroku/fazy
  (wcześniej trzymała do końca tury, także przez turę przeciwnika).
  **T18 tokeny** (CR 704.5d) — znikają poza bitwiskiem (po triggerach dies).
  **T19 prawo legend** (CR 708.2) — face-down nie ma nazwy, nie wchodzi do
  grup duplikatów; działa po odsłonięciu.
  **T20 koszt obrotu morph/megamorph** (CR 702.37) — pipy kolorów: Monastery
  Flock {U}, Woolly Loxodon {5}{G}, Ainok Tracker {4}{R}, Segmented Krotiq
  {6}{G} (wcześniej sam bezbarwny generic).
  **UX A** etykieta obrotu face-down: morph vs megamorph z deskryptora
  obiektu (root cause: lookup w registry → fallback „megamorph").
  **UX B** etykiety akcji ZAWSZE z kosztem (ikony many): cast_spell/cleave/
  escape/adventure/adventure_creature/kicker, activate_ability (T/X/pipy),
  cycling/equip/ninjutsu, plot, flip morph.
  **UX C** własne face-down odsłaniane na pełnym ekranie (CR 708.2 —
  kontroler może patrzeć na swoje zakryte karty); cudze zostają zakryte.
  Testy: **983/983** (+9); artefakt 49 modułów / ~1040 kB. Pełny B0
  (13500 meczów, 0 niedokończonych): heuristic **89.1% vs random, 62.3% vs
  aggro**, aggro 93.0% vs random — progi 0.78/0.57 utrzymane.

Ten plik jest krótkim punktem wejścia dla właściciela, nowych współpracowników i agentów.
Powinien być aktualizowany po każdej istotnej zmianie zakresu, architektury lub etapu prac.

## Proces pracy

Gałąź `main` jest chroniona i każda zmiana wchodzi przez Pull Request: bez bezpośredniego pusha
i force pusha, z pustą bypass list, 0 wymaganymi approvals, obowiązkiem rozwiązania komentarzy
i scalaniem metodą `Squash and merge` po jawnej decyzji właściciela. Required status checks
włączymy dopiero po zbudowaniu stabilnego CI.

Praca agentska przebiega w modelu sesyjnym: **1 sesja = 1 gałąź (`arena/...`) = 1 PR**.
PR sesji żyje przez całą sesję — kolejne tematy dopisują mu osobne, zielone commity,
a opis jest aktualizowany kumulacyjnie. Scalenie lub zamknięcie PR kończy sesję;
nowa sesja startuje od aktualnego `main`. Szczegóły:
[workflow — praca z sesją agentską](WORKFLOW.md#praca-z-sesją-agentską-arena).

Projekt realizują agenci **Agent Arena** ([ADR 0013](decisions/0013-agent-arena-sessions-and-mandatory-handoff.md)):
scalenie PR kończy sesję kodowania (brak dalszych modyfikacji GitHuba), a nowa sesja
nie widzi stanu lokalnego poprzedniej — startuje z `main` i z tekstu pierwszego promptu.
Dlatego **obowiązkowym etapem zamknięcia sesji jest instrukcja przekazania**: blok tekstu
w czacie do wklejenia następnemu agentowi + trwały zapis w tym pliku i w
`docs/setup/HANDOFF_<data>.md`.

Szczegóły: [workflow](WORKFLOW.md), [polityka bezpieczeństwa](../SECURITY.md),
[ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Co już wiemy o istniejącej aplikacji

Właściciel wgrał do repozytorium `card_viewer_12_10_for_Github.html` — jeden plik,
9 257 linii, z wyciętymi sekretami. Aplikacja została uruchomiona i przeanalizowana.
Pełny opis: **[docs/AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)**.

Najważniejsze ustalenia:

1. **Wirtualny Stół jest logicznie niezależny** — 30% kodu w dwóch blokach, sześć zależności
   od reszty aplikacji, jedno wywołanie w drugą stronę. Rozplątywanie nie jest potrzebne.
2. **Arkusz kolekcji nie zawiera danych reguł** — brak kosztu many, typów i P/T. To dlatego
   obecny prompt każe modelowi wyszukiwać statystyki kart w internecie.
3. **Stan gry jest mutowany z 105 miejsc** w handlerach UI, bez walidacji i warstwy komend.
4. **Fog of War nie istnieje** — ręka przeciwnika jest renderowana w całości, celowo.
5. **Brak determinizmu** — tasowanie przez `sort(() => Math.random() - 0.5)`, brak seeda.
6. **Kilka reguł MtG jest już poprawnie zakodowanych** (zmiana strefy czyści znaczniki,
   summoning sickness, znikanie tokenów) — to gotowa lista wymagań dla engine.

## Decyzje podjęte po audycie

| Decyzja | ADR |
|---|---|
| Czysty JavaScript (ESM) — język, testy i struktura katalogów | [0008](decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona przez 0011) |
| Budujemy standalone Wirtualny Stół, nie adapter w starej aplikacji | [0009](decisions/0009-standalone-game-table-instead-of-extraction.md) |
| Dane reguł kart pobierane ze Scryfall przed kodowaniem, potem trzymane w repozytorium | [0010](decisions/0010-card-rules-data-in-repository.md) |
| Modularne źródła, jednoplikowy artefakt, dwa tryby uruchomienia | [0011](decisions/0011-modular-sources-single-file-artifact.md) |

Konsekwencja dla zakresu: repozytorium **nie utrzymuje** aplikacji kolekcjonerskiej,
mang, komiksów, teleturnieju ani rankingu modeli AI. Właściciel ma własną kopię z tymi funkcjami.

### Jak to będzie działać w praktyce

- **Właściciel nie instaluje ani nie buduje niczego.** Sklejaniem modułów w jeden plik
  zajmuje się CI przy każdej zmianie na `main`.
- **iPad:** wejście na adres GitHub Pages, ilustracje ze Scryfall.
- **Komputer:** pobrany plik HTML otwierany bezpośrednio, ilustracje z lokalnego `./img/`.
- **Reguły, talie i przebieg partii są w obu trybach identyczne** — różni je tylko warstwa obrazów.
- **Talie są plikami w repozytorium.** Świadomy koszt: nowej talii nie zbuduje się z iPada
  w trakcie grania.
- **Partie zapisują się jako seed i lista ruchów**, więc każdy błąd da się odtworzyć
  z małego pliku tekstowego.
- **Cała warstwa AI znika** — brak klucza API, brak listy modeli, brak wywołań LLM.

Ważne zastrzeżenie techniczne: Safari na iOS kasuje `localStorage` po siedmiu dniach bez
wejścia na stronę (polityka ITP Apple). Dlatego przeglądarka służy wyłącznie jako wygodny
cache, a trwałość zapewniają pliki w repozytorium i eksport zapisu partii.

## Ustalony kierunek

- Budujemy **core engine bez zakodowanych konkretnych kart**.
- Core zawiera pojęcia i procedury gry, a karty są osobnymi definicjami korzystającymi
  ze współdzielonych mechanik.
- Karty dodajemy pojedynczo lub małymi partiami wraz z testami i danymi reguł.
- Nie dążymy do obsługi wszystkich kart MtG.
- Pierwszym praktycznym celem jest rozgrywka z taliami zbudowanymi z około 20 obsługiwanych kart.
- Engine jest jedynym autorytetem stanu i legalności działań.
- Wirtualny Stół powstaje jako samodzielna aplikacja korzystająca z engine.
- Gra ma zapewniać widok gracza zgodny z Fog of War; kontroler nie dostaje ukrytych danych przeciwnika.
- Pierwszy przeciwnik jest algorytmiczny i deterministyczny. Agent LLM pozostaje opcjonalny.

Szczegóły i uzasadnienia: [rejestr decyzji](decisions/README.md).

## ~~⚠️ Wymaga działania właściciela~~ ✔ Wykonane

Właściciel wgrał workflow CI i publikacji oraz włączył GitHub Pages
(instrukcja: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md)).
Oba workflow (`ci.yml`, `pages.yml`) przechodzą na `main`, więc artefakt
jednoplikowy publikuje się automatycznie po każdym scaleniu — testowanie
z iPhone'a/iPada działa.

## Najbliższe zadanie

**M1–M5 są zamknięte na katalogu syntetycznym: sandbox, zasoby, combat, warstwa danych,
bot heurystyczny i pierwsza pionowa ścieżka UI (gra człowiek–bot przez jeden plik HTML).**

Stan techniczny:

- M1: odtwarzalny headless sandbox — zamknięty, z formalnym testem pełnej ścieżki replay;
- M2: land drop, mana, creature permanent, koszt, tap/untap i summoning sickness — zamknięte;
- M3: combat syntetyczny w kontrakcie `legalCommands` (test własnościowy: każda oferowana
  komenda jest akceptowana), centralne state-based actions po każdej komendzie, spójny automat
  kroków — zamknięte; znane uproszczenia udokumentowane w `docs/ENGINE_MILESTONES.md`;
- M4: registry, statusy wsparcia, parser/writer tekstu talii, walidacja kopii, filtry
  i podsumowania — gotowe; **syntetyczny katalog testowy** (`src/cards/card-data.js`)
  z materializacją do obiektów gry i taliami wersjonowanymi w `decks/`; stos z czarami
  instant/sorcery, targetowaniem i pierwszymi efektami (damage/pump); bot heurystyczny
  ze śladem uzasadnień (`src/controllers/heuristic-bot.js`);
- M5: stół w jednym HTML (`src/table/`): sesja prowadzi partię człowiek–bot przez protokół
  (auto-ruchy bota, auto-przewijanie okien samego pasa, polski log zdarzeń); UI renderuje
  PlayerView, kliki wysyłają komendy, replay eksportuje się do pliku i importuje z walidacją;
  talie `decks/*.txt` wstrzykiwane do artefaktu przez build (ADR 0011/0012);
- artefakt jednoplikowy zawiera pełny stół: self-test w HTML uruchamia komendy przez
  `PlayerView`, a moduły źródeł są strzeżone przed cyklami importów i kolizjami nazw;
- pełna partia syntetyczna (talia z pliku → definicja → obiekt gry → symulacja → replay)
  kończy się rozstrzygnięciem w engine, także sterowana kliknięciami UI;
- UI kreatora talii — zrealizowane w M20 zgodnie z ADR 0012 (stan nietrwały,
  eksport tekstowy zamiast `localStorage`).

Rozszerzenie Etapu 5 (bez decyzji właściciela):

- inspektor grobów i menu biblioteki z nazwami z registry;
- moduł adresów ilustracji (`./img/` vs Scryfall) — Etap 0b;
- framework abilities (activated/triggered/static), tokeny i załączniki;
- podgląd karty z ilustracją, autosave (`localStorage`) i wznawianie partii
  (z zapisu pola oraz z autosave);
- **zdolności aktywowane wpięte w engine** (`activate_ability` w `legalCommands`/
  `execute`: koszt tap + efekt pump), wspólny interpreter efektów
  (`src/engine/effects.js`) dla czarów i zdolności, **tworzenie tokenów przez
  efekt `create_token`**; syntetyczne karty `syn-warboar` (zdolność {T}: +1/+1)
  i `syn-swarmsummon` (czar: 1/1 Goblin) + definicja tokenu; talia
  `decks/synthetic-abilities.txt`; log tłumaczy nowe zdarzenia na polski.
- **M7 (nowy układ stołu, praca tylko w warstwie UI):** karty jako kafelki
  wyglądające jak karty (syntetyczna kolorowa twarz: nazwa, koszt, typ, pole
  reguł, P/T) zamiast tekstowych chipów; stół na całą szerokość (bitwisko wroga
  u góry, stos pośrodku, Twoje bitwisko na dole, ręka na samym dole) z układem
  perspektywicznym lądów/stworów; pasek statusu i pasek graczy (życie/biblioteka);
  **strefy (groby/exile/biblioteka) w modalnym inspektorze** zamiast pionowej listy;
  **podgląd karty** — hover (desktop) i klik (menu kontekstowe / modal z pełną twarzą);
  rozwijane panele akcji/logu/zapisu. Menu kontekstowe filtruje dozwolone akcje (komendy)
  po kliknięciu karty, również z optymalizacją dla touch/mobile (nagłówek jako miniatura karty).
  Zachowane wszystkie dotychczasowe funkcje stołu; engine i protokół nietknięte.
- **M8 (pierwszy batch realnych kart, 2026-08-01):** Highland Game (KTK),
  Kappa Tech-Wrecker (NEO), Segmented Krotiq (DTK). Dane ze Scryfall (ADR 0010 §2a)
  w `docs/cards/scryfall-*.json`, definicje `supported` w `src/cards/card-data.js`
  (z polem `oracleText` i adresem ilustracji druku), talia `decks/real-batch1.txt`.
  Nowe mechaniki w engine (minimalny wymiar dla tych kart): **liczniki** (+1/+1
  i znaczniki jak deathtouch), **triggered abilities** (`dies`,
  `combat_damage_to_player`), **ninjutsu** (z ręki, zwrot nieblokowanego
  atakującego, wejście tapped/atakujące), **morph/megamorph** (zagranie 2/2
  twarzą w dół za {3}, obrót za koszt megamorph z +1/+1, FoW tożsamości).
  Nowe efekty w `applyEffect`: gain_life, add/remove_counter, exile_permanent,
  turn_face_up. Testy `test/real-cards-batch1.test.js`; fingerprint uwzględnia
  liczniki i face-down; log i render stołu obsługują nowe karty (face-down jako 2/2).
- **M9 (drugi batch realnych kart, 2026-08-01):** Grizzled Outcasts (ISD, transform DFC
  na Krallenhorde Wantons 7/7), Entrancing Lyre (THB, {X},{T} z blokadą odkręcania),
  Zoraline, Cosmos Caller (BLB, flying/vigilance, tribał nietoperzy, reanimacja z finality).
  Nowe mechaniki: **transform** (trigger upkeep wg liczby czarów poprzedniej tury),
  **artefakty jako permanenty**, **koszt {X}**, **blokada odkręcania** (`untapLockedBy`),
  **flying/vigilance** w combacie, **subtypy** i trigger `bat_attacks`, **opcjonalna
  płatność triggera** (mana/życie), **reanimacja z finality counterem** (śmierć → exile).
  Bot heurystyczny punktuje zdolności aktywowane (używa {X}). Talia `decks/real-batch2.txt`;
  testy `test/real-cards-batch2.test.js`; 227/227 zielonych.
- **M10 (trzeci batch realnych kart, 2026-08-01):** Rupture Spire (CON, land ETB
  tapped + obowiązkowe „sacrifice it unless you pay {1}" z auto-tapem innego landa),
  Leafcrown Dryad (THS, enchantment creature z PEŁNYM bestow {3}{G} — czar aury
  na stosie, załączenie (nie-stwór), odłączenie w stwora, specjalna reguła
  nielegalnego celu; załączniki wpisane w engine na zawsze), Prismari Campus
  (STX, land ETB tapped + {4},{T}: Scry 1). Nowe mechaniki: **entersTapped** i
  obowiązkowy trigger „płać albo poświęć", **linie typów (types)** na obiektach
  (predykat artefakt/enchantment Kap-py łapie enchantment creature), **reach** w
  combacie, **załączniki aury bestow** (buff +2/+2 i reach w efektywnych
  statystykach), **scry 1** z blokującą decyzją `resolve_scry` (FoW: przeciwnik
  widzi tylko fakt, nie treść). Przy okazji naprawa regresji: instalacja talii
  gubiła deskryptory (`types`/`entersTapped`/`bestow`) w prawdziwych partiach.
  Talia `decks/real-batch3.txt`; testy `test/real-cards-batch3.test.js`;
  benchmark B0 przemierzony; 279/279 zielonych.
- **M7c (UX po uwagach właściciela z iPada, 2026-08-01):** hover wyłączony na dotyku
  (tap → tylko menu kontekstowe, bez migającego podglądu); auto-pass okien bez realnej
  decyzji — sam pass, samo tapnięcie landów (chyba że po odkręceniu staje się wykonalne
  zagranie), puste deklaracje ataku/bloków i puste rozstrzygnięcie walki przewijają się
  same, więc tura bota i puste fazy nie wymagają klikania; **akcje w wysuwanym panelu**
  (szuflada z lewej na desktopie / bottom-sheet na mobile, przycisk FAB z licznikiem)
  zamiast przewijanej listy na dole strony. Testy `test/session-autopass.test.js`.
- **B0 (harness pomiarowy bota, 2026-08-01):** `tools/benchmark.mjs` mierzy macierz
  win-rate bot-vs-bot (`aggro`/`heuristic`/`random`) na wszystkich taliach
  `decks/*.txt`, na N seedach (domyślnie 50), z meczami na obu stronach stołu na
  tych samych rozdaniach; bot aggro przeniesiony do produkcyjnych kontrolerów
  (`src/controllers/aggro-bot.js`), `random` w benchmarku gra bez losowej
  kapitulacji. Test regresji `test/bot-benchmark.test.js` pilnuje progów win-rate
  na deterministycznej próbce. Od B0 każda zmiana bota jest mierzona tym harnessem
  (tabela w opisie PR). Roadmapa bota B0–B5 wraz z rozstrzygnięciami właściciela
  (max trudność, okienko rozumowania domyślnie zwinięte, warunek dla ML):
  [docs/BOT_ROADMAP.md](BOT_ROADMAP.md). Baseline (po Batchu 4, 9 talii):
  heuristic 67.4% vs random, 59.0% vs aggro, aggro 71.4% vs random
  (13 500 meczów, 0 niedokończonych).
- **M11 (czwarty batch realnych kart, 2026-08-01):** Gloomfang Mauler (DSK,
  menace + swampcycling {2}), Serra's Embrace (czysta aura: +2/+2, flying,
  vigilance), Cloak of the Bat (equipment: +1/+1, flying, haste). Nowe mechaniki:
  **menace**, **haste**, **backup 2** (blokująca decyzja `resolve_backup`),
  **typecycling** z ręki (odrzucenie → wyszukanie → reveal → tasowanie seedem),
  **załączniki uogólnione** (jedna warstwa dla bestow, czystych aur i equipmentu)
  oraz **wirtualne landy podstawowe** (`VIRTUAL_BASIC_LANDS`). Talia
  `decks/real-batch4.txt`; testy `test/real-cards-batch4.test.js`;
  313/313 zielonych.
- **M12 (ilustracje realnych kart na stole, 2026-08-02; tylko warstwa UI):**
  kafel karty z realnym drukiem renderuje obraz ze Scryfalla (`imageUri`
  przeskalowany do `normal`, `loading="lazy"`), a syntetyczna twarz zostaje
  **fallbackiem** — widocznym do czasu wczytania i na stałe po błędzie
  (404/offline). Hover (desktop) i pełny podgląd pokazują ten sam druk w
  rozmiarze `large`; **scroll nad kartą przełącza tor podglądu**
  (scryfall → FOT → KON) jak w pliku legacy, z kształtami okien 320×448 /
  900×386 / 900×550. Karty zakryte mają wspólny rewers (FoW: adres nie zależy
  od karty), DFC po transformacji pokazuje `/back/`, tapnięcie obraca cały
  kafel z obrazem, a nakładka stanu (obrażenia, choroba, aura/equipment,
  efektywne P/T) rysuje się na ilustracji. Wirtualne landy dostały „stały
  druk" — przekierowanie po nazwie (`api.scryfall.com`), jak w legacy.
  Nowe: `artId` w definicji karty + `tools/fetch-art-ids.mjs` (uzupełnia
  numery ilustracji z opublikowanego CSV arkusza kolekcji; adres wyłącznie
  ze zmiennej `MTG_COLLECTION_CSV_URL`, nigdy w repozytorium).
  Testy `test/table-card-art.test.js`, `test/art-ids-tool.test.js`,
  rozszerzony `test/card-images.test.js`; 342/342 zielonych. Instrukcja:
  [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
- **M13 (artId z arkusza kolekcji, 2026-08-02; dane + narzędzie):**
  `tools/fetch-art-ids.mjs` uzupełnił `artId` w definicjach **wszystkich
  13 realnych kart** (Highland Game 509, Kappa Tech-Wrecker 278, Segmented
  Krotiq 523, Grizzled Outcasts 171, Krallenhorde Wantons 486, Entrancing
  Lyre 195, Zoraline 480, Rupture Spire 448, Leafcrown Dryad 521, Prismari
  Campus 459, Gloomfang Mauler 199, Serra's Embrace 110, Cloak of the Bat 200).
  Ekstrakcja numeru obsługuje formaty `412FOT.png`, `77.png`, `9KRA.png`
  oraz `1LTR` (liczba + kod setu — aktualny format kolumny `Ilustracja`),
  a aktualizacja istniejącego `artId` zachowuje przecinek (poprawka
  idempotencji przy zmianie numeru). Tory podglądu FOT/KON używają teraz
  lokalnych `./img/<artId>FOT.png`/`KON.png`, gdy plik istnieje, z fallbackiem
  na Scryfall; bez zmian w runtime. Testy `test/art-ids-tool.test.js`,
  `test/card-images.test.js` zaktualizowane do stanu „karty mają artId";
  342/342 zielonych.
- **M13b (słownik kart kolekcji w repo, 2026-08-02; dane + narzędzie):**
  pełna lista kart z arkusza (542 karty, kolumny `Ilustracja`,`Nazwa Karty`,
  z ID setu: `1LTR` = nr 1 z LTR, `5_2XM` = nr 5 z 2XM) wersjonowana
  w `tools/collection-art-ids.csv`; **duplikaty nazw z różnych setów
  zachowane**. Logika narzędzia: 1) słownik lokalny (offline, domyślnie),
  2) karty spoza słownika → fetch z arkusza, 3) nadal bez numeru → bez
  `artId` (tory FOT/KON spadają na Scryfall). Dopasowanie rozstrzyga
  duplikaty po secie karty (`pickArtId`), inaczej pierwszym wpisem;
  `--csv` to pełne nadpisanie źródeł. Test pilnuje spójności słownika
  z `card-data.js` (każda karta z `artId` ma zgodny wpis — także po secie).
  Procedura odświeżania: docs/setup/ILUSTRACJE_KART.md. 345/345 zielonych.
- **M14 (piąty batch realnych kart, 2026-08-02):** Midnight Guard (DKA —
  trigger „another creature enters" odkręca źródło), Holdout Settlement (OGW —
  land: {T}: Add {C} + {T}, tap untapped creature: add one mana),
  Skyclave Geopede (ZNR — trample + Landfall +2/+2 do końca tury). Nowe
  mechaniki w engine: **trigger wejścia na cudze źródła** (untap i landfall),
  **trample** (nadmiar obrażeń nad blokerami na gracza), **koszt „tap
  stwora"** (`tapCreature` — deterministyczny jak płatności M10), efekty
  `untap_permanent` i `add_mana` (dowolny kolor = 1 bezbarwna). Wszystkie 3
  karty mają `artId` ze słownika (385/79/493). Talia `decks/real-batch5.txt`;
  testy `test/real-cards-batch5.test.js` (13); benchmark z 10 taliami
  (16 500 meczów): heuristic 77.1% vs random, 60.4% vs aggro, 73.5% aggro vs
  random — próbka regresji 74.8%/63.2%, progi podniesione do 0.59/0.48.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  359/359 zielonych.
- **B2 (infrastruktura lookahead, 2026-08-02):** `src/engine/lookahead.js`
  (`makeSimulate` — kandydat na `structuredClone` stanu + dogranie polityką,
  horyzonty combat/main_phase, deterministyczne), `runSimulation` przekazuje
  `helpers.simulate`, `createHeuristicBot({ lookahead: 1 })` (domyślnie 0).
  **Pomiar wykazał pogorszenie** (baseline 76.5% vs random → 70.3% z lookahead
  na próbce 10 seedów; wszystkie 4 warianty strojenia poniżej baseline) —
  lookahead zbyt często rezygnuje z ataków, a w małych taliach (deck-out)
  presja ataku jest więcej warta. Zgodnie z zasadą B0 (zakaz pogorszenia)
  funkcja **domyślnie wyłączona**; infrastruktura + testy
  (`test/bot-lookahead.test.js`, 8) zostają jako fundament pod B2-w2.
  Szczegóły i tabela pomiarów: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
  367/367 zielonych.
- **B5 (okienko rozumowania bota, 2026-08-02; decyzja właściciela
  2026-08-01 — tylko warstwa UX):** nowy panel stołu „Rozumowanie bota"
  obok Logu partii, **domyślnie zwinięty** (`<details>` bez `open`); po
  rozwinięciu pokazuje „dlaczego bot zagrał X" — ślad decyzji z `trace()`
  bota (wybrana opcja, ocena, najlepsze alternatywy, np. `T3 · Faza
  główna — Zagranie landa (ocena 90); najlepsza z 3 opcji. Alternatywy:
  Zagranie permanentu (70), Pass priorytetu (0).`). Sesja zbiera wpisy
  (bufor 60, czyszczony przy wznowieniu), boty bez trace nie psują sesji
  (panel: „Brak danych"). Engine/protokół/bot nietknięte — bez pomiaru
  benchmarku (to nie zmiana bota). Testy `test/bot-reasoning.test.js` (8);
  375/375 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **M15 (szósty batch realnych kart, 2026-08-02):** Soulmender (M20 — {T}:
  zysk 1 życia), Illusory Demon (ARB — flying + trigger „when you cast a
  spell" → poświęcenie źródła), Jyoti, Moag Ancient (M3C — ETB tworzy
  tokeny Forest Dryad wg liczby rzuceń commandera (tu zawsze 0 — brak
  command zone, mechanicznie poprawne) + na początku walki pompuje land
  creatures o moc Jyoti). Nowe w engine: **trigger „when you cast a spell"**
  (dla spell_cast i permanent_cast; casting samej karty nie poświęca jej —
  poprawność wg CR), **land creatures** (token Forest Dryad: typ Land +
  rodzaj creature — walczy i tapuje się na manę), **trigger
  beginning_of_combat**, dynamiczny pump `source_power`, `create_token`
  z liczbą `commander_casts`, efekt `buff_land_creatures`. Bot unika
  rzucania czarów przy własnym demonie (kara wg wartości stwora). Wszystkie
  3 karty mają `artId` ze słownika (13/305/307). Talia `decks/real-batch6.txt`;
  testy `test/real-cards-batch6.test.js` (15); benchmark z 11 taliami
  (19 800 meczów): heuristic 74.7% vs random, 58.6% vs aggro, 73.2% aggro
  vs random — próbka regresji 72.7%/62.5%, progi 0.59/0.48 bez zmian.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  391/391 zielonych.
- **M16 (siódmy batch realnych kart, 2026-08-02; od tego batcha 5 kart na
  batch — decyzja właściciela):** Fake Your Own Death (OTJ), Puppeteer
  Clique (SHM), Unstable Frontier (CON), Apprentice Wizard (2XM), Delta
  Bloodflies (TDM). Nowe w engine (generycznie, ADR 0002): **liczniki
  -1/-1** w statystykach, **granty zdolności „do końca tury"**
  (`abilityGrants` + `grant_abilities`), **LKI** (`formerCounters`,
  `formerAbilityGrants` — CR 603.10), **persist** (CR 702.79),
  **reanimacja z grobu przeciwnika ze zmianą kontroli**, **opóźnione
  triggery** (`state.delayedTriggers`, CR 603.7), **tokeny niebędące
  stworami** (Treasure z własną zdolnością), **koszt „Sacrifice this"**,
  **atomowe koszty zdolności** (naprawiony błąd: nieudana aktywacja
  zostawiała permanent zatapniony), **cel „land you control" + tymczasowa
  zmiana typu podstawowego**, **`lose_life`** i **intervening if**.
  Wszystkie 5 kart ma `artId` ze słownika (295/343/49/188/431). Talia
  `decks/real-batch7.txt`; testy `test/real-cards-batch7.test.js` (25);
  benchmark z 12 taliami (23 400 meczów): heuristic 76.9% vs random,
  61.3% vs aggro, 75.8% aggro vs random — próbka regresji 74.8%/64.6%,
  próg vs aggro podniesiony do 0.49. Szczegóły:
  [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md). 427/427 zielonych.
- **M18 (UX stołu: pełny ekran karty i modal ruchu bota; 2026-08-02, decyzje
  właściciela):** (A) **dwuklik / double-tap** na dowolnym kaflu otwiera skan
  karty na **pełnym ekranie** (`renderCardFullscreen`, warstwa
  `#card-fullscreen`), a **pojedyncze tapnięcie karty bez dostępnych akcji**
  (karta przeciwnika, grób, exile) robi to samo zamiast pokazywać puste menu
  kontekstowe. iOS nie wysyła `dblclick` dla dotyku niezawodnie, więc drugie
  tapnięcie w ciągu 300 ms rozpoznajemy sami (`touchend`) — jeden kontrakt na
  myszy i na dotyku. (B) **modal „Ruch przeciwnika"** — bot gra w tle, a jego
  czary, zdolności i triggery nie zostawiają śladu na stole; dotąd gracz
  musiał wyławiać je z logu. Sesja zbiera istotne ruchy bota
  (`session.botMoves`, bufor czyszczony przy każdym ruchu gracza, żeby modal
  pokazywał ODPOWIEDŹ, nie historię), a UI pokazuje je w modalu blokującym,
  zamykanym przyciskiem, ze **skanem ostatniej zagranej karty**. Świadomie
  pomijamy passy, tapowanie many i kroki tury (szum — decyzja właściciela).
  Testy `test/table-ux-m18.test.js` (8) + nowe id w `test/table-ui.test.js`;
  464/464 zielonych, artefakt 36 modułów / 377.0 kB.
- **Bugfix ilustracji na stole (2026-08-02, zgłoszenie właściciela):** kafle
  realnych kart na stole i w ręce pokazywały syntetyczną „twarz" zamiast skanu
  ze Scryfalla (poprawny obraz był widoczny dopiero w oknie szczegółów).
  Przyczyną NIE był wybór adresu (ten był poprawny od M12), tylko sposób
  ukrywania obrazu w trakcie ładowania: `<img>` startował z
  `style.display = 'none'`, a **przeglądarka nie pobiera obrazów ukrytych
  `display: none`** — przy `loading="lazy"` nie pobiera ich nigdy, więc
  zdarzenie `load` nie padało i fallback (twarz) zostawał na zawsze. Modal
  szczegółów używa innej ścieżki (bez `lazy`), dlatego tam skan działał.
  Naprawa: obraz w trakcie ładowania jest **przezroczystą warstwą** nad twarzą
  (klasa `is-loading`, CSS `opacity: 0` + `position: absolute`), a nie
  elementem `display: none`; po `load` warstwa staje się widoczna i twarz
  znika, po wyczerpaniu kandydatów wraca twarz (bez zmian). Dotyczy wszystkich
  kart ze skanem — realnych i wirtualnych landów podstawowych; karty
  syntetyczne i tokeny nadal (celowo) mają kolorową twarz. Testy regresyjne
  w `test/table-card-art.test.js` (2 nowe: „żaden kafel ze skanem nie startuje
  z display:none" i „wirtualny land dostaje skan"); 429/429 zielonych.
- **M17 (ósmy batch realnych kart, 2026-08-02):** Phyrexian Rager (DMU),
  Nefarious Imp (CLB), Gather the Townsfolk (DDQ), Evangel of Synthesis
  (BRO), Woolly Loxodon (KTK). Nowe w engine (generycznie, ADR 0002):
  **dobieranie kart z efektu** (`draw_cards`, wspólne z komendą draw),
  **licznik dobrań w turze** (`cardsDrawnThisTurn`), **odrzucanie kart**
  (`discard_cards`, deterministycznie najdroższa), **zdolności STATYCZNE
  warunkowe** (CR 604.3 — przeliczane przy odczycie statystyk, nie „do końca
  tury"), **trigger „one or more permanents you control leave the
  battlefield"** (raz na komendę, CR 603.2), **scry poza własną turą**
  (pendingScry oddaje i zwraca priorytet), **fateful hour** (warunkowa liczba
  tokenów), **zwykły morph** (obrót bez licznika +1/+1). Wszystkie 5 kart ma
  `artId` ze słownika (75/3/335/352/518). Talia `decks/real-batch8.txt`;
  testy `test/real-cards-batch8.test.js` (26); benchmark z 13 taliami
  (27 300 meczów): heuristic 77.8% vs random, 63.6% vs aggro, 75.5% aggro
  vs random — próbka regresji 75.0%/66.9%, próg vs aggro podniesiony do 0.51.
  Wyceny ETB w bocie odrzucone po pomiarze (pogarszały wynik — zasada B0).
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md). 456/456 zielonych.
- **B3 (modelowanie przeciwnika, 2026-08-02; pozycja 10.4):**
  `src/engine/hypergeom.js` (deterministyczna hipergeometria) + bot zna
  talię przeciwnika (`opponentDeck` — przekazywana z benchmarku i sesji)
  i klasyfikuje jego czary generycznie (instant damage = removal, pump =
  combat trick). Model ręki: N = biblioteka+ręka, K = kopie odpowiedzi minus
  widoczne w strefach publicznych (adaptacja w trakcie partii), n = ręka.
  **EV ataku**: kara ≈ wartość stwora × P(removal) przy otwartej manie wroga
  i P>45% (nie w wyścigu — lekcja B2); **EV bloku**: kara za blok zabijający
  atakującego przy ryzyku pumpa (poza presją śmiertelną). Pomiar: pełna
  macierz 19 800 meczów — 74.5% vs random, 58.6% vs aggro (baseline
  74.7/58.6 — neutralny wobec botów benchmarku; wartość w grze z człowiekiem
  trzymającym odpowiedzi); próbka regresji 72.5%/62.5%, progi 0.59/0.48
  bez zmian. Testy `test/hypergeom.test.js` + `test/bot-opponent-model.test.js`
  (11); 402/402 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **B1 (lepsza heurystyka bota, 2026-08-02; pozycja 10.3 kolejki):**
  świadomość kroków tury (bez tapowania many/zdolności {T} w untap/upkeep/
  draw/end/cleanup), zegar (blisko lethal, wyścig, deck-out), ocena planszy
  (flying-evasion, parytet stworów, ceny bloków), wycena zdolności z definicji
  karty (pump − koszt tapu, neutralizacja Liry wg celu, equip, cycling,
  ninjutsu). **Naprawiona patologia deck-out** na `synthetic-abilities`
  (heuristic 0% → 100% vs random w mirrorze — bot stał z zatapianymi
  stworem i wypalał własną bibliotekę). Pełna macierz 50 seedów (13 500
  meczów): heuristic vs random **75.4%** (było 67.4%), vs aggro **60.9%**
  (było 59.0%), agregat heuristic 68.1% (było 63.2%); próbka regresji
  73.1% / 63.3%, progi w `test/bot-benchmark.test.js` podniesione do
  0.58 / 0.48. Szczegóły i tabele: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).

Następny większy pakiet: kolejny batch realnych kart (lista od właściciela; każda
karta z danymi ze Scryfall — ADR 0010 §2a). **Batch 18 czeka na listę
właściciela.** Zamknięte: ilustracje (poz. 10.1), Batche 1–17, B1, B3, B4,
B5 (UX), M20 kreatora talii, M21 ChoiceRequest, M24 (Batch 11), M25
(przebieg tur dla AI), M26 (gesty dotyku na iPadzie), M27 (Batch 12) i M28
(Batch 13); B2 — infrastruktura
lookahead (eksperyment nie przeszedł progu jakości, funkcja pozostaje
wyłączona).
Szczegóły B4 i pomiary: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
Świadome uproszczenia M8–M11 (brak kaskadowania triggerów,
deterministyczne „you may", wymuszana płatność „unless you pay", scry tylko na
własnej bibliotece, uproszczony model continuous effects dla aur bestow itd.)
są udokumentowane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

> **Układ definicji kart (ADR 0010 §1 vs rzeczywistość):** ADR 0010 przewidywał
> „jedna karta = jeden plik" w `src/cards/definitions/`, ale repozytorium
> ewoluowało do pojedynczego modułu `src/cards/card-data.js` (sekcja `REAL_CARDS`).
> Po Batche 1–13 (54 wspieranych kart) formalizuje to **ADR 0014**
> ([definicje kart w pojedynczym module](decisions/0014-card-definitions-single-module.md)),
> który zastępuje §1 ADR 0010. Procedura dodawania karty: `docs/cards/HOW_TO_ADD_CARD.md`.

Milestone’y i kryteria są zapisane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

Historyczna kolejność pierwszych kroków (zrealizowana w bieżącym PR):

1. Szkielet `src/engine/`, `src/protocol/` i `test/` zgodny z ADR 0011.
2. CI uruchamiający `node --test` przy każdym PR.
3. `build.mjs` + publikacja na GitHub Pages — żeby każdy kolejny przyrost był od razu
   sprawdzalny na iPadzie, a nie dopiero na końcu projektu.
4. Tożsamość obiektów i strefy z kontrolowaną zmianą strefy.
5. Seedowane RNG i poprawne tasowanie.
6. `GameState` → `PlayerView` z testem braku wycieku ukrytych informacji.

## Otwarte pytania

Audyt zamknął większość pytań z poprzedniej wersji tego dokumentu (zob. §9 audytu).
Pozostają:

1. **Które karty wchodzą do pierwszego zestawu?** **Batche 1–17 (94 karty)
   zakodowane; kolejny batch czeka na listę właściciela.** Dostarczone
   i zamknięte (Batch 11, 2026-08-03: Underdark Explorer, Angel's Feather,
   Release the Ants, Porcelain Legionnaire, Curate, Canonized in Blood;
   Batch 12, 2026-08-03: Grave Exchange, Hysterical Blindness, Barkform
   Harvester, Undead Servant, Rage of Purphoros; Batch 13, 2026-08-03:
   Scorned Villager, Curse of the Pierced Heart, Emissary Escort,
   Snarling Wolf, Negate).
   Przed kodowaniem każdej karty obowiązkowy pobór danych ze Scryfall
   (ADR 0010 §2a). Docelowo ~20 wspieranych kart (przekroczone — katalog
   rośnie zgodnie z listami właściciela).
   *(częściowo rozstrzygnięte 2026-08-01, Batch 5 2026-08-02, Batch 11 2026-08-03)*
1a. ~~**Druk Ethersworn Shieldmage (Batch 16)**~~ **Rozstrzygnięte 2026-08-05:**
   zapis „CON\" na liście odnosił się do planu Alara; właściciel potwierdził
   druk **ARB** (Alara Reborn) — tak zakodowano (artId 536 ze słownika).
2. ~~**Jaki rozmiar talii dla pierwszych rozgrywek?**~~ **Rozstrzygnięte 2026-08-01:**
   bez minimalnej wielkości — talia ma tyle kart, ile wyjdzie z kreatora. Walidacja
   rozmiaru (`size` w `validateDeck`) pozostaje opcjonalna i domyślnie wyłączona.
3. **Jaki docelowy poziom ochrony FoW?** W aplikacji czysto klienckiej realnie osiągalne jest
   „uczciwe UI + kontroler bez dostępu do ukrytych danych". Pełna poufność wymaga backendu.
   Decyzja potrzebna dopiero przy Etapie 6.
4. **Czy stół ma zachować tryb swobodny (sandbox)** jako narzędzie diagnostyczne obok
   trybu sterowanego regułami?
5. ~~**Kreator talii**~~ **Zrobione w M20 (2026-08-03):** ADR 0012 zrealizowany
   bez `localStorage`, z filtrami `Plan`/`Set`/nazwa, walidacją talii i wspólnym
   tekstowym formatem eksportu oraz plików repozytorium.
6. ~~**Czy podnieść ADR 0005 do „Zaakceptowana"?**~~ **Rozstrzygnięte 2026-08-01:**
   [ADR 0005](decisions/0005-deterministic-replayable-execution.md) jest zaakceptowana —
   determinizm jest wymogiem działania zapisu partii.
7. ~~**Czy prawdziwe landy (Forest/Mountain…) wejdą do katalogu?**~~ **Rozstrzygnięte
   2026-08-01:** NIE. Landy podstawowe istnieją wirtualnie — do talii dobiera się
   dowolną liczbę sztuk, a ilustracje wyświetlają się ze Scryfall tak jak w pliku
   legacy HTML. **Zaimplementowane od Batchu 4 (M11):** `VIRTUAL_BASIC_LANDS`
   w `src/cards/card-data.js` (Plains/Island/Swamp/Mountain/Forest jako
   `supported`, typy `['Basic','Land']` + podtyp), `parseDeckText` przyjmuje
   dokładne nazwy, `validateDeck` nie limituje kopii, typecycling ma realny cel
   wyszukiwania; talia `decks/real-batch4.txt` używa `8x Swamp`. Pozostaje
   ilustracja: **zrobiona 2026-08-02** — stały druk landów podstawowych to
   przekierowanie po nazwie do Scryfalla (`imageUri` w `VIRTUAL_BASIC_LANDS`),
   jak w pliku legacy.
8. ~~**Docelowy poziom trudności bota i prezentacja jego rozumowania w UI.**~~
   **Rozstrzygnięte 2026-08-01:** trudność maksymalna dostępna; rozumowanie w osobnym
   okienku stołu, domyślnie zwiniętym, docelowo rozwiniętym. Szczegóły:
   [docs/BOT_ROADMAP.md](BOT_ROADMAP.md) (B5).
9. ~~**Czy wolno wprowadzić zależność ML (B4)?**~~ **Rozstrzygnięte warunkowo
   2026-08-01:** tylko jeśli stół nadal działa lokalnie (z pobranego pliku / lokalnego
   serwera HTTP) i zdalnie z GitHub Pages na iPadzie/iPhonie bez instalowania czegokolwiek
   — w praktyce czysty JS w jednoplikowym artefakcie (ADR 0011). Framework ML wymaga
   osobnej decyzji i ADR.
10. **Kolejka zadań zatwierdzona przez właściciela 2026-08-01** (priorytet malejący;
    handoff: [docs/setup/HANDOFF_2026-08-01.md](setup/HANDOFF_2026-08-01.md)):
    1. ~~**Ilustracje prawdziwych kart na stole.**~~ **Zrobione 2026-08-02**
       (M12 niżej): kafel realnej karty renderuje druk z `imageUri` (rozmiar
       `normal`, lazy-load), hover i pełny podgląd pokazują ten sam obraz w
       `large`, syntetyczna twarz jest fallbackiem. Objęte: DFC (po transformacji
       tył), tapnięcie (obrót całego kafla), rewers dla kart zakrytych, wirtualne
       landy (druk domyślny Scryfalla), tory podglądu FOT/KON przełączane
       scrollem jak w legacy. Instrukcja:
       [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
    2. ~~**Batch 5 realnych kart**~~ **Zrobione 2026-08-02 (M14):** Midnight
       Guard, Holdout Settlement, Skyclave Geopede (procedura ADR 0010 §2a;
       triggery wejścia, trample, koszt „tap stwora"). **Batch 6 (M15,
       2026-08-02): Soulmender, Illusory Demon, Jyoti, Moag Ancient
       (when you cast a spell, land creatures, beginning_of_combat).**
       **Batch 7 (M16, 2026-08-02, 5 kart): Fake Your Own Death, Puppeteer
       Clique, Unstable Frontier, Apprentice Wizard, Delta Bloodflies
       (granty zdolności, persist, reanimacja, opóźnione triggery).**
       **Batch 8 (M17, 2026-08-02): Phyrexian Rager, Nefarious Imp, Gather
       the Townsfolk, Evangel of Synthesis, Woolly Loxodon (dobieranie,
       zdolności statyczne, fateful hour, zwykły morph).**
    3. ~~**Etap B1 bota**~~ **Zrobione 2026-08-02** — każda zmiana mierzona
       `node tools/benchmark.mjs` (tabela przed/po w opisie PR), progi w
       `test/bot-benchmark.test.js` podniesione (0.59 / 0.48 po Batchu 5).
       Wynik: 75.4% → 77.1% vs random (9 → 10 talii), 60.9% → 60.4% vs aggro;
       patologia deck-out naprawiona. Szczegóły: [BOT_ROADMAP](BOT_ROADMAP.md).
    4. ~~**B4 — strojenie wag**~~ **Zrobione 2026-08-03 (M19)** —
       hill-climbing na tym samym harnessie B0 przyjął `mana=1.1` i
       `permanent=0.9`; pełna macierz poprawiła wynik 77.8% → 77.9% vs random
       oraz 63.6% → 64.0% vs aggro. Progi regresji: `0.60 / 0.52`.
    5. ~~**Kreator talii UI**~~ **Zrobione 2026-08-03 (M20)** — filtry
       Plan/Set/nazwa, lista kart supported, limit kopii, podsumowanie,
       kopiowanie i pobieranie wspólnego formatu tekstowego; bez localStorage.
    6. ~~**UI ChoiceRequest**~~ **Zrobione 2026-08-03 (M21)** — modal grupuje
       warianty celu/X/scry/backup, waliduje wybór przez protokół i przekazuje
       legalną komendę do sesji; engine nadal używa enumeracji jako adaptera.
    7. ~~**Batch 9 realnych kart**~~ **Zrobione 2026-08-03 (M22)** — Kor
       Cartographer, Scorpion Sentinel, Dunland Crebain, Dragonbroods' Relic,
       Secluded Steppe; dane Scryfall, artId, talia i generyczne mechaniki.
    8. ~~**Batch 10 realnych kart**~~ **Zrobione 2026-08-03 (M23)** — Goblin
       Piker, Angel of the Dawn, Armored Skaab, Tumbleweed Rising,
       Dawntreader Elk; nowe mechaniki globalnego buffa, mill, plot i dynamicznego X.
    9. ~~**Batch 11 realnych kart**~~ **Zrobione 2026-08-03 (M24)** — Underdark
       Explorer, Angel's Feather, Release the Ants, Porcelain Legionnaire,
       Curate, Canonized in Blood; inicjatywa, clash, phyrexian mana,
       first strike, surveil i descended.

## Aktualny bloker

Brak dalszej listy realnych kart — **Batche 1–21 (138 wspieranych kart) zakodowane; Batch 22 czeka na listę właściciela.**
Poz. 10.1 (ilustracje), **Batche 2–11, B1, B3, B4, B5 (UX), M20, M21 i M24
są zamknięte**;
B2 — infrastruktura lookahead (eksperyment nie przeszedł progu jakości,
wyłączona; szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md)). Nie włączamy
lookahead bez przeprojektowania i nie dodajemy kart bez danych Scryfalla.

Poboczna zaległość z poz. 10.1: **zamknięta 2026-08-02 (M13)** — `artId`
dla wszystkich 13 realnych kart uzupełniony z opublikowanego arkusza
(adres wyłącznie w `MTG_COLLECTION_CSV_URL` / `tools/collection.config.json`,
nigdy w artefakcie stołu); pełny słownik kolekcji (542 karty) wersjonowany
w `tools/collection-art-ids.csv` (M13b). Tory FOT/KON działają, gdy pliki `./img/`
istnieją; bez plików cicho spadają na Scryfall.

## Kryterium ukończenia aktualnej fazy

Etap 1 kończy się, kiedy:

- istnieje uruchamialny headless engine bez zależności od DOM-u i sieci;
- `node --test` przechodzi lokalnie i w CI;
- kontrakty `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest` są zaimplementowane
  i opisane w JSDoc;
- test potwierdza brak wycieku ukrytych informacji do `PlayerView`;
- ten sam seed i ta sama sekwencja komend dają identyczny przebieg symulacji;
- dwa `RandomBot`-y przechodzą przez minimalną symulację tur.


## Sesja 2026-08-07 — T1–T4 (stos permanentów, cele triggerów, auto-tap, mulligan)

Po M48 (PR #32) usunięto cztery największe świadome luki engine — wszystkie u root cause,
bez maskowania (AGENTS.md). Mini-roadmapa: `docs/plans/PLAN_2026-08-07-poprawki-stos-i-luki.md`.

- **T1 — permanenty na stosie (CR 601/608/702):** rzut stwora/artefaktu/enchantmentu kładzie
  CZAR na stosie; wejście na bitwisko po pełnej rundzie passów (resolvePermanentSpell —
  liczniki ETB, bloodthirst, face-down). Przeciwnik odpowiada instanitem, kontrczary celują
  w czary-stwory, cast triggery przy rzucie, ETB przy rozstrzygnięciu. Timing sorcery:
  cast_permanent/play_land wymagają pustego stosu. CR 117.3b: po rozstrzygnięciu priorytet
  aktywnego gracza. Adventure creature i Discover free-cast też na stos.
- **T2 — cele triggerów jako decyzje gracza (CR 603/115.1b):** resolve_trigger_target zamiast
  deterministycznego findTriggerTarget (15 kart); „up to one"/„you may" = opcja odmowy;
  Zoraline: najpierw płatność, potem cel; Angel's Feather: „you may" tak/nie. LKI dla
  triggerów dies/leaves. Root fixy: tokeny nie są „card from graveyard" (CR 108.2b),
  ślepe wpisy nie blokują pass, exile_permanent z null = brak efektu (CR 608.2b).
- **T3 — auto-tap płaci pipy kolorów właściwą maną (CR 106.4/601.2h):** koniec cichej złej
  płatności ({U} z {W}); do-tap kolorowopasujących źródeł, atomiczność płatności;
  darmowe rzuty (plot/discover) bez wymagań kolorów; morph face-down bezbarwny (CR 702.36).
- **T4 — mulligan londyński (CR 103.4):** decyzja keep/mulligan po rozdaniu; mulligan =
  tasowanie ręki do biblioteki, dobranie 7, odłożenie N kart na spód (wybór gracza).
  Boty zatrzymują rękę (pierwsza oferta) — B0 bez zmiany przebiegu.
- **T5 — regeneracja (CR 701.12):** zdolność „regenerate" zakłada tarczę; następne
  ZNISZCZENIE (śmiertelne obrażenia / efekt destroy) jest zastępowane (odtapowanie, zdjęcie
  obrażeń, wyjście z walki, bez dies); nie chroni przed poświęceniem/prawem legend/P/T<=0.
- **T6 — TRIGGERY NA STOSIE (CR 603.3):** efekty zdolności triggerowanych rozstrzygają się
  PO pełnej rundzie passów (wspólny stos z czarami, LIFO) — przeciwnik odpowiada instanitem.
  Intervening-if przy rozstrzyganiu (CR 603.4), LKI źródła (CR 603.10), cele nieważne =
  no-op (CR 608.2b). Na stos idą: ETB/dies/attacks/landfall/prowess/cast-triggery, rozdziały
  Sag, opóźnione triggery, combat damage triggers. Bramki: declare_blockers/resolve_combat
  przy pustym stosie; pass w combat_damage dozwolony przy niepustym (okno odpowiedzi).

Testy: **1025/1025** (+4: test/trigger-vanished-target.test.js). Build: 49 modułów / ~1089 kB.
B0 finalny (13500 meczów, **0 niedokończonych**): heuristic **90.4% vs random, 61.7% vs
aggro**, aggro **95.4% vs random** — progi 0.78/0.57 utrzymane.

**Fix crasha B0 po T6 (CR 608.2b):** pełna macierz B0 wywalała się na „Modyfikować można
tylko stwora na battlefield" — pump (prowess/landfall) rozstrzygany ze stosu na źródle,
które odeszło z bitwiska w oknie odpowiedzi. Root fix: efekty triggerów z nielegalnym
celem = no-op (pump, pump_food_result, damage, goad, grant_abilities,
grant_keywords_until_end_of_turn, sacrifice_permanent, reanimate_under_your_control,
return_permanent_from_graveyard, return_creature_card_to_hand, put_graveyard_card_on_bottom,
untap_permanent, cant_block, cant_be_blocked, turn_face_up). LKI stub źródła niesie teraz
ostatnie znane statystyki (power/toughness — CR 603.10, efekt „source_power" Jyoti).
Przy okazji wykryty maskowany bug: walidacja aktywacji morph/megamorph nie odrzucała
obrotu już odkrytej karty (throw w turnFaceUp udawał nielegalność) — root fix w
activateAbility. Weryfikacja: pełny przebieg 13500 meczów bez crasha.

**Kolejne tematy (poza tą sesją):** batch realnych kart od właściciela; resztowe
determinizmy „you may" (kolejność ofert); regeneracja czeka na pierwszą realną kartę
z tym keywordem (mechanika generyczna + testy syntetyczne gotowe).

## Sesja 2026-08-08 — UX A+B + czyszczenie luk (PR #33, 2026-08-08)

Na zgłoszenie właściciela naprawione dwa tematy UX oraz wyczyszczone przestarzałe Jawne Ograniczenia i kolejne uproszczenia niezgodne z CR:

- **A. Wskaźnik tury jako warstwa** — `#turn-indicator` przeniesiony z `.topbar` na poziom `<body>` przed `.app`, CSS `position: fixed; top:8px; left:8px; z-index:1100` (poniżej modalu 1500 i fullscreen 2600), `pointer-events:none` — zawsze widoczny przy scrollu, nie zasłania kart.
- **B. Etykiety mulligana** — `commandLabel` dla `resolve_mulligan_choice` / `resolve_mulligan_bottom_choice` zamiast technicznego `resolve_mulligan_choice` pokazuje dwie rozróżnialne polskie etykiety (`Zatrzymaj tę rękę` vs `Weź mulligana (odłożysz N kart)` z dynamicznym licznikiem oraz `Odłóż na spód (N): <nazwy>`), `ACTION_RANK -3`.
- **C. Czyszczenie Jawnych Ograniczeń cz.1 (handout T1–T6)** — 7 kart: `highland-game` (trigger dies bez stosu → T6), `rupture-spire` (płatność automatyczna → pay_or_sacrifice), `kor-cartographer` / `pilgrims-eye` / `fiery-fall` (deterministyczne szukanie → resolve_search_choice), `moonlit-meditation` (replacement deterministycznie → resolve_moonlit_choice), `rage-of-purphoros` (can't be regenerated — uściślenie).
- **D. Any-color bezbarwnie → kolorowa mana (M41)** — 10 kart: `rupture-spire`, `prismari-campus`, `holdout-settlement`, `dragonbroods-relic`, `raucous-carnival`, `fake-your-own-death`, `marut`, `porcelain-legionnaire` (phyrexian), `scorned-villager` ({G}), `esper-stormblade` (hybrid) — `MANA_SOURCE_MAP` już kolorowy, wpisy przestarzałe usunięte; `seers-lantern {C}` zostaje (słusznie bezbarwna).
- **E. Wybór stwora do tap (CR 601.2h)** — `Holdout Settlement` / `Dragonbroods Relic` (`tapCreature`) i `Wedgelight Rammer` Station (`tapOtherCreature`): `legalActivatedAbilities` enumeruje warianty per stwór (`tapCreatureId`/`tapOtherCreatureId`) zamiast deterministycznego pierwszego, `activateAbility` waliduje i tapuje wybrany (fallback dla starych replay), `game-state` przekazuje, `render` grupuje i etykietuje `tapnij X`.
- **F. Escape jako wybór (CR 702.138)** — `Sweet Oblivion`: `legalEscapeCasts` enumeruje podzbiory 4 kart z grobu (kombinacje, cap 32 jak crew) zamiast pierwszych 4, `castEscape` waliduje dowolny podzbiór, `render` grupuje i etykietuje `Ucieczka: X — wygnaj: <nazwy>`, `dragonbroods-relic` any-target deterministycznie → [] (trigger już jako pendingTriggerTargets).

Weryfikacja: `npm test` **1025/1025**, `npm run build` 49 modułów / 1090 kB, B0 0.78/0.57 bez regresji, headless testy mulligana i Escape.

## Sesja 2026-08-08 — M50 Saga Mesmerize jako wybór gracza + audyt limitations (PR #34, 2026-08-08)

Na zgłoszenie właściciela („wykonaj B a potem D z twojej listy") zrealizowane dwa tematy z listy otwartej:

- **B. Mesmerize (Shiva, Warden of Ice — Saga rozdziały I/II)** — Temat 2 dla Sag: cel „Target creature can't be blocked this turn" wybiera KONTROLER Sagi blokującą decyzją `resolve_trigger_target` (jak inne cele triggerów T2: Forge Devil, Kor Sanctifiers, Puppeteer Clique, Greatsword of Tyr). Kolejność kandydatów (`creature_you_control` z bitwiska) = dawny determinizm, więc proste boty biorą pierwszą ofertę i zachowują dotychczasowe zachowanie „najsilniejszy własny stwór". Nowa `queueSagaChapter` w `src/engine/triggers.js` rozdziela ścieżki: rozdziały z `requiresTarget` → `queueTargetDecision` (nowa kolejka `pendingTriggerTargets` dla Sagi); bezcelowe → `queueTriggerToStack` jak dotąd. `fireSagaChapter` przyjmuje `chapterTargets` z `payload.targets`; `resolveTriggerEntry` w ścieżce `sagaChapter` przekazuje je. Usunięto martwą `findSagaChapterTargets`. Karta `shiva-warden-of-ice` chapters I/II dostały `requiresTarget: { type: 'creature_you_control' }`.
- **D. Audyt `limitations`** — z 159 wpisów `limitations` w `src/cards/card-data.js` znaleziono 3 do wyczyszczenia po naprawie Mesmerize: skopiowane wpisy o determinizmie celu Mesmerize w `krallenhorde-wantons`, `moonscarred-werewolf` (tylne strony wilkołaków — nigdy nie miały Mesmerize) i `shiva-warden-of-ice`. Reszta wpisów to aktualne komentarze implementacyjne (świadome uproszczenia, mechaniki zaimplementowane jako decyzje gracza itd.) — brak dalszych świadomych uproszczeń do wyczyszczenia. Rekomendacja dla właściciela: żadne dalsze czyszczenie `limitations` nie jest potrzebne.

Weryfikacja: `npm test` **1028/1028** (3 nowe testy Mesmerize + 2 zaktualizowane w batch16), `npm run build` 49 modułów / 1095.3 kB, B0 progi 0.78/0.57 bez zmian (boty biorą pierwszą ofertę — domyślne zachowanie niezmienione).

## Sesja 2026-08-08 — M51 UX i18n: token count, modal labels, ikony many (PR #35, 2026-08-08)

Na zgłoszenie właściciela 2026-08-08 (po testach iPada z PR #34) trzy tematy UI:

- **A. Gather the Townsfolk — opis „tworzenia 1/1"** — `describeSpellEffects` w `src/table/render.js` nie uwzględniał `amount` ani fateful hour. Teraz dla `create_token` z `amount > 1` opis zawiera `N× token P/T Name` (Gather the Townsfolk 2×, Howl 2×+, Undead Servant wg grobu); z `ifLifeAtMost` dokleja `(X przy życiu ≤ N)` (Gather the Townsfolk: 5 przy życiu ≤ 5). Analogiczna poprawka w `describeEffect` dla spójnych etykiet aktywowanych zdolności (Sailor of Means, Captain's Call). Mechanika była OK (log i stół pokazywały prawidłową liczbę), tylko opis kłamał.
- **B. Modalne Choose one — brak nazw opcji** — 4 karty modalne (aerith-rescue-mission, your-temple-is-under-attack, ruinous-rampage, youre-confronted-by-robbers) dostały pole `name` w każdym `spell.modes[i]` (nazwy z Oracle text). `commandLabel` w `src/table/render.js` dla `cast_spell` z `modeIndex` dokleja ` — {modeName}` po nazwie karty, np. „Rzuć: Your Temple Is Under Attack — Pray for Protection (koszt {2}{W})" — gracz widzi, KTÓRĄ opcję wybiera.
- **C. Ikony many łamią tekst w przyciskach** — z oryginalnego screenshotu iPada: w wąskim buttonie .action ikona `{W}` zostawała sama w linii, a `)` przeskakiwał do następnej. Przyczyna: `display: inline-flex` + `width: 1.25em` traktowały ikonę jako sztywny znak oderwany od kontekstu. Naprawa: `display: inline-block` + `white-space: nowrap` + `flex-shrink: 0` + `margin: 0 2px`. Ikona trzyma się sąsiedniego tekstu, nie wymusza własnego kontekstu łamania linii.

Weryfikacja: `npm test` **1039/1039** (+11 nowych: 5 spell-effect-description, 6 modal-mode-name), `npm run build` 49 modułów / 1098.5 kB.

## Sesja 2026-08-08 — M52 Batch 22: 10 realnych kart (PR #34, 2026-08-08)

Dziesięć realnych kart z kolejki właściciela 2026-08-08 (handoff
`HANDOFF_2026-08-08b.md`): **Thistledown Players** (BLB), **Etherwrought
Page** (ARB), **Stomping Slabs** (MOR), **Courage in Crisis** (WAR),
**Selesnya Charm** (RTR), **Wormfang Newt** (JUD), **Raise the Alarm**
(CMR), **Cellar Door** (ISD), **Healer of the Glade** (M20) i **Enter the
Enigma** (DSK). Wszystkie `supported` w 100% mechaniki z Oracle (ADR 0010
§2a — 10 plików Scryfall pobranych przed kodowaniem przez `fetch_page`
z uwagi na ograniczenie `curl` w sandboxie; artId/plan ze słownika
kolekcji). Procedura sesji: 1 sesja = 1 branch (`arena/019fe084-mtg`) =
1 PR (#34); pierwszy commit PR to plan
(`docs/plans/PLAN_2026-08-08-batch22-cards.md`), kolejne commity to
silnik → 3 feat (3+3+4 karty) → docs (M52 + HANDOFF).

**Nowe generyczne mechaniki engine (ADR 0002):** **proliferate** (CR 701.27)
— `pendingProliferate` + `resolve_proliferate` (Courage in Crisis: +1/+1
counter + proliferate; pierwsza karta z proliferate w katalogu);
**mill_from_bottom** (Cellar Door: 2 karty z dołu + conditional 2/2
Zombie token); **return_exiled_to_battlefield** (Wormfang Newt: ETB exile
own land, LTB return; LKI z `exiledCardIds`); **reveal_top_to_bottom_order**
(Stomping Slabs: odsłoń 7, ułóż w kolejności, resztę na spód, named
„Stomping Slabs" deal 7); **modal upkeep trigger** (Etherwrought Page:
3 tryby — gain 2 life / surveil 1 / opp loses 1 life) + nowa kolejka
`pendingModalTrigger` i komenda `resolve_modal_choice`; nowe typy celów
w `triggerTargetCandidates`: `creature_with_power_at_least {min:5}`,
`nonland_permanent`, `land_you_control`. Nowe kolejki pending (4),
komendy resolve_* (4), zdarzenia (11); 1 nowy token (`token_knight` 2/2
biały Knight vigilance; `token_soldier` i `token_zombie` re-używane
z wcześniejszych batchy). 4 nowe ścieżki w `tryFire` (proliferate,
reveal_order, modal_trigger, damage_target).

**Naprawy root cause (AGENTS.md — nie maskujemy):**
- `effects.js`: literówka `pendingDamageTargets` → `pendingDamageTarget`
  (commit `f786955`); kolejka w `game-state.js` bez 's' — efekt
  `damage_to_target` z `requiresTarget` gubił kandydatów. Wykryte przez
  test Stomping Slabs.
- `identity.js`: dodany parametr `name` (commit `f786955`); `addObject`
  przekazywał `name` do `createGameObject` (testy z named biblioteką).
- `game-state.js`: filtr tokenów w `accepted` zmieniony z `o.name != null`
  na `o.cardId.startsWith('token_')` (CR 704.5d — tokeny po prefiksie
  cardId, nie po `name`).

**Testy.** Nowe: `test/engine-batch22.test.js` (engine: 4 nowe efekty +
4 kolejki), `test/real-cards-batch22-first.test.js` (4: Thistledown
untap, Etherwrought modal × 3, Stomping reveal+reorder+named damage),
`test/real-cards-batch22-second.test.js` (4: Courage +1/+1+proliferate,
Selesnya Pump+Token, Wormfang ETB/LTB ping-pong) + helper
`resolveStack(state)` do rozstrzygania stosu z pełnymi rundami passów,
`test/real-cards-batch22-third.test.js` (4: Raise 2× Soldier, Cellar
mill_from_bottom+token, Healer ETB gain life, Enter cant_be_blocked+draw);
`test/art-ids-tool.test.js` `withArt.length === 148` (138 → 148).

**Plan sesji:** `docs/plans/PLAN_2026-08-08-batch22-cards.md` (253 linii,
szczegóły mechanik, decyzje, świadome uproszczenia). Handoff:
`docs/setup/HANDOFF_2026-08-08c.md` (następna sesja: kolejka
właściciela — Batch 23 czeka).

**Benchmark.** Pełny B0 (9 talii, 50 seedów, 13 500 meczów, 0
niedokończonych) zmierzony 2026-08-08: heuristic **90.4% vs random**,
**61.8% vs aggro**, aggro **95.5% vs random**. Progi `0.78 / 0.57`
utrzymane (heuristic vs aggro 61.8% > próg 57%, heuristic vs random
90.4% > próg 78%; porównanie z M51: 90.4%→90.4% vs random, 61.7%→61.8%
vs aggro, 95.4%→95.5% aggro vs random — **tylko w górę**, dodanie
kart, nie zmiana bota). Proliferate w Courage in Crisis to jedyny
spell z proliferate w katalogu — bot bierze PIERWSZEGO kandydata z
oferty (deterministycznie), więc brak dodatkowych opóźnień gry.

Weryfikacja: `npm test` **1059/1059** (+20: 4 engine + 12 kart + 4
naprawa), `npm run build` 49 modułów / 1123.8 kB, `npm run benchmark`
13500 meczów / 856.7 s (~63.5 ms/mecz).

## Sesja 2026-08-08 — M53 Batch 23: 10 realnych kart (PR #35, 2026-08-08)

Dziesięć realnych kart z kolejki właściciela (handoff `HANDOFF_2026-08-08e.md`): **Vandalize** (DTK), **Expunge** (USG), **Shiv's Embrace** (M11), **Deepwood Denizen** (MH2), **Welder Automaton** (AER), **Feedback** (5ED), **Vow of Wildness** (CMR), **Greater Tanuki** (NEO), **Scorch Spitter** (M20), **Turn the Tide** (MBS). Wszystkie `supported` w 100% Oracle (ADR 0010 §2a — 10 plików Scryfall pobranych przed kodowaniem, artId/plan ze słownika). Procedura sesji: fix B23 UI (2 bugi modalu) jako pierwszy commit PR #35, potem plan → silnik → 3 feat (3+3+4 karty) → docs (M53 + HANDOFF).

**Nowe generyczne mechaniki engine (ADR 0002):** `land`/`enchantment`/`nonartifact_nonblack_creature` target, `enchantedPermanentControllerUpkeep` (Feedback), `damage_defending_player` (Scorch), `damage_enchanted_permanent_controller` (Feedback), `pump_enchanted_creature` (Shiv's), `buff_opponents_creatures` (Turn the Tide, re-use Hysterical Blindness), `channel` z ręki (Greater Tanuki, jak cycling), `costReduction` per +1/+1 (Deepwood), `cantAttackYou` (Vow).

**Fix B23 UI (początek sesji):** `closeBotMoveModalPause` → `rerender()` + `rerender()` wstrzykuje `▶ Wznów grę bota` gdy `botPausePending`; `openCardFullscreenByCardId` nie chowa `bot-move` (fullscreen nad modalem), `closeCardFullscreen` przywraca modal.

Weryfikacja: `npm test` **1084/1084** (+17: 7 engine-batch23 + 10 kart + 3 art-ids), `npm run build` 49 modułów / 1172.0 kB, `withArt.length === 158` (148→158).

## Sesja 2026-08-08 — M54 Audyt Batch 23 + UX kosztów many (PR `arena/019fe265-mtg`, 2026-08-08)

Dwa tematy właściciela: (A) audyt implementacji Batch 23 („nie mam zaufania
do agenta, który to kodował") i (B) UX — koszty many łamiące się w HTML.

**Audyt A (runtime, nie asercje definicji):** skrypt end-to-end przez
cast/activate/triggers → 8/11 przed fixami. Trzy realne bugi silnika, które
przeszły przez testy sprawdzające tylko istnienie pól:

1. **Channel (Greater Tanuki)** — `activateChannel` w scope `activateCycling`,
   wołana z `activateAbility` → `ReferenceError` przy aktywacji; do tego
   nieistniejący event `card_searched` (usunięty). Fix: funkcja modułowa.
2. **Feedback („Enchant enchantment")** — nie do rzucenia: 4 miejsca
   (castAuraSpell, resolveAuraSpell, attachAuraToCreature, SBA
   removeIllegalAttachments) wymagały stwora. Fix: wspólny `isLegalAuraHost`.
3. **Vandalize („Destroy both")** — `destroy_permanent` ignorował
   `targetIndex` → land nigdy nie ginął. Fix: konwencja
   `targets[effect.targetIndex ?? 0]`.

**UX B:** koszty many jako niełamliwe grupy — `manaSymbolsHtml` owija
sekwencję ikon w `.ms-group` (inline-block + nowrap); poprzednia łatka M51
„C" zapobiegała łamaniu WEWNĄTRZ ikony, nie MIĘDZY ikonami. Bez zamiany
ikon na litery.

**Korekta danych (uwagi właściciela):** sety Greater Tanuki (NEO) i Turn the
Tide (MBS) pozostają zgodne z listą właściciela — poprawiono pliki Scryfall
i imageUri do właściwych wydruków (NEO #189 / MBS #35), zamiast zmieniać sety.

**Testy.** `test/audit-batch23-fixes.test.js` (12 behawioralnych),
`test/mana-icons-group.test.js` (7), `test/attachment.test.js` rozszerzony
(11). Weryfikacja: `npm test` **1104/1104**, `npm run build` 49 modułów /
1175.5 kB. Plan: `docs/plans/PLAN_2026-08-08-audit-b23-mana-ux.md`.
Handoff: `docs/setup/HANDOFF_2026-08-08f.md`.

## Sesja 2026-08-08 — M55 Batch 24: 10 realnych kart (PR `arena/019fe265-mtg`, 2026-08-08)

Kolejka właściciela: Faceless Butcher (TOR), Unbreakable Bond (IKO),
Spinewoods Paladin (OTJ), Tome Scour (M11), Goblin Battle Jester (M13),
Brawler's Plate (M15), Glitch Ghost Surveyor (DFT), Mystic Sanctuary (ELD),
Willbender (DD2), Scion Summoner (OGW). Scryfall pobrane z parametrem set=
(lekcja M54), artId ze słownika.

**Nowe mechaniki:** plot dla permanentów (pierwsza karta z plotem), linked
exile stwora, lifelink counter (CR 122.1b), speed/start-your-engines/max
speed (DFT), turned_face_up + redirect celu czaru (Willbender), sanctuary
lands. **Root cause:** warunki triggerów z kontekstem zdarzenia przy decyzji
celu, detach załączników przy usuwaniu tokenów i osieroconych aur, zachowanie
oryginalnych abilities przy face-down (morph).

**Karty w taliach:** red +Goblin Battle Jester/Brawler's Plate, black
+Faceless Butcher/Unbreakable Bond, green +Spinewoods Paladin/Scion Summoner,
graveyard +Tome Scour, azorius +Willbender/Glitch Ghost Surveyor/Mystic
Sanctuary. Weryfikacja: `npm test` **1121/1121**, build 49/1219.6 kB,
benchmark 2160 meczów 0 crashy. Plan:
`docs/plans/PLAN_2026-08-08-batch24-cards.md`.

## Sesja 2026-08-08 — M56 srebrna odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Drugi przegląd mechanik (po brązowej odznace) wykrył 5 naruszeń reguł:
(1) goad wygasał w cleanup zamiast trwać do następnej tury goadującego
(CR 701.38c), (2) aury ignorowały hexproof (CR 702.11b), (3) lifelink nie
działał na obrażeniach niecombat (CR 702.15), (4) Curse of the Pierced Heart
ignorował tarcze prewencji (CR 615), (5) damage_dealt niósł kwotę przed
prewencją — delirium przeszacowywało obrażenia (CR 119.3). Wspólny helper
`dealNonCombatDamage` (prewencja tarcz+filtr, event z kwotą zadaną, infect,
lifelink) + `goadedUntilTurn` + `auraTargetHexproof`. Weryfikacja:
`npm test` **1126/1126**, build 49/1221.5 kB, benchmark 1080 meczów 0 crashy.
Testy: `test/engine-silver-badge.test.js`.

## Sesja 2026-08-08 — M57 złota odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Trzeci przegląd mechanik: (1) limit ręki w cleanup tylko dla aktywnego gracza
(CR 514.1), (2) combat damage_dealt z kwotą po prewencji + brak triggerów przy
0 zadanych (CR 119.3), (3) buffy „do końca tury" jako efekty ciągłe —
`untilEndOfTurnBuffs` obejmują stwory wchodzące później (CR 611.2c),
(4) opcjonalne płatności triggerów liczą manę produkowalną (canPayTrigger),
(5) dobranie z pustej biblioteki przez efekt karty kończy grę (CR 104.3c).
Weryfikacja: `npm test` **1131/1131**, build 49/1225.8 kB, benchmark 1080
meczów 0 crashy. Testy: `test/engine-gold-badge.test.js`.

## Sesja 2026-08-09 — M58 platynowa odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Czwarty przegląd mechanik (po brązowej/srebrnej/złotej odznace) — 5 naruszeń
reguł, wszystkie naprawione root-cause:

1. **CR 510.1c/702.19b** — przydział obrażeń combat (lethal/trample)
   uwzględniał prewencję: tarcze Withstand ODEJMOWANO od lethal, filtr
   „prevent all damage this turn" (Ethersworn Shieldmage) zerował lethal.
   Zasady: przy sprawdzaniu lethal IGNORUJE się efekty zmieniające faktycznie
   zadane obrażenia — trample 5/5 vs 3/3 z tarczą 2 szło na gracza 4 zamiast
   2 (bloker dostawał 0 zamiast 1 obrażenia).
2. **CR 119.3** — zdarzenia `damage_dealt` niosły kwotę PRZED prewencją w
   ścieżkach combat atakujący→bloker, bloker→atakujący oraz
   `damage_to_controller` (niespójność z konwencją złotej odznaki);
   zdarzenia `damage_prevented` trafiają teraz do strumienia wyniku komendy.
3. **CR 701.27a** — proliferate nie mógł celować w graczy ze znacznikami
   trucizny: czytał/pisał `player.counters.poison` zamiast `player.poison`
   (pole, które czytają SBA i `addPoisonCounters`).
4. **CR 401.4** — `mill_from_bottom` brał ostatni element WSPÓLNEJ listy
   biblioteki zamiast spodu biblioteki GRACZA-CELU (Cellar Door młynował
   kartę drugiego gracza po scry/mulligan-bottom pierwszego).
5. **CR 108.3/400.7** — `bounce_permanent` zwracał permanent na rękę
   DOTYCHCZASOWEGO KONTROLERA zamiast WŁAŚCICIELA (Jill, Lunar Rejection;
   `ownerId` już śledzone od Trostani).

Weryfikacja: `npm test` **1139/1139**, build 49/1228.5 kB, benchmark 1080
meczów 0 crashy (heuristic 88.1% vs random / 63.1% vs aggro — progi
0.78/0.57 utrzymane). Testy: `test/engine-platinum-badge.test.js` (8 testów);
zaktualizowany `test/engine-batch22.test.js` (proliferate: pole poison).
Plan: `docs/plans/PLAN_2026-08-09-platynowa-odznaka.md`.


## Sesja 2026-08-09 — M59 Batch 25: 10 realnych kart (PR #37, 0afe5a4)

Dziesięć realnych kart z kolejki właściciela — Scryfall pobrane **z parametrem `set=`** (lekcja M54) i `imageUri` zgodne z danymi (ADR 0010 §2a). Plan: `docs/plans/PLAN_2026-08-09-batch25-cards.md`.

**Karty:** Trestle Troll (RTR, 1/4 BG defender/reach + regenerate {1}{B}{G}), Lab Rats (STH, sorcery buyback), Anthem of Champions (FDN, anthem +1/+1), Goblin Deathraiders (ALA, 3/1 BR trample), Fertile Thicket (BFZ, land entersTapped + ETB reveal top 5), Reassembling Skeleton (M19, z grobu {1}{B} tapped), Idyllic Grange (ELD, Plains warunkowy + ETB licznik), Deadly Recluse (M10, 1/2 G reach/deathtouch), Benevolent Blessing (CMR, aura flash + choose color + protection), Springbloom Druid (MH1, ETB sacrifice-search 2 basic lands).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Buyback CR 702.26** (Lab Rats): dopłata {4}; po rozstrzygnięciu karta wraca na rękę zamiast do grobu (`pendingSpellReturnToHand`).
- **Protection from color CR 702.16** (Benevolent Blessing): `protectionFromColors`, wybór koloru `pendingColorChoice` + `resolve_color_choice`, filtry targetowania/blokowania, prewencja obrażeń, odczepianie nielegalnych załączników.
- **Conditional entersTapped** (Idyllic Grange): `minOtherPlains` — wchodzi tapped chyba że kontroler ma ≥3 inne Plains (self nie liczy).
- **ETB reveal top N** (Fertile Thicket): `pendingFertileThicket` — obejrzyj top 5, wybierz 0-1 basic land na top, reszta na bottom (opcjonalny lookup).
- **ETB sacrifice-search** (Springbloom Druid): `pendingSpringbloom` — opcjonalnie poświęć land, jeśli tak → search up to 2 basic lands tapped.
- **Static anthem `all_creatures_you_control`** (Anthem of Champions): `staticBonuses` zakres rozszerzony.

**Root cause / pułapki:** buyback wraca PO rozstrzygnięciu; protection kierunek (atakujący vs bloker); Idyllic liczy OTHER Plains; „up to two” → 0/1/2; flash aury sprawdzane jak instant.

**Testy:** `test/real-cards-batch25.test.js` (11 testów end-to-end + Scryfall sanity + determinizm), `tools/collection-art-ids.csv` +10, talie singleton zaktualizowane. **Exit:** `npm test` **1153/1153**, build **49 modułów / 1252.9 kB**, benchmark 1080 meczów 0 crashy (heuristic 87.2% vs random / 71.4% vs aggro).

## Sesja 2026-08-09 — M60 UI A–F: choice grouping + obrazy + bot modal (PR #37, 0afe5a4)

Sześć poprawek UX zgłoszonych po Batch25 (bez zmian engine poza `choiceRequestGroupKey`):

**A.** `choiceRequestGroupKey` grupuje WSZYSTKIE `resolve_*` (nie tylko `resolve_trigger_target`) — modal pokazuje „wybierz cel / poświęć / etc.” zamiast losowej nazwy wariantu.
**B.** Klik obrazu karty w menu kontekstowym otwiera fullscreen.
**C.** 6 poprawionych `imageUri`: Wormfang Newt, Courage in Crisis, Enter the Enigma, Healer of the Glade, Raise the Alarm, Selesnya Charm — zgodne ze Scryfall.
**D.** Modal „Ruch przeciwnika” filtrowany flagą `isBotAdvancing` — ETB ludzich czarów nie trafia do listy bota (`noteBotMove`).
**E.** Badge aury/equipment pokazują nazwę gospodarza (`Aura → Host`).
**F.** ETB Kor Cartographer (i wszystkie `resolve_trigger_target`) grupowane do modala wyboru zamiast surowych nazw funkcji.

Weryfikacja: `npm test` **1153/1153**, build **49 modułów / 1259.2 kB**, benchmark 1080 meczów 0 crashy.

## Sesja 2026-08-09 — M61 B2-w2 lookahead infra (PR #37, 0afe5a4, domyślnie OFF)

Infrastruktura lookahead bota (B2) — wyłączona domyślnie (~4× wolniej), włączana `createHeuristicBot({ lookahead: 1 })`:

1. **evalView:** jakość stwora (keywords: flying/deathtouch/lifelink/trample/vigilance/menace/first_strike), evasion power, presja library ≤5, skalowanie przewagi życia.
2. **simpleChoice polityka przeciwnika:** gra landy, rzuca stwory, blokuje jeśli zabija, rozstrzyga decyzje pending — realistyczniej niż pełny greedy.
3. **LOOKAHEAD_EVAL_THRESHOLD** 2 → 1.
4. **Wiring:** `makeSimulate(state)` przekazywane jako `helpers.simulate` do `bot.chooseCommand` (wcześniej brak — lookahead nigdy nie był wołany).

Benchmark z lookahead **włączonym** (2 seedy, 540 gier vs random/aggro): vs random **84.0%** (+5.0 p.p. vs 79.0% bez), vs aggro **80.0%** (+34 p.p. vs 46.0% bez — poprzedni simple greedy blokował optymalnie i psuł ataki). Domyślnie OFF: pełny B0 1080 meczów **87.2%/71.4%** (progi 0.78/0.57).

## Sesja 2026-08-09 — M62 brązowa odznaka po Batch25: 5 błędów vs MtG (PR #37, 0afe5a4)

Drugi przegląd po Batch25 (brąz):

1. **CR 702.16a — protection a obrażenia (DEBT D):** `markDamage` nie sprawdzał `isDamagePreventedByProtection` — obrażenia od chronionego koloru przechodziły. Fix: sprawdzenie kolorów źródła vs `effectiveProtectionFromColors`.
2. **CR 702.16b — protection a odczepianie:** `removeIllegalAttachments` nie odczepiał istniejących aur/equipment chronionego koloru (wyjątek „your own” z Benevolent błędnie uogólniony). Fix: odczepia wszystkie, `effectiveProtectionFromColors` przeniesione z `permanents.js` do `attachments.js` (cykl importów).
3. **CR 514.3a — cleanup bez pętli:** gdy triggery/SBA odpalą w cleanup, dodatkowy cleanup nie następuje — udokumentowane jako jawne ograniczenie (brak karty w katalogu tego potrzebującej).
4. **declareBlockers a protection:** `canBlock` tylko w ofercie UI, brak walidacji w `execute`. Fix: walidacja w `declareBlockers`.
5. **Fertile Thicket „you may look”:** nie było opcjonalne — teraz gracz może zrezygnować (skip) lub obejrzeć i wybrać 0/1.

Weryfikacja: `npm test` **1153/1153**, build **50 modułów / 1268.3 kB** (50 przez rozdział `attachments.js`), benchmark 1080 0 crashy.

## Sesja 2026-08-09 — M63 srebrna odznaka po Batch25: 5 błędów vs MtG (PR #37, 0afe5a4)

Trzeci przegląd po Batch25 (srebro):

1. **CR 702.136 — plot „later turn”:** brak kontroli `plottedAtTurn` — plotted karta dała się rzucić w tej samej turze. Fix: `plottedAtTurn` + `state.turn.number > plottedAtTurn` w `castPermanent`/`legalCommands`.
2. **CR 702.16a — protection w combat:** `markDamage` wołane bez `sourceId`, więc ochrona nie blokowała obrażeń atakujący→bloker i bloker→atakujący. Fix: `sourceId` przekazywane.
3. **CR 702.16a — protection blocking kierunek:** `canBlock` + `declareBlockers` sprawdzały ochronę BLOKERA vs kolory atakującego — odwrotnie względem CR („can't be blocked by [quality] creatures” — sprawdza się ochronę ATAKUJĄCEGO vs kolory blokera). Fix: `attackerProt` vs `blockerColors`.
4. **CR 702.16a — protection w non-combat:** `dealNonCombatDamage` nie sprawdzał ochrony. Fix: check przed filtrem.
5. **CR 702.16b — protection odczepianie własnych:** wyjątek „nie zdejmuj własnych aur/equipment” dotyczył tylko Benevolent Blessing, nie ogólnej reguły. Fix: `removeIllegalAttachments` zdejmuje WSZYSTKIE załączniki chronionego koloru.

Weryfikacja: `npm test` **1153/1153**, build **50 modułów / 1269.6 kB**, benchmark 1080 0 crashy (87.2%/71.4%).



## Sesja 2026-08-09 — M64 Batch 26: 10 realnych kart (PR `arena/019fe7bf-mtg`)

Dziesięć realnych kart z kolejki właściciela — Scryfall pobrane **z parametrem `set=`** (lekcja M54) i `imageUri` zgodne z danymi (ADR 0010 §2a). Plan: `docs/plans/PLAN_2026-08-09-batch26-cards.md`.

**Karty:** Kabira Vindicator (ROE, 2/4 W level up {2}{W} sorcery, LEVEL 2-4 3/6 other +1/+1, LEVEL 5+ 4/8 other +2/+2), Great Furnace (MRD, artifact land {T}: Add {R}), Bomat Bazaar Barge (KLD, 5/5 Vehicle ETB draw + Crew 3), Index (APC, sorcery {U} look top 5 any order), Bladed Sentinel (MBS, 2/4 {W}: vigilance), Might of the Masses (2XM, instant {G} pump +1/+1 per creature you control), Magic Damper (FIN, instant {U} +1/+1 hexproof untap), Hecteyes (FIN, 1/1 ETB each opponent discards 1), Carapace Forger (SOM, 2/2 metalcraft +2/+2), Lurking Green Dragon (CLB, 4/4 flying cant attack unless defender has flying).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Level Up CR 702.86** (Kabira): activated {2}{W} sorcery dodaje level counter, static progi minLevel/maxLevel (2-4 i 5+) modyfikują self P/T (+1/+2 i +2/+4) i anthem other_creatures (+1/+1 / +2/+2) via `staticConditionHolds` + `permanents.effectivePower`.
- **Index** (APC): `pendingIndex` + `resolve_index_choice` (permutacja top 5, blokuje jak scry, kończy `pendingSpell`).
- **pump_by_creature_count** (Might): +1/+1 per creature you control (liczone w effects).
- **discard_each_opponent** (Hecteyes): ETB każdy przeciwnik odrzuca 1 (pendingDiscard, 1v1 jeden).
- **Attack restriction** (Lurking): `cantAttackUnlessDefenderHasFlying` (static + `isLegalAttacker` check defender's flying via `effectiveKeywords`).
- **Artifact land** (Great Furnace): `MANA_SOURCE_MAP` R + type Artifact Land (liczy się dla metalcraft).

**Talie:** singleton 9 talii — azorius +Kabira/Bladed, green +Might/Carapace/Lurking, black +Hecteyes, red +Great Furnace/Bomat (16 landów: 15 Mountains + Great Furnace), spellslinger +Index/Magic Damper (hunter seeds przelosowane). **Testy:** `test/real-cards-batch26.test.js` (14 testów), aktualizacje `art-ids` 178→188, `repo-decks` round-trip + red 45→47, `table-session` hunter seeds (endure 1→2, delirium 19→1, graveyard-top 2→5). **Exit:** `npm test` **1167/1167**, build **50 modułów / 1284.3 kB**, benchmark 1080 0 crashy (progi 0.78/0.57).

## Sesja 2026-08-09 — M65 audyt Batchu 26: 4 błędy vs MtG + crash pełnego B0 (PR `arena/019fe7ec-mtg`)

Na zlecenie właściciela („karty mają być w 100% zgodne z MtG bez uproszczeń i ograniczeń")
przeprowadzono audyt Batchu 26 sondą behawioralną (nie testami definicyjnymi — wzorzec
M54). Plan: `docs/plans/PLAN_2026-08-09-audyt-b26.md`.

1. **Crew = instant (CR 701.36)** — Bomat Bazaar Barge (B26) i Irontread Crusher (B21)
   miały `timing: 'sorcery'` bez „Activate only as a sorcery" w Oracle; crew nie działało
   w turze przeciwnika ani w odpowiedzi na czar. Fix: domyślne 'instant'.
2. **Kolorowe koszty zdolności (CR 118.2)** — zagnieżdżone `colors: [['W']]` w 4
   definicjach (Kabira, Bladed, Trestle, Skeleton) łamały dopasowanie pipów → zdolności
   NIGDY nie były oferowane ani aktywowalne (martwe mechaniki na kartach `supported`).
   Fix: płaskie `colors: ['W']` / `['B','G']` (konwencja M45).
3. **Index (APC)** — reorder działał w engine, ale gracz-człowiek nie widział top 5
   (brak `pendingIndex` w PlayerView) ani nie mógł przestawić kart. Fix: pendingIndex
   w widoku (FoW jak scry), wizard kolejności w UI, etykiety i polskie logi.
4. **Face-down bez keywordów (CR 708.2)** — zakryty stwór (morph) zachowywał keywordy
   (np. flying) — błędnie odblokowywał Lurking Green Dragon i blokował flyery.
   Fix: `effectiveKeywords` → [] dla faceDown.
5. **Crash pełnego B0 (pre-existing)** — transform wilkołaka na LKI stub (źródło umarło
   na stosie triggera) crashował „Obiekt bez transformTo". Fix: no-op dla źródła poza
   bitwiskiem (CR 608.2b).

**Weryfikacja:** `npm test` **1182/1182**, build **50 modułów / 1289.5 kB**, **pełne B0
13500 meczów / 0 crashy** — heuristic **92.0% vs random, 65.5% vs aggro**, aggro 94.2%
vs random (progi 0.78/0.57 utrzymane; wzrost vs 90.4%/61.8% po M64 dzięki działającym
zdolnościom kolorowym/crew). Testy: `test/audit-batch26-fixes.test.js` (13).

## Sesja 2026-08-09 — M66 UX walki i many: uwagi właściciela A/B/C/D/R (PR `arena/019fe7ec-mtg`)

Na uwagi z testów na iPadzie + 2 błędy wykryte rozpoznaniem (plan
`docs/plans/PLAN_2026-08-09-ux-walka-i-many.md`):

- **A** — spacja przed `)` w kosztach akcji (flex gap na `.action` z ikonami many) → `gap:0` + margin na diament.
- **A2** — MANA_COSTS kończyło się na Batchu 24 (39 kart): walidacja kolorów pominięta (Might {G} za {U}!) + etykiety bez ikon → uzupełnione ze Scryfall + strażnik.
- **B** — atakujący/blokujący: koniec list kombinacji — wizard z przełącznikami (goad/menace/cantBlockAlone pilnowane).
- **C** — log walki gubił nazwy (`?`) — zdarzenia z cardId (LKI); poprawione mapowanie blokerów.
- **D** — pojedynczy bloker dostaje pełną moc (3/3 vs 1/1 = 3, nie 1).
- **R** — rozdzielanie obrażeń przy wielu blokerach/trample = decyzja gracza (`pendingDamageAssignment`, 1 wariant dla botów, wizard bez kombinacji).
- **Fixy B0** — kolejność pending (triggery przed przydziałem obrażeń), `remove_counter` jako efekt = no-op przy braku licznika (Kappa ×2).

**Weryfikacja:** `npm test` **1197/1197**, build 50 modułów / 1317.2 kB, **pełne B0
13500 meczów / 0 crashy** — heuristic **91.7% vs random, 65.6% vs aggro**, aggro
93.7% (progi 0.78/0.57 utrzymane). Testy: `test/audit-batch26-fixes.test.js` (23),
`test/choice-request-ui.test.js` (wizardy), `test/card-data.test.js` (strażnik).

## Sesja 2026-08-09 — M67 Batch 27: 10 realnych kart (PR `arena/019fe7ec-mtg`)

Kolejka właściciela: Civilized Scholar // Homicidal Brute (ISD DFC),
Battle-Rattle Shaman (M21), Jeskai Devotee (TDM), High Stride (BLB),
Inspiration (8ED), Minotaur Abomination (M14), Guildsworn Prowler (CLB),
Giant Spider (M19), Scroll Thief (M13), Force Away (KTK). Scryfall z `set=`
przez fetch_page (api zablokowane), artId/plan ze słownika, MANA_COSTS
uzupełnione (strażnik M66).

Nowe mechaniki: **draw_then_discard z transformem** (Scholar — odrzucenie
stwora → untap+transform na Homicidal Brute), **didntAttackThisTurn**
(Homicidal Brute end step), **draw_cards applyTo target** (Inspiration),
**dies „wasn't blocking"** (Guildsworn — LKI wasBlocking w extra),
**ferocious draw/discard** (Force Away — pendingOptionalDraw tak/nie),
**add_mana z kolorami** (Jeskai {1}: add U/R/W once). Reuse:
beginning_of_combat+target, flurry, reach, combat_damage_to_player.

Talie: spellslinger +5, red +1, black +2, green +2. Testy: 16 behawioralnych
(`test/real-cards-batch27.test.js`), hunter seeds przelosowane.
**Weryfikacja:** `npm test` **1213/1213**, build 50 modułów / 1336.1 kB,
**pełne B0 13500 / 0 crashy** — heuristic 63.1% vs aggro / 92.3% vs random
(progi 0.78/0.57 utrzymane).

## Sesja 2026-08-10 — M68 daybound/nightbound: globalny znacznik dnia/nocy (PR `arena/019fe7ec-mtg`)

Na zgłoszenie właściciela („czy daybound jest w engine? globalne mechanizmy spójne"):
- **Inicjatywa + Lochy już były** (M24) — globalna karta The Undercity na stole
  (img ze Scryfall), znacznik inicjatywy, pokoje per gracz.
- **Daybound/nightbound dodane (CR 708.9)**: `state.dayNight` (globalny znacznik jak
  inicjatywa), `setDayNight` transformuje daybound↔nightbound in-place, wyzwalacze
  (wejście daybound → dzień; rzut czaru przy daybound na stole → noc; upkeep aktywnego
  bez czaru w jego poprzedniej turze → dzień), wejście nightbound w nocy.
- **Karta Day//Night na stole** (img ze Scryfall TVOW 21, front/back wg designation) —
  spójna z lochami (renderDayNight).
- Civilized Scholar to zwykły transform DFC (ISD), NIE daybound — nietknięty przez
  day/night (test).
- Testy: `test/daybound-nightbound.test.js` (9, syntetyczne); renderDayNight w table-ui.
- **Weryfikacja:** `npm test` **1223/1223**, build 50 modułów / 1343.2 kB, benchmark
  1080 0 crashy. Mechanika generyczna — realne karty daybound wejdą z przyszłymi batchami.

## Sesja 2026-08-10 — M69 Batch 28: 9 realnych kart (PR `arena/019fe7ec-mtg`)

Kolejka właściciela: Silumgar Butcher (DTK), Relic Robber (ZNR), Flurry of Wings
(ARB), Expose to Daylight (RNA), Etherium Abomination (ARB), Awaken the Bear (KTK),
Security Rhox (SNC), Dreams of Steel and Oil (BRO), Tenth District Veteran (RNA).
**Moonscarred Werewolf zostaje tyłem DFC (limited)** — decyzja właściciela (a):
klasyczny transform upkeep i day/night to osobne mechaniki MtG.

Nowe mechaniki: **Exploit** (opcjonalne poświęcenie przy wejściu + trigger
„exploits" z celem), **Unearth** (z grobu z haste, exile na end step i przy
odejściu), **koszt alternatywny ze Skarbów** (Security Rhox — tylko mana ze
Skarbów), **reveal + wybory** (Dreams — ręka i grób, obowiązkowe), **token u
ofiary** (Relic Robber — Goblin Construct cantBlock + upkeep damage), **tokeny
wg liczby atakujących** (Flurry), cele czarów artifact_or_enchantment i player
opponent. Fix: transfer_counters_on_dies no-op przy celu poza bitwiskiem
(CR 608.2b).

Talie: black +3, red +1, green +2, azorius +2, tokens +1. Testy: 13 behawioralnych
(`test/real-cards-batch28.test.js`), hunter seeds przelosowane.
**Weryfikacja:** `npm test` **1236/1236**, build 50 modułów / 1375.7 kB,
**pełne B0 13500 / 0 crashy** (heuristic 78.6% ogółem, 58.3% vs aggro — progi
0.78/0.57 utrzymane).

## Sesja 2026-08-10 — M70: UX wyborów i etykiet + Idyllic Grange entersTapped (PR #40 `arena/019febbd-mtg`)

Uwagi właściciela z testów na iPhonie (Pages, screenshoty): generyczne etykiety
grup wyborów + surowy HTML many w modalu aury (A), czarne nazwy kart na ciemnych
chipach Surveil (B), Idyllic Grange nietapnięta przy <3 innych Plains (C), etykieta
akcji z kosztem many łamana na 3 kolumny (D).

Engine (C, sonda Batchu 25): `idyllic-grange` dostała brakujące `entersTapped:
true` obok warunku; trigger countera ożywiony (`enters` → `enter_battlefield`,
`requiresTarget` wewnątrz triggera). Ten sam martwy event `'enters'` naprawiony
w `fertile-thicket` i `springbloom-druid`; Fertile ogląda wierzch WŁASNEJ
biblioteki (CR 401.4, filtr kontrolera na wspólnej liście) z permutacyjnym
`bottomOrder`; Springbloom „up to two" to dwie decyzje gracza (`queueSearchChoice`
na top-level effects.js + `chain` w resolve_search_choice). Boty aggro/heuristic
nauczone `resolve_fertile_thicket` / `resolve_springbloom`.

UI: przyciski grup opisują CO wybieramy („Wybierz: Mulligan (2 opcje)", „Aura:
Benevolent Blessing (3 opcje)"), odmiana opcja/opcje/opcji, nagłówek modala =
ten sam opis; opcje modala przez innerHTML (ikony many); etykieta akcji w jednym
`span.action-label` (koniec kolumn w flexie); `.look-wizard-card` jasne.

Testy: batch25-etb-enters-fix (10 behawioralnych + 2 strażniki registry),
choice-request-ui (etykiety/innerHTML/intro), table-ui (jeden span.action-label),
look-wizard-contrast. **Weryfikacja:** `npm test` **1255/1255**, build 50 modułów /
1385.2 kB, quick B0 1080 0 crashy (heuristic 79.2% ogółem; 61.4% vs aggro / 96.9% vs random), **pełne B0 13500 0 crashy (heuristic 78.6% ogółem; 63.4% vs aggro / 93.8% vs random)** — progi 0.78/0.57
utrzymane.


## Sesja 2026-08-11 — M71: srebrna odznaka — 4 twarde błędy vs CR + zgłoszenia A–D (PR `arena/019fed61-mtg`)

Łowy błędów jak Sherlock (metoda RED→GREEN, strażniki formy, nie definicji).
Plan: `docs/plans/PLAN_2026-08-11-lowy-srebne-odznaka.md`.

**Znalezione i naprawione błędy vs CR:**
1. **CR 510.4/510.5 (combat)** — `resolveCombatDamage` używał `startPass =
   resume.pass` (boolean) jako INDEKSU `passes=[true,false]`; `passes[true]`=
   `passes[1]`=false pomijało przebieg first strike przy wznowieniu decyzji
   rozdzielania (first/double strike z trample lub wieloma blokerami nie
   zadawało), a wznawianie przebiegu zwykłego ponownie rozdawało obrażenia
   niezablokowanych atakujących (**objaw D: „walka rozstrzygnęła się dwukrotnie"**).
   Fix: numeryczny startIndex (true→0, false→1).
2. **CR 702.16d+702.15 (combat)** — lifelink/deathtouch liczyły `dealt` SPRZED
   prewencji protection w obu ścieżkach combat; kontroler źródła z lifelink
   zyskiwał życie za zapobiegnięte obrażenia (osiągalne: aura z flash
   Benevolent Blessing po deklaracji bloków). Fix: kwota po prewencji protection.
3. **CR 702.16b (celowanie)** — check protection-celowania w `validateTargets`
   brał kolory GRACZA (zawsze puste) → martwy; czar/zdolność źródła
   chronionego koloru mógł celować w chronionego permanentu. Fix: `sourceColors`
   (kolory źródła) przez wszystkie call-site validateTargets/collectLegalTargets.
4. **CR 702/704 (log)** — `creature_destroyed` nie niósł `cardId`; log walki
   pokazywał **„? ginie"** (objaw C). Fix: cardId w evencie + render przez
   nameOf (jak permanent_destroyed w M70).

**Zgłoszenia właściciela A–D z testów (naprawione):**
- **A (UI)** — karta Undercity (inicjatywa) nie dała się otworzyć na pełnym
  ekranie. Fix: `renderUndercity` klikalna + `openUndercityFullscreen()` w main.js
  (renderCardFullscreen printu lochu).
- **B (bot)** — boty „skipowały szukanie" Secret Entrance (Undercity, pokój 1):
  `resolve_search_choice` miał domyślną punktację 0, a rezygnacja (`found:null`)
  jest pierwszą ofertą. Fix: heuristic `case 'resolve_search_choice'` (znajdź >
  fail-to-find, land premiowany) + aggro (found != null).
- **C (log)** — patrz bug 4 wyżej.
- **D (engine)** — patrz bug 1 wyżej (ten sam root cause co first-strike resume).

Nowe testy: `test/bug-hunt-2026-08-11.test.js` (1a–1c, 2a–2b, 3, 4, 5, 6, 7) +
`table-ui.test.js` (renderUndercity klik). Po zmianie zachowania bota hunter seed
delirium w table-session przelosowany 25→48.

**Weryfikacja:** `npm test` **1292/1292**, build 50 modułów / 1402.0 kB,
quick B0 1080 **0 crashy** (heuristic 74.3% ogółem; 53.6% vs aggro / 95.0% vs random),
pełne B0 13500 (w toku — wynik w opisie PR).


## Sesja 2026-08-11 — M72: Batch 29 (10 kart) + generyczne rozdzielanie obrażeń (PR `arena/019fed61-mtg`)

Kolejka właściciela (plan `docs/plans/PLAN_2026-08-11-batch29-cards.md`). Scryfall
z `set=` przez fetch_page; artId/plan ze słownika; MANA_COSTS 200→210.

**Karty:** Mournful Zombie (APC), Necrosquito (ONE), Curiosity (ISD), Veiled
Ascension (MKC), Angelic Benediction (ALA), Frontline War-Rager (EOE), Lash of the
Balrog (LTR), Fireball (JVC), Spread the Sickness (MBS), Warmaker Gunship (EOE).

**Nowe mechaniki engine (generyczne):** licznik oil (P/T z liczników, dies trigger),
licznik flying (CR 122.1b), trigger aury „deals damage to opponent", exalted +
attacks_alone, cloak (face-down 2/2 z biblioteki), sacrifice-or-pay (Lash),
end_step intervening-if tapped count, station + ETB damage wg artefaktów.

**Generyczne rozdzielanie obrażeń niecombat (CR 119.4):** `pendingDamageDistribution`
+ `resolve_damage_distribution` — gracz rozdziela X między cele (każdemu tyle, ile
chce; suma <= total). `queueDamageDistribution` (effects.js) — reużywalne dla
wszystkich przyszłych czarów/zdolności. Fireball: wybór X + celów przy rzucie, czar
czeka na stosie do decyzji; wizard UI, default u botów = równy podział.

**FIX deadlocka benchmarku:** `pendingOptionalTrigger` (Curiosity may-draw, Veiled
cloak) jest PRZED celami triggerów w firstPendingDecisionPlayerId i enumeracji
(execute źródłem prawdy) — koniec `optional_trigger_unresolved` przy jednoczesnych
decyzjach.

**Weryfikacja:** `npm test` **1308/1308**, build 50 modułów / ~1443.6 kB, quick B0
1080 **0 crashy**, **pełne B0 13500 0 crashy (heuristic 78.4% ogółem; 62.7% vs aggro /
94.1% vs random)** — brak regresji vs M71; progi 0.78/0.57 utrzymane.

## Sesja 2026-08-11 — M73: audyt PR #41 (M71+M72+M72b) — 9 błędów naprawionych (PR #42 `arena/019ff0e1-mtg`)

Pełny audyt behawioralny ostatniego scalonego PR na zlecenie właściciela
(„nie ufam jakości poprzedniego agenta — sprawdź i popraw"). Sonda end-to-end na
żywym engine (wzorzec M54/M65 — testy zachowania, nie definicji). Plan:
`docs/plans/PLAN_2026-08-11-audyt-pr41.md`. **9 błędów naprawionych u root
cause (RED→GREEN), 0 maskowania:**

1. **Fireball (JVC) — podział obrażeń niezgodny z Oracle.** Oracle: „deals X
   damage divided evenly, rounded down" + „{1} more for each target beyond the
   first". Było: gracz rozdzielał X dowolnie (wizard + decyzja
   `resolve_damage_distribution`), a default bota rozdysponowywał resztę
   (wg Oracle reszta PRZEPADA). Jest: deterministyczny floor(X/n), reszta
   przepada; 0 celów i X=0 legalne („any number of targets"); protection od
   koloru czaru w walidacji; usunięta cała machineria free-distribution
   (pendingDamageDistribution, resolve_damage_distribution, wizard, wpisy
   protokołu/botów/UI) — jedyna karta używająca mechanizmu to Fireball.
2. **Angelic Benediction „attacks alone" — brak filtra kontrolera.** Cudza
   Benediction pompowała mojego stwora i dawała przeciwnikowi „you may tap"
   przy MOIM samotnym ataku. Fix: tryFire tylko gdy kontroler źródła ==
   kontroler atakującego (CR 702.82).
3. **Curiosity — tylko combat damage.** Oracle: „deals damage" (każde). Fix:
   wspólny hook combat + niecombat (`enchanted_creature_damage_to_opponent`).
4. **Veiled Ascension — flying counter tylko przy cloak.** Statyczna zdolność
   „face-down creatures you control enter with a flying counter" nie działała
   dla morph (Monastery Flock w azorius). Fix: wspólny helper
   `maybeAddFaceDownFlyingCounter` (cloak + resolvePermanentSpell) ORAZ
   `effectiveKeywords` dla faceDown zwraca keywordy z LICZNIKÓW (CR 122.1b;
   ruling cloak: „other effects can grant it characteristics") — licznik
   flying daje flying także zakrytemu; drukowane keywordy nadal zakryte
   (CR 708.2, testy D1–D3 zielone).
5. **Oil — nadmierna generalizacja.** `counterDelta` dodawał oil do P/T
   WSZĘDZIE; sam licznik nie daje P/T (daje go zdolność Necrosquito). Fix:
   statyczny pump `oil_counters` w staticBonuses + zdolność na Necrosquito.
6. **Protection — luka fixu M71 w ścieżce aury.** `castAuraSpell`/`legalAuraCasts`
   sprawdzały tylko hexproof (aura koloru X mogła zaczarować stwora z
   protection od X); brak rewalidacji w `resolveAuraSpell` (gospodarz zyskał
   protection na stosie → fizzle czystej aury, bestow jako stwór CR 702.103b).
7. **D-luki: zdolności aktywowane omijały stos.** (a) brak rewalidacji celów
   przy rozstrzyganiu zdolności ze stosu (Entrancing Lyre vs stwór, którego moc
   urosła ponad X w oknie odpowiedzi → fizzle CR 608.2b); (b) **equip** był
   sorcery-speed + poza stosem — wg CR 702.6a to aktywowana zdolność INSTANT
   speed na stosie (założenie po rundzie passów, cel rewalidowany); (c)
   **cycling/channel** — odrzut to koszt (przy aktywacji), dobranie/szukanie
   przy rozstrzyganiu (przeciwnik może odpowiedzieć); (d) **ninjutsu**
   (CR 702.48a) — koszty przy aktywacji, wejście zatapnięte i atakujące przy
   rozstrzyganiu.
8. **B8 sonda mechanik M72** — Necrosquito (artefakt/„another"), Veiled ETB,
   Warmaker station: wszystkie poprawne, utrwalone testami.
9. **B9 UI M72b** — E (właściciel w modalach) i F (badge „zaczarowana: X"/
   „wyposażona: X") utrwalone testami render.

**Weryfikacja reguły priorytetu (CR 117.3c):** po rzuceniu czaru / aktywacji
zdolności rzucający ZACHOWUJE priorytet („If a player has priority when they
cast a spell, activate an ability, or take a special action, that player
receives priority afterward") — może odpowiedzieć własnym instanitem na wierzch
stosu (LIFO), zanim przeciwnik dostanie priorytet. Engine to realizuje
poprawnie; wcześniejsze zgłoszenie w tej sesji („priorytet powinien przejść
dalej wg CR 117.4") było błędem interpretacyjnym i zostało wycofane. Testy
regresyjne B10 (engine + sesja + interakcja z ptaszkiem wyciszenia).

**Weryfikacja:** `npm test` **1334/1334** (było 1310; +24 nowe testy),
build **50 modułów / 1453.2 kB**, quick B0 1080 meczów 0 crashy, pełne B0
13500 — wynik w opisie PR #42 (progi 0.78/0.57).

## Sesja 2026-08-11 — M73b: UX A/B + feature „ptaszek wyciszenia opcji" (PR #42)

Uwagi właściciela z testów + feature request (po audycie M73):

- **A. Panel górny (wskaźnik tury)** — skrócone etykiety: „T." zamiast „Tura",
  „ż." zamiast „życia", „On" zamiast „Nieprzyjaciel"; faza bez „beginning"
  (dla kroków beginning pokazywana jest sama nazwa kroku: „Untap"/„Upkeep"/
  „Dobieranie"; fazy combat/ending → „Walka"/„—"); przy braku miejsca panel
  łamie wiersz (flex-wrap + border-radius 12px zamiast nowrap-pigułki).
- **B. Nakładka karty** (`.ovl-badges`) — każda informacja (obrażenia, choroba,
  liczniki, przypięte aury/equipmenty) w OSOBNYM wierszu (flex-direction:
  column) zamiast zlewać się w jeden rząd na ilustracji.
- **Feature: ptaszek wyciszenia opcji.** Opcje rzutów/aktywacji
  (cast_permanent/cast_spell/cast_cleave/cast_escape/cast_adventure/
  cast_adventure_creature/activate_ability/plot_card) w panelu „Twoje
  działania" mają checkbox „nie przerywaj auto-passu". Zaznaczona opcja jest
  pomijana przez `hasMeaningfulDecision` — auto-pass przewija okna, w których
  jedyną sensowną komendą jest wyciszona opcja (np. zdolność poświęcenia,
  której nie użyje się przez wiele tur). Inne opcje nadal przerywają;
  odznaczenie przywraca. Klucz opcji: `commandOptionKey` (type+objectId+
  abilityIndex+targets+xValue+modeIndex+buyback+payAltCost+bestow+faceDown+...);
  zbiór wyciszeń w pamięci strony (jak inne preferencje UI); generyczne komendy
  (pass, dobranie, ląd, deklaracje walki, resolve_*) bez ptaszka. Po zmianie
  zbioru sesja przewija grę (`recheckAutoPass`), gdy okno straciło wszystkie
  nie-wyciszone decyzje.
- **Fix (crash pełnego B0):** equip rozstrzygany ze stosu rzucał, gdy sam
  sprzęt zniknął w oknie odpowiedzi (LKI stub → attachEquipmentToCreature
  rzuca). Guard: źródło musi być nadal legalnym equipment na bitwisku,
  inaczej fizzle (CR 608.2b) + test regresyjny.

Weryfikacja: `npm test` **1337/1337**, build **50 modułów / 1458.7 kB**,
pełne B0 13500 (cap 8000): **0 crashy, 0 niedokończonych** — heuristic
**79.2% ogółem (64.0% vs aggro / 94.4% vs random)**, aggro 64.7% — progi
0.78/0.57 utrzymane. Cap podniesiony 5000→8000: zdolności na stosie wydłużyły
grind-games (seed 1043 wiedzmin vs azorius kończył się deck-outem 2 tury po
capie 5000 — wzorzec M31).

## Sesja 2026-08-11 — M73c: brązowa odznaka — 5 błędów wykrytych żywym testerem stołu (PR #42)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (`tools/table-tester`):
5 partii różnymi taliami. Znalezione i naprawione (RED→GREEN, +6 testów):

1. **„efekt." jako opis triggerów/zdolności na kaflach** — `describeEffect` miał
   fallback `'efekt'`; pełna mapa polskich opisów ~70 typów efektów (kafle
   pokazują „Gdy wejdzie na bitwisko: poświęć ląd, szukaj 2 basic landów.").
2. **Surowe slugi efektów czaru** (`cant_be_regenerated_this_turn +
   destroy_permanent`) — `describeSpellEffects` używa wspólnych opisów
   („zniszcz + nie może być regenerowany"); fix znaków „+-" w pumpach.
3. **„cel: ? (Nieprzyjaciel)"** dla face-down celu (Expunge na morph) —
   `nameOfObject`/`commandLabel` zwracają „morph" dla obiektów faceDown
   (CR 708.2).
4. **„? — blokujący:"** w wizardze blokujących (face-down atakujący) —
   `objectName` zwraca „morph".
5. **Gołe „Koniec partii"** po zakończeniu — wskaźnik pokazuje
   „Koniec partii — wygrywa <gracz>".

Weryfikacja transkryptem testera: 0× „efekt.", 0× surowe slugi, 0× „cel: ?",
0× „? — blokujący"; „Stos — morph" dla zakrytego czaru. `npm test` **1347/1347**,
build **50 modułów / 1465.4 kB**.

## Sesja 2026-08-11 — M73d: srebrna odznaka — 10 błędów wykrytych żywym testerem stołu (PR #42)

Audyt „z perspektywy gracza": 10 partii różnymi taliami na prawdziwym
artefakcie (`tools/table-tester`). Naprawione (RED→GREEN, +7 testów):

1. **„efekt (undefined)"** na kaflach — puste `effect: {}` w zdolnościach
   statycznych/cyclyng (Anthem, Carapace, Kabira, Etherium Sculptor).
   Fix: opis pomija puste efekty; cyclyng/channel opisane jawnie.
2. **„: ."** — pusty opis triggera modalnego (Etherwrought Page — 3 tryby):
   `describeTriggered` obsługuje `modes`.
3. **Surowe typy celów** („cel: player"/„any_target") — `TARGET_TYPE_LABELS`.
4. **„rzuca Inspiration → cel: ?"** — cel-gracz jako „?" (log i stos): imię.
5. **„Trigger: X (you_cast_second_spell_each_turn)"** — surowe eventy
   triggerów: `TRIGGER_EVENT_LABELS` + render stosu.
6. **„aktywuje: Soulmender → cel: Soulmender"** — log „cel:" dla zdolności
   bez celu: event niesie targets tylko gdy zdolność ma cele.
7. **„zadaje 0 obrażeń"** w logu — pomijane (0 to brak obrażeń, CR 119.3).
8. **„choroba" na artefaktach/enchantmentach** — badge tylko dla stworów
   (CR 302.6).
9. **„wskazuje ? z ręki przeciwnika"** (Dreams reveal) — event niósł objectId
   zamiast cardId karty.
10. **„mieli 1 karty"** — odmiana `polishPlural` (1 kartę / 2 karty / 5 kart).

Weryfikacja transkryptem: 0× „efekt (undefined)", 0× surowe slugi celów,
0× „cel: ?", 0× bezcelowe „→ cel:", 0× „zadaje 0". `npm test` **1354/1354**,
build **50 modułów / 1471.0 kB**.

## Sesja 2026-08-11 — M74: Diamentowa odznaka — 16 błędów UX żywym testerem stołu (PR `arena/019ff280-mtg`)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (`tools/table-tester/`,
35 partii × różne talie/seedy). Wzorzec M73c/M73d/M65 (objaw z transkryptu →
naprawa u ROOT CAUSE → test regresyjny). Plan:
`docs/plans/PLAN_2026-08-11-diamentowa-odznaka.md`.

**16 błędów naprawionych (wszystkie UI/etykiety/log — bot bez zmian):**
1. Log „X zostaje skontrowany (?)" — event `spell_countered` niósł tylko
   `counteredBy` (objectId czaru-kontrującego, który znika ze `state.objects`
   po rozstrzygnięciu). Fix: LKI `counteredByCardId` w evencie + log czyta po cardId.
2. Modal clash pokazywał surowe „p1-library-N" — `PlayerView.pendingClash.cards`
   niosło objectId, a etykieta czytała jak cardId. Fix: PlayerView konwertuje na
   cardId (odsłonięte karty clash są jawne).
3. „· ·"/„· · · ·" na kaflach — zdolności STATYCZNE (pump/condition/scope) bez
   opisu renderowały pusty string; `rulesText` sklejał bez filtra. Fix:
   `describeStatic` + filtr pustych opisów (Veiled, Kabira, Ember Beast…).
4. Etykieta aktywacji dublowała cel — `describeAbility` doklejał „cel: <typ>"
   a akcja i tak „→ cel: <nazwa>". Fix: opcja `withTarget:false` dla etykiety akcji.
5. Surowe „resolve_reveal_exile_hand/grave" (Dreams of Steel and Oil). Fix:
   `commandLabel` dla obu (+ nazwa karty po `session.nameOfObject`, bo PlayerView
   chowa cardId odsłoniętej ręki).
6. „(koszt )" puste przy zdolnościach bez many — `abilityCostHtml` znał tylko
   mana/tap; koszty „odrzuć N/poświęć" (Plague Reaver) i brak kosztu (Crew/sac)
   dawały pusty nawias. Fix: `discardCards`/`sacrificeSelf` + pominięcie pustego.
7. Odmiana „obrażeń" wg liczby — „zadaje 1 obrażeń". Fix: helper
   `obrażenie/obrażenia/obrażeń` (1/2-4/5+) w session.js i render.js.
8. Log odrzucenia „wybiera, którą odrzuca kartę z ręki (efekt)" — nieczytelna
   gramatyka + techniczny sufiks. Fix: czytelny komunikat.
9. Surowy „source_power" w opisie buffa Jyoti. Fix: `ptAmount` dla dynamicznych P/T.
10. Brak polskich etykiet keywordów — `double_strike`, `level_up`, `persist`,
    `defender`, `infect`, `exalted`, `indestructible`, `flash`, `morph`,
    `changeling`. Fix: `KEYWORD_LABELS`.
11. Surowe „token_eldrazi_scion" — token nie był zarejestrowaną kartą (tylko
    inline w create_token). Fix: `defineCard` dla tokena (jak pozostałe tokeny).
12. Surowe „(saga_chapter)" w logu triggera (Shiva saga). Fix: `TRIGGER_EVENT_LABELS`.
13. „zyskaj 1 życia" — odmiana życia (1 → „1 życie").
14. Angielskie tryby Etherwrought Page („Life Gain/Surveil/Drain"). Fix: polskie
    nazwy trybów.
15. Niespójne etykiety załączników na nakładce ilustracji — `buildStateOverlay`
    używał „aura:/equip:", a `buildFace` „zaczarowana:/wyposażona:". Fix: spójne.
16. „Bone Splinters → cel: ?" — `spell_cast` niósł tylko objectId celu; cel
    zniknięty ze `state.objects` (token/śmierć) dawał „?". Fix: LKI
    `targetCardIds` w evencie + log czyta po cardId.

**Weryfikacja:** `npm test` **1374/1374** (+16 regresyjnych „Diament N" w
`test/table-ui.test.js`), build 50 modułów / ~1481 kB, quick B0 (2160 meczów)
**0 crashy** (heuristic ~78.8% ogółem, progi 0.78/0.57 utrzymane; bot bez zmian —
pełne B0 niewymagane). Testerem: 0× „skontrowany (?)", 0× „p1-library-N",
0× surowe slugi, 0× „· ·", 0× „(koszt )", 0× „zyskaj 1 życia", 0× „zadaje
1-4 obrażeń", 0× „→ cel: ?", Etherwrought po polsku, „zaczarowana:/wyposażona:".


## Sesja 2026-08-11 — M75: poprawki z ręcznych testów A–E (PR #44)

Po diamentowej odznace (M74) właściciel wykonał ręczne testy — 5 uwag (A–E),
wszystkie naprawione u root cause. Plan:
`docs/plans/PLAN_2026-08-11-ręczne-testowanie.md`.

- **A. Cellar Door bez ilustracji** — `imageUri` (błędny UUID Scryfall) → 404
  → syntetyczna twarz. Poprawiono UUID; dodano strażnik `imageUri` = UUID z
  `docs/cards/scryfall-*.json` dla każdej karty (test).
- **B. Ptaszek wyciszenia** — za mały obszar aktywny; klik obok rzucał
  instanta. Ptaszek w `<label class="action-ignore">` z paddingiem; klik w
  label nie propaguje do przycisku.
- **C. Wizardy walki** — pokazują „(atak, obrona)" przy każdym stwórze;
  klik w nazwę otwiera pełny ekran karty (`onOpenCard`).
- **D. Odrzucenie przy limicie ręki** — (1) gramatyka komunikatu (rozróżnienie
  „jako koszt / przy limicie ręki / efektem"); (2) „Ruch przeciwnika" dla
  decyzji CZŁOWIEKA → root cause: `noteBotMove` rejestrował zdarzenia
  człowieka podczas auto-passu faz człowieka w `advance()`; fix: flaga
  `botActing` (tylko gałąź BOTA); (3) modal bez nazw kart → `commandLabel`
  dla `resolve_discard_choice` („Odrzuć: <nazwa>").
- **E. Auto-pass utykał w Głównej 2 („Brak akcji")** po wyciszeniu opcji —
  root cause: gałęzie auto-passu faz CZŁOWIEKA w `advance()` pauzowały na
  zdarzeniach (`pauseOnBotMoves && significant`) jak przy ruchu bota. Fix:
  pauza tylko w gałęzi BOTA.

Weryfikacja: `npm test` **1380/1380**, build 50 modułów / ~1484 kB, quick B0
(1620 meczów) 0 crashy (heuristic ~78.1%, próg 0.78; bot bez zmian).

## Sesja 2026-08-11 — M76: Batch 30 — 10 realnych kart (PR #44)

Kolejka właściciela (handoff po PR #43): Batch 30. Plan:
`docs/plans/PLAN_2026-08-11-batch30-kart.md`. Scryfall z `set=` przez
fetch_page; artId/plan ze słownika; MANA_COSTS +10.

**Karty:** Banishment Decree (MBS), Crew Captain (SNC), Consume Spirit (MRD),
Altar of the Goyf (MH2), Instant Ramen (FIN), Inspiring Bard (AFR),
Seismic Monstrosaur (LCI), Epic Experiment (OTC), Gurmag Drowner (DTK),
Wavecrash Triton (THS).

**Nowe mechaniki generyczne (ADR 0002):**
1. **Bounce na wierzch biblioteki** (`bounce_to_library_top`, Banishment
   Decree — CR 108.3/400.7, cel artifact_or_creature_or_enchantment).
2. **Generyczny X-cost czar** (`spell.xCost` — Consume Spirit, Epic
   Experiment; X wybiera gracz, koszt = manaCost + X, `spellX` na stosie).
3. **enteredThisTurn** statyk (Crew Captain — indestructible w turze wejścia;
   proxy summoningSickness).
4. **Statyczny grant wg podtypu** (`creatures_with_subtype`, Altar of the
   Goyf — Lhurgoyf mają trample).
5. **Koszt aktywacji sacrificeLand** (Seismic Monstrosaur — {2}{R}, poświęć
   ląd: dobierz).
6. **Modalny trigger ETB z celem** (Inspiring Bard — choose one; tryb bez
   legalnego celu niedostępny — fix crasha benchmarku).
7. **Epic Experiment** (exile top X, free-cast inst/sorc MV≤X, reszta do
   grobu; `pendingEpicExperiment`).
8. **look top N → jedna do ręki, reszta do grobu** (`pendingLookTopN`,
   Gurmag Drowner — po exploicie).
9. **Heroic** (`spell_targets_this_creature` — Wavecrash Triton: tap stwora
   przeciwnika + lock_untap).

Talie singleton +10 (azorius, black, green, red, spellslinger, tokens);
tester stołu obsługuje „Odrzuć:". Boty znają resolve_epic_choice /
resolve_look_top_choice.

**Weryfikacja:** `npm test` **1393/1393** (+13 behawioralnych w
`test/real-cards-batch30.test.js`), build 50 modułów / ~1519 kB, pełne B0
(2160 meczów, 0 crashy): heuristic **79.5% ogółem** (64.6% vs aggro / 94.4%
vs random) — progi 0.78/0.57 utrzymane.


## Sesja 2026-08-12 — M77: uwagi przed mergiem PR #44 (A–C)

Przed mergem Batchu 30 właściciel zgłosił 3 uwagi z testów na telefonie,
wszystkie naprawione u root cause. Plan:
`docs/plans/PLAN_2026-08-12-uwagi-przed-mergiem.md`.

- **A. Dublowany komunikat o tasowaniu** (Caravan Vigil) — `search_choice_resolved`
  i `library_searched` emitowane razem dawały 2 wpisy „tasuje". Fix: tłumienie
  natychmiastowego `library_searched` po `search_choice_resolved` w logu
  (`describeEvent`) i modalu bota (`noteBotMove`); inne ścieżki (typecycling,
  pokoje lochu) bez zmian.
- **B. Bot rzuca buff na stwora przeciwnika** (Might of the Masses →
  Maritime Guard) — kara „wzmacnianie przeciwnika" obejmowała tylko `pump`,
  a Might używa `pump_by_creature_count`. Fix: kara dla wszystkich pump-efektów
  (`pump`, `pump_by_creature_count`, `pump_enchanted_creature`) na cudzym.
- **C. Brak info o zmianie tury/fazy** podczas ciągłego ruchu bota — modal
  „Ruch przeciwnika" pokazuje teraz nagłówki „Tura N — <gracz>" i
  „Faza: <nazwa>" (turn_started/step_advanced, `lastBotPhaseKey`).

Weryfikacja: `npm test` **1396/1396** (+3), build 50 modułów / ~1523 kB, pełne
B0 (2160 meczów) 0 crashy — heuristic ~79.4% ogółem (progi 0.78/0.57; zmiana
bota mierzona).

## Sesja 2026-08-12 — M78: diamentowa odznaka challenge 2 — 15 błędów żywym testerem (PR #44)

Właściciel rzucił wyzwanie: 15 błędów Testerem Gracza. Rozegrano 20+ partii
(różne talie/seedy, dłuższe gry) na prawdziwym artefakcie i przeskanowano
transkrypty (tools/table-tester/scan.mjs). Plan:
`docs/plans/PLAN_2026-08-12-diamentowa-odznaka-challenge2.md`.

**15 błędów etykiet/logu, wszystkie u root cause (bez zmian bota):**
1. `bounce_to_library_top` bez polskiego opisu → „efekt (…)" (Banishment Decree).
2. Koszt Escape „?" — czyta z registry (graveyard view nie niesie spell).
3. Inspiring Bard tryby „Bardic Inspiration/Song of Rest" → polskie.
4. Ainok Artillerist „Zasięg · Zasięg" — describeStatic pokazuje keywordy tylko
   dla zdolności SCOPOWANYCH (samodziałające trafiają do keywordLine).
5. `look_top_put_one_hand_rest_grave` bez opisu (Gurmag Drowner).
6. Howl dynamiczna liczba tokenów („za każdy Forest") niewidoczna w opisie czaru.
7. `epic_experiment` bez opisu (Epic Experiment).
8. `buff_creature_until_end_of_turn` bez opisu (Altar of the Goyf).
9. Jyoti „moc źródła/moc źródła" → ptPair deduplikuje równe P/T.
10. COUNTER_LABELS deathtouch/flying/lifelink → polskie (były surowe).
11. „(koszt4U)" — brak spacji w costPart.
12. „(koszt odrzuć 2 karty)" → „(koszt: odrzuć …)" (czysty koszt pozamany).
13. Modalne tryby Choose one po angielsku (Aerith, Ruinous, Selesnya, Robbers,
    Your Temple) → polskie.
14. Dublowane „aura → Xaura"/„wyposaża" — buildStateOverlay nie powiela
    przypięcia (robi to buildFace).
15. exalted_pump „(exalted)" → „(egzaltacja)".

Weryfikacja: `npm test` **1405/1405** (+9 w `audit-diamond-challenge2.test.js`),
build 50 modułów / ~1525 kB, pełne B0 (2160 meczów) 0 crashy — heuristic 79.4%
(progi 0.78/0.57 utrzymane). Testerem: 0× „efekt (<slug>)", 0× „Zasięg · Zasięg",
0× „moc źródła/moc źródła", 0× „(koszt ?)", 0× „aura → Xaura", 0× angielskie
tryby, 0× „(exalted)", 0× „(koszt4U)".

## Sesja 2026-08-12 — M79: uwagi A/B + audyt PR #44 (PR #45)

Po merge PR #44 właściciel zgłosił dwa błędy z telefonu i zlecił audyt
jakości tamtego PR. Plan: `docs/plans/PLAN_2026-08-12-uwagi-ab-audyt-pr44.md`.

**Uwagi z testów (root cause):**
- **A.** Modal „Ruch przeciwnika” pokazywał każdą zmianę kroku (`Faza: …`).
  Nagłówek fazy jest teraz *oczekujący* — wypychany dopiero przy akcji.
  Zawsze zostaje „Tura N — <gracz>”.
- **B1.** Wynik walki znikał z „Ruch przeciwnika” (M75 `botActing` pomijał
  auto-resolve). Modal raportuje CAŁĄ fazę walki: bloki, obrażenia (także
  stwór–stwór — `combat: true`), truciznę (infect), śmierci i triggery.
  `dealCombatDamageToPlayer` niesie LKI `sourceCardId`.
- **B2.** Fullscreen z wizardu ataku/bloku chował `choice-request` — jak B23.
  Nie chowamy już tego modala (z-index 2600 > 1500).

**Audyt Batch 30 / M74–M78:**
- Consume Spirit: Oracle „Spend only black mana on X” — `xCost.black` +
  płatność X jako pipy {B} (oferta i `castXCostSpell`).
- Epic Experiment: free-cast z `chosenTargets: []` fizzlował czary z celem
  (CR 608.2b). Oferta per legalny cel/tryb; execute waliduje i ustawia cele.
  X nieopłacone = 0 (CR 107.3b).
- Crew Captain `enteredThisTurn` nie jest już proxy `summoningSickness`
  (kradzież dawała fałszywe indestructible). Flaga `enteredOnTurn` przy
  wejściu na bitwisko (`addObject` / `moveObjectDirectly` / tokeny).
- `PROJECT_STATE.md`: usunięte znaczniki konfliktu `<<<<<<< HEAD` ze squash #44.
- Komentarz `combat.js` o „pełna siła KAŻDEMU blokerowi” zaktualizowany (M66).

Weryfikacja: `npm test` + `npm run build` (wyniki w opisie PR #45). Bot bez
zmian — B0 niewymagany.

## Sesja 2026-08-12 — M80: Jill, Shiva's Dominant — cel ETB także własne permanenty

Uwaga A z testów właściciela po merge M79:

> Karta Jill, Shiva's Dominant — celuje tylko w permanenty przeciwnika.
> Czy wśród opcji nie powinno być także własnych?

Oracle Jill: „up to one other target nonland permanent” — brak ograniczenia
do przeciwnika; celem może być dowolny permanent niebędący lądem inny niż
źródło, w tym własny kontrolera.

**Root cause:** typ celu `other_nonland_permanent` w `triggers.js`
(używany wyłącznie przez Jill) odfiltrowywał własne permanenty źródła
(`controllerId === sourceObject.controllerId`).

**Fix:** usunięto ten filtr — kandydatami są wszystkie nie-landy poza
źródłem (obu graczy), bez hexproof, najsilniejszy pierwszy (spójne
z generycznym `nonland_permanent` / Thistledown Players). Walidacja
`resolve_trigger_target` korzysta z tego samego `triggerTargetCandidates`,
więc wybór własnego permanentu jest akceptowany.

Plan: `docs/plans/PLAN_2026-08-12-jill-shiva-dominant-targeting.md`.

Weryfikacja: `npm test` **1413 pass / 0 fail**, `npm run build`
50 modułów / 1530.9 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-12 — M80: audyt rozgrywki żywym testerem stołu

Zlecenie właściciela: wykorzystać Żywy Tester (`tools/table-tester/run-game.mjs`),
wcielić się w rolę gracza, rozegrać partie na prawdziwym artefakcie przeciwko
botowi i zebrać ≥15 błędów/niejasności/uproszczeń z perspektywy gracza, potem
je naprawić. Plan: `docs/plans/PLAN_2026-08-12-audyt-zywy-tester.md`.

**Narzędzie rozszerzone (audyt):**
- tester loguje treść modala „Ruch przeciwnika” (`bot-move`) — wcześniej tylko
  go zamykał;
- tester deklaruje BLOKI w wizardzie (wcześniej nigdy nie blokował, więc walka
  stwór–stwór była niewidoczna).

**Naprawione (16):**
- `session.js`: „Brak ataku” (puste `attackers_declared`) nie tworzy modala —
  szum/pusta faza.
- `render.js commandLabel`: szukanie w bibliotece rozróżnia znalezione karty
  i rezygnację; mulligan pokazuje finalną rękę 7−N (London mulligan).
- `render.js describeEffect`: Reclusive Artificer „zada tyle obrażeń, ile
  artefaktów kontrolujesz” (było „za każdy twój artefakt obrażeń”); Tumbleweed
  Rising bez surowego slug `greatest_power_you_control` (dynamiczne P/T).
- `render.js describeTriggered`: czytelne opisy zamiast „Trigger <event>” dla:
  Landfall, land przeciwnika, krok końca, exploit, aura-host-celem-czaru,
  drugi czar, czar niebędący stworem, odwrócenie twarzy, niebojowe obrażenia
  przeciwnikowi, celowany ETB z obrażeniami (Forge Devil).
- `choice-request.js`: wizard obrażeń „śmiertelne N” (nie angielskie „lethal”).

Transkrypt: `tools/table-tester/audyt-m80-green-vs-red.txt`.

Weryfikacja: `npm test` **1421 pass / 0 fail**, `npm run build`
50 modułów / ~1535 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-13 — M81: polowanie na błędy vs CR (brązowa odznaka)

Przegląd istniejących kart i mechanik vs Comprehensive Rules; znalezienie
i naprawa 5 błędów/uproszczeń. Plan:
`docs/plans/PLAN_2026-08-13-brazowa-odznaka-bug-hunt.md`.

**Naprawione (5):**
- **`creature` trigger-target self:** filtry typu `creature` w `triggers.js`
  wykluczały źródło; karty „target creature" bez „other" (Cloudbound Moogle,
  Forge Devil, Reclusive Artificer, Goblin Battle Jester, Battle-Rattle
  Shaman, Silumgar Butcher, Angelic Benediction) nie mogły celować w siebie
  (Moogle ETB w ogóle nie odpalał, gdy był jedynym stworem). Faceless Butcher
  („another") dostał `notSelf`.
- **Goad can't block:** `canBlock`/`legalBlockerOptions`/`declareBlockers`
  nie egzekwowały CR 701.38 („goaded creatures can't block").
- **Wavecrash Triton:** `lock_untap` (trwały, jak Entrancing Lyre) zamiast
  „doesn't untap during controller's NEXT untap step" — nowy jednorazowy efekt
  `dont_untap_next_untap_step` (flaga zużywana w następnym untap).
- **Caravan Vigil Morbid:** wymuszał położenie landa na bitwisko bez opcji
  „may" (ręka). Szukanie w bibliotece przyjmuje teraz `destinations` i gracz
  wybiera ręka/bitwisko.
- **Amass z wieloma armiami:** engine brał pierwszą Armię bez wyboru.
  Nowa blokująca decyzja `resolve_amass_choice` (CR 701.43 „choose an Army").

**Przy okazji (root cause, ujawnione przez BUG1):** `damage_to_controller`
(Forge Devil) nie niósł `sourceCardId` — gdy źródło ginęło w SBA tego samego
rozstrzygnięcia (celowało w siebie), log walki pokazywał „? zadaje 1 obrażenie".

Weryfikacja: `npm test` **1427 pass / 0 fail** (1421 → 1427), `npm run build`
50 modułów / ~1541.5 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-13 — M82: Batch 31 — 10 realnych kart + 3 nowe talie

Kolejka właściciela (handoff po M81). Lista (10 kart): Furious Forebear (TDM),
Jwari Shapeshifter (WWK), Floodhound (MH2), Inspire Awe (THB),
Cogwork Assembler (2XM), Dread Warlock (M10), Steel Sabotage (2XM),
Warrior's Sword (FIN), Awaken the Sleeper (ONE), Impact Tremors (DTK).
Plan: `docs/plans/PLAN_2026-08-13-batch31-kart.md`.

**Nowe generyczne mechaniki (ADR 0002):**
- **trigger z grobu + opcjonalna płatność** (Furious Forebear): skan źródła
  w grobie na śmierć kontrolowanego stwora, `other_creature_you_control_dies`,
  `return_source_from_graveyard_to_hand`.
- **enter as copy** (Jwari): deskryptor `enterAsCopy` rozstrzygany PRZY wejściu
  (przed SBA — inaczej 0/0 ginie zanim ETB by się odpalił), kopiuje najsilniejszego
  Ally; generyczny w `spells.js`/`registry.js`.
- **investigate / token Clue** (Floodhound): efekt `investigate`, token `token_clue`.
- **prewencja combat „except by enchanted/enchantment creatures"** (Inspire Awe):
  flaga `preventCombatExceptEnchanted` + filtr w `combat.js`.
- **token-kopia artefaktu z haste + delayed exile** (Cogwork Assembler):
  `create_copy_token`.
- **„can't be blocked except by [kolor]"** (Dread Warlock): statyczna restrykcja
  blokowania.
- **counter artifact spell** (Steel Sabotage): typ celu `artifact_spell_on_stack`.
- **job select** (Warrior's Sword): `job_select` — Hero token + attach; equipment
  nadaje podtyp Warrior (`subtypes` w attachmentGrant/registry/identity).
- **czasowa kontrola do EOT + untap + haste + zniszcz equipment** (Awaken the
  Sleeper): `gain_control_until_end_of_turn` (revert w cleanup),
  `destroy_equipment_attached`.
- **„creature you control enters"** (Impact Tremors): trigger `creature_you_control_enters`.

**Błąd ujawniony (root cause):** enumeracja zdolności aktywowanych oferowała
TYKO stwory jako cele niezależnie od typu celu — Cogwork Assembler (cel
'artifact') dostawał stwory i bot wybierał nielegalny cel. Naprawa: wspólna
`legalTargetCandidates` w `abilities.js`.

**Talie (B):** nowe `decks/ostrza.txt`, `decks/mechanicy.txt`,
`decks/sojusznicy.txt` + dopiski do istniejących (azorius, green, black, red).

Weryfikacja: `npm test` **1442 pass / 0 fail** (1427 → 1442), `npm run build`
50 modułów / ~1570.3 kB. Bot bez zmian → B0 niewymagany.

## Sesja 2026-08-13 — M83: audyt rozgrywki żywym testerem (10 błędów)

Zlecenie właściciela: użyć Żywego Testera (`tools/table-tester/run-game.mjs`),
wcielić się w rolę gracza, rozegrać partie różnymi taliami i zebrać ≥15
błędów/niejasności/uproszczeń z perspektywy gracza, potem je naprawić. Plan:
`docs/plans/PLAN_2026-08-13-audyt-zywy-tester-m83.md`.

**Naprawione (10):**
- **Log walki:** „A i B i C blokuje" → „A, B i C blokują" (liczba mnoga,
  przecinki) — `blockers_declared`.
- **Nagłówek modala:** „Faza: Faza główna" → „Faza: Główna 1" (redundancja).
- **„Brak bloków" w modalu** „Ruch przeciwnika" pomijany (szum jak „Brak ataku").
- **Morph face-down:** etykieta „Obróć twarzą do góry: (morph )" miała pusty
  koszt — PlayerView battlefield nie niósł `morph`.
- **„→ cel: ?" na stosie** dla czaru celującego w gracza (Release the Ants) —
  stack-view nie rozpoznawał gracza jako celu.
- **Surowe „Trigger <event>:"** — czytelne opisy dla 13 typów triggerów
  (when_you_cast_spell, beginning_of_combat, player_casts_spell, ...).
- **Etykieta czaru X** — „Rzuć: Fireball (koszt XR)" bez wartości X → „X=N".
- **Bot zapętlał się re-equipem** tego samego stworu (Hunter's Blowgun) —
  kara za re-equip obecnego nosiciela w `heuristic-bot.js`.
- **Błędny opis Insatiable Appetite** — „poświęć Food (zyskaj 3 życia)" zamiast
  „+5/+5 albo +3/+3 do końca tury".
- **Craft bez artefaktu do wygnania crashował** („Brak artefaktu do wygnania
  (craft)") — teraz no-op (CR 608.2b).

**NIE-bugi (artefakty):** podwójne „choroba"/P/T na kaflach (jsdom nie ładuje
obrazów); re-equip przez testera-klikacza; Banishment Decree na token (token
znika poza bitwiskiem — CR 704.5d).

Weryfikacja: `npm test` **1452 pass / 0 fail**, `npm run build`
50 modułów / ~1574 kB. Bot zmieniony (re-equip) → pełny B0 bez niedokończonych;
progi win-rate utrzymane.

## Sesja 2026-08-13 — M84: ostateczne wyzwanie Testera Gracza (15+ błędów)

Zlecenie właściciela: użyć Żywego Testera, wcielić się w rolę gracza i znaleźć
15 unikalnych błędów albo stwierdzić, że więcej nie da się znaleźć. Plan:
`docs/plans/PLAN_2026-08-13-audyt-zywy-tester-m84.md`.

**Nowe błędy (M84):**
- Kafel Greatsword of Tyr (equipped_creature_attacks) — surowy „Trigger atak
  wyposażonego stwora:" → czytelny opis.
- Epic Experiment — odmiana „1 kart do grobu"/„wygnano 1 kart" (powinno
  „1 karta"/„1 kartę").
- Proliferate — `counter_added` bez `total` → „(razem undefined)".
- Station over-use bota — pompował liczniki charge bez końca (brak wyceny
  progu); dodana kara + PlayerView niesie `station`.
- Index/look_top i Fertile Thicket — odmiana „kart" (powinno „kartę"/„karty").
- `damage_prevented` — „zostają zniwelowane" bez powodu; dodany powód
  (ochrona / Inspire Awe / tarcza) + flaga `inspireAwe`.
- Tester: nie klikał „pomijam" (STOP) i atakował solo (can't attack alone).

Razem z M83 (10 bugów) to 16+ unikalnych.

Weryfikacja: `npm test` **1458 pass / 0 fail**, `npm run build`
50 modułów / ~1575.9 kB. Bot zmieniony (Station + re-equip) → benchmark bez
niedokończonych, progi win-rate utrzymane.

## Sesja 2026-08-13 — M88: naprawa transkryptu Żywego Testera (PR #51, 3f3bd77)

Kontynuacja po PR #50 (M87 wykonany). Audyt Żywym Testerem wykazał, że
**transkrypt modala „Ruch przeciwnika" zlepiał sąsiednie wpisy DOM
(`<div.bot-move-line>`)** jedną spacją i obcinał kontekstem
(`slice(0, 400)`), ukrywając realne bugi UI pod szumem typu
„Faza: Główna 1G Garruk's Companion wchodzi na bitwisko" w jednej
linii. To samo z modalami wyboru (intro + lista opcji) i kaflami
(kilka `<div>` w jednym `.tile`: `.fname`/`.fcost`/`.ftype`/`.fbox`).

**Root cause (nie maskowanie):** wydzielony moduł
`tools/table-tester/extract.mjs` z trzema czystymi ekstraktorami —
`extractBotMoves({title, entries})` zwraca listę linii (tytuł + każdy
wpis z `  • `), `extractModalChoice({intro, options, chosenIndex,
confirmText})` zwraca intro + każdą opcję osobno z markerem ▶ dla
wybranej, `extractTileText(tile)` czyta pola kafla osobno i łączy
separatorem `·`. `run-game.mjs` używa ich w `closeBotMove`, `resolveModal`
i `tiles` (snapshot).

**Testy:** 6 RED→GREEN w `test/table-tester-output.test.js`
(extractBotMoves nie zlepia, extractModalChoice oznacza ▶,
extractTileText rozdziela kafle separatorem `·`). Pełny wynik:
**1524/0** (+6), build 50 modułów / 1618.8 kB, bot nietknięty (B0 bez zmian).

**Plan:** `docs/plans/PLAN_2026-08-13-m88-tester-output.md`. Handoff:
`docs/setup/HANDOFF_2026-08-13-m88.md`. Snapshoty: `tools/table-tester/
audyt-m88-{blk-tok-66,soj-inn-44}.txt`.

## Zasada aktualizacji

Każdy PR zmieniający kierunek projektu powinien odpowiednio aktualizować:

- ten plik — jeśli zmienia się bieżący stan lub następny krok;
- `docs/ROADMAP.md` — jeśli zmienia się kolejność etapów;
- ADR — jeśli zapada lub zmienia się decyzja architektoniczna;
- dokumentację karty/mechaniki — jeśli zmienia się zakres jej obsługi.
