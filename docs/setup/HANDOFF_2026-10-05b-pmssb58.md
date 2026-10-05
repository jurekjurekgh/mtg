# Handoff 2026-10-05b — PMSSB-58: jakościowe domknięcie batcha 63

## Punkt zaczepienia

- Kontynuacja **tego samego PR #155**, gałąź `arena/01a108d2-mtg`.
- Właściciel zażądał jakościowego PMSSB po wyjaśnieniu, że wcześniejsze
  „10/10 kart” oznaczało integrację i reguły, nie komplet wycen bota.
- **PMSSB-58 DONE**: wszystkie dziesięć kart ma inwentarz decyzji, wynik
  audytu i piny jakości. Nie jest to obietnica optymalnego bota.
- Ostatni commit kodu: **`45e7faa`**. Wyniki zabezpieczone jako `60436c3`;
  późniejsze zmiany zamknięcia są dokumentacyjne. PR nie jest scalany przez agenta.

## Faktyczne bramy

| Pomiar | Wynik |
|---|---|
| Ostatni osobny fast przed poprawką 3 etykiet UI | **7747/7747**, exit 0 |
| Końcowy all na `45e7faa` (obejmuje nowe testy UI) | **8013/8013**, exit 0, 596,4 s |
| Build | **72 moduły / 4871,6 kB**, exit 0 |
| Quick | **672/672 ukończonych**, 0 unfinished, exit 0, 544,9 s |
| CI kodu | **PASS**, [run 37304592016](https://github.com/jurekjurekgh/mtg/actions/runs/37304592016), 5m6s |

All i quick były równoległe na zamrożonym kodzie. Nie porównywać tych czasów
z oddzielnymi przebiegami jako pomiaru wydajności.

**Wynik jakości nie jest retuszowany:** quick heuristic **584/672 (86,9%)**,
vs random **315/336 (93,8%)**, vs aggro **269/336 (80,1%)**. Referencja sprzed
PMSSB-58: **585/672**. Jest jedna wygrana mniej; progi/seedów nie zmieniano.
Mirror ON/OFF na siedmiu taliach: **15:13**, 28/28 końców, 53,6% ON — mała
próba, nie dowód statystycznej przewagi. Dowód konkretnych napraw = piny,
mutacje i porównania wycen, nie sam agregat zwycięstw.

## Co zostało zrobione

- **Plan `7bff147` przed kodem**, baza `c60fb42`. Audyt poprzedniego PR #154
  i obowiązkową lekturę wykonano wcześniej w tej samej sesji; nie było
  nowego scalenia na main (`a362efa`).
- **A — `8f1a907`:** opcja lootu z tokena, realna cena discard tym samym
  pickerem, bilans ofiary ujemnej pompy, zachowanie zasobu przy progu X,
  ostatni skuteczny bloker vs mana na sam dobór. **29 pinów**.
- **B — `77ebd06`:** cast i wybór modala na jednej mierze najlepszej legalnej
  wypłaty; ward i rezerwa many; każdy slot zwrotu z grobu, dostępność
  kolorów/krzywej, cena raz na czar; rozróżnialne etykiety. **25 pinów**.
- **C — `1bf6c31`, brama `1a2f313`:** prawdziwe zagrożenie zniszczeniem dla
  regeneracji, poprawna rola umierającego w walce, ETB ewazji wobec realnego
  bloku, nasycenie/fixing/timing rampy, żywe zdolności po stripie i cena
  czarów z licznikami. **44 piny**. Stare macierze wypłat fight/proliferate/
  liczników jawnie izolują cenę many; nowe piny mierzą domyślną cenę i ×0.
- **Narzędzia — `0c70a01`:** własna talia w kontekście tie/mirror,
  walidacja niepustej próby, zakończenia i limitów; 6 pinów. `5965df5`
  zapisuje wyniki ewaluacji zamiast zostawiać je wyłącznie w sandboxie.
- **Stół — `45e7faa`:** 7/7 ukończonych gier, 0 flag/limitów/STOP/niewycenionych
  wybranych komend. Ręczny odczyt wykrył „gracz wybierasz tryb”; 3 RED→GREEN
  i poprawka także skip. Replay świeżego artefaktu, seed 5801, potwierdził
  prawidłowy napis i naturalne zakończenie bez flag.

Łącznie **98 dedykowanych pinów scoringu A/B/C**, plus narzędzia i UI.
Każda naprawiana klasa ma mutację lub kontrolę ×0; nie dodano nazwowych
wyjątków ani nie zmieniano danych talii.

## Pokrycie i granice — nie wyciągaj silniejszego wniosku

- Użyto wszystkich **7 talii batcha**: Innistrad BRG, Worek Legendy,
  Worek Dzikie Światy, Zendikar, Mirrodin WU, Dominaria WRG, Dominaria UB.
- Tie: OFF **55**, ON **54** remisów akcyjnych, po 7 ukończonych gier.
- Mirror: po 2 seedy od 5800, obie strony; OFF wyłącza nowe wymiary A/B/C
  w tym samym kodzie. Listę parametrów zawiera raport.
- W siedmiu grach stołu nie zaobserwowano rzutu Connection/Urborg ani
  aktywacji Mendera. Odrzucenie/obecność w ręce nie jest pokryciem.
  Te decyzje mają jawne wymuszone sceny z zaakceptowanymi komendami.
- Wartość bitwy używa jawnego protektora/obrony, **nie zgaduje wartości
  nieznanej tylnej strony Siege**. Brak karty Battle w katalogu pozostaje.
- Model zapotrzebowania na manę nie planuje wszystkich przyszłych kombinacji
  kilku czarów. Ochrona blokera przy poświęceniu na manę ma jawnie ograniczony
  model pojedynczego zadeklarowanego ataku, nie całej gry.
- Zmiana snapshotu C: OFF odtwarza `ed4b3183…`, ON `ea4cee6850362582…`.
  Jeden wpis, zero zmienionych wyborów: Tarkir BG–Warhammer UBR, seed 1000,
  index 80, koszt czaru 4 obniża 74→70. Talii/seedów nie ruszano.

## Najważniejsza uwaga właściciela o pracy

**Nie przetrzymuj kilku godzin postępu lokalnie.** Właściciel przerwał
zbyt długą falę bez pusha. Zapisano natychmiast `1bf6c31` jako jawny WIP
(bez fałszywej zielonej bramy), a wynik kolejnego przebiegu jako `1a2f313`.
Potem kolejne małe checkpointy i wyniki od razu trafiły na GH.
Trwała reguła jest w ENVIRONMENT §2. WIP nie zastępuje końcowego fast/build/all.

Po odtworzeniu sandboxa pliki mogą odpowiadać starszemu checkpointowi,
a zdalna gałąź być dalej. W tej kontynuacji odtworzono A/B z `77ebd06`
po sprawdzeniu, że lokalne pliki były dokładnie `c60fb42`. **Nigdy nie rób
reset --hard na nieprzejrzanym drzewie.** Fetch, porównanie i zachowanie
lokalnych zmian; append-only, bez force push i bez zmiany gałęzi sesji.

## Dalej

1. Obowiązkowa lektura AGENTS, wszystkich ADR, LESSONS i ENVIRONMENT.
2. Sprawdź faktyczny status PR #155 / main. Merge wyłącznie właściciel.
3. Po scaleniach audyt następnej sesji; żadnej nowej listy kart bez właściciela.
4. PMSSB-58 nie powtarzać od zera: [plan](../plans/PLAN_2026-10-05a-pmssb58-batch63.md),
   [raport](../audits/PMSSB58_BATCH63_2026-10-05.md), [hub](../PMSSB.md),
   piny `audyt-pmssb58-*` są trwałym stanem wykonania.
5. Nowy problem otwiera się nowym dowodem, nie przeczuciem. Bez pełnego B0,
   automatycznego tuningu i obniżania progów pod wynik.
6. **Wszystkie duże testy wyciszone:** stdout i stderr do ignorowanego logu,
   zachowany exit code, ograniczone podsumowanie. Żadnego pełnego TAP do rozmowy.

Logi i transkrypty `.arena/` są niewersjonowane i mogą przepaść. Wyniki,
cytaty dowodowe, commity i jawne pozostałe granice są zapisane w repo/CI.
