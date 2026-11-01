# Minimalne X bota — korekta właściciela 2026-11-01

Właściciel doprecyzował: chodzi o **minimalne**, nie maksymalne X. Bot nie powinien rzucać Magma Pummeler ani innych czarów z X za X < 3, chyba że jest pod presją przegranej. Wycofano niewypchniętą próbę usuwania górnego limitu 15; ta korekta nie zmienia legalności, oferty ani modala dla człowieka. Wcześniejsze sformułowania o żądaniu usunięcia limitu wynikały z błędnej interpretacji i nie są wymaganiem.

## Plan

- [x] Zmierzyć obecne zachowanie rzeczywistych Magma Pummeler, Fireball, Consume Spirit i Epic Experiment; przejrzeć inne ścieżki czarów X i istniejące wyjątki.
- [x] Napisać testy RED dla X=0,1,2 bez presji, X=3, przybliżonej presji przegranej i celowego ratunku; uwzględnić wygraną przy X<3 w świetle jednoznacznego wyjątku właściciela oraz dostępność ofert dla człowieka. Zachować istniejące decyzje poza rzucaniem czarów i pokrętła.
- [x] Zastosować próg generycznie po deskryptorze kosztu X w punktach decyzji bota, bez rozpoznawania nazw kart i bez zmiany reguł gry. Niskie życie samo w sobie nie dowodzi presji przegranej; wyjątek musi być związany z zagrożeniem i użytecznością rzutu.
- [x] Testy pokrewne, szybki zestaw, build; udokumentować ograniczenia modelu presji, commit i push. Następnie kontynuować audyt PR #177.

## Wynik

Aktualny katalog ma cztery takie czary: Magma Pummeler (`xCost` permanentu), Consume Spirit i Epic Experiment (`spell.xCost`) oraz Fireball (`spell.fireball`). Próg dotyczy również płatnych wariantów okna Vaana i okien darmowego rzutu (X samego czaru jest tam 0). W komendzie Halo Foragera X płatności zdolności nie jest X czaru; nie nakładamy progu na samą zdolność ani na inne czary. Wyjątek Fireballa obejmujący wygraną przy braku presji oraz wyjątek od samego życia ≤5 zostały usunięte. Pokrętło `xMinimumValue=0` nadal wyłącza próg.

Presja to przybliżenie: suma siły wszystkich wrogich stworów ≥ życie bota, nawet gdy część może nie móc zaatakować lub zostać zablokowana. Przy damage/gain wymagamy, by rzut usunął wystarczającą część oszacowanego zagrożenia, zwiększył życie ponad nie albo wygrał **w tej presji**; Epic w desperacji może próbować znaleźć ratunek w niepustej bibliotece. Dla permanentu istnieje osobna przybliżona reguła ostatniego blokera; X=0 dla Magmy nie przechodzi, bo 0/0 ginie. To nie jest pełna symulacja przyszłej walki ani wykrywanie innych dróg przegranej. Silnik i legalne wybory gracza nie zostały zmienione.

Testy `test/uwaga-2026-11-01-minimum-x.test.js`: wszystkie cztery czary X=0/1/2 i X=3, presja, brak presji mimo niskiego życia i możliwej wygranej, nieużyteczny strzał, awaryjny Magma/Epic, Discover, Vaan oraz wyłączenie pokrętła. Fireball X=0 nie jest obecnie oferowany w tej ścieżce silnika; test tego nie utożsamia z odebraniem legalnej oferty. Test PMSSB wartości życia wyłącza politykę progu, aby nadal mierzyć pierwotną drabinę, nie nowy filtr.

RED: 8/23 (w tym jeden błędny warunek testu dotyczący nieoferowanego Fireball X=0); dodatkowy RED dla Discover/Magmy. Po naprawie pakiet pokrewny 108/108; `npm test` 9238/9238, `npm run build` 76 modułów / 5625,9 kB. Testów wolnych po tej zmianie nie uruchomiono.
