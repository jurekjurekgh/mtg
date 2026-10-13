# Plan 2026-10-12 — F: Impulse i sekwencyjna kolejność spodu biblioteki

## Zgłoszenie i stan wyjściowy

Oracle Impulse brzmi:

> Look at the top four cards of your library. Put one of them into your hand
> and the rest on the bottom of your library in any order.

Silnik już rozdziela ten efekt na `pendingLookTopN`, przyjmuje
`resolve_look_top_choice.cardId` oraz opcjonalne `bottomOrder`, waliduje pełną
permutację reszty **przed mutacją** i odkłada ją na spód biblioteki. Brakuje
jednak warstwy interakcji:

- `playerView.pendingLookTopN.cards` bezpiecznie ujawnia obejrzane karty tylko
  decydentowi;
- `legalCommands` oferuje po jednej komendzie na wybór karty (bez permutacji —
  to poprawna i zachowywana własność);
- zwykły modal listy odsyła wyłącznie `cardId`, więc silnik korzysta z domyślnej
  kolejności reszty;
- gracz nie dostaje kroku pozwalającego ustalić `bottomOrder`.

Bazowa brama przed zmianą jest zielona: testy istniejącego wspólnego wizarda,
pełnego przepływu wstrzymanego Impulse oraz batcha 65 dają **58/58**.

## Kontrakt UX

Po rozstrzygnięciu Impulse gracz:

1. widzi cztery obejrzane karty i wybiera dokładnie jedną do ręki;
2. widzi trzy pozostałe karty;
3. wybiera je po jednej, **od samego dołu biblioteki**:
   - pierwszy klik = karta na samym dole;
   - drugi klik = druga od dołu;
   - trzeci klik = trzecia od dołu.

Nie wolno ani w silniku, ani w UI generować listy wszystkich permutacji.
Wspólny `renderPeekWizard` ma przeprowadzić liniowy przebieg: 4 opcje wyboru,
a następnie odpowiednio 3, 2 i 1 opcję kolejności.

Wewnętrzna reprezentacja biblioteki ma wierzch na początku tablicy, więc
`bottomOrder` jest dopinane jako kolejność **od najbliższej wierzchu do samego
dna**. Adapter UI zbiera kliknięcia w kierunku żądanym przez właściciela (od
dna), a przy budowie jednej końcowej komendy odwraca je do kontraktu engine.
To mapowanie ma być jawnie przypięte testem.

## Zakres rodziny i granice

Naprawa ma działać po typie decyzji, nie po nazwie ani `cardId` Impulse:

- obejmuje `pendingLookTopN` z `restTo === 'library_bottom'`;
- wariant „wybrana do ręki” (Impulse, Merchant's Dockhand i inne źródła tego
  deskryptora) używa etykiet ręki;
- wariant `pickTo === 'exile_face_down_linked'` (Clone Shell) korzysta z tego
  samego sekwencyjnego sortera, lecz zachowuje właściwe etykiety wygnania;
- wariant Gurmag Drowner, którego reszta trafia do grobu, zachowuje zwykły
  wybór jednej karty i nie pyta o nieistotną kolejność;
- jedna obejrzana karta nadal rozstrzyga się automatycznie w silniku (L144);
- przy jednej pozostałej karcie nie ma pozornej decyzji kolejności;
- bot zachowuje liniową ofertę po jednej komendzie na wybór; brak
  `bottomOrder` nadal oznacza bezpieczną kolejność domyślną;
- widok może ujawnić `restTo` jako publiczny rodzaj decyzji, ale `cards`
  pozostają dostępne wyłącznie dla jej właściciela (FoW bez zmian).

## Roadmapa i kolejność commitów

### F0 — plan i dowód stanu wyjściowego (osobny commit)

- [x] Prześledzić utworzenie `pendingLookTopN`, bramkę wykonania, generator
  legalnych komend, projekcję widoku i routing modala.
- [x] Potwierdzić, że engine już waliduje dowolny `bottomOrder` bez potrzeby
  enumeracji permutacji.
- [x] Potwierdzić kierunek tablicy biblioteki i konieczność odwrócenia kolejności
  klików „od samego dołu”.
- [x] Uruchomić celowaną bramę bazową: **58/58**.
- [x] Przejść bramę dokumentacji: **23/23**.
- [x] Commit i push planu przed kodem.

### F1 — RED: pełny przepływ i strażniki rodziny

- [x] Dodać test produkcyjnego przepływu: rzut prawdziwego Impulse, cztery
  obejrzane karty, wybór jednej do ręki, następnie trzy kliknięcia od samego
  dołu i wykonanie jednej kompletnej komendy.
- [x] Przypiąć, że fizyczny spód biblioteki odpowiada kolejno pierwszemu,
  drugiemu i trzeciemu kliknięciu, mimo odwrotnej reprezentacji `bottomOrder`.
- [x] Przypiąć liniową liczbę opcji na każdym kroku i brak jakiejkolwiek
  enumeracji 3! wariantów.
- [x] Przypiąć routing wyłącznie dla `restTo: 'library_bottom'`, właściwego
  gracza i jawnej listy kart; Gurmag Drowner ma pozostać poza sorterem.
- [x] Przypiąć wariant Clone Shell oraz przypadek jednej karty pozostałej.
- [x] Uruchomić nowy plik i zachować czerwony wynik przed implementacją:
  **0/5**, wszystkie pięć pinów czerwonych.

### F2 — wspólny sekwencyjny wizard

- [x] Rozszerzyć `pendingLookTopNView` o publiczne `restTo`, bez rozszerzenia
  widoczności kart.
- [x] Rozpoznać rodzaj czynności w `lookWizardKindOf`, bez nazwy karty.
- [x] Dodać cienki adapter wspólnego `renderPeekWizard`: obowiązkowy wybór
  jednej karty oraz sorter reszty od samego dołu.
- [x] Uogólnić krok `pick` tylko o możliwość braku opcji „żadna”; istniejący
  kreator Fertile Thicket zachowuje własny wariant opcjonalnego wyboru.
- [x] Na końcu zbudować jedną komendę `resolve_look_top_choice` z `cardId` i
  odwróconym `bottomOrder`.
- [x] Zachować `legalCommands` jako N wyborów kart — zero permutacji.
- [x] GREEN testów F (**6/6**) oraz powiązanych regresji
  UI/engine/FoW/bota (**227/227**).

### F3 — bramy i domknięcie

- [x] Celowane testy F i całej rodziny `pendingLookTopN`.
- [x] `npm test` z pełnym stdout/stderr w `.arena/*.log`: **8072/8072**.
- [x] `npm run build` z pełnym stdout/stderr w `.arena/*.log`:
  **73 moduły / 5048,8 kB**.
- [x] `npm run test:all` uruchomione raz po domknięciu kodu, z pełnym
  stdout/stderr w `.arena/*.log`: **8337/8337**.
- [x] `git diff --check`.
- [x] Osobny commit kodu/testów `f22b243` i push.
- [x] Uzupełnić plan, historię projektu, handoff i opis PR #163.
- [x] Osobny commit dokumentacji, push oraz końcowy zielony GitHub CI.

## Ryzyka i strażniki

1. **Odwrócona kolejność.** Pierwszy klik „od samego dołu” musi stać się
   ostatnim elementem engine'owego `bottomOrder`; test sprawdza stan strefy,
   nie tylko payload UI.
2. **Pozorna naprawa.** Sam tekst „w dowolnej kolejności” bez trzech osobnych
   kroków nie spełnia zgłoszenia.
3. **Eksplozja wariantów.** Generator legalnych komend nie może produkować
   permutacji. Wizard składa jedną dowolną permutację lokalnie i wysyła ją
   dopiero po ostatnim kliknięciu.
4. **FoW.** Przeciwnik może znać rodzaj decyzji i źródło, ale nie tożsamości
   obejrzanych kart.
5. **Wspólna rodzina.** Etykieta miejsca wybranej karty musi pochodzić z
   `pickTo`; nie wolno zaszyć Impulse ani Clone Shell po nazwie.
6. **Sonda Żywego Testera.** Klucz opcji może wskazywać kanoniczną legalną
   ofertę wyboru karty; nie wolno dla samej sondy enumerować pełnych
   `bottomOrder`.

## Wynik końcowy

Zaimplementowano generyczny, sekwencyjny przebieg dla całej gałęzi
`pendingLookTopN` odkładającej resztę na spód. Impulse pokazuje cztery liniowe
opcje wyboru karty, a następnie 3→2→1 opcji kolejności. Pierwszy klik sortera
jest kartą na samym dole; adapter odwraca zebrane kliknięcia dopiero przy
budowie jednej komendy zgodnej z engine'owym `bottomOrder`.

Nie powstał generator permutacji: `legalCommands` nadal zawiera dokładnie N
komend wyboru karty, a sonda Żywego Testera używa odpowiadającej im
kanonicznej komendy bez kolejności. Wariant Clone Shell ma etykiety wygnania
zakrytego i ten sam sorter; Gurmag Drowner (reszta do grobu) zachowuje dawny
przebieg. FoW ujawnia przeciwnikowi tylko publiczny rodzaj efektu, nigdy nazwy
obejrzanych kart.

RED **0/5** przeszedł w GREEN **6/6**. Powiązane regresje: **227/227**;
`npm test`: **8072/8072**; `npm run test:all`: **8337/8337**; build:
**73 moduły / 5048,8 kB**. Kod i testy są w `f22b243`.
