# PLAN 2026-11-03 — bezpieczne kroki w automatycznych krokach gry

## Cel i granica

Naprawiać potwierdzone błędy kolejności automatycznych kroków gry **bez hurtowej wymiany silnika** i bez utraty poprawnych implementacji kart. Właściciel zaakceptował wyjaśnienie problemu i polecił kontynuować, ostrzegając przed regresją dużej, działającej części katalogu.

To jest mini-roadmapa jednego zadania w ramach audytu #178 i draftu PR #179. Nie zastępuje `PLAN_2026-11-03-audyt-pr178.md` i nie zamyka jego otwartych pozycji. Nie dodajemy kart, nie uruchamiamy pełnego benchmarku B0, nie scalamy PR i nie stosujemy łat `NIE_WDRAZAC`.

Słownik używany niżej:

- **Zdarzenie** — pojedynczy fakt w grze, np. opuszczenie pola bitwy przez permanent.
- **Wyzwalacz** — zdolność reagująca na fakt; najpierw trafia na stos, a wykonuje się dopiero po uzyskaniu priorytetu przez graczy.
- **Ostatni znany stan** — cechy permanentu zapamiętane tuż przed opuszczeniem pola bitwy, zanim powstał nowy obiekt w grobie, wygnaniu lub ręce.
- **Automatyczne sprawdzenie stanu** — usuwanie stworów z lethalnymi obrażeniami, tokenów poza polem bitwy, osieroconych aur itp.
- **Kolejność aktywny–nieaktywny** — reguła określająca, który gracz pierwszy układa swoje oczekujące zdolności na stosie.

## Punkt zaczepienia — pomiar zamrożonego drzewa

- [x] Gałąź `arena/5d931b5a-mtg`, HEAD `ad4bf3b`, czyste drzewo; draft PR #179 istnieje przed kodowaniem.
- [x] `npm run test:all`: **10 097 pass / 114 skip / 0 fail**, 10 211 testów, 489,2 s; exit 0.
- [x] `npm run build`: **77 modułów / 5673,7 kB**; exit 0.
- [x] Nie edytowano drzewa podczas pomiaru. Logi: `.arena/safe-architecture-baseline-all.log`, `.arena/safe-architecture-baseline-build.log`.
- [x] Ponownie pobrano przypięty tekst Comprehensive Rules (CR), SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`.
- [x] Audyt #178 pozostaje częściowy: **114 otwartych wierszy mapy**. To osobna liczba od **114 otwartych, wymuszonych RED**; zbieżność wartości nie oznacza tego samego zakresu.

## Etap 1 — zabezpieczyć zachowania, które już działają

- [ ] Dodać aktywne testy regresji bez zmiany produkcji: kilka własnych permanentów opuszczających pole bitwy razem daje jeden wyzwalacz na obserwatora; same permanenty przeciwnika nie dają żadnego; tokeny są liczone; dwie kopie obserwatora wyzwalają się osobno.
- [ ] Uzupełnić kontrolę priorytetu, decyzji gracza i odtworzenia przebiegu (replay) tam, gdzie obecne testy mierzą tylko skutek końcowy.
- [ ] Zachować i uruchomić istniejące testy `real-cards-batch8`, grupowania zdolności, bestow, madness i kreatora many. Nie przepisywać ich asercji pod planowaną zmianę.
- [ ] Każdy nowy test ma wykonywać rzeczywiste komendy silnika; syntetyczne ustawienie planszy musi być jawne i ograniczone do przygotowania scenariusza.

**Ukończenie:** nowe testy GREEN na niezmienionej produkcji; pełny `npm test` + `npm run build`; osobny commit i natychmiast push. Jeśli test ujawni błąd, nie oznaczać go jako poprawnego zachowania — wydzielić reprodukcję do etapu 2.

## Etap 2 — jeden potwierdzony błąd własnego odejścia

Kandydat, jeszcze nie zatwierdzona łata: odchodzący permanent z własną zdolnością „ilekroć jeden lub więcej permanentów, które kontrolujesz, opuszcza pole bitwy” powinien uwzględnić także własne odejście. Obecny skan zbiorczy ogląda tylko permanenty pozostałe na polu bitwy.

- [ ] Najpierw odtworzyć błąd rzeczywistymi komendami i sprawdzić warianty: zwykła śmierć, wygnanie, odbicie, poświęcenie jako koszt, przejęta kontrola, utrata zdolności, zdolność nadana, token oraz powrót karty na pole bitwy przed rozstrzygnięciem.
- [ ] Porównać kontroler i zdolności **sprzed ruchu**, nie cechy nowego obiektu po zmianie strefy. Podstawa: CR 603.2, 603.6c, 603.10/603.10a, 608.2h i 113.7a. Cytaty i ślad źródła w teście oraz opisie commitu.
- [ ] Sprawdzić całą ścieżkę aż do rozstrzygnięcia efektu, nie samo pojawienie się wpisu na stosie. Nie dodawać warunku po nazwie ani identyfikatorze karty.
- [ ] Wybrać najmniejszą naprawę korzystającą z istniejącego ostatniego znanego stanu, jeśli wystarcza. Nie zmieniać przy okazji grupowania wielu zdarzeń, kolejności wielu graczy ani momentu wykonywania automatycznych sprawdzeń.
- [ ] Mutacja polega na usunięciu dokładnej naprawy i musi przywrócić właściwy RED; dodatkowa mutacja nie może wzmacniać przypadkowego warunku.

**Ukończenie:** udokumentowany RED→GREEN, mutacja złapana, pełny `npm test` + `npm run build`, osobny commit i push. Nie usuwać skipów z pokrewnych przypadków A110–A113 tylko dlatego, że jeden wariant przeszedł.

**Warunek zatrzymania:** jeżeli poprawny lokalny fix wymaga nowego trwałego modelu zdarzeń, zmiany kolejności całej partii lub nowego sposobu zapisu stanu, najpierw powstać ma osobna decyzja architektoniczna z opisem kosztów i migracji. Nie wdrażać takiej zmiany jako „drobnej poprawki”.

## Etap 3 — granice pojedynczych zdarzeń, dopiero po dowodzie

- [ ] Zbudować inwentarz emiterów odchodzących obiektów i miejsc kolejkowania wyzwalaczy; rozróżnić jedną jednoczesną grupę od osobnych instrukcji oraz osobnych aktywacji zdolności many.
- [ ] Na rzeczywistych komendach wykazać różnicę między obecnym grupowaniem „na komendę” a grupowaniem właściwego zdarzenia. Nie uznawać samego istnienia wielu ruchów w jednej komendzie za błąd.
- [ ] Zachować kolejność i tożsamość zdarzeń w replay oraz nie podwajać wpisów stosu po wznowieniu decyzji.
- [ ] Dopiero po reprodukcji zaprojektować najmniejszą zmianę granicy zdarzenia. Jeśli zmienia model stanu, przygotować ADR przed kodowaniem.

**Ukończenie:** osobny dowód błędu, projekt granicy, testy obu stron granicy i pełna brama. Bez tego etapu nie zamykać A110 ani nie deklarować naprawy całej rodziny.

## Etap 4 — wspólna kolejność i automatyczne sprawdzenia

- [ ] Oddzielnie badać kolejność zdolności wielu graczy, wybór celów, późniejsze zdolności zależne od celu oraz ponowne automatyczne sprawdzenie stanu.
- [ ] Nie sortować ponownie istniejącego, już rozstrzygniętego stosu i nie ukrywać wcześniej utworzonych wpisów.
- [ ] Nie zmieniać kolejności madness ani działania kreatora many bez nowego, rzeczywistego kontrprzykładu; obecne testy tych obszarów są zielone i zostały semantycznie przejrzane.
- [ ] Każdy potwierdzony przypadek dostaje własny RED→GREEN i własny commit. Wspólny checkpoint wdrażać tylko jako zatwierdzoną zmianę architektoniczną, nie przez zastosowanie historycznych patchy.

**Ukończenie:** właściwy otwarty test przechodzi bez osłabiania asercji, pełny fast + build; przed końcem pracy dodatkowo pełny `npm run test:all`. Pozostałe RED jawnie wymienione.

## Kolejność commitów i procedura bezpieczeństwa

1. Niniejsza roadmapa + aktualizacja aktywnego planu, raportu, historii i handoffu; brama dokumentów, pełny fast + build, commit/push **przed kodowaniem**.
2. Aktywne testy zachowań już poprawnych; pełny fast + build, commit/push.
3. Reprodukcja i lokalna naprawa jednego potwierdzonego błędu; RED→GREEN, mutacja, pełny fast + build, commit/push.
4. Kolejne niezależne przypadki wyłącznie po spełnieniu tych samych warunków.
5. Końcowy pełny pakiet, build, aktualizacja opisu PR i handoffu.

Przed każdym pushem: `git status`, lokalny log, `git fetch origin arena/5d931b5a-mtg`, porównanie `HEAD..FETCH_HEAD` i `FETCH_HEAD..HEAD`. Nigdy force push. Po resecie sandboxa najpierw kopia zmian i porównanie drzew, dopiero potem odzyskanie wskaźnika gałęzi zgodnie z `ENVIRONMENT.md` §2.

## Ryzyka i jawne ograniczenia źródłowe

- Największe ryzyko to „naprawa” przez zmianę zachowania setek poprawnych kart. Dlatego najpierw testy chroniące, potem mały diff i pełna brama.
- Jeden `scry_started` nie wystarcza do policzenia wyzwalaczy: blokuje dalsze rozstrzyganie. Testy liczą także faktyczne `ability_triggered` i wpisy stosu.
- Nowy obiekt po zmianie strefy nie jest starym permanentem. Nie wolno czytać jego kontrolera lub zdolności jako stanu sprzed ruchu.
- Grupowanie po całej komendzie jest obecnym kompromisem, ale jego zmiana nie jest automatycznie bezpieczna. Wymaga osobnego kontrprzykładu.
- Dozwolone mirrory GitHub dostarczyły dosłownego CR i Oracle text. Nie udało się pozyskać z nich rulingów Nefarious Imp; nie oznacza to, że rulingi nie istnieją. Nie zapisywać pustej listy jako faktu i nie cytować niepozyskanej treści.
