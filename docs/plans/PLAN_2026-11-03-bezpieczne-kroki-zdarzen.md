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

- [x] Dodać aktywne testy regresji bez zmiany produkcji: kilka własnych permanentów opuszczających pole bitwy razem daje jeden wyzwalacz na obserwatora; same permanenty przeciwnika nie dają żadnego; tokeny są liczone; dwie kopie obserwatora wyzwalają się osobno.
- [x] Uzupełnić kontrolę priorytetu, decyzji gracza i odtworzenia przebiegu (replay) tam, gdzie obecne testy mierzą tylko skutek końcowy.
- [x] Zachować i uruchomić istniejące testy `real-cards-batch8`, grupowania zdolności, bestow, madness i kreatora many. Nie przepisywać ich asercji pod planowaną zmianę.
- [x] Każdy nowy test ma wykonywać rzeczywiste komendy silnika; syntetyczne ustawienie planszy musi być jawne i ograniczone do przygotowania scenariusza.

**Ukończenie:** nowe testy GREEN na niezmienionej produkcji; pełny `npm test` + `npm run build`; osobny commit i natychmiast push. Jeśli test ujawni błąd, nie oznaczać go jako poprawnego zachowania — wydzielić reprodukcję do etapu 2.

**Wynik etapu 1:** `test/audyt-pr179-zbiorowe-opuszczenie-regresje.test.js`, 7/7 GREEN bez zmiany produkcji. Pełny fast **9836 pass / 114 skip / 0 fail**, build **77 modułów / 5673,7 kB**. Dwa początkowe błędy były błędami przygotowania testu (zbyt mała pula many i mutacja tokenów poza zapisem replay), nie silnika; poprawiono setup, nie asercje regułowe.

## Etap 2 — jeden potwierdzony błąd własnego odejścia

Kandydat, jeszcze nie zatwierdzona łata: odchodzący permanent z własną zdolnością „ilekroć jeden lub więcej permanentów, które kontrolujesz, opuszcza pole bitwy” powinien uwzględnić także własne odejście. Obecny skan zbiorczy ogląda tylko permanenty pozostałe na polu bitwy.

- [x] Najpierw odtworzyć błąd rzeczywistymi komendami i sprawdzić warianty: zwykła śmierć, wygnanie, odbicie, poświęcenie jako koszt, przejęta kontrola, utrata zdolności, zdolność nadana, token oraz powrót karty na pole bitwy przed rozstrzygnięciem.
- [x] Porównać kontroler i zdolności **sprzed ruchu**, nie cechy nowego obiektu po zmianie strefy. Podstawa: CR 603.2, 603.6c, 603.10/603.10a, 608.2h i 113.7a. Cytaty i ślad źródła w teście oraz opisie commitu.
- [x] Sprawdzić całą ścieżkę aż do rozstrzygnięcia efektu, nie samo pojawienie się wpisu na stosie. Nie dodawać warunku po nazwie ani identyfikatorze karty.
- [x] Wybrać najmniejszą naprawę korzystającą z istniejącego ostatniego znanego stanu, jeśli wystarcza. Nie zmieniać przy okazji grupowania wielu zdarzeń, kolejności wielu graczy ani momentu wykonywania automatycznych sprawdzeń.
- [x] Mutacja polega na usunięciu dokładnej naprawy i musi przywrócić właściwy RED; dodatkowa mutacja nie może wzmacniać przypadkowego warunku.

**Ukończenie:** udokumentowany RED→GREEN, mutacja złapana, pełny `npm test` + `npm run build`, osobny commit i push. Nie usuwać skipów z pokrewnych przypadków A110–A113 tylko dlatego, że jeden wariant przeszedł.

**Wynik etapu 2:** A111 przed poprawką 4 pass / 20 fail; po poprawce 24/24. Usunięcie całej naprawy przywraca 4 pass / 20 fail. Naprawa dotyczy tylko `processTriggersScan`: (1) wygnanie zamiast śmierci pomija trigger „dies”, ale nie kończy skanu odejścia; (2) odchodzący obserwator jest skanowany z LKI sprzed ruchu; (3) poświęcenie z finality nie ustawia „descended”. A111 usunięte z kwarantanny. Pozostałe wymuszone RED: **92** (było 114; część pokrewnych przypadków też zaczęła przechodzić, ale nie zamykano ich plików). Fast **9856 pass / 94 skip / 0 fail**, build **77 modułów / 5675,9 kB**. Pełny `test:all` po A111: **10 124 pass / 94 skip / 0 fail**.

**Warunek zatrzymania:** jeżeli poprawny lokalny fix wymaga nowego trwałego modelu zdarzeń, zmiany kolejności całej partii lub nowego sposobu zapisu stanu, najpierw powstać ma osobna decyzja architektoniczna z opisem kosztów i migracji. Nie wdrażać takiej zmiany jako „drobnej poprawki”.

## Etap 3 — granice pojedynczych zdarzeń, dopiero po dowodzie

- [x] Zbudować inwentarz emiterów odchodzących obiektów i miejsc kolejkowania wyzwalaczy; rozróżnić jedną jednoczesną grupę od osobnych instrukcji oraz osobnych aktywacji zdolności many. Wynik: `../audits/INWENTARZ_ZDARZEN_I_TRIGGEROW_2026-11-04.md`.
- [x] Na rzeczywistych komendach wykazać różnicę między obecnym grupowaniem „na komendę” a grupowaniem właściwego zdarzenia. Nie uznawać samego istnienia wielu ruchów w jednej komendzie za błąd. Dowód: wymuszone A110 (osobne auto-Treasure) przy zielonej kontroli jednoczesnego zniszczenia; A112/A113 dla partii kolejności.
- [x] Zachować kolejność i tożsamość zdarzeń w replay oraz nie podwajać wpisów stosu po wznowieniu decyzji. A110 ma aktywne assertions replay i fingerprint.
- [x] Dopiero po reprodukcji zaprojektować najmniejszą zmianę granicy zdarzenia. Jeśli zmienia model stanu, przygotować ADR przed kodowaniem. ADR 0031 zaakceptowany; pierwszy krok objął tylko A110.

**Ukończenie:** osobny dowód błędu, projekt granicy, testy obu stron granicy i pełna brama. Bez tego etapu nie zamykać A110 ani nie deklarować naprawy całej rodziny.

**Wynik etapu 3 / A110:** przed poprawką 6 pass / 10 fail; po poprawce 16/16. Mutacja ignorująca `departureGroupId` przywraca 6 pass / 10 fail. Grupowanie używa jawnej grupy zdarzenia, a brak identyfikatora zachowuje dawną grupę komendy jako fallback. Fast **9866 pass / 84 skip / 0 fail**, build **77 modułów / 5677,1 kB**; `test:audit` **108 testów / 26 pass / 82 fail**. Pełny `test:all` po A110: **10 134 pass / 84 skip / 0 fail**. NIE zamknięto A112/A113.

## Etap 4 — wspólna kolejność i automatyczne sprawdzenia

- [ ] Oddzielnie badać kolejność zdolności wielu graczy, wybór celów, późniejsze zdolności zależne od celu oraz ponowne automatyczne sprawdzenie stanu.
- [ ] Nie sortować ponownie istniejącego, już rozstrzygniętego stosu i nie ukrywać wcześniej utworzonych wpisów.
- [ ] Nie zmieniać kolejności madness ani działania kreatora many bez nowego, rzeczywistego kontrprzykładu; obecne testy tych obszarów są zielone i zostały semantycznie przejrzane.
- [ ] Każdy potwierdzony przypadek dostaje własny RED→GREEN i własny commit. Wspólny checkpoint wdrażać tylko jako zatwierdzoną zmianę architektoniczną, nie przez zastosowanie historycznych patchy.

**Ukończenie:** właściwy otwarty test przechodzi bez osłabiania asercji, pełny fast + build; przed końcem pracy dodatkowo pełny `npm run test:all`. Pozostałe RED jawnie wymienione.

**Wynik podetapu A112:** fast **9876 pass / 74 skip / 0 fail**, build **77 modułów / 5677,3 kB**; `test:audit` **98 testów / 24 pass / 74 fail**. Pełny `test:all` po A112: **10 144 pass / 74 skip / 0 fail**. A113 pozostaje otwarte (4 RED). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A113:** fast **9880 pass / 70 skip / 0 fail**, build **77 modułów / 5677,4 kB**; `test:audit` **94 testy / 24 pass / 70 fail**. Pełny `test:all` po A113: **10 148 pass / 70 skip / 0 fail**. Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A108/A109:** przed poprawką wymuszone 28 testów / 0 pass / 28 fail; po fixie **28/28**. Cztery mutacje (brak odroczenia aury, wczesne zamknięcie Ward, brak SBA aury w skanie Imp, brak triggera odroczonej aury) przywracają czerwony wynik odpowiednio 24/28, 2/26, 8/26 i 12/28. Kontrole Ward/aura/SBA + graf modułów **138/138**. Fast **9908 pass / 42 skip / 0 fail**, build **77 modułów / 5680,4 kB**; `test:audit` **66 testów / 24 pass / 42 fail**. Pełny `test:all` po A108/A109: **10 176 pass / 42 skip / 0 fail**. A108/A109 zdjęte z kwarantanny; pozostałe wymuszone RED **42** (A84/A98/A100–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A100:** przed poprawką wymuszone 6 testów / 0 pass / 6 fail; po fixie **6/6**. Mutacja wyłączająca odroczenie wpisów stosu przywraca 0/6; mutacja usuwająca flush po Ward czerwieni 2/28 w A108/A109. A84 zyskuje pierwsze 4/8 (stos nietknięty w trakcie Ward), ale końcówka APNAP pozostaje otwarta. Kontrole Ward **106/106**. Fast **9914 pass / 36 skip / 0 fail**, build **77 modułów / 5682,6 kB**; `test:audit` **60 testów / 28 pass / 32 fail**. Pełny `test:all` po A100: **10 182 pass / 36 skip / 0 fail**. A100 zdjęte z kwarantanny; pozostałe wymuszone RED **32** (A84/A98/A101–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A84:** po A100 pozostawało 4/8 (końcówka APNAP po Ward); po włączeniu odroczonych wpisów do istniejącej partii śmierci **8/8**. Mutacja wyłączająca partię po Ward przywraca 4/8. Kontrole A100/A108/A109/A110/A112/A113 **92/92**. Fast **9922 pass / 28 skip / 0 fail**, build **77 modułów / 5683,4 kB**; `test:audit` **36 testów / 8 pass / 28 fail**. Pełny `test:all` po A84: **10 190 pass / 28 skip / 0 fail**. A84 zdjęte z kwarantanny; A95/A96 tracą nieużywany wrapper A84. Pozostałe wymuszone RED **28** (A98/A101–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A101:** przed poprawką wymuszone 2 testy / 0 pass / 2 fail; po fixie **2/2**. Mutacja wyłączająca przekazanie partii po zapłacie przywraca 0/2. Kontrole A84/A94/A100/A108/A109/A110/A112/A113 i Zoraline **129/129**. Fast **9924 pass / 26 skip / 0 fail**, build **77 modułów / 5685,1 kB**; `test:audit` **34 testy / 12 pass / 22 fail**. Pełny `test:all` po A101: **10 192 pass / 26 skip / 0 fail**. A101 zdjęte z kwarantanny; A98 zyskało końcówkę APNAP (4/8), środek płatności pozostaje otwarty. Pozostałe wymuszone RED **22** (A98/A102–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A98:** przed poprawką po A101 pozostawało 4/8 (stos w trakcie dopłaty); po odroczeniu wpisów **8/8**. Mutacja wyłączająca odroczenie przywraca 4/8. Kontrole A94/A101/A84/A100/A108/A109/A110/A112/A113/Zoraline **129/129**. Fast **9932 pass / 18 skip / 0 fail**, build **77 modułów / 5685,6 kB**; `test:audit` **26 testów / 10 pass / 16 fail**. Pełny `test:all` po A98: **10 200 pass / 18 skip / 0 fail**. A98 zdjęte z kwarantanny; A104 zyskało pierwszą połowę (4/6), A105 bez zmiany. Pozostałe wymuszone RED **16** (A102–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.

**Wynik podetapu A102/A103:** przed poprawką wymuszone 2+2 testy / 0 pass / 4 fail; po fixie **2/2 + 2/2**. Mutacja wyłączająca dobór w partii przywraca 0/2 w obu rodzinach. Kontrole A94/A98/A101/A84/A100/A108/A109/A110/A112/A113/Zoraline **137/137**. Fast **9936 pass / 14 skip / 0 fail**, build **77 modułów / 5686,0 kB**; `test:audit` **22 testy / 10 pass / 12 fail**. Pełny `test:all` po A102/A103: **10 204 pass / 14 skip / 0 fail**. A102/A103 zdjęte z kwarantanny; pozostałe wymuszone RED **12** (A104–A107). Nie wdrożono pełnego wspólnego checkpointu dla wszystkich typów zdarzeń.




## Rozpoznanie po A111 — co dokładnie zostało do zrobienia

Pomiar wymuszonych A110/A112/A113 po A111: **30 testów / 8 pass / 22 fail**. To nie są nowe błędy wprowadzone przez A111; to pozostały rdzeń problemu kolejności.

- **A110 (zamknięte):** dwie osobne aktywacje many Skarbu w jednej płatności Ward były łączone w jedno zdarzenie odejścia, bo klucz grupowania obejmował kontrolera w całym skanie/komendzie. Naprawa wprowadza `departureGroupId` dla osobnej aktywacji many i dla partii zniszczenia; jednoczesne zniszczenie nadal daje jeden wyzwalacz.
- **A112 (zamknięte):** grupowy wyzwalacz odejścia i celowany wyzwalacz śmierci trafiają już do jednej partii wyboru kolejności przez rozszerzenie istniejącej partii śmierci o `permanents_you_control_leave_battlefield`. RED 2/10 → GREEN 10/10, mutacja złapana, replay/fingerprint aktywne.
- **A113 (zamknięte):** mieszany checkpoint obrażeń bojowych i śmierci wszedł do istniejącej partii przez objęcie `combat_damage_to_player` wspólną koleją wyboru. RED 0/4 → GREEN 4/4, mutacja złapana, replay/fingerprint aktywne.

Wniosek: następny krok nie powinien polegać na dodaniu kolejnego wyjątku do obecnego sortowania. Trzeba najpierw zdefiniować granicę zdarzenia i partii oczekujących zdolności oraz sposób zapisu wyborów kolejności w replay. Jeżeli wymaga to nowego trwałego pola stanu lub zmiany protokołu decyzji, powstaje ADR **przed** kodowaniem. ADR: `../decisions/0031-event-identity-and-trigger-batches.md` (status Zaakceptowana; właściciel wybrał najpierw A110). Małe poprawki lokalne nadal mogą być wdrażane osobno, jeśli nie zmieniają tej granicy.

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
