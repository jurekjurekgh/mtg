# Plan: zgłoszenia właściciela H + I (2026-11-07)

Zgłoszenia z wiadomości właściciela (sesja po zamknięciu bumpu CR + F-OGŁ, PR #181):

- **H. Mindstab/Suspend**: (a) akt zawieszenia sorceryka tylko w fazie Main
  (CR 702.62a „if you could begin to cast this card…", 307.1); bot podobno
  zawieszał w upkeep; (b) bot ma mieć DODATNI scoring suspend TYLKO w Main2
  (postcombat_main) — „mana pod koniec tury", nie Main1.
- **I. Undercity**: hover na nazwie ścieżki w wyborze („Podziemia — idź do:
  Forge") ma ZAWSZE pokazywać kartę Undercity — tę samą, którą pokazuje hover
  panelu Undercity.

## Rozpoznanie (odczyty źródeł, nic niezmienione)

### H1 — akt zawieszenia w upkeep: NIEMOŻLIWY w silniku

- `suspendCard` (src/engine/spells.js:3260) rzuca `Suspend tylko w swoją fazę
  main przy pustym stosie`, gdy: nie aktywny gracz LUB faza poza
  `['precombat_main','postcombat_main']` LUB stos niepusty. Dodatkowo wymaga
  karty z `suspend` w RĘCE tego gracza.
- `execute` (src/engine/game-state.js:6732) owija to w `reject('illegal_suspend:…')`.
- Oferta (game-state.js ~9526): ta sama bramka (aktywny gracz + faza main +
  pusty stos) obejmuje `suspend_card` — w upkeep komenda nie istnieje w
  `legalCommands`, więc i UI, i bot nie mają czego kliknąć.
- W katalogu JEDYNA karta z `suspend` to **Mindstab** (sorcery {1}{B},
  Suspend 4—{B}) — bramka „main phase" jest dziś de-facto zgodna z CR
  (timing zawieszenia = timing rzutu tej karty z ręki, 307.1). Gdyby przyszły
  karty instant-speed z suspend, bramkę trzeba uogólnić o timing rzutu —
  dzisiaj brak takich kart.
- **Wniosek**: linia logu w t3 „Mindstab — trigger (suspend — zdjęcie licznika
  czasu w podtrzymaniu)" to LEGALNY trigger upkeep (CR 702.62a, drugie
  zdanie), nie akt zawieszenia. Akt zawieszenia w t3 nastąpił w T8 MAIN1
  (przed deklaracją ataku). Zgłoszenie (a) = misreading; mimo to dokładamy
  piny gwarancyjne, żeby bramka nie zardzewiała.

### H2 — wycena suspend nie rozróżnia faz

`case 'suspend_card'` (src/controllers/heuristic-bot.js:12139):
`castOfferedNow ? 8 : 30` − `creatureManaCostWeight`×(koszt+pipy) −
`suspendWaitPenalty`×liczniki. Zero czynnika fazy → w Main1 suspend wygrywa,
gdy rzut nieosiągalny (t3: T8 main1, 24 pkt). Właściciel: dodatni scoring
TYLKO w Main2.

Precedens w kodzie: `morbidMain1Penalty`/`morbidMain2Bonus` (rzut czeka na
Główną 2) — ten sam kształt reguły.

### I — opcje trasy Undercity nie mają podglądu

- Panel Undercity: `renderUndercity` → `attachSpecialCardHover(card, hover,
  {name, imageUri: UNDERCITY_DUNGEON…})` — hover działa.
- Wybór trasy: grupa `resolve_undercity_route` → w modalu idzie przez
  `buttonsPlanOf` → `renderMultiTargetWizard` (buttonsMode). Wiersz dostaje
  podgląd/hover WYŁĄCZNIE gdy `cardIdForChoiceOption(option)` zwróci cardId —
  a komenda trasy (`{type, roomName}`) nie niesie żadnej karty, więc
  `previewCardIdOfOption` zwraca null → nazwa ścieżki jest martwym tekstem.
- Opcjonalny kanał `onHoverCardByCardId` → `modalHoverByCardId` →
  `modalHoverInfoByCardId(cardId)` (rejestr) → `scryfallHover.start(info)` —
  ta sama machina, którą panel podaje info {name, imageUri}.

## Zmiany

### H1 — piny gwarancyjne (silnik już zgodny; bez zmian src)

Nowy plik `test/zgloszenie-h1-suspend-timing.test.js` (wzorzec:
zgloszenie-d-k6-tokeny):

1. upkeep własny: w `legalCommands`/widoku NIE MA `suspend_card`
   (Mindstab w ręce + bagno);
2. upkeep własny: `execute({type:'suspend_card',…})` → odrzucone
   (`ok:false`, `illegal_suspend:`), karta zostaje w ręce;
3. main1 i main2: oferta `suspend_card` JEST;
4. main1 + coś na stosie: oferty brak (bramka pustego stosu);
5. main faza przeciwnika: oferty brak (tylko własna main).

### H2 — kara w Main1 jako parametr deskryptorowy

- `heuristic-params.js`: nowy klucz `suspendMain1Penalty` (obok
  `suspendWaitPenalty`; nazwa mówi, ZA CO jest kara) + domyślna wartość
  **40** (baza ≤ 30 → wynik w Main1 ≤ −10, strictly pod pasowaniem;
  por. morbidMain1Penalty 90 przy bazie ~70).
- `heuristic-bot.js` `case 'suspend_card'`: po doliczeniu kosztu i zwłoki —
  kara `P.suspendMain1Penalty`, gdy `myTurn(view)` i faza
  `precombat_main` (oferta i tak istnieje tylko we własnej main — straż
  lustrzana jak przy morbid). Postcombat_main: bez zmian (dodatni scoring).
- Piny w `test/audyt-pmssb35-odroczenie.test.js`:
  - B1–B5 przechodzą do sceny **main2** (postcombat_main) — dokumentują
    arytmetykę baza/koszt/zwłoka, która jest bezfazowa; helper `game()`
    dostaje opcję `step`;
  - nowa sekcja H2: Main1 → bot NIE zawiesza (wybiera pasowanie/rzut),
    Main2 → zawiesza (ta sama scena); kotwice arytmetyczne
    (Main1 = 24 − 40 = −16; pokrętło 0 przywraca 24 — wymiar wyłączalny,
    konwencja M429).
- Golden master `test/bot-scoring-snapshot.test.js`: świadoma regeneracja
  (`node tools/bot-scoring-snapshot.mjs --write`) + wpis w rejestrze
  regeneracji z zmierzoną różnicą.
- Benchmark bota (`npm run benchmark` + bot-benchmark w test:all) — obowiązkowo
  (zmiana wyceny).
- Dowód decyzyjny: re-run partii t3 (seed 4242) testerem — akt zawieszenia
  przenosi się z main1 do main2 (albo znika, gdy main2 bez sensu).

### I — pseudo-id 'undercity' dla opcji trasy

- `choice-request.js` `previewCardIdOfOption`: `resolve_undercity_route` →
  zwraca `'undercity'` (pseudo-id karty specjalnej spoza rejestru; celowo
  PRZED pętlą `resolveCardId`, bo rejestru nie zna). Funkcja czysta — pin
  jednostkowy.
- `main.js` (trzy miejsca, jeden koncept „karty specjalne po pseudo-id"):
  - `modalHoverInfoByCardId('undercity')` → info lochu
    (`UNDERCITY_DUNGEON.name/imageUri`, types: ['Dungeon']) — ten sam obraz
    co panel;
  - `openCardFullscreenByCardId('undercity')` → `openUndercityFullscreen()`
    (ścieżka dotykowa: tap w nazwę trasy = pełny ekran lochu);
  - `cardNameOfOption` → `'Undercity'` dla pseudo-id (etykieta przycisku
    podglądu w ścieżce zapasowej renderChoiceRequest).
- Piny `test/zgloszenie-i-undercity-podglad-trasy.test.js`:
  1. czysty: `previewCardIdOfOption({type:'resolve_undercity_route',
     roomName:'Forge'}, …) === 'undercity'`;
  2. instalacja: `renderMultiTargetWizard` buttonsMode z wierszem
     cardId 'undercity' → hover na nazwie wiersza woła
     `onHoverCardByCardId('undercity')` (mini-DOM, wzorzec m202-b);
  3. drut (L16, skan źródła main.js jak w audyt-pr1xx): modalHoverInfoByCardId
     i openCardFullscreenByCardId mają gałąź 'undercity' używającą
     UNDERCITY_DUNGEON / openUndercityFullscreen.

## Kolejność i bramy

1. Plan (ten plik) — commit.
2. Piny RED: H1 (oczekiwane zielone od razu — gwarancja), H2 (czerwone:
   Main1 bot zawiesza), I (czerwone: brak 'undercity').
3. Fixy: H2 (params + bot), I (choice-request + main.js).
4. Piny GREEN + `npm test` (fast).
5. Świadoma regeneracja golden master + wpis w rejestrze (zmierzona różnica).
6. `npm run test:all` (grupami), `npm run build`, `npm run benchmark`.
7. Dowód t3: `npm i` w tools/table-tester (node_modules zniknęły) →
   `run-game.mjs --seed 4242` → porównanie z .arena/t3.txt.
8. Dokumentacja: PROJECT_HISTORY, handoff, PR #181 (REST PATCH body),
   commit + push. Bez scalania PR.
