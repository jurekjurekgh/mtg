# Plan 2026-09-20 — uwagi z gry (A–E): plan kolekcji, landcycling, log partii, podział bezkolorowych, atak przy niskim życiu

Zlecenie właściciela (2026-09-20, po zamknięciu batcha 57): pięć zgłoszeń z gry,
do domknięcia jeszcze w PR #130. Praca paczkami — każda paczka: pin + zielone
`npm test` + `npm run build`, commit i push po każdej (stała zasada właściciela).

Raport w kolejności zgłoszeń; paczki A–E niżej. Zasady projektu bez zmian:
ADR 0002 (żadnej nazwy karty w logice — tylko deskryptory), ADR 0023/0024
(karty wchodzą do talii WYŁĄCZNIE generatorem), ADR 0010 §4 (pełna mechanika,
zero `support.limitations`), ADR 0005 (determinizm), L41/L48 (jedno źródło
reguły dla oferty, wykonania i prezentacji).

## A. Time to Feed w talii Theros — skąd się wziął

Zgłoszenie: „W talii Theros znalazłem kartę Time to Feed. Możesz mi to
wytłumaczyć??? Dane tej karty to: 561THS Time to Feed THS — Wiedźmin."

**Wyjaśnienie (pomiar):** talia planowa bierze karty z planu, a plan karty jest
przepisywany z arkusza kolekcji (ADR 0029 — katalog rośnie tylko z listy
właściciela; `tools/fetch-plans.mjs` → kolumna „Plan / Setting"). W naszym
słowniku `tools/collection-art-ids.csv` wiersz `561THS,Time to Feed,Theros`
niesie plan **Theros**, więc generator (ADR 0023) położył kartę w
`decks/theros.txt` — i nikt tego nie zauważył, bo plan zgadzał się z SETEM
karty (THS), czyli wyglądał wiarygodnie (klasa L1: dane proweniencji też są
kodem).

**Naprawa paczki A:** dane wracają do stanu z arkusza — plan „Wiedźmin"
(wpisujemy wartość podaną przez właściciela; pełnego re-synchronu arkusza
sandbox nie zrobi, bo sieć do Google Sheets jest w nim zablokowana —
`docs/cards/HOW_TO_ADD_CARD.md` §Proweniencja). Churn: karta przenosi się z
`decks/theros.txt` do właściwej talii planu „Wiedźmin" (mono-zielona → strona
BG), liczności w README z pomiaru M203/7. Pin: karta ma plan zgodny z arkuszem
i jest w talii tego planu (strażnik M178 i tak pilnuje singletonu).

## B. Bot marnuje landcycling, gdy nie ma już celu w bibliotece

Zgłoszenie: „Karta Seismic Monstrosaur. Bot aktywuje zdolność Mountaincycling
nie mając w talii Mountains. To bezsensowne zmarnowanie many i karty z ręki…
Przecież grający zna swoją talię i wie, że jeśli ma określoną ilość basic lands
na stole to więcej w talii nie ma. Dotyczy wszystkich land-cyclingów."

**Pomiar (potwierdzony w paczce):** scena z Seismic Monstrosaur na ręce i zerem
Gór w bibliotece → bot brał `activate_ability` z oferty, bo gałąź `cycling`
bez `drawCards` była wyceniana na +2 („wyszukanie ziemi to wartość") — karta
i mana szły w pustkę dokładnie tak, jak opisał właściciel. Reguła gry stoi po
jego stronie: gracz zna SWOJĄ talię i wie, ile kopii celu jeszcze zostało.

**Naprawa (paczka B, `a92f982`):** bot dostaje WŁASNĄ talię
(`createHeuristicBot({ ownDeck })`; sesja przekazuje talię bota, benchmark obie
talie — brak `ownDeck` = zachowanie sprzed zgłoszenia, kompatybilność
wsteczna dla testów jednostkowych). Z listy liczone są kopie (`ownCounts`),
a predykat „czy w bibliotece MOŻE jeszcze być cel" liczy DOLNĄ granicę:
`kopie w talii − kopie widoczne poza biblioteką` (pole bitwy, ręka, grób, stos,
wygnanie). Gdy wychodzi 0 → aktywacja jest czystą stratą (kara `finish(-12)`,
nie premia), niezależnie od wariantu cyklowania: typecycling
(`cycling.subtypes`, np. Mountaincycling) i basic landcycling
(`cycling.allTypes`, np. Fiery Fall). Strażnik:
`test/zgloszenie-b-landcycling-bez-celu.test.js` — brak celu w bibliotece
(brak aktywacji), kontrola pozytywna (Góra w bibliotece → cykluje), Fiery Fall
bez landów w bibliotece (brak aktywacji) i brak wiedzy o talii = stare
zachowanie.

## C. UI — sekcja „Log partii": kopiowanie i chronologia

Zgłoszenia: C1 — przyciski jak w „Przebieg tur (dla AI)", ale działające na
logu gry (`Tura:` select + „Kopiuj wybraną turę" + „Kopiuj całą partię");
C2 — lista rozwijana z WSZYSTKIMI turami oraz „cała partia" (domyślnie
wybrana, drukowana na bieżąco); C3 — chronologia odwrotna: najnowsze na DOLE,
nowe wiersze dopisywane na końcu.

**Naprawa:** wpisy logu dostają numer tury i aktywnego gracza (sesja), sesja
wystawia `logEntries()`, `logTurnEntries()`, `logTextAll()`, `logTextFor(n)`;
panel „Log partii" dostaje select + dwa przyciski + pole tekstowe (`<pre>`)
z wybranym zakresem („cała partia" domyślnie, odświeżane na bieżąco), a lista
styli logu renderuje się w kolejności CHRONOLOGICZNEJ (najstarsze u góry).
Zachowanie formatu: log bez zmian treści (te same zdania), tylko kolejność i
nowe narzędzia kopiowania; etykiety tur jak w panelu AI
(„Tura N — Czarodziejka/Nieprzyjaciel").

## D. Simian Simulacrum trafia do złej części Dominarii

Zgłoszenie: „To jest artefakt. Może trafić do każdej talii. Ale jego zdolność
(Unearth) wymaga 2 zielonej many. Wkładanie go do talii Dominaria (WU) jest
mało sensowne. Powinien trafić do talii Dominaria (BRG). Musisz zmodyfikować
skrypt dzielący karty na talie, żeby przy podziale bezkolorowych kart brał pod
uwagę pipy kosztów zdolności lub/i wytwarzaną manę."

**Pomiar:** `tools/generate-plan-decks.mjs` → `splitColorsOf` dla karty
bezkolorowej czyta WYŁĄCZNIE kolory produkowanej many
(`getSourceForObject`). Simian Simulacrum nic nie produkuje → pusta tożsamość
→ „wypełniacz" → algorytm dosypuje go do mniejszej strony (WU).

**Naprawa (paczka D, `cdd090d`) — zakres zawężony pomiarem:** tożsamość
kolorowa karty bezkolorowej = kolory produkowanej many ORAZ pipy kosztów JEJ
ZDOLNOŚCI; dla kart kolorowych bez zmian (chodzi głównie o artefakty — „może
trafić do każdej talii", więc pytać o zdolność trzeba właśnie tutaj).
`abilityCostColorsOf` czyta koszty zdolności aktywowanych (`ability.cost.colors`:
unearth, cycling, equip) i koszty alternatywne/dodatkowe czaru (`escape`,
`flashback`, `buyback`, `cleave`), a ŚWIADOMIE pomija `effects[].colors` — to
kolor TWORZONEGO TOKENU, nie karty (pułapka Call the Mountain Chocobo: tworzy
zielonego ptaka, a sam ma tylko czerwony flashback). To zarazem reguła MtG
„color identity". Pełne wejście pipów do funkcji celu podziału zostało
ZMIERZONE i odrzucone: przenosiło CAŁY podział Dominarii (WU|BRG → UB|WRG, 46
czerwonych testów) — został wariant, w którym pipy decydują o stronie karty
bezkolorowej, a maski/nazwy talii się nie zmieniają (stąd `dominaria-wu` i
`dominaria-brg` bez zmian nazw). Churn: dominaria-brg 18 (+Simian — zgłoszenie
załatwione), dominaria-wu 15, mirrodin-brg/wu po jednej karcie (Trigon of
Corruption ↔ Ichorclaw Myr, niezależnie od Simiana); liczności w README
z pomiaru M203/7, golden-master świadomie zregenerowany z atrybucją (L25 —
pary i seedy bez zmian, więc ten sam zakres próbkowania).

## E. Bot oddaje gardę przy 2 życiach i przegrywa kontratakiem

Zgłoszenie: „Bot ma 2 życia i jedną kreaturę 2/2 na stole. Ja też mam jedną
2/2, ale mam 18 życia. Bot atakuje, przepuszczam, dostaję 2, potem dobijam
bota. To bez sensu działanie bota. Nie powinien się odsłaniać mając tak mało
życia."

**Pomiar (potwierdzony w paczce):** przy moich 2 życiach i po jednym 2/2 na obu
stronach atak dostawał wynik DODATNI — wycena per-stwór (wymiana →
`power - 1`) była podbijana premią za wyścig (+8, przy życiu ≤ 2 nawet +20),
a zegar wygrywał cenę gardy, choć po ataku nie zostawał żaden bloker.

**Naprawa (paczka E, `06a83ab`):** kara „oddana garda" (crackback) w wycenie
`declare_attackers`. Model gardy: `guardToughness` = suma wytrzymałości MOICH
niezatapniętych, niezadeklarowanych blokerów (`cantBlock`/`detained` poza
rachunkiem); `enemyCrackbackPower` = moc wrogich stworów mogących zaatakować
w następnej turze (tapnięte liczą się, bo w turze wroga się odtapiają). Garda
jest „oddana", gdy atak NIE wygrywa teraz (`winsNow`: `penetratingPower >=
życie wroga` albo wygrana trucizną — lethal zostaje), kontratak w ogóle grozi
(`crackbackPower > 0`), a po ataku przeżycie znika (przed atakiem
`crackbackPower − guardToughness < moje życie`, po ataku już nie). Wtedy
pomijamy premię za wyścig (L3 — inaczej +8/+20 przebija każdą drobną karę)
i odejmujemy `P.crackbackPenalty` (= 12). Wyjątek zmierzony w pinie: atak
LETALNY na stole zmusza wroga do blokowania — blokery, które przy tym giną
(najtańsze najpierw, wytrzymałość ≤ najmocniejszy atak), znikają z kontrataku
(`forcedBlockLoss`), żeby strażnik nie karał ataku kończącego grę.
Deterministycznie i po deskryptorach (ADR 0002).

## Kolejność paczek i kryteria

| Paczka | Zakres | Pin (RED przed fixem) |
| --- | --- | --- |
| A | plan Time to Feed + churn talii | plan zgodny z arkuszem; karta w talii planu |
| B | `ownDeck` + wycena landcyclingu | scena bez celu w bibliotece → brak aktywacji |
| C | log partii: select + kopiowanie + chronologia | test sesyjny zakresów + render (kolejność, opcje) |
| D | tożsamość bezkolorowych z pipów zdolności | split: Simian Simulacrum po stronie BRG |
| E | crackback w wycenie ataku | scena 2 życia, oba 2/2 → brak ataku |

Każda paczka: RED→GREEN (stash-proof plików źródłowych), zielone `npm test`
(oraz `npm run build`), commit + push. Bramy końcowe sesji: pełne `npm test`,
build, benchmark quick, ewentualny churn talii + README (M203/7), wpis w
`docs/ENGINE_MILESTONES.md`, `docs/PROJECT_HISTORY.md`, handoff i lekcje
(zapis tylko dla klas ogólnych — L-kody cytowane w kodzie muszą istnieć).

## Stan realizacji (2026-09-20)

Wszystkie paczki zrealizowane na gałęzi PR #130 — kolejność, dowody i bramy:

| Paczka | Commit | Strażnik (pin) | Bramy / pomiar |
| --- | --- | --- | --- |
| A | `633178f` | `test/zgloszenie-a-time-to-feed-plan.test.js` | talie po regeneracji: `theros` 26/9/17, `wiedzmin-bg` 26/9/17 (Forest 4); liczności README z pomiaru M203/7 |
| B | `a92f982` | `test/zgloszenie-b-landcycling-bez-celu.test.js` (4 przypadki) | `ownDeck` w sesji i benchmarku; brak `ownDeck` = stare zachowanie |
| C | `998afc8` | `test/zgloszenie-c-log-partii-tury.test.js` | log w kolejności chronologicznej (najnowsze na dole), select z „cała partia" domyślnie + dwa przyciski kopiowania; kolejność pilnuje też `test/m346-tester-kolejnosc-logu.test.js` |
| D | `cdd090d` | `test/zgloszenie-d-pipy-zdolnosci-podzial.test.js` (4/4) | `npm test` 5991/5991; build 64 moduły / 3966,4 kB; golden `4514c1cf65d99082…` |
| E | `06a83ab` | `test/zgloszenie-e-oddana-garda.test.js` (6/6; RED 5/1 — czerwone tylko E/1) | `npm test` 5997/5997; build 64 moduły / 3970,2 kB; benchmark quick 672 mecze: heuristic 85,9% (przed zmianą 86,0% — szum, L3) |

Wnioski wykonawcze dla następnej paczki bota:

1. **E a strażnik D/3** (`test/zgloszenie-d-jalowy-atak-w-gang.test.js`): ten sam
   atak 3/1 za 3/3 przy 3 życiach podpada teraz pod regułę E (wróg może NIE
   blokować i dobić kontrą), więc fixture mierzy granicę klasyfikacji „jałowego
   ataku" przy 12 życiach — scenariusz crackbacku ma WŁASNY pin (plik E).
   Nowe piny walki pisz tak, żeby nie kolidowały z regułą gardy.
2. **D a generator**: karty są wyłącznie w taliach generowanych (ADR 0023/0024);
   każdy churn to regeneracja + liczności README (M203/7) + świadoma decyzja
   o golden-masterze (L25), nigdy ręczna edycja pliku talii.
3. **B — dolna granica**: przy 0 kopii celu bot nie może się mylić; przy 1+
   zachowuje się jak dziś (niepewnych kopii nie odejmujemy).

## Ryzyka rozpoznane z góry

1. **B (własna talia bota)** — `ownDeck` to nowa informacja w kontrakcie bota:
   musi być przekazana i w sesji, i w benchmarku (inaczej testy/regresja bota
   mierzą inny byt). Pin na „brak talii = stare zachowanie" (kompatybilność
   wsteczna dla testów jednostkowych).
2. **B** — liczenie „kopie poza biblioteką" musi być odporne na tokeny
   (bez `cardId` w talii), kopie-czarów i karty wrócone do biblioteki
   (tutor „na wierzch"): liczymy DOLNĄ granicę (widoczne kopie odejmujemy,
   niepewne zostawiamy) — przy 0 bot nie może się mylić, przy 1+ zachowuje
   się jak dziś.
3. **C** — log jest odtwarzany przy KAŻDYM renderze (pełna lista w DOM):
   zmiana kolejności nie może dokładać duplikatów ani gubić auto-scrolla;
   pin na liczbie wierszy po dwóch renderach.
4. **D** — poszerzenie tożsamości bezkolorowych może przenieść karty w
   kilku planach (zmierzone: 9 kart bezkolorowych z kolorowymi kosztami
   zdolności); churn liczony generatorem i wypisany w commicie z atrybucją.
5. **E** — kara za oddanie gardy nie może zablokować ataków wygrywających
   (lethal zostaje), ani CELOWYCH ataków samobójczych (all-in przy
   nieuniknionej przegranej) — stąd reguła „kara tylko wtedy, gdy PRZED
   atakiem garda wystarczała na przeżycie".
