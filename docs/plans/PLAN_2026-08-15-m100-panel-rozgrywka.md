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

**Audyt per commit (odpowiedź na pytanie właściciela 2026-08-15 — „czy
sprawdziłeś wszystkie commity poprzedniego agenta"): TAK.** Squash 075a79f
niesie 27 sub-commitów; każdy ma pokrycie w plikach (lista 46 z GitHub API)
i każdy obszar produkcyjny weryfikowałem wprost w kodzie podczas E0/E1.5–E6:

| Commity | Obszary/pliki | Weryfikacja |
|---|---|---|
| M90 (1-6): bugi iPhone B/C1/D + crashe B0 + docs | session.js (apply po sukcesie), game-state.js (reset passów), tokens.js+effects.js (token-kopia DFC, transformTo), spells.js (fizzle zdolności) + 4 testy nowe | czytane w kodzie; komentarze M90 bug B/C1 na miejscu |
| M91 (7-10): tryb modalny, ptaszek grup, prewencje bota, docs | spells.js (modeName), session.js describe; choice-group-ignore.test.js; heuristic-bot.js (prewencje/REMOVAL_EFFECTS) + bot-combat-prevention/bot-no-self-removal | czytane; reguły bota z danych strukturalnych (nie po nazwa/ID) |
| M92 (11-13): audyt PlayerView, 5 luk | game-state.js (pola types/attacking/prevent*; face-down przeciwnika bez types), bot-view-prevention-gaps.test.js, ADR 0017 | pola obecne; FoW honorowane |
| M93-M94: ADR 0017/LESSONS/ENVIRONMENT | docs/decisions, docs/LESSONS.md, ENVIRONMENT.md, docs-decisions.test.js | trwałe reguły działają w tej sesji |
| M95 (16-19): CR 104.4b/400.3/110.6b/400.7 | state-based.js (remis), objects/permanents/game-state.js (kontrola, tap, flagi turowe), bug-hunt-2026-08-14-sherlock.test.js | czytane (isDraw, moveObjectDirectly) |
| M96 (20-23): polityka testera + 4 znaleziska | run-game.mjs, detectors.mjs, session.js (keyword_granted M96), effects.js (firebreathing poza combatem), audit-m96-tester.test.js | komentarze M96 na miejscu |
| M97 (24-25): profile/detektory, pusty modal | run-game.mjs, detectors.mjs, main.js (showBotMoves), TESTER_STOLU.md | mechanika pustych modali czytana przy E1 |
| M98: nagłówek tury = treść | main.js + detectors.mjs + audit-m96-tester.test.js | potwierdzone w E1/E6 |
| M99: weryfikacja mutacyjna + 3 błędy produktu | session.js (botStackObjects, stats_modified), run-game.mjs (impatient, windowRecords), bot-spell-resolution-in-modal.test.js, reveal-exile-log-null.test.js, TESTER_STOLU.md, LESSONS L13 | całość czytana przy E2 (stackObjects generalizowane teraz na obu graczy) |

Wniosek bez zmian: żadna zmiana nie wisiała „w powietrzu" — wszystko ma
opisany fix + test; brak kart batch; brak magicznych liczb per-karta;
AGENTS.md/ADR 0016 reguła audytu obecna wcześniej. Jedyny rozjazd =
pominięte wpisy docs M98/M99 (naprawione w E7).

**Znalezione rozjazdy dokumentacji (do naprawy w E7):**

- `PROJECT_STATE.md` nie ma wpisów M98/M99 (nagłówek stoi na M97 z liczbą
  testów 1652/0; po M99 jest 1677/0). Uzupełnić w E7 — handoff czatowy
  opisał M99, ale trwały zapis został pominięty (naruszenie ADR 0013 §4).
- `docs/setup/HANDOFF_2026-08-15*.md` nie istnieje — ta sesja dopisuje.

### E1### E1 — rename „Ruch przeciwnika" → „Rozgrywka"

- [x] Teksty UI (session.js/render.js/main.js — tytuł modala i ewentualne
      etykiety przycisków).
- [x] Testy: pliki z listy grep (`bot-move-tokens`, `curate-modal`,
      `modal-spell-log`, `bot-spell-resolution-in-modal`, `table-ux-m18`,
      `session-autopass`, `session-bot-pausa`, `audit-m96-tester`,
      `audit-pr44-fixes`).
- [x] Tester: `extract.mjs` (tytuł modala w transkrypcie), `detectors.mjs`,
      `run-game.mjs`, README — bez rozjazdu wyników detektorów między trybami.
- [x] Dokumenty aktualne: TESTER_STOLU (oś 2), ewentualnie LESSONS/AGENTS,
      jeśli nazwa występuje jako odniesienie do żywego elementu.
- [x] **E1b — ODROCZONE/odrzucone:** identyfikatory wewnętrzne (`botMoves`) zostają bez zmian — koszt refactoru bez wartości dla gracza (decyzja z E1).
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


- [x] Uogólnić `botStackObjects` → znane obiekty stosu **obu** kontrolerów;
      `spell_resolved` (z `modeName` dla czarów modalnych — dane już w
      zdarzeniu od M91/D) trafia do modala niezależnie od rzucającego.
- [x] Efekty rozstrzygnięcia (obrażenia, pump, destroy, token…) — pokrycie
      symetryczne gracz/bot (bot ma je od M99; dodać gałąź gracza).
- [x] Testy: rozszerzyć `bot-spell-resolution-in-modal` lub nowy plik —
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


- [x] `card_drawn` z `source: 'effect'` dla człowieka → wpis w modalu
      (z nazwą karty, jeśli zdarzenie ją niesie dla właściciela ręki;
      sprawdzić dane zdarzenia i dopiąć wg L6, jeśli brak).
- [x] `draw_step` pozostaje szumem (test strażnika).

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


- [x] Inwentaryzacja zdarzeń: scry/surveil, reveal (Dreams), mill (grób =
      strefa publiczna), clash, Epic Experiment, typecycling/search z reveal,
      Stomping Slabs (ma `revealedNames`), Fertile Thicket, Index.
- [x] Uzupełnić dane zdarzeń engine, gdzie brakuje (L6), z bramką FoW:
      nazwy tylko dla (a) własnych podejrzeń człowieka, (b) kart jawnych.
- [x] Dla bota: sam fakt („Nieprzyjaciel przegląda wierzch biblioteki") —
      bez nazw z ukrytej strefy (test braku wycieku).

### E5 — symetria innych istotnych zagrań

**WYKONANE (npm test 1702/0, build OK).** HUMAN_DIGEST_EVENTS (rzut, perm.,
ląd, aktywacja zdolności, wejście permanentu, transformacja) — nagłówkowe
zagraniе człowieka wpada do bufora modala jako kontekst dla odpowiedzi bota.
Atak człowieka był pokryty bramką raportu z walki (M75/B1) — teraz strażnik
testowy. Test: `test/human-plays-modal.test.js` (RED→GREEN: bufor po własnym
zagraniу pokazywał tylko ruchy bota).


- [x] `land_played`, `ability_activated` gracza, wejścia permanentów,
      transformacje — ta sama ścieżka co bot (tam, gdzie zdarzenie jest
      istotne dla bota, jest istotne dla gracza).
- [x] Walka: raport już zbiera bloki/obrażenia/śmierci (M79/B1) — upewnić
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


- [x] Kilka partii matrycowo (różne talie/profile), `--quiet` i
      `--snapshot-every 1` — detektory bez rozjazdu.
- [x] Transkrypty potwierdzające nowe treści w modalu — fragmenty w opisie PR.

### E9 — polowanie Żywym Testerem (10 unikalnych błędów)

Zlecenie właściciela: „postaraj się znaleźć 10 unikalnych błędów Żywym
Testerem". Matryca: 13 partii (12 pairingów talii × profile greedy/random/
defensive/explorer/impatient × seedy, tryby --quiet i tick 0/1) +
4 weryfikacje powtórzone po łatkach. Transkrypty: tools/table-tester/
audyt-m100-e9-* (RED, przed fixami) i audyt-m100-e10-VERIFY-* (GREEN, po).

Znalezione i NAPRAWIONE (każdy: root cause + test RED→GREEN + weryfikacja
żywa po rebuild; numery P jak w commitach):

1. **P1 — nieskończony mulligan (deadlock partii)** [h03/h10/h16, defensive]:
   oferta keep:false wieczna; po 7. mulliganie ręka pusta, a gra kręciła się
   dalej (tester: 134 mulligany, etykieta „odłóż 134 karty na spód"). CR 103.4:
   mulligan operuje na ręce — brak ręki = brak mulliganu. Fix: bramka execute
   `mulligan_below_zero_hand` + oferta tylko keep przy count ≥ 7. Testy:
   mulligan.test.js (+2). Verify: v1-seed37 kończy partię normalnie.
2. **P3 — token z CDA: surowe staty w komunikacie** [h04]: „tworzysz token
   Tarmogoyf (0/0)", a na stole 3/4 i atakuje za 3. token_created niesie teraz
   statystyki EFEKTYWNE po wejściu (tokens.js → effectivePower/Toughness).
   Test: token-created-message.test.js (3). Verify: „(3/4)" na żywo.
3. **P4 — „patrzy na 2 kart"** [h05]: scry/surveil/Index bez odmiany
   liczebnika (jest polishPlural — te trzy miejsca go ominęły; surveil dla 1
   dawało nawet „1 kart"). Fix: polishPlural w scry_started/surveil_started/
   index_started. Testy: library-manipulation-modal (+3, stary regex E4
   oczekiwał błędnej formy — zaktualizowany).
4. **P6 — każda aura „za koszt bestow"** [h08]: „Ty rzuca Curse of the
   Pierced Heart za koszt bestow". Zdarzenie niesie flagę bestow — komunikat
   uzależniony. Testy: +2. Verify: v4 bez bestow.
5. **P7 — mentor: pusty opis efektu** [h08/h13]: „Gdy ten stwór atakuje jako
   mentor: ." — fallback pod spodem był nieosiągalny. Fix: pełne zdanie reguły
   mentora przy pustych efektach. Test w table-ui.
6. **P8 — aury bez opisu efektów statycznych** [h09/h13]: Nature's Embrace —
   całkiem puste pole tekstowe; Shiv's Embrace bez „+2/+2, Latanie".
   cardInfo niesie teraz deskryptor aura, rulesText renderuje pump/keywords/
   grantMana. Testy w table-ui.
7. **P9 — goły koszt po opisie ekwipunku** [h09/h13]: „Equip {4} — nosiciel…
   · {4}" — zdolność equip dodatkowo opisywana przez describeAbility. Fix:
   pominięcie (equipLine już opisuje). Test w table-ui.
8. **P10 — brakujące podtypy kart** [h02/h13]: „Artifact" zamiast „Artifact —
   Equipment" (Hunter's Blowgun), „Creature" zamiast „Creature — Turtle Ninja"
   (Kappa Tech-Wrecker). Także: Segmented Krotiq (Insect), Highland Game (Elk).
   Wg scryfall-*.json. Strażnik: equipment ⇒ podtyp Equipment (registry).
9. **P11 — „cel: dowolny cel"** [h08]: pleonazm w opisach (any_target).
   Fix: opis bez podwójnego „cel:" (zdolności i czary).
10. **P12 — własny morph jako „morph"** [h01]: etykieta „Rzuć: Village Rites —
    poświęć morph" choć właściciel zna tożsamość (CR 708.6). nameOfObject
    (session) i nameOfObjectId (render) nazywają własne zakryte; wrogie
    zostają „morph" (CR 708.2, playerView maskuje). Strażnicy FoW zieloni.
    Verify: „poświęć Segmented Krotiq (Ty)" na żywo.

Zweryfikowane jako NIE-błędy (odrzucone przy polowaniu, z dowodami):
- Zgłoszenia detektora [info] „czar bota bez okna na odpowiedź" w trybie
  tick-rate 1 (h08) — konsekwencja celowego wyciszenia ptaszkiem przez
  gracza; w tick 0 okno jest (modal-boundary). By-design.
- „Duplikaty" celów lądów w modalu (h02) — odrębne obiekty o tej samej
  nazwie (2 Islands + 2 Forests), legalne oferty.
- Wilkołak: Moonscarred→Scorned przy upkeep po 2 czarach bota — poprawne
  (tylna strona ma minSpellsLastTurn: 2, eachUpkeep — CR ok).
- Bot kontrujący własny czar (Steel Sabotage → Cogwork Assembler, h08) —
  głupota polityki bota: celowanie legalne (CR), polityki botów poza zakresem.
- „Ty mieli" — celowa narracyjna konwencja „Ty <3. osoba>" używana wszędzie
  („Ty zagrywa", „Ty dobiera"), nie odmiana błędna; „tworzysz" to odstępstwo.

### E10 — łatki (commity) i weryfikacje

- 90db939 P1+P3 (silnik), 5fe3793 P12/P4/P6 (sesja), d812a8d P7-P11 (render),
  4ebd0bd P10 (dane kart). Łącznie +23 testy, suite 1725/0, build 1663.8 kB,
  benchmark 7/7. Weryfikacje żywe po rebuild: audyt-m100-e10-VERIFY-*.

### E11 — PRAWDZIWY audyt PR #52 (zlecenie właściciela 2026-08-15)

Nie „spis plików" (to było E0), tylko: czy kod po zmianach robi dokładnie
to, co ma robić; czy zmiany nie mają skutków ubocznych; czy nic ważnego
nie zostało usunięte; spójność mechanik z CR. Zakres: diff 075a79f (squash
PR #52) — plik po pliku kod, nie mapowanie. Raport: sekcja poniżej + wynik
w opisie PR i w HANDOFF.

#### Werdykt ogólny

**PR #52 jest merytorycznie poprawny.** Przeczytane wszystkie hunksy diffa
kodu (7 plików silnika, 3 pliki warstwy stołu, 1 kontroler, 3 pliki
narzędzi testera) oraz wszystkie zmiany testów. Wnioski:

- **Kod robi to, co deklarują commity** — każda mechanika zweryfikowana
  względem „Comprehensive Rules" i względem intencji (patrz lista niżej).
- **Brak skutków ubocznych** — stwierdzone zachowania uboczne są celowe
  i udokumentowane w komentarzach (np. reset `turn.passes` przy każdej
  komendzie nie-pass jest podwojony intencjonalnie; reset atrybutów
  obiektu przy zmianie strefy ma świadome wyjątki LKI).
- **Nic ważnego nie zniknęło** — zmiany w kodzie są chirurgiczne;
  17 plików testów wyłącznie ADYTYWNE (0 usuniętych asercji, 0 osłabionych
  oczekiwań — pełny skan diffami). Jedyna większa podmiana to stara prosta
  polityka testera zastąpiona pełniejszą (potwierdzone behawioralnie:
  `closeBotMove`/modal 'botmove' działają w 13 partiach E9).
- **Stack 1725/0, benchmark bota 7/7, build OK** — po całej sesji M100.

#### Werdykty per mechanika (co sprawdzono → wniosek)

1. **Remis przy równoczesnej przegranej (state-based.js, CR 104.4b).**
   Sprawdzone: SBA zbiera komplet przegranych (życie ≤ 0 ORAZ trucizna
   ≥ 10, w jednym przebiegu) zanim ogłosi wynik; przy przegranej wszystkich
   `isDraw=true`, `winnerId=null`. Okablowanie kompletne: init pola
   (game-state.js), playerView, baner „Koniec partii — REMIS" (main.js +
   render.js), komunikat sesji. Stary bug — wynik zależał od kolejności w
   `state.players` — jest martwy (sam komentarz w kodzie to dokumentuje).
   **WNIOSEK: poprawne.**
2. **Reset liczników priorytetu (game-state.js, CR 117.3c/117.4).**
   `state.turn.passes = 0` wykonuje się przy KAŻDEJ komendzie nie-pass
   (błąd „Carrion Call bez okna po zagraniu" naprawiony u źródła: okno
   priorytetu otwiera się po każdej akcji, nie tylko po niektórych).
   `advanceStep` i rozstrzygnięcie wierzchołka stosu zerują dodatkowo —
   podwojenie intencjonalne, replay deterministyczny. **WNIOSEK: poprawne.**
3. **Własność obiektów przy zmianie strefy (objects.js, CR 400.3/110.2a/
   110.6b/400.7).** `moveObjectDirectly` przy zejściu z bitwiska przywraca
   kontrolera właścicielowi (naprawia grob złodzieja typu Puppeteer
   Clique), odkręca permanent (`tapped:false`) i czyści historię tury
   (damagedThisTurn, attackedThisTurn, monstrous, …) — bo „nowy obiekt"
   nie pamięta przeszłości. Wyjątki Last-Known-Information są świadome
   i opisane w komentarzu. Zmiana w jedynym choke-poincie zmian stref —
   nie da się obejść. **WNIOSEK: poprawne.**
4. **Fizzle zdolności bez legalnych celów (spells.js, CR 608.2b).**
   Przed PR #52 rozstrzygnięcie wskazującej zdolności w sytuacji, gdy cel
   zniknął, wywoływało `markDamage(undefined)` = crash (Ballista Wielder).
   Po zmianie: guard na `targetSpec.length > 0`, zdarzenie `fizzled:true`
   z powodem, zdolności bezcelowe nietknięte; „you may" bez celu → no-op.
   Sprawdzone też fizzle equip i działu (Epic Experiment) — analogicznie.
   **WNIOSEK: poprawne** (drobna uwaga kosmetyczna pkt 3 niżej).
5. **Copy-token DFC (effects.js/tokens.js, CR 707.8a).** Kopia tokena dwu-
   stronnego dziedziczy `transformTo` — naprawia crash B0 („Ta karta nie
   ma drugiej strony (craft)"). Passthrough w tokens.js zgodny.
   **WNIOSEK: poprawne.**
6. **Onesie w widoku + prewencje (game-state.js playerView).** Typy kart
   publiczne w widoku (dla bota i UI), wrogie face-down nadal maskowane
   (cardId→null — strażniki FoW zielone, potwierdzone także max łatką P12:
   własny morph nazwany, wrogi „morph"). Prewencje i tarcze regeneracji
   trafiają do widoku jako KOPIE (nie referencje — brak metki wycieku
   stanu wewnętrznego). Pole `attacking` jawnie publiczne. **WNIOSEK:
   poprawne, FoW nienaruszone.**
7. **grantKeywordsUntilEndOfTurn(..., options) (permanents.js).**
   Adytywny parametr (viaBackup) — żadne istniejące wywołanie nie zmieniło
   semantyki. **WNIOSEK: poprawne.**
8. **Paria bota z silnikiem (heuristic-bot.js).** `damageFullyPrevented`
   (bot) to wierna replika `isDamagePrevented` (permanents.js): every
   typesInclude + isCreature/kind. Błąd M99 („bot zachodzi w prewencję")
   naprawiony bez rozpoznawania kart po nazwach (zgodne z ADR 0002).
   Nowe heurystyki (removal wrogi/własny, fog tylko w turze wroga, pump
   tylko w combat, self-mill penalizowany) czytają wyłącznie publiczne pola
   widoku. Benchmark 7/7. **WNIOSEK: poprawne, FoW nienaruszone.**
9. **Ptaszek grup wariantów (render.js).** Grupa „ignorowalnych" opcji
   (np. wszystkie payloady Village Rites) dostaje ptaszka tylko, gdy CAŁA
   grupa jest ignorowalna; stan ptaszka = „wszystkie klucze obecne";
   toggle flipuje jednolicie (warunek `isIgnored === wasIgnored`), więc
   częściowa grupa nie daje fałszywego ptaszka. Zweryfikowane na żywo w E9.
   **WNIOSEK: poprawne.**
10. **Filtr modali z samą „Fazą:" (main.js).** Zgodne ze słowem właściciela
    z M98: nagłówki tur zostają w logu, same fazy = szum. Czyszczenie
    bufora (clearBotMoves + continueAfterBotPause) nie zjada komunikatów —
    sprawdzone, że bufor to tylko ruchy bota między modalami. **WNIOSEK:
    poprawne, decyzja właściciela zachowana.**
11. **Narracja sesji (session.js).** Nowe słowniki ZONE_LABELS /
    KEYWORD_EVENT_LABELS są osobnym modułem od render.js celowo (cykl
    importów przy sklejaniu build.mjs — zweryfikowane kierunki importów).
    Tryby w „rzuca"/„rozstrz."; REMIS w „przegrywa"; keyword_granted poza
    sekcją backup; proliferate_resolved→null (bez szumu). **WNIOSEK:
    poprawne** (uwagi kosmetyczne pkt 1, 4, 5 niżej).
12. **Narzędzia testera (tools/table-tester).** Nowe detektory (m.in.
    „no-response-window" z REGAINED_CONTROL) — zweryfikowane na 13 partiach
    E9: jedyne zgłoszenie to celowe wyciszenie ptaszkiem w tick-rate 1
    (by-design, udokumentowane w E9). Usunięta prosta polityka zastąpiona
    pełniejszą — bez regresji obserwowalnej. **WNIOSEK: poprawne.**
13. **Testy PR #52 (17 plików).** Skan wszystkich diffów testów: 0 linii
    usuniętych, 0 osłabionych (=> zamiana na łagodniejsze dopasowania),
    wszystkie nowe asercje odnoszą się do wprowadzonych mechanik.
    **WNIOSEK: testy wzmacniają, nic nie kasują.**

#### Uwagi / drobiazgi (nic blokującego; 1 naprawiona na bieżąco)

1. **NAPRAWIONE — docstring `zoneLabel` kłamał** (session.js): opis głosił
   „nieznany identyfikator zwraca «?»", a kod zwraca SUROWY identyfikator.
   Kod jest lepszy od docstringu (odsłona błędu > dyskretna heurystyka),
   więc poprawiony docstring — nie kod. Testy session 13/0.
2. Fizzle zdolności jest logowany jak zwykłe „rozstrzygnięta" —
   `describeGameEvent` nie pokazuje powodu fizzle dla zdolności (samo
   `fizzled:true` w zdarzeniu jest). Kosmetyka; przed #52 to był CRASH,
   więc obecny stan to poprawa. Zostaje jako ewentualny polish później.
3. `keyword_granted` bez cardId może dać „? zyskuje: …" (brzegowy przypadek
   źródła bez stałego cardId). Kosmetyka logu.
4. Docstring goad w permanents.js („znacznik zdejmuje cleanup") jest
   niezgodny z rzeczywistym wygaszaniem na starcie tury (game-state.js).
   Odkryte przy audycie, ale to jest PRE-EXISTING (nie pochodzi z PR #52).
5. ZONE_LABELS używa „cmentarz"/„wygnanie", a reszta UI mówi „grób"/„exile"
   — niespójność leksykalna logu. Rozproszone, ryzyko churnu; zostaje jako
   uwaga do decyzji właściciela, czy ujednolicać słownictwo.

### E7 — dokumenty i domknięcie

- [x] `PROJECT_STATE.md` — wpis M100 (+ uzupełnić brakujące wpisy M98/M99,
      jeśli audyt potwierdzi brak — patrz E0).
- [x] `TESTER_STOLU.md` — nazwa „Rozgrywka" i zakres osi 2 po zmianach.
- [x] `docs/setup/HANDOFF_2026-08-15.md` + blok przekazania w czacie.
- [ ] Opis PR — kumulatywny. (aktualizowany na bieżąco; finalny stan po ostatnim commicie)

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
