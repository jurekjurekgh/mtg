# A110 — granice auto-mana / LKI, NIE WDRAŻAĆ

`A110_NIE_WDRAZAC.patch` to izolowany eksperyment oparty na `bda0076`, **nie poprawka produkcyjna**. Odtworzenie z korzenia repo:

```sh
mkdir -p .arena/odtworzenie110
git archive bda0076 | tar -x -C .arena/odtworzenie110
git apply --no-index --directory=.arena/odtworzenie110 docs/audits/experiments/A110_NIE_WDRAZAC.patch
cp test/audyt-pr177-a110-auto-mana-events.test.js .arena/odtworzenie110/test/
(cd .arena/odtworzenie110 && AUDIT_A110_ENFORCE=1 node --test test/audyt-pr177-a110-auto-mana-events.test.js)
```

Wynik: **12 GREEN / 4 RED**. Produkcja, baza `7aff9b6` i #177 `59815d5`: **6 GREEN / 10 RED**. Domyślnie w produkcji aktywne są 6 kontroli, a 10 nieudanych przypadków to skip; flaga wymusza wszystkie. `git apply` uruchamiaj z korzenia, nie wewnątrz kopii bez `.git`; poprawność odtworzenia sprawdzono porównaniem plików.

## Co mierzą testy

- Ward {2} z realnego zakrytego Riftburst Hellion po Shocku, dwa prawdziwe tokeny Treasure utworzone pomocniczo i rzeczywiste Nefarious Imp umieszczone w setupie. Auto-zapłata aktywuje dwa oddzielne źródła; Imp musi wyzwolić się dwa razy, nie raz. Wszystkie orientacje aktywnego/płacącego, dwóch różnych kontrolerów Imp, dwa Impy jednego kontrolera i replay. Cztery kontrole ręcznej sekwencji liczą po dwa triggery, ale **nie** dowodzą ich właściwego czasu/APNAP.
- Realny Austere Command usuwa jednocześnie dwa Treasure: każda instancja Imp kontrolera tych artefaktów wyzwala się **raz**, nie po razie na artefakt. Dwie kontrole pozostają GREEN.
- Realny Severed Strands `{1}{B}` automatycznie poświęca dwa Treasure do many, **następnie** poświęca Imp jako dodatkowy koszt. Sprawdzone są faktyczna kolejność trzech poświęceń i konieczność trzech triggerów Imp z LKI. Produkcja i prototyp dają **0 zamiast 3**, bo agregat szuka źródeł tylko na bieżącym polu bitwy.
- Inny tryb realnego Austere Command wykonuje kolejno osobne instrukcje: zniszcz artefakty, potem stwory z MV ≤3. Imp kontrolera artefaktów powinien widzieć obie grupy, a Imp przeciwnika własne opuszczenie pola; produkcja i prototyp gubią oba źródła. Karty/akcje są rzeczywiste, ale Impy, tokeny, tura, priorytet i pula w setupie nie odtwarzają pełnej partii.

Eksperyment oznacza osobne automatyczne aktywacje skarbowej zdolności many w zdarzeniu poświęcenia i agreguje takie odejścia osobno, zachowując zbiorczą ścieżkę pozostałych zdarzeń. Bez tagu lub bez kolejki **10 RED / 6 GREEN**; naiwne rozgrupowanie każdego odejścia powoduje **6 RED / 10 GREEN**, w tym obie kontrole jednoczesnego zniszczenia. Bazowo w eksperymencie są już cztery RED powyższych przypadków LKI. To punktowy eksperyment, nie model wszystkich równoczesnych zdarzeń, kosztów i efektów; LKI źródła/warunków i APNAP są nierozwiązane, więc nie wdrażać.

Prototyp w wybranym podzbiorze many/triggerów miał **408 pass / 70 skip / 0 fail** przed dopisaniem dwóch domyślnie pomijanych testów kolejnych trybów; nie jest to pełna walidacja. Po zastosowaniu **obu** eksperymentów A109 i A110 w jednej izolowanej kopii wymuszone 42 testy dają **38 GREEN / 4 RED** (LKI przy Severed Strands i kolejnych trybach Austere), nie pełne rozwiązanie; niezależny test M134 nadal wykrywa nieopisane zdarzenie z A109. Prototypy nie zmieniają produkcji i nie dowodzą APNAP ani całego modelu checkpointów. B0 nie uruchamiano.
