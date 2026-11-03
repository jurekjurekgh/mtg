# A111–A113 — LKI Imp i granice batcha, NIE WDRAŻAĆ

`A111_A112_NIE_WDRAZAC.patch` jest odtwarzalną próbą opartą na `8788062`, **nie jest poprawką produkcyjną**. Mimo 34/34 dla A111–A112, wariant bojowy A113 wciąż wykazuje 4 RED i błędne APNAP. Odtwarzanie w osobnej kopii, z korzenia repozytorium:

```sh
mkdir -p .arena/odtworzenie111
git archive 8788062 | tar -x -C .arena/odtworzenie111
git apply --no-index --directory=.arena/odtworzenie111 docs/audits/experiments/A111_A112_NIE_WDRAZAC.patch
cp test/audyt-pr177-a{111,112,113}*.test.js .arena/odtworzenie111/test/
(cd .arena/odtworzenie111 && AUDIT_A111_ENFORCE=1 AUDIT_A112_ENFORCE=1 AUDIT_A113_ENFORCE=1 node --test test/audyt-pr177-a{111,112,113}*.test.js)
```

Przygotowaną kopię i oba pliki silnika porównano z eksperymentem. Z flagami: prototyp **34 GREEN / 4 RED**, produkcja, baza `7aff9b6` i #177 `59815d5` **4 GREEN / 34 RED**. W produkcji 34 przypadki są domyślnie pomijane, cztery kontrole aktywne; skip nie jest GREEN.

## Co rzeczywiście mierzymy

- **A111, 20 RED / 4 kontrole:** rzeczywisty Shock zadaje śmiertelne obrażenia Nefarious Imp. Samotny Imp powinien zobaczyć własne odejście z LKI, ale produkcja nie wyzwala jego scry. Testy obejmują obu kontrolerów, syntetyczną zmianę kontroli i finality, replay/fingerprint, rzeczywiste rozstrzygnięcie scry, drugi żywy Imp, utratę zdolności i syntetyczne nadanie faktycznego deskryptora zdolności. Oddzielnie żywy Imp powinien widzieć wygnanie innego permanentu z finality przez Shock/SBA, rzeczywisty Terminal Agony albo Village Rites jako koszt; Selhoff Occultist i descended kontrolują, że wygnanie nie jest śmiercią ani zejściem karty do grobu. Zwykłe poświęcenie daje dies i descended. Setup kart, bibliotek, tury, puli many, finality i zmiany kontroli jest częściowo syntetyczny; nie jest to pełna partia.
- **A112, 10 RED:** po rzeczywistym Shocku umiera pojedynczy Imp. Kiedy rzeczywisty Selhoff drugiego gracza wyzwala cel, po jego wyborze stos ma zachować APNAP; gdy rzeczywisty Murder of Crows ma tego samego kontrolera co Imp, kontroler musi móc wybrać względną kolejność; dwie instancje Impa są rozróżniane po source ID. Karty i akcje realne, stan stołu/tura/priorytet/pula ustawione w setupie.
- **A113, 4 RED:** w prawdziwej walce Scroll Thief trafia gracza, Hill Giant jest blokowany przez Impa i zabija go, Selhoff aktywnego obserwuje śmierć. Aktywny musi wybrać kolejność Thief/Selhoff, a potem trigger nieaktywnego Imp musi leżeć nad oboma. Atak/blok/obrażenia są realne; stwory i krok walki umieszczono w setupie. W obu orientacjach produkcja gubi Imp, a końcowy prototyp stawia go przedwcześnie: po wyborze celu stos od dołu to `[scroll-thief, nefarious-imp, selhoff-occultist]` zamiast `[selhoff-occultist, scroll-thief, nefarious-imp]` dla wybranego porządku. Nie testujemy pełnej rozgrywki od początku.

## Dlaczego prototyp odrzucono

Wąska próba czyta LKI pojedynczego `creature_destroyed` z SBA, tylko gdy checkpoint z `accepted` nie ma wcześniej nierozstrzygniętych decyzji; dla finality usuwa przedwczesne `return`, ale blokuje death-specific handlers i `descended`. Nie dotyczy wielu odejść, kolejnych instrukcji A110, ogólnego replacement ani wszystkich innych checkpointów. Pierwsza próba przechodziła A111 24/24, lecz w A112 tylko 2/10: zły APNAP z Selhoff oraz brak wyboru kolejności z Crows i dwoma Impami. Późniejsza wąska próba dodaje grupowy trigger do istniejącego batcha śmierci przy jednym zdarzeniu SBA; uzyskuje A111–A112 34/34, lecz A113 miesza trigger obrażeń bojowych, którego batch nie obejmuje. Samo wyliczanie kolejnych rodzajów triggerów grozi powtórzeniem problemu A99; potrzeba modelu rzeczywistych checkpointów i zachowania wszystkich źródeł/LKI, wyborów oraz kolejności, a nie deklaracji ogólnej poprawki.

Podczas eksperymentu wykryto dodatkową pułapkę: samo usunięcie `return` dla poświęcenia z finality błędnie oznaczało wygnanie jako `descended` (2 RED); dodano osobny strażnik i kontrolę zwykłego poświęcenia. Mutacje pierwszej próby: usunięcie ścieżki LKI 12 RED; przywrócenie wyjścia przy finality SBA/poświęcenia/zniszczenia 8/2/2 RED; utrata strażnika descended 2 RED; zły kontroler 4 RED; pominięcie efektywnych zdolności 4 RED; wywołanie dies dla wygnania w trzech ścieżkach po 2 RED. Po rozszerzeniu batcha usunięcie nowej kwalifikacji daje 8 RED, usunięcie LKI daje 22 RED na A111–A112. Mutacje sprawdzają przypadki testowe, nie dowodzą bezpieczeństwa pozostałych ścieżek.

B0 nie uruchamiano. Otwartych A84/A109/A110 i A111–A113 nie wolno uznawać za naprawione na podstawie eksperymentu.
