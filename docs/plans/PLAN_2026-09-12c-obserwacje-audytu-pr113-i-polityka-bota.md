# PLAN 2026-09-12c — obserwacje audytu PR #113 (F1–F8, O1/O3/O4) + polityka bota przy przydziałach obrażeń

**Sesja:** `arena/01a0925f-mtg` (PR #114 — ten sam PR, kontynuacja po E7).
**Baza:** `214e7bb` (E6 uzupełnienie). **Bramki na starcie:** `npm test`
5195/5195, `npm run test:all` 5205/5205, `npm run build` 61 modułów / 3523,6 kB,
quick benchmark 84,2% (566/672), golden master bota bez churn po W5/E6.

**Zlecenie właściciela (2026-09-12):** „kontynuuj z zaproponowanymi dalszymi
krokami: obserwacje audytu PR #113 (F1, F2, F3, F5, F7, F8, O1, O3, O4) oraz
polityka bota przy przydziałach obrażeń — domyślny lethal-first nie korzysta
z pokrycia lethal przez inne stwory (po W5 przydział 0 + całość na gracza jest
legalny); to wycena, nie reguły, więc wymagałoby pomiaru wpływu na win-rate."

## Lektura startowa (AGENTS.md §0)

AGENTS.md, ENVIRONMENT.md, ADR 0002/0005/0016/0018/0020/0021/0029/0030,
docs/LESSONS.md (L7, L13, L14, L16, L21, L27, L28, L41, L48, L76, L92),
`docs/setup/TESTER_STOLU.md` (osie audytu), `docs/setup/HANDOFF_2026-09-12.md`,
`docs/plans/PLAN_2026-09-11b-audyt-pr113-wyzwanie-3-5.md` (odhaczony w całości).

## Punkt zaczepienia (zmierzony 2026-09-12, nie przepisany — L7/L92)

### 0. Utrata szczegółu audytu i brak pliku — korekta własnego wpisu

Plan `PLAN_2026-09-11b` (punkt E2, odhaczony w tej sesji) podaje jako wynik
`docs/audits/AUDYT_PR113_2026-09-11.md`. **Plik nie istnieje** (`ls docs/audits`
— brak); obserwacje F1–F8/O1–O4 przetrwały tylko jako skrót w
`docs/setup/HANDOFF_2026-09-12.md` (linie ~200–206) i w opisie PR #114 §1.
Szczegół utracony z dwoma resetami piaskownicy. Wniosek: wpis E2 jest
**nieprecyzyjny i musi być skorygowany**, a obserwacje trzeba **zmierzyć od
nowa** w dzisiejszym kodzie — nie odtwarzać z pamięci (ADR 0030 §2, L7).

### 1. F1 zmierzone dziś (sonda `/tmp/f1.mjs`, do przepisania jako narzędzie)

`stateFingerprint` (`src/engine/fingerprint.js`) rzutuje **58** pól obiektu,
a obiekt gry ma ich **100**; pomiar na bogatym obiekcie: **33 pola ustawione,
a nieobecne w odcisku** — `ownerId`, `cardName`, `name`, `bloodthirst`, `renown`,
`protectionFromColors`, `suspend`, `suspended`, `suspendReady`, `timeCounters`,
`warp`, `warpReady`, `surge`, `manifestTurnUpCost`, `rebound`, `reboundCast`,
`reboundReady`, `madness`, `toxic`, `echo`, `echoColors`, `echoUnpaid`,
`chooseColor`, `devour`, `endure`, `exploit`, `enteredOnTurn`,
`damagedByDeathtouch`, `formerCounters`, `isToken`, `saga`, `station`,
`manaFromTreasureSpent`. Poziom stanu: **114** kluczy, **16** poza odciskiem —
`starterId`, `isDraw`, `objectSequence`, `spellsCastThisTurn`,
`lastTurnSpellsCastByPlayer`, `spellsCastThisTurnByPlayer`, `lastTurnSpellsCast`,
`mulliganCounts`, `cardsDrawnThisTurn`, `lifeGainedThisTurn`,
`preventCombatExceptEnchanted`, `creatureDiedThisTurn`, `landEnteredThisTurn`,
`damageTakenByPlayerThisTurn`, `speedIncreasedThisTurn`, `moonlitUsedThisTurn`.
Notatka audytu mówiła o 11 polach — klasa jest **większa**, a część pól zmienia
PRZYSZŁE możliwości (liczniki czasu, echo, madness, rebound, trackery turowe
typu „ile czarów w tej turze"), więc sonda „oferta bez skutku" (M103, L15) może
dawać fałszywe „brak skutku", a weryfikacja replayów nie odróżnia takich stanów
(klasa L16/M122#1/M187-N1/M323 — w tym repo wracała pięciokrotnie).
Strażnik istnieje tylko dla decyzji wstrzymujących
(`test/fingerprint-pending-decisions.test.js`) — dla pól obiektu i liczników
turowych strażnika NIE MA. Fixtury nie przechowują odcisków
(`grep -rl fingerprint test/fixtures` — pusto), więc rozszerzenie projekcji nie
psuje zapisanych danych; `test/replay.test.js` porównuje dwa biegi (ADR 0005 —
wszystkie pola deterministyczne).

### 2. Polityka bota przy przydziałach (zlecenie właściciela)

Po W5 (`fa52619`) przydział „0 na blokera + całość na gracza" jest legalny, gdy
lethal blokera pokrywają obrażenia przydzielane mu w tym samym kroku przez inne
stwory (CR 702.19b/702.2b). Domyślna polityka (`defaultDamageAssignment`,
lethal-first po blokerach w kolejności deklaracji) tego NIE wykorzystuje, a bot
nie ma wariantów do wyboru: `legalCommands` oferuje JEDNĄ komendę
`resolve_damage_assignment` z domyślną mapą (`buildDefaultDamageAssignments`),
więc „polityka" bota = polityka domyślna silnika. To wycena, nie reguły — zmiana
wymaga pomiaru win-rate (quick benchmark) i świadomego uzasadnienia zmian
golden mastera.

### 3. O4 (duplikacja helpera) — konkretny przypadek z tej sesji

Przy W5 dodano modułowe `inFirstStrikePassOf`/`inRegularPassOf` (`combat.js`),
a `processCombatPass` ma własne lokalne domknięcia `inFirstStrikePass`/
`inRegularPass` o identycznej treści — dwie kopie tej samej reguły (L41/L14:
jedna zasada, jedna implementacja).

### 4. F7 (`hasCreatureType` bez testu) — do zmierzenia

Notatka: „`hasCreatureType` w 23 miejscach bez testu". Liczba miejsc i pokrycie
testowe do ponownego pomiaru (kod się od audytu zmienił).

## Kroki

- [x] **B1 — polityka domyślna trample korzysta z pokrycia lethal (zlecenie
      właściciela).** `defaultDamageAssignment` liczy przydziały SEKWENCYJNIE
      w kolejności deklaracji i dla atakującego z trample pomija dopłatę do
      lethal, który już pokrywają inni (CR 702.19b: „damage from other creatures
      that's being assigned during the same combat damage step"; nadmiar idzie na
      gracza). Reguły się NIE zmieniają (W5 już to zalegalizowało) — zmienia się
      wybór domyślny, czyli także punkt startowy wizarda i ruch bota.
      Pomiar: golden master (ile decyzji i jaki scoreSum), quick benchmark
      (win-rate przed/po — regresja = wycofać zmianę), test RED→GREEN + mutacje
      (L13). Etykieta wizarda już wyjaśnia pokrycie (F-E6-2, `078e6ed`).
- [x] **B2 — F1: odcisk obejmuje stan zmieniający przyszłe możliwości +
      STRAŻNIK.** Projekcja pól obiektu i liczników turowych; osobna, jawna
      lista pól POMIJANYCH z powodem (stałe gry: `starterId`, `isDraw`), żeby
      „pomijam, bo zapomniałem" i „pomijam, bo tak trzeba" były rozróżnialne.
      Strażnik (test) wylicza shape obiektu i klucze stanu i żąda dla każdego:
      projekcja ALBO wpis na białej liście — klasa nie może wrócić po cichu
      (L16/L28). Weryfikacja dwustronna (L27): na stanie sprzed naprawy strażnik
      MUSI krzyczeć, po naprawie milczeć.
- [x] **B3 — O4: jedna implementacja przynależności do przebiegu.** Usunąć
      lokalne domknięcia w `processCombatPass` na rzecz modułowych helperów
      (bez zmiany zachowania; testy W3/W4/W5 muszą pozostać zielone).
- [x] **B4 — F7: inwentaryzacja `hasCreatureType` + test.** Pomiar liczby miejsc
      i pokrycia; jeśli brak testu jednostkowego — test na rodzinę (changeling,
      typy warunkowe, `creature_you_control`), nie po jednej karcie (ADR 0002).
- [x] **B5 — F2/F3/F5/F8/O1/O3: pomiar każdego wskaźnika z osobna i werdykt.**
      Wskaźniki z notatki: `effects.js:1079` (F2), `triggers.js ~2735` (F3),
      `session.js:2623`/`:3226` (F5, numery przesunięte po E6), nieaktualne
      liczby w komentarzach (F8), martwy sentinel (O1), „nieszkodliwe" (O3).
      Każdy punkt: zmierzyć w dzisiejszym kodzie, zapisać werdykt (naprawa ALBO
      odrzucenie z dowodem) — bez zgadywania, co autor miał na myśli.
      F4 odrzucone wcześniej jako fałszywy pozytyw — NIE wracać.
- [x] **B6 — dokumenty.** Utworzenie `docs/audits/AUDYT_PR113_2026-09-11.md`
      jako REKONSTRUKCJI z dzisiejszym pomiarem (uczciwie oznaczonej: szczegół
      oryginalny utracony), korekta wpisu E2 w `PLAN_2026-09-11b`, wpisy
      w `docs/PROJECT_HISTORY.md` i `docs/setup/HANDOFF_2026-09-12.md`,
      kumulatywny opis PR #114 (REST PATCH — `gh pr edit` pada), trzy partie
      Żywym Testerem po zmianach (L76: świeży `dist/`).

## Kolejka commitów (każdy samodzielnie zielony: `npm test` + `npm run build`)

1. `docs(plan)`: ten plan (przed kodowaniem — ADR 0020 A).
2. `feat(bot)` lub `revert`: B1 z pomiarem win-rate i golden mastera.
3. `fix(pomiar)`: B2 (odcisk + strażnik).
4. `refactor(combat)`: B3.
5. `test`: B4.
6. `fix`/`docs`: B5 (osobno na każde znalezisko z werdyktem „naprawa").
7. `docs(audyt)`: B6.

## Ryzyka i pułapki

- **B1 zmienia golden master bota** — regeneracja tylko z uzasadnieniem liczbowym
  (które partie, ile decyzji, scoreSum) i po potwierdzeniu, że quick benchmark nie
  spada poniżej 84,2% (566/672). Pełnego B0 nie uruchamiamy (ADR 0018).
- **B1 zmienia też punkt startowy wizarda** — etykieta z F-E6-2 musi zostać
  spójna (testy UI `test/choice-request-ui.test.js`).
- **B2 rozszerza odcisk** → sonda „oferta bez skutku" stanie się surowsza:
  możliwe NOWE zgłoszenia w partiach Żywego Testera (to cel, nie regresja), ale
  każde trzeba przeczytać i rozstrzygnąć (L27 punkt 5: jeśli detektor oskarża
  kod poprawny, napraw POMIAR).
- Numery linii z notatki audytu są przesunięte (W3/W4/W5/E6 dotknęły `combat.js`,
  `game-state.js`, `session.js`, `choice-request.js`, `tokens.js`) — szukać
  po treści, nie po numerze.
- `addObject` odrzuca pola spoza kontraktu (L21) — sonda pomiarowa musi ustawiać
  pola przez `state.objects.set(id, Object.freeze({...}))`, inaczej pomiar kłamie.
- Zmiany dokumentów uruchamiają testy czytające dokumenty
  (`dokumentacja-budzet-lektury`, `m197-plany-kolekcji`, `family-audit.mjs`).

## Wyniki (pomiar 2026-09-12, po wykonaniu)

- **B1** (`2d30130`): domyślny przydział trample korzysta z pokrycia lethal
  (CR 702.19b/702.2b), sekwencyjnie w kolejności deklaracji, `onlyAssigned`
  oddziela politykę od walidatora. Sonda: oferta `{x:[{w:3}]}` → `{x:[{w:0}]}`
  (5 na gracza zamiast 3+2). Golden master BEZ zmian, benchmark IDENTYCZNY
  (84,2% / 566 z 672) — sytuacja nie występuje w korpusie; wartość = spójność
  z W5 i lepszy domyślny przydział dla człowieka. Testy B1/1–B1/6; mutacje
  M1/M2/M4/M5 złapane, **M3 równoważna** (udokumentowana, nie łapana na siłę).
- **B2** (`ebae99d`): odcisk = 51 brakujących pól obiektu (projekcja generyczna
  `...projectValue(rest)`) + 14 liczników tury + 5 pól stanu efektów +
  `madnessQueue`; wykluczenia etykiet jawne z powodem (`copyNumber` — pin M323/D,
  `objectSequence` — generator id, `commands`/`events` — dzienniki, `starterId`/
  `isDraw` — stałe); strażnik pokrycia B2/1–B2/2 (uniwersum = fabryka ∪ token),
  sondy zachowania B2/3–B2/5b, pin granicy B2/7. Sonda no-op: `lastManaSpend`
  zaklasyfikowany po stronie KOSZTU. Cztery testy kodujące starą granicę
  (M323/D, U9 ×2, M104) zostały zielone BEZ zmian. Strażnik dwustronny:
  czerwony na `fingerprint.js` sprzed naprawy.
- **B3** (`a00707d`): jedna implementacja przynależności do przebiegu — usunięte
  lokalne domknięcia w `processCombatPass` i `buildDamageAssignmentView`
  (`grep` po naprawie: 2 wystąpienia reguły, oba w definicjach modułowych).
- **B4** (`1e23847`): test rodzinny `hasCreatureType` (B4/0–B4/8: changeling =
  każdy typ stworów z katalogu, każda strefa, zakrycie CR 708.2a, grant EOT,
  `typeGrant` przez silnik, straże, skan źródeł pod kontrakt „typy niestworowe
  tędy nie przechodzą") + naprawa rozjazdu reguły: `effectiveSubtypesOnBattlefield`
  deleguje do `effectiveSubtypes` (CR 305.7/613.1d/205.3d). Mutacje M1–M5 złapane.
- **B5** (`f910765` dla F5; werdykty w `docs/audits/AUDYT_PR113_2026-09-11.md`):
  F2 i F3 **odrzucone z dowodem** (pomiar: `armedOnTurn` diagnostyczne + cleanup
  czyści rejestr `permanents.js:1136`; wszystkie trzy emisje `permanent_cast`
  niosą `object`), **F5 POTWIERDZONE i NAPRAWIONE** — wrostkowa bramka 14 członów
  w `noteBotMove` wyekstrahowana do `isMainLogEvent`, `phaseHeaderFor` →
  `phaseHeaderText` (czysta), zbiory bramek na poziom modułu; równoważność
  udowodniona na **68 208 kombinacjach, 0 rozjazdów**; test rodzinny B5/1–B5/14,
  mutacje 9/9 złapane, Żywy Tester 3 partie / 304 sondy / 0 zgłoszeń. F8
  naprawione (liczby z pomiaru), O1 nie do odtworzenia, O3 bez akcji, F4 nie wraca.
- **B6**: ten plan odhaczony, audyt zapisany jako REKONSTRUKCJA, wpis E2
  w `PLAN_2026-09-11b` skorygowany, `HANDOFF_2026-09-12` i `PROJECT_HISTORY`
  zaktualizowane, opis PR #114 przez REST PATCH, Żywy Tester: 7 partii na
  świeżym `dist/`, 362 sondy no-op, 0 zgłoszeń detektorów.
- Bramki końcowe: `npm test` **5232/5232**, build 61 modułów / **3533,1 kB**,
  benchmark **84,2% (566/672)** w 135,0 s, golden master bez zmian, Żywy Tester
  10 partii / 666 sond no-op / 0 zgłoszeń detektorów.
- Kolejka na następną sesję: (1) O1 — odtworzenie wskazania „martwy sentinel"
  z opisu właściciela (pomiar nie znalazł kandydata w logice), (2) do decyzji
  właściciela: squash-merge PR #114, pełny B0 (ADR 0018), (3) zapadnia druków:
  `bezSetu` 43 i `bezZrodla` 13 (snapshoty do przepisania pobraniem set-aware).
