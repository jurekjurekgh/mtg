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

**Pomiar (do zrobienia w paczce):** scena z Seismic Monstrosaur na ręce i
zerem Gór w bibliotece (wszystkie znane poza biblioteką) → `activate_ability`
z oferty, wycena dodatnia (gałąź `cycling` bez `drawCards` daje +2) — bot
wyrzuca kartę i płaci {2} za wyszukanie, które nie może znaleźć niczego
(CR 701.19b: „fail to find").

**Naprawa:** bot dostaje WŁASNĄ talię (`ownDeck` — deklaracja z sesji/
benchmarku, tak jak `opponentDeck`; gracz zna swoją talię, więc to nie FoW)
i liczy, ile kart pasujących do kryterium wyszukiwania MOŻE jeszcze być
w bibliotece: `liczba w talii − kopie widoczne poza biblioteką` (pole bitwy,
ręka, grób, stos, wygnanie). Gdy wychodzi 0 → aktywacja jest czystą stratą
(kara, nie premia), niezależnie od typu cyklowania: typecycling
(`cycling.subtypes`, np. Mountaincycling) i basic landcycling
(`cycling.allTypes`, np. Fiery Fall). Jedno źródło predykatu: „czy w
bibliotece może jeszcze być cel" (L41/L48) — używane przez wycenę aktywacji
i przez przyszłe decyzje tego samego typu.

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

**Naprawa:** tożsamość kolorowa karty bezkolorowej = suma (a) kolorów
produkowanej many i (b) pipów kosztów JEJ ZDOLNOŚCI (koszty aktywowane,
w tym koszty alternatywne/dodatkowe: unearth, escape, flashback, plot,
bestow, suspend, madness, warp, surge, kicker, morph…). To zarazem reguła
MtG „color identity" (koszt zdolności liczy się do tożsamości), więc
decyzja nie jest arbitralna. Churn talii liczony generatorem; jeśli zmiana
dotknie pary z `SNAPSHOT_CONFIG` — świadoma regeneracja golden-mastera
z atrybucją (L25).

## E. Bot oddaje gardę przy 2 życiach i przegrywa kontratakiem

Zgłoszenie: „Bot ma 2 życia i jedną kreaturę 2/2 na stole. Ja też mam jedną
2/2, ale mam 18 życia. Bot atakuje, przepuszczam, dostaję 2, potem dobijam
bota. To bez sensu działanie bota. Nie powinien się odsłaniać mając tak mało
życia."

**Pomiar (do zrobienia w paczce):** stan z życia bota 2 przy obu 2/2 —
`enemyBoardPower(view) >= myLife(view)` włącza gałąź `racing`, a premia
wyścigu (+8/+20) przebija wszystkie kary za oddanie blokera; atak dostaje
wynik dodatni.

**Naprawa:** nowa kara „oddana garda" (crackback) w wycenie
`declare_attackers`: jeśli po ataku (atakujący tapnięci) wrogie stwory mogą
zadać co najmniej tyle obrażeń, ile mam życia, a PRZED atakiem garda
wystarczała do przeżycia następnej tury (blokery zatrzymywały atak), to
atak zamienia przeżycie w przegraną — kara liczona względem premii wyścigu
(L3: kara musi być liczona razem z premią, nie obok niej), z wyjątkiem
ataku, który wygrywa grę (lethal zostaje +1000). Model gardy: sumaryczna
moc wroga minus wytrzymałości blokerów zostających w domu (chump/trade),
deterministycznie i po deskryptorach (ADR 0002).

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
