# PLAN 2026-10-05a — PMSSB-58: jakościowe domknięcie wszystkich mechanik batcha 63

Zlecenie właściciela: po wyjaśnieniu, że „10/10 kart” nie oznacza zakończonego
PMSSB, przeprowadzić jakościowe domknięcie. Kontynuacja **tego samego PR #155**
i gałęzi `arena/01a108d2-mtg`, baza jakościowa **`c60fb42`** (kod `f54e21a`).
Bez nowych kart, zmian talii, pełnego B0 ani automatycznego tuningu.

## 0. Rozpoznanie i warunki pracy

- Obowiązkową lekturę i audyt 79 plików poprzedniego scalenia PR #154 wykonano
  wcześniej w tej sesji (raport `AUDYT_PR154_2026-10-04.md`). PR #155 nadal OPEN,
  `main` nadal `a362efa`; nie pojawiło się nowe scalenie do audytu.
- Po odtworzeniu środowiska porównano wszystkie pliki z wypchniętym `c60fb42`
  (brak różnic/braków), następnie odtworzono HEAD/index bez nadpisywania plików.
- Odświeżono AGENTS, ENVIRONMENT, procedurę PMSSB i raporty powiązanych rodzin.
  Pozostałe ADR-y i LESSONS są niezmienione względem wykonanej lektury sesji.
- Świeży baseline: **fast 7642/7642**, exit 0, **113 087,029916 ms**; build
  **72 moduły / 4850,0 kB**, exit 0. Referencyjny snapshot `577aa78e…`.
- Wszystkie duże przebiegi: stdout **i** stderr do ignorowanego `.arena/`,
  zachowany kod wyjścia, ograniczone podsumowanie. Zamrożenie drzewa podczas bram.
- Pomiar negatywny jest wynikiem. Rodziny DONE nie są otwierane „na wyczucie”:
  nowy deskryptor/koszt/kombinacja musi dać nowy dowód, inaczej pozostaje kontrolą.

## 1. Inwentarz dziesięciu kart i decyzji

| Karta | Mechaniki / ścieżki obowiązkowo sprawdzane |
|---|---|
| Bloodtithe Harvester | ETB artefaktowego tokena; koszt {1}+tap+discard+sacrifice przy doborze; decyzja odrzucenia; zachowanie Blood vs zużycie; ujemny dynamiczny pump i koszt ofiary; sorcery / wybór celu / zero Blood |
| Dig Site Inventory | +1/+1 counter + vigilance do końca tury; wybór własnego gospodarza; flashback vs ręka; czas i koszt |
| News Helicopter | ciało artefaktowego latacza + ETB 1/1; przyrost z tokena, kierunek, liczba, koszt rzutu |
| Natural Connection | basic na pole tapnięty; ramp vs brak trafień / nasycenie; timing instant; wybór koloru lądu i koszt |
| Subterranean Scout | ETB ewazji dla power ≤2; żywy atakujący vs chory/tapnięty/wróg; main1 vs main2; wartość rzutu i wyboru celu |
| Loxodon Mender | regenerate artefaktu (stwór **i nie-stwór**); zagrożenie na stosie/walka; własny vs obcy; duplikat tarczy; nieskuteczna regeneracja; koszt many i tapu |
| Snarespinner | reach i warunkowy trigger bloku; projekcja blokera oraz atakującego; latanie efektywne, brak/utrata zdolności, przed/po rozstrzygnięciu |
| Urborg Uprising | zwrot 0/1/2 stworów + dobór; każdy slot celu i brak duplikowania zysku; jakość/zagrywalność kart; biblioteka, mana i wybór pomiędzy wariantami |
| Kozilek's Predator | 2× Spawn: ciało vs bank many; mana bezbarwna; poświęcenie tylko za realne odblokowanie akcji; koszt utraconego blokera |
| Etched Host Doombringer | wartość modalnego ETB przy rzucie i wyborze; wskazany przeciwnik, zysk życia, lethal; obrona/protektor, rzeczywista zmiana i koszt wardu; porównanie trybów |

Każda pozycja dostaje macierz **kierunek × cel × timing × stan** oraz wymiar
kosztu. Ręka / aktywacja / trigger-decyzja / modal / wrapper i flashback używają
wspólnej miary, jeżeli opisują ten sam skutek (L41). Sterownik nigdy nie czyta
prywatnego GameState. Pozytywne piny kończą się zaakceptowaną komendą i skutkiem.

## 2. Znane przesłanki, nie gotowe werdykty

- Przegląd wskazuje brak roli lootu w `tokenBodyValue` (Blood) oraz brak jawnej
  ceny `cost.discardCard` w wycenie aktywacji. Trzeba zmierzyć PRZED, nie dopisać
  arbitralnej premii do nazwy tokena.
- Dotychczasowy pin Harvester sprawdza jedną zabójczą aktywację, nie rangowanie
  małej/dużej ofiary ani bilans oddania własnego ciała.
- Scoring obrony i modalnego ETB wymaga niezależnego sprawdzenia; test efektu
  Doombringer wybierał tryb ręcznie. Nie jest to test jakości wyboru bota.
- Próbka quick ma talie z dwiema kartami batcha (Snarespinner, Urborg), nie
  całą dziesiątkę. Pokrycie musi być dodatkowo scenariuszowe i ukierunkowane.

## 3. Mini-roadmapa i planowane commity

0. [x] Odtworzenie punktu wyjścia, baseline, plan wypchnięty **przed kodem**.
1. [x] **Inwentarz + pomiar PRZED.** Powtarzalny harness prawdziwego silnika,
   pełny PlayerView i decide/trace; tablica wyników/F1…Fn dla wszystkich kart.
   Jawne kontrole ujemne, koszt i ścieżki bliźniacze. Sondy w `.arena/`,
   trwałe wyniki w raporcie. Nie zmieniać wag, zanim istnieje czerwony dowód.
2. [x] **Fala A — ekonomia zasobów.** Loot/discard jako koszt, rola tokena,
   Harvester/pump-ofiara, Spawn/mana. Wspólne helpery i parametry rodzinowe,
   ×0 kontroluje nowy wymiar; stare poprawne przypadki mają kotwice.
   Nowe piny + mutacje, fast + build, osobny commit i natychmiastowy push.
3. [x] **Fala B — tryby i odzyskiwanie.** Doombringer (cast/modal, życie,
   bitwa/ward) oraz Urborg (sloty/ilość/jakość/dobór), według findingów.
   Piny, mutacje, fast + build, osobny commit i push.
4. [ ] **Fala C — pozostałe kombinacje.** Dig Site, Helicopter, Connection,
   Scout, Mender, Snarespinner: nowe dowody → naprawy wspólnej rodziny;
   brak błędu → jawny wynik z pinem, nie pozorna zmiana parametrów.
   Fast + build, osobny commit i push po samodzielnym kroku.
5. [ ] **Ewaluacja PMSSB.** Snapshot z pierwszą różnicą (cel: bez refreshu;
   uzasadniony dryf wymaga kontroli parametrów OFF na tych samych wejściach),
   tie-audit przed/po, mirror OFF/ON oraz Żywy Tester na taliach z mechanikami.
   Każda talia batcha musi mieć obserwację albo jawny scenariusz wymuszony;
   zero obserwacji nie jest PASS jakości. Bez `--full` i bez strojenia progu.
6. [ ] **Domknięcie.** Pełny wyciszony `all`, build, quick (bez `--full`),
   faktyczny status CI; raport PMSSB-58 + wpis rejestru rodzin, historia,
   handoff i kumulacyjny opis PR. Wszystko wypchnięte, brak sond w Git.

Fale można podzielić na mniejsze zielone przyrosty, jeśli ujawnią odrębną
przyczynę. Nie wolno ogłosić całej macierzy DONE po samej fali A.

## 4. Kryteria zamknięcia i ryzyka

- Każda karta ma jawny wynik audytu scoringu i piny wyboru, nie tylko reguł.
- Nowe findingi mają liczby PRZED→PO, testy czułe na usunięcie poprawki,
  kontrole anty-over-fix i — gdy dochodzi nowa waga — sterowanie ×0.
- Istniejące rodziny nie są globalnie przestrojone pod jeden nowy przypadek.
  Bez wyjątków po nazwie/ID karty; bez nowych kart i bez zmian talii.
- Własny koszt discard/sacrifice to realna utrata zasobu. Efekt „dobierz”
  nie może być dodatnią wartością, gdy płatność niszczy lepszy plan.
- Battle pozostaje kontraktem publicznych ról/obrony; brak kart Battle w
  katalogu nie usprawiedliwia pominięcia testów decyzji Doombringer. Nie
  rozszerzamy reguł atakowania/tylnych stron bitwy na zapas.
- Golden-master mierzy dryf, nie jakość. Benchmark nie dowodzi pokrycia.
- Testy pomagające budować scenę sprawdzają każdą komendę; nie mogą maskować
  odrzuceń `break`/`try-catch` ani złych pól (np. `summoningSick`).

## Wykonanie

- `7bff147`: plan wypchnięty przed kodem; PR #155 oznaczony jako kontynuowany.
- Pomiar 59 scen z zaakceptowanymi komendami: F1–F12 w
  `docs/audits/PMSSB58_BATCH63_2026-10-05.md`; kontrole dodatnie dla tokenów,
  pipów/timingu many, biblioteki, flashbacku, wyboru Scouta i bloku Snarespinner.
- Fala A w implementacji: 29 pinów; pierwsze 25 dały 12 FAIL przed zmianą.
  Po poprawkach integracja **123/123**. Sześć mutacji: 2/5/2/1/2/1 FAIL;
  każda cofnięta. Snapshot OFF odtwarza `577aa78e…`; ON `94a9d975…`,
  49 zmienionych wpisów w dwóch śladach, **zero zmian wyborów**. Różnice
  to koszt discard Goblin Pickera, nie zmiana talii ani seedów.
- Brama fali A: **fast 7672/7672** (110 002,814634 ms), build **72 moduły /
  4858,3 kB**, snapshot **4/4**, exit 0. Pozostałe fale nie są DONE.

- `8f1a907`: fala A zapisana i wypchnięta. Rozpoczęta fala B: 25 pinów,
  17/19 początkowych RED; po poprawkach integracja **342/342**, osiem mutacji
  czułych. ON/OFF snapshotu takie same; dryf z A wynika wyłącznie z bogatszych
  etykiet flashbacku (po normalizacji wraca hash A). Brama B w toku.
- Fala B: **fast 7697/7697** (110 436,316111 ms), build **72 moduły /
  4864,3 kB**, snapshot **4/4**, exit 0. Stare fixture zwrotów dostały realne
  kolory/manabazę i bibliotekę zamiast nagradzać niemożliwe zagranie/deck-out.

- Wznowienie: środowisko odtworzyło pliki `c60fb42`, ale zdalna gałąź miała
  już fale A/B do `77ebd06`. Zweryfikowano brak lokalnych zmian względem
  `c60fb42`, odzyskano dokładnie 14 zmienionych/nowych plików, bez force push.
- Fala C: 44 piny, integracja **135/135**. F9–F11 oraz nowe dowody F14–F16
  (żywe zdolności, rzeczywisty brak trafień, koszt Dig Site). Osiem mutacji:
  **6/1/2/5/1/1/2/2 FAIL**. Causal OFF odtwarza hash B; ON zmienia tylko jeden
  wpis o koszt 4, bez zmiany wyboru. Brama fast/build/snapshot w toku.

### Checkpoint na polecenie właściciela — 2026-10-05

Zapisywany natychmiast jako **WIP**, przed następną bramą, żeby postęp nie
pozostał wyłącznie w sandboxie. Fala C ani całe PMSSB-58 **nie są DONE**.

- Kod i 44 nowe piny fali C są zachowane; osiem mutacji cofnięto.
- Pierwszy fast C: **7730/7741**, 11 FAIL. Dziesięć starych kotwic fight/
  proliferate uwzględniało cenę czaru w pomiarze historycznej wypłaty;
  ostatni guard obejmował też dopisane helpery search zamiast samej proliferacji.
- Oddzielono cenę od starych macierzy efektów i przywrócono granicę sekcji
  bez podnoszenia limitu guardu. Po korektach celowane **88/88**, exit 0.
- **Nie wykonano jeszcze ponownej pełnej bramy fast/build po tych korektach.**
  Następny krok: wyciszony fast + snapshot + build, następnie osobny commit
  wyniku/ewentualnych napraw i natychmiastowy push. Dalej ewaluacja §5 i all §6.
- Ten checkpoint jest zabezpieczeniem postępu, nie deklaracją zielonej bramy.
