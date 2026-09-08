# Weryfikacja zgłoszeń A/B — 2026-09-08

Kontynuacja PR106 po ukończonym batch54. Bez nowych kart, zmian talii,
wag bota ani kolejnego audytu105. Plan ze źródłami Oracle/CR opublikowano
przed kodem: `docs/plans/PLAN_2026-09-08-animator-discard-ui.md`.

## A — odznaka animacji

PlayerView wyprowadza `linkedAnimationSource` z aktywnego linkedAnimations
oraz żywego źródła na battlefield. Wspólny overlay pokazuje
**„animowany przez Skilled Animator”**; nie rozpoznaje karty po ID ani5/5.
Źródło face-down ma cardId:null i opis „animowany przez zakrytą kartę”,
także dla kontrolera. Odejście źródła/hosta usuwa powiązanie i odznakę.

8 testów `test/owner-animation-badge.test.js`: rzeczywisty rzut/ETB,
PlayerView obu graczy, wspólny DOM overlay, source→grave/exile/hand,
ponowne wejście hosta, zmiana kontroli/zakrycie źródła, zwykły5/5 bez badge.
Dodatkowy strażnik tekstu usuwa zauważony na żywym stole stary opis
„animuj do końca tury”: poprawne bazowe5/5 trwa dopóki źródło jest na polu.
Mechanika czasu trwania animacji nie została zmieniona.

## B — jeden wybór N odrzuceń

- Decydent dostaje publiczny dla niego deskryptor liczby/celu decyzji;
  przeciwnik ma pendingDiscardChoice:null. Źródło nie odsłania obcej ręki.
- `discardPlanOf` wykorzystuje oferty pojedynczych kandydatów i dokładną
  liczbę z widoku, bez enumerowania podzbiorów ręki.
- Realny main kieruje przed single-target do wspólnego checkbox pickera:
  licznik0/N, dokładnieN, jedno zatwierdzenie.
- `resolve_discard_choice/cardIds` sprawdza całą listę przed pierwszym
  odrzuceniem: rozmiar, unikalność, kandydaci, żywa ręka i kontroler.
  `cardId` nadal działa dla botów/replayów i prostych pojedynczych wyborów.
- Madness, pendingSpell i pendingAbilityActivation ruszają dopiero po
  pełnym odrzuceniu. Krótsza ręka dla efektu oraz Nightsnare zachowane.
- Anulowanie **nie odrzuca zaznaczonych kart**. Nie jest jednak cofnięciem
  rzutu ani zwrotem wcześniej opłaconej many: koszt nadal czeka na wybór.
  Po zapłacie kontrczar nie zwraca kart; draw3 następuje przy resolution.
- Log nazywa każdą kartę przez card_discarded; resolved nie dodaje już
  fałszywego trzeciego/pierwszego odrzucenia „kosztu zdolności”.

24 testy `test/owner-discard-selection.test.js`, w tym wykonanie prawdziwej
funkcji openChoiceRequest z main + rzeczywisty renderer DOM + execute.
Potwierdzone0/1/3 niedozwolone przy N=2, anulowanie/reopen, brak zmian przed
zatwierdzeniem, błędne/stare ID/kontroler, atomowość, kontrczar, madness,
Plague Reaver, Mindstab z krótszą ręką i Nightsnare. Starsze rodziny UI
pozostają w pełnej bramce testów.

## Bramki i dowód z artefaktu

- A: fast4935/4935; B: fast4958/4958 przed ostatnimi2 testami tekstów.
- **Finalne `npm run test:all`:4970/4970**,236363ms, bez skipped/fail.
  Obejmuje32 nowe testy A/B i cały szybki/wolny zestaw.
- **Build:60 modułów/3433,3kB**, `git diff --check` czysty.
- Golden bez regeneracji: **4d9b14e84a7aedfea809663b54ced107cbf4077971c85d9cf0dd872ffa13c886**.
  Wagi/progi/fixture/skład benchmarku nietknięte; poprzedni quick batch54
  pozostaje wynikiem historycznym, nie nowym przebiegiem tych poprawek.

Odtwarzalna komenda po `npm run build` (jsdom w tools/table-tester):

```sh
node tools/table-tester/run-game.mjs --human kaladesh --bot forgotten-realms \
  --seed 11068 --steps 80 --snapshot-every 1 \
  --out ../../.arena/owner-closed-live.txt
```

Nieinstrumentowany standalone `dist/mtg-table.html`, realne talie i ruchy:

1. Cathartic Reunion: „zaznacz2 karty do odrzucenia jako koszt”,4 kandydatów,
   **jeden picker2z4**. Odrzucone Island i Mountain; dopiero potem dobrane
   Stall Out, Ghirapur Gearcrafter i Welder Automaton. Nie ma drugiego
   modala wyboru pojedynczej karty.
2. Skilled Animator ETB wskazuje Merchant’s Dockhand. Snapshot faktycznego
   kafla: **„animowany przez Skilled Animator ·5/5”**, obok poprawny opis
   źródła „dopóki źródło pozostaje na polu bitwy”.
3. 80kroków (limit scenariusza, nie pełna partia),54 sondy noop,
   **0 zgłoszeń detektorów**,0 wybranych ruchów bez dedykowanej wyceny.
   To nie jest dowód optymalności bota ani test gestów/layoutu przeglądarki.
   Pełną macierz wygaśnięcia badge pokrywają testy A, nie ten sam live.

Pierwszy live zgłosił etykietę „(koszt)” jako pusty deskryptor — poprawiono
tekst na „koszt: odrzuć2 karty”, bez wyłączenia/osłabienia detektora.
Live ujawnił też dwa stare błędy opisów powyżej; poprawione i ponownie
sprawdzone na świeżym buildzie. Surowe logi pozostają w ignorowanym .arena.

## Publikacja

A:938882b; B:da70d10, oba wypchnięte, oba CI SUCCESS
([A](https://github.com/jurekjurekgh/mtg/actions/runs/34264619030),
[B](https://github.com/jurekjurekgh/mtg/actions/runs/34265720965)).
Finalne poprawki tekstów/raport w kolejnym commicie tej samej gałęzi;
wynik jego CI i aktualny HEAD w opisie/checks PR106. PR pozostaje OPEN,
bez merge i bez wymuszonego push. Zakończono A/B, brak nowego batcha.
