# Plan: batch 72 — kolekcja 635–644 (10 kart)

Data: 2026-11-06. Gałąź: `arena/5d931b5a-mtg` (PR otwarty).
Lista i plany pochodzą od właściciela. Wartości `Plan` są wiążące i zostaną
przeniesione 1:1 do definicji oraz generatora talii.

## Lista zakresu

| Kolekcja | Karta | Set | Plan |
|---|---|---|---|
| 635ISD | Feral Ridgewolf | ISD | Wiedźmin |
| 636DSK | Creeping Peeper | DSK | Duskmourn |
| 637STX | Vortex Runner | STX | Arcavios |
| 638M13 | Kraken Hatchling | M13 | Wiedźmin |
| 639RNA | Open the Gates | RNA | Bloomburrow |
| 640SOS | Living History | SOS | Arcavios |
| 641EOE | Banishing Light | EOE | Kamigawa |
| 642THS | Pheres-Band Centaurs | THS | Theros |
| 643XLN | Shining Aerosaur | XLN | Ixalan |
| 644M19 | Lich's Caress | M19 | Forgotten Realms |

Lista nie zostanie rozszerzona o karty spoza zgłoszenia. Kody setów, w tym SOS,
będą sprawdzone względem konkretnego druku w Scryfall; jeśli druk nie istnieje
pod podanym setem, pracę nad daną kartą zatrzymamy i opiszemy rozbieżność bez
samowolnej zmiany setu lub planu.

## Wiążący workflow etapów

Każdy etap kończy się własnym commitem i pushem na `arena/5d931b5a-mtg`.
PR pozostaje niescalony bez zgody właściciela.

1. **B0 — plan (ten etap).** Utrwalić listę, plany i kolejność pracy przed
   pobieraniem danych.
2. **B1 — źródła.** Dla każdej karty pobrać snapshot Scryfall z jawnym `set=`;
   zapisać Oracle, druk, koszt, typy, statystyki, obraz, rulings i datę
   weryfikacji w `docs/cards/scryfall-<slug>.json`. Sprawdzić/uzupełnić
   `artId` w `tools/collection-art-ids.csv` i strażnikach snapshotów.
3. **B2 — inwentarz reguł.** Z Oracle i rulingów wypisać mechaniki kart,
   odróżnić istniejące, wcześniej strojone i brakujące generyczne reguły;
   dopiero po tym ustalić kolejność pinów RED→GREEN i zakres zmian silnika.
4. **B3 — mechaniki oraz definicje.** Dodać brakujące reguły do core bez
   wyjątków po nazwie karty, a następnie definicje dziesięciu kart,
   `mana-costs-data.js`, `artId` i wiążące `plan`.
5. **B4 — testy kart i dowiązania.** Dla każdej karty sanity danych oraz
   scenariusz legalny i nielegalny; interakcje z istniejącym katalogiem.
   Nowe deskryptory/zdarzenia dostają komplet czterech dowiązań: log i typ
   zdarzenia, etykietę PL, wycenę bota albo świadome `REVIEWED_UNVALUED`,
   materializację (`gameObjectDataOf` i instalacja talii).
6. **B5 — PMSSB.** Dla każdej mechaniki nieobjętej wcześniejszą pętlą strojenia:
   plan i sonda PRZED, audyt wspólnych ścieżek/kosztu/anty-over-fix, pokrętła,
   piny RED→GREEN i mutacje, pomiar PO oraz raport w `docs/PMSSB.md`. Bliźniacze
   mechaniki dostają krótszą pętlę z dowodem, że istniejące strojenie pasuje.
7. **B6 — talie.** Uruchomić wyłącznie
   `node tools/generate-plan-decks.mjs`; nie edytować `decks/*.txt` ręcznie.
   Zweryfikować `git diff decks/` i `test/repo-decks.test.js`. W raporcie
   podać, gdzie trafiła każda karta i czy generator przebudował/zmienił
   istniejące talie; niepowiązana przebudowa oznacza stop i analizę przed
   dalszym etapem.
8. **B7 — bramy i dokumentacja.** Uruchomić testy fast/slow, build oraz
   benchmark dobrany do zmian. Pełny B0 uruchamiać tylko na wyraźną prośbę
   właściciela. Zaktualizować `PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md`,
   dokumentację PMSSB i handoff; commit/push każdego etapu.

## Kryteria akceptacji

- 10/10 kart zgodnych z danymi Oracle i rulingami właściwych druków;
  `support.limitations` puste.
- `Plan` zachowany 1:1; artId ze słownika kolekcji; żadnych ręcznych zmian
  talii.
- Każda nowa mechanika generyczna, z pinami RED→GREEN i właściwą pętlą PMSSB.
- Raport generatora: celowa talia/plan każdej karty oraz wszystkie zmiany
  istniejących talii.
- Testy, build i wymagane benchmarki zielone; etapy commitowane i wypychane
  po kolei na gałąź sesji.
