# A109 — próba SBA/LKI podczas Ward, NIE WDRAŻAĆ

`A109_NIE_WDRAZAC.patch` to eksperyment oparty na produkcji z `ce6056c`, **nie poprawka do zastosowania**. Nie zawiera zmian A99/A107 ani rozwiązania ogólnego APNAP. Odtworzenie wyłącznie w osobnym katalogu, z korzenia repo:

```sh
mkdir -p .arena/odtworzenie109
git archive ce6056c | tar -x -C .arena/odtworzenie109
git apply --no-index --directory=.arena/odtworzenie109 docs/audits/experiments/A109_NIE_WDRAZAC.patch
cp test/audyt-pr177-a109-ward-aura-sba.test.js .arena/odtworzenie109/test/
(cd .arena/odtworzenie109 && AUDIT_A108_ENFORCE=1 AUDIT_A109_ENFORCE=1 node --test test/audyt-pr177-a108-ward-sba.test.js test/audyt-pr177-a109-ward-aura-sba.test.js)
```

Oczekiwane **26 pass / 2 fail**: A108 2 GREEN, A109 24 GREEN i dwa RED dla Nefarious Imp przy automatycznej zapłacie Ward. Osobno `node --test test/m134-kompletnosc-zdarzen.test.js` w kopii daje **3 pass / 1 fail**: nowy typ `aura_orphaned_during_ward` nie ma opisu/wygaszenia w logu stołu. Nie maskować tego problemu samym wpisem protokołu. `git apply` uruchomione wewnątrz katalogu bez `.git` potrafi pominąć hunki; polecenie powyżej działa z korzenia, zweryfikowano pliki kopii bajt po bajcie.

## Co zbadano

Produkcja: wymuszone A109 **26 RED**, domyślnie 26 skip (`AUDIT_A109_ENFORCE=1`). Bazowy `7aff9b6` i #177 `59815d5` także 26 RED: pierwsze 22 nie dochodzą do okna Ward dostępnego dzięki ręcznej manie Scionów, ale ostatnie cztery z automatycznym Treasure docierają do sytuacji i wykazują te same błędy — Imp 1 zamiast 3 i odejście aury przed `ward_pay_resolved`.

Realne Scion Summoner, Sciony, zakryty Riftburst Hellion, Shock, Griffin Guide, Infectious Bloodlust i Leafcrown Dryad bestow, a także rzeczywista aktywacja Blazing Torch; Torch i Nefarious Imp umieszczono na polu pomocniczo. Testy obejmują obie strony, zapłatę/odmowę, dwa załączniki, osobnego kontrolera aury, syntetyczny finality i zmianę kontroli, replay przed i po decyzji, replay po automatycznej zapłacie oraz syntetyczne zero życia. Pule, tura i priorytet są ustawiane pomocniczo. W wariancie auto-Ward dwa tokeny Treasure z prawdziwymi deskryptorami umieszczono w setupie, Clawing Torment rzeczywiście rzucono na pierwszy, Imp umieszczono na polu; jawnie sprawdzono poświęcenie obu Treasure.

W eksperymencie `pendingWardPay` blokuje SBA; dla czystej aury, której gospodarz odszedł podczas Ward, wskaźnik jest odłączony dla niezmienników, aura czeka na SBA, a migawka LKI jest skanowana wraz ze śmiercią gospodarza. Znacznik pozwala uwzględnić późniejsze odejście aury i właściwego kontrolera Imp, także po finality, i jest czyszczony po zmianie strefy lub ponownym przypięciu. Bestow i equipment zachowują osobną politykę. Dodatkowo decyzję Ward czyści się **po** automatycznej produkcji many, nie przed nią. Bez tej ostatniej zmiany prototyp miał A109 **22 GREEN / 4 RED**: auto-Ward nadal wysyłał aurę do grobu przed końcem rozstrzygania. Po zmianie czas jest poprawny w badanej sondzie, ale nie liczba triggerów.

Ostatni problem jest istotny: `processTriggers` agreguje `leftBattlefield` per komenda. Dwa osobno poświęcone Treasure i późniejsza akcja stanowa aury są trzema zdarzeniami dla Imp, lecz jedna komenda je scala i daje 1 zamiast 3. Ogólna naprawa musi zachować jednoczesność rzeczywistych zdarzeń, LKI i APNAP; dzielenie kolejki na ślepo jest nieudowodnione. Prototyp pozostawia też znane wcześniejsze problemy A84 i może nie obejmować innych efektów lub zagnieżdżonych decyzji. **Brak podstaw do wdrożenia.**

Niezależne mutacje na odtworzonej wersji końcowej, w A109 przy dwóch istniejących RED: wyłączenie bramki SBA **24 RED**, natychmiastowe usuwanie aury **24 RED**, brak skanu LKI **12 RED**, brak obsługi odroczonego odejścia dla Imp **8 RED**, utrata kontrolera aury **6 RED**, wcześniejsze wyczyszczenie Ward przy auto-manie **4 RED**. Mutacje testują właściwe punkty, ale nie dowodzą ogólnej poprawności.

Szersze testy pierwszej wersji eksperymentu (przed ostatnim przesunięciem czyszczenia Ward, 22 testy A109): powiązany podzbiór **407 pass / 34 skip / 0 fail** z wymuszonym A108; fast **9828 pass / 44 skip / 3 fail**, z czego 1 to rzeczywisty brak opisu nowego zdarzenia, a 2 strażniki repo wymagają `.git` i nie działają w kopii z `git archive`; slow **268/268**. To nie są wyniki końcowej wersji eksperymentu ani wyniki produkcji. Żadnej z tych zmian nie przeniesiono do silnika produkcyjnego. Nie uruchamiano B0.
