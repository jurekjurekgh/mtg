# PLAN M100 — audyt PR #52 + panel „Rozgrywka" (dawniej „Ruch przeciwnika")

**Data:** 2026-08-15 · **Gałąź:** `arena/01a0046e-mtg` · **Sesja:** M100

## Zadanie (pierwszy prompt sesji, decyzje właściciela)

0. **Obowiązkowy audyt poprzedniego PR.** Uwaga właściciela: reguła ma być
   jasno zalecona w dokumentacji. **Jest** — AGENTS.md ma sekcję
   „Obowiązkowy audyt poprzedniego PR na starcie sesji", formalizuje ją
   ADR 0016 (pkt A). Nie dopisujemy nic; wykonujemy.
1. **Poszerzenie treści panelu „Ruch przeciwnika" i zmiana nazwy na
   „Rozgrywka"** — panel pokazuje już nie tylko ruchy przeciwnika, ale i moje.
   Właściciel chce tam dodatkowo widzieć:
   - **dobrane przez gracza karty**,
   - **rozstrzygnięte czary — moje i przeciwnika**,
   - **zrealizowane czary modalne (wybór trybu) — moje i przeciwnika**,
   - **nazwy kart z czarów typu scry i podobnych, manipulujących biblioteką**
     (wyłącznie te nie objęte FoW),
   - **inne logiczne, istotne zagrania gracza i przeciwnika**.

## Stan na starcie (zmierzony wg L7, nie przyjęty z handoffu)

- `main` = `075a79f` (squash PR #52: M90–M99). Potwierdzone w repo:
  plan M99, `test/reveal-exile-log-null.test.js`,
  `test/bot-spell-resolution-in-modal.test.js`, profil `impatient`.
- `npm test` **1677/0** · `npm run build` **50 modułów / 1649.8 kB** — zgodnie
  z handoffem.
- Mechanizm panelu (rozpoznanie kodu): `session.botMoves` +
  `noteBotMove(e)` w `src/table/session.js`, z bramką `botActing` (M75),
  `botStackObjects` (M99 — rozstrzygnięcia czarów bota po passie gracza) i
  raportem walki (M79/B1). Treść filtruje `showBotMoves` (M97: same fazy to
  szum, nagłówki tur zostają — decyzja właściciela).

## Decyzje projektowe (do ewentualnej korekty właściciela)

- **„Dobrane karty" = dobrania z efektów** (`source: 'effect'`), nie z kroku
  dobierania — krok draw jest szumem od M34/M89 (oś 2 w TESTER_STOLU,
  potwierdzone decyzjami właściciela).
- **FoW ponad wszystko:** nazwy kart pokazujemy tylko dla informacji, do
  których człowiek jest uprawniony: (a) jego własne podejrzenia biblioteki
  (scry/surveil/look — on je widział przy decyzji), (b) karty jawne publicznie
  (reveal, grób, stos, wygnanie twarzą w górę). Dla ruchów bota z ukrytych
  stref — sam fakt bez nazw.
- **Częstotliwość modala bez zmian** — pokazuje się przy dotychczasowych
  pauzach (zwrot sterowania do gracza). Treść szersza, nie częstsza.
- **Historia dokumentów zostaje nietknięta:** stare wpisy `PROJECT_STATE.md`
  i starych planów mówiące o „Ruchu przeciwnika" opisują przeszłość — nową
  nazwę stosujemy w treściach aktualnych (UI, TESTER_STOLU, tester).

## Etapy (każdy = samodzielnie zielony commit)

### E0 — audyt PR #52 (ADR 0016, bez pełnego B0) — WYKONANY

- [x] Diff PR #52 (`gh pr diff 52`): 46 plików, +5793/−69 (głównie testy/docs).
- [x] **Brak batcha kart** — `src/cards/card-data.js`, `docs/cards/`,
      `tools/collection-art-ids.csv` nietknięte. Punkt 2 audytu (Oracle)
      nie dotyczy.
- [x] Engine — przeczytane w całości: M90 B/C1 (apply po sukcesie +
      reset passów po akcji), crashe (token DFC `transformTo`, fizzle
      zdolności bez celów), M95 (CR 104.4b remis + `isDraw` w widoku,
      root-fix `moveObjectDirectly` dla controllerId/tapped/pól turowych),
      M92 (typy/permanent `types`, prewencje/tarcze/regeneracja, `attacking`
      w PlayerView — face-down przeciwnika nadal bez linii typów, CR 708.2),
      M99 (modal: `botStackObjects` + `BOT_RESOLUTION_EVENTS`).
- [x] Mechaniki generyczne, zgodne z ADR 0002: nowe reguły bota liczą się
      z danych strukturalnych (typy, filtry prewencji, cel-gracz), bez
      rozpoznawania kart po nazwie/ID; nazwy kart występują tylko w
      komentarzach jako przykłady.
- [x] Potwierdzenie: `npm test` 1677/0 · `node --test test/bot-benchmark.test.js` 7/7.
- [x] Wnioski dopisane: tutaj + `PROJECT_STATE.md` (w E7).

**Znalezione rozjazdy dokumentacji (do naprawy w E7):**

- `PROJECT_STATE.md` nie ma wpisów M98/M99 (nagłówek stoi na M97 z liczbą
  testów 1652/0; po M99 jest 1677/0). Uzupełnić w E7 — handoff czatowy
  opisał M99, ale trwały zapis został pominięty (naruszenie ADR 0013 §4).
- `docs/setup/HANDOFF_2026-08-15*.md` nie istnieje — ta sesja dopisuje.

### E1### E1 — rename „Ruch przeciwnika" → „Rozgrywka"

- [ ] Teksty UI (session.js/render.js/main.js — tytuł modala i ewentualne
      etykiety przycisków).
- [ ] Testy: pliki z listy grep (`bot-move-tokens`, `curate-modal`,
      `modal-spell-log`, `bot-spell-resolution-in-modal`, `table-ux-m18`,
      `session-autopass`, `session-bot-pausa`, `audit-m96-tester`,
      `audit-pr44-fixes`).
- [ ] Tester: `extract.mjs` (tytuł modala w transkrypcie), `detectors.mjs`,
      `run-game.mjs`, README — bez rozjazdu wyników detektorów między trybami.
- [ ] Dokumenty aktualne: TESTER_STOLU (oś 2), ewentualnie LESSONS/AGENTS,
      jeśli nazwa występuje jako odniesienie do żywego elementu.
- [ ] **E1b (refactor identyfikatorów, osobny commit):** `botMoves` → nazwa
      symetryczna (bufor ma trzymać ruchy obu stron), `noteBotMove` →
      neutralna. Czysty rename, zero zmiany zachowania, pełny `npm test`.

### E1.5 — BUG A (zgłoszenie właściciela 2026-08-15): wyciek nazwy karty face-down

Cytat z testów na telefonie: modal pokazał „Nieprzyjaciel zagrywa
**Segmented Krotiq** twarzą w dół (2/2)", a później „atakuje mnie zakryta
kreatura Segmented Krotiq". Obiekt LEŻĄCY na stole twarzą w dół jest dla
przeciwnika bezimiennym 2/2 (CR 708.2) — modal/log/atak/blok/podział obrażeń/
celowanie **nie mogą** ujawnić jego nazwy. (Ujawnienie przy ZNIKNIĘCIU ze
stołu jest legalne — CR 708.8/708.9: opuszczający bitwisko morph zostaje
odsłonięty — więc LKI typu `targetCardIds`/`sourceCardId` po śmierci może
nazywać).

Root cause do sprawdzenia (sondy przed fixem, RED→GREEN):

- [x] `describeGameEvent` case `permanent_cast` z `faceDown: true` woła
      `nameOf(e.object?.cardId)` — nazwa prosto z rejestru, omija warstwę
      „faceDown → morph" z `nameOfObject` (M73c fix objął tylko `nameOfObject`).
- [x] `attackers_declared` / `blockers_declared` — jak budowane są nazwy
      (jeśli z cardId/objektu-cardId = wyciek; z nameOfObject = „morph").
- [x] `damage_dealt` / `combat` linie (`sourceCardId`, cel).
- [x] Cele czarów: log modalu czyta `targetCardIds` (M74 LKI) — jeżeli cel
      wciąż jest na stole zakryty, nazwa wycieka; preferować żywy objectId
      (faceDown→«morph»), LKI dopiero gdy obiektu nie ma.
- [x] Wizardy UI (atak/blok/podział obrażeń/wybór celu) — etykiety
      face-down celi/atakujących (M74 uznał tu «morph» — zweryfikować
      pokrycie; łatwo pominąć ścieżkę z `cardId`).
- [x] Iloraz: jakie opisy używają `nameOf(e.cardId)`/`nameOf(e.object?.cardId)`
      tam, gdzie obiekt może leżeć face-down → wspólny helper typu
      „nazwa-jaką-widzi-człowiek" (obiekt żywy & zakryty → «morph»; obiektu
      brak → LKI cardId legalne). Fix u root cause w tej warstwie, nie lista
      point-fixów.
- [x] Test: `test/fow-facedown-names.test.js` — scenariusze: bot zagrywa
      morph (modal „Rozgrywka" bez nazwy), morph bota atakuje/blokuje
      (log/modal bez nazwy), cel w morphu bota (bez nazwy), a po śmierci
      morpha nazwa WOLNO się pojawić (CR 708.8). Strażnik: własny morph —
      nazwa niewidoczna w logu, widoczna w pełnym ekranie (istniejące
      pokrycie UX C z M48).

**WYKONANE (2026-08-15, npm test 1688/0, build 50 mod., benchmark 7/7).** Sondy
potwierdziły wyciek na 9 ścieżkach. Fix root-cause:
`session.js::describeGameEvent` dostał lokalny helper `objectOrLki(objectId,
cardId)` — nazwa z ŻYWEGO obiektu ma pierwszeństwo (`nameOfObject` zwraca
„morph" dla face-down), LKI cardId dopiero gdy obiekt zniknął ze stanu.
Pokryte: `permanent_cast` (face-down: nazwa tylko własna — gracz zna swoją
kartę, CR 708.6; przeciwnika → „morph"), cele czarów, `attackers_declared`,
`blockers_declared`, `damage_dealt` (źródło+cel), `damage_prevented`,
`permanent_entered_battlefield`, `object_attached` (host), `keyword_granted`,
cele delirium/mentora. Strażnik skanu w `noteBotMove`: zakryte zagranie
przeciwnika nie pokazuje ilustracji (obiekt face-down na stosie/stole).
`combat.js::buildDamageAssignmentView(state, viewerId)` zeruje cardId
zakrytych kart przeciwnika w widoku podziału obrażeń (FoW jak battlefield);
`playerView` przekazuje własne playerId. Wizard podziału (`choice-request.js`)
etykietuje z żywego obiektu („morph", P/T zostają — publiczne), cardId
dopiero gdy obiekt zniknął. Test: `test/fow-facedown-names.test.js` 11/11
(RED 9/11 → GREEN; weryfikacja mutacyjna = pierwotny przebieg RED pokrył
każdą stronę fixa). Reguła graniczna opatrzona testem: LKI po śmierci/
kontrze/wygnaniu legalne.

Kolejność: E1.5 PRZED E2 — E2-E5 dodają nowe linie modalu nazywające obiekty;
muszą dziedziczyć naprawioną warstwę nazewniczą zamiast powielać wyciek.

### E2 — rozstrzygnięte czary obu graczy (+ modalne z trybem)

**WYKONANE (npm test 1690/0, build 50 mod.).** M99 trzymało na stosie tylko
czary BOTA (`botStackObjects`) — rozstrzygnięcia i skutki czarów CZŁOWIEKA
szły wyłącznie do logu. Root fix: śledzenie stosu `stackObjects` obejmuje
OBU kontrolerów, bramki `isStackResolution`/`isResolutionEffect` działają
symetrycznie, a `apply()` przepuszcza zdarzenia komendy człowieka przez
`noteBotMove` (ta sama bramka filtruje echo decyzji człowieka — wpuszczane
są tylko zdarzenia z rodziny rozstrzygnięć). Czary modalne pokazują tryb
także przy rozstrzygnięciu (tekst warstwy M91, teraz dociera do modala obu
graczy). Częstotliwość pauz bez zmian (decyzja z planu). Test:
`test/spell-resolution-symmetry-modal.test.js` 2/2 — weryfikacja mutacyjna:
bez fixa produkcyjnego test 1 pada dokładnie objawem buga („log zna
rozstrzygnięcie „Curate", modal milczy").


- [ ] Uogólnić `botStackObjects` → znane obiekty stosu **obu** kontrolerów;
      `spell_resolved` (z `modeName` dla czarów modalnych — dane już w
      zdarzeniu od M91/D) trafia do modala niezależnie od rzucającego.
- [ ] Efekty rozstrzygnięcia (obrażenia, pump, destroy, token…) — pokrycie
      symetryczne gracz/bot (bot ma je od M99; dodać gałąź gracza).
- [ ] Testy: rozszerzyć `bot-spell-resolution-in-modal` lub nowy plik —
      mój czar rozstrzygnięty po passie bota widoczny w „Rozgrywce".

### E3 — dobrane karty gracza z efektów

**WYKONANE (npm test 1692/0).** Wyszło ZA DARMO z root-fixu E2: bramka
rozstrzygnięć (`isStackResolution` + `BOT_RESOLUTION_EVENTS` z `card_drawn`)
+ istniejący filtr `isCardDrawnNoise` (tylko `source:'effect'` nie jest
szumem) przepuszczają dobrania z efektu człowieka do modala, a dobranie
w kroku dobierania nadal odfiltrowują. Zero zmian produkcyjnych — etap
dowiózł dedykowane pokrycie (testy 3-4 w
`test/spell-resolution-symmetry-modal.test.js`, w tym strażnik szumu).
Weryfikacja mutacyjna: na kodzie sprzed E2 test 3 pada objawem („log zna
„Ty dobiera: Coralhelm Guide" (dobranie z efektu Curate), modal milczy").


- [ ] `card_drawn` z `source: 'effect'` dla człowieka → wpis w modalu
      (z nazwą karty, jeśli zdarzenie ją niesie dla właściciela ręki;
      sprawdzić dane zdarzenia i dopiąć wg L6, jeśli brak).
- [ ] `draw_step` pozostaje szumem (test strażnika).

### E4 — nazwy kart z manipulacji biblioteką (spoza FoW)

**WYKONANE (npm test 1700/0, build 50 mod., benchmark 7/7).** Dwie luki
naprawione: (1) bramka modala w ogóle nie wpuszczała rodziny manipulacji
biblioteką — do BOT_RESOLUTION_EVENTS doszły card_milled, card_revealed,
scry/surveil/index/look (started+resolved), epic_experiment, clash;
(2) opisy niosą nazwy tam, gdzie legalne FoW: własne scry (spód+wierzch z
nazw — nowe pola emitera), Index (kolejność od góry), look_top (wzięta
karta), Epic Experiment (wygnane na odkryty exile — obaj), tutor
z kryterium (reveal, CR 701.20 — nowe pole foundCardId), mill do grobu
(card_milled — grób publiczny, obaj). Podejrzenia BOTA zostają bez nazw
(test FoW, test 7). Test: `test/library-manipulation-modal.test.js` 8/8
(RED 8/8 → GREEN).


- [ ] Inwentaryzacja zdarzeń: scry/surveil, reveal (Dreams), mill (grób =
      strefa publiczna), clash, Epic Experiment, typecycling/search z reveal,
      Stomping Slabs (ma `revealedNames`), Fertile Thicket, Index.
- [ ] Uzupełnić dane zdarzeń engine, gdzie brakuje (L6), z bramką FoW:
      nazwy tylko dla (a) własnych podejrzeń człowieka, (b) kart jawnych.
- [ ] Dla bota: sam fakt („Nieprzyjaciel przegląda wierzch biblioteki") —
      bez nazw z ukrytej strefy (test braku wycieku).

### E5 — symetria innych istotnych zagrań

**WYKONANE (npm test 1702/0, build OK).** HUMAN_DIGEST_EVENTS (rzut, perm.,
ląd, aktywacja zdolności, wejście permanentu, transformacja) — nagłówkowe
zagraniе człowieka wpada do bufora modala jako kontekst dla odpowiedzi bota.
Atak człowieka był pokryty bramką raportu z walki (M75/B1) — teraz strażnik
testowy. Test: `test/human-plays-modal.test.js` (RED→GREEN: bufor po własnym
zagraniу pokazywał tylko ruchy bota).


- [ ] `land_played`, `ability_activated` gracza, wejścia permanentów,
      transformacje — ta sama ścieżka co bot (tam, gdzie zdarzenie jest
      istotne dla bota, jest istotne dla gracza).
- [ ] Walka: raport już zbiera bloki/obrażenia/śmierci (M79/B1) — upewnić
      się, że dotyczy też ataków gracza.

### E6 — weryfikacja Żywym Testerem (L13: OBIE tryby logowania)

**WYKONANE (L13: każda partia w --quiet i --snapshot-every 1, wyniki
detektorów zgodne między trybami).** Transkrypty w `tools/table-tester/`:

- `audyt-m100-przed-fix-azo-blk-42.zip` (+pełny `--quiet` w txt obok):
  partia PRZED łatkami E6 — detektor złapał `token Treasure (null/null)`
  (opis tokena niestworowego drukował „(null/null)"). Fix: opis bez P/T
  dla tokenów bez P/T. Tryby zgodne.
- `audyt-m100-v2-azo-blk-42.txt` + `…-snap.zip`: 0 zgłoszeń po łatce
  (oba tryby, pokrycie UI 40/43/12 identyczne).
- `audyt-m100-v2-azo-mech-7-r9.txt`: drugi matchup, profil random — 0
  zgłoszeń (oba tryby).
- `audyt-m100-v2-azo-grn-34.txt` (+ weryfikowany snap): matchup morphowy —
  żywe dowody BUG A: „Nieprzyjaciel zagrywa morph twarzą w dół (2/2)",
  „morph wchodzi na bitwisko", „Face-down creature" na polu wroga, własny
  morph nazwany („Ty zagrywa Willbender twarzą w dół"). Detektor złapał
  drugorzędne: surowy slug triggera `enchantment_you_control_enters` w LOGU
  — etykieta dodana, po rebuildzie 0 zgłoszeń w obu trybach.

Dodatkowe znaleziska naprawione tą łatką: segment scry „na wierzchu:"
pusty po decyzji „wszystko na spód" (filtr segmentu po NAZWACH, nie po
polach danych).


- [ ] Kilka partii matrycowo (różne talie/profile), `--quiet` i
      `--snapshot-every 1` — detektory bez rozjazdu.
- [ ] Transkrypty potwierdzające nowe treści w modalu — fragmenty w opisie PR.

### E7 — dokumenty i domknięcie

- [ ] `PROJECT_STATE.md` — wpis M100 (+ uzupełnić brakujące wpisy M98/M99,
      jeśli audyt potwierdzi brak — patrz E0).
- [ ] `TESTER_STOLU.md` — nazwa „Rozgrywka" i zakres osi 2 po zmianach.
- [ ] `docs/setup/HANDOFF_2026-08-15.md` + blok przekazania w czacie.
- [ ] Opis PR — kumulatywny.

## Pułapki / ryzyka

- **Wyciek FoW przez modal** — test regresyjny typu „modal nie niesie nazwy
  karty dobranej przez bota" obok istniejących testów wycieku widoku.
- **Szum:** same fazy bez akcji = bez modala (M97); nagłówki tur zostają;
  krok draw = szum. Nie wolno cofnąć tych decyzji właściciela przy okazji
  rozszerzania treści.
- **Tester/detektory zakładają tytuł modala** — rename bez aktualizacji
  `tools/` zepsuje transkrypty i detektory (fałszywe alarmy/ślepota).
- **Polskie znaki w `edit_file`** — edycje plików z polskim tekstem przez
  `python3` + `encoding='utf-8'` (ENVIRONMENT §4).
- **Częste commity + push** po każdym zielonym etapie (L9).

## Kryteria końcowe

- `npm test` zielone (≥ 1677 + nowe), `npm run build` 50 modułów, bot
  nietknięty funkcjonalnie (B0 nie wymagany — zmiana dotyczy warstwy
  prezentacji/sesji; jeśli audyt E0 ruszy engine, wtedy `bot-benchmark.test.js`).
- Tester: nowe treści widoczne w transkryptach, detektory spójne w obu trybach.
