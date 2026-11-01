# Minimalne X bota — korekta właściciela 2026-11-01

Właściciel doprecyzował: chodzi o **minimalne**, nie maksymalne X. Bot nie powinien rzucać Magma Pummeler ani innych czarów z X za X < 3, chyba że jest pod presją przegranej. Wycofano niewypchniętą próbę usuwania górnego limitu 15; ta korekta nie zmienia legalności, oferty ani modala dla człowieka. Wcześniejsze sformułowania o żądaniu usunięcia limitu wynikały z błędnej interpretacji i nie są wymaganiem.

## Plan

- [ ] Zmierzyć obecne zachowanie rzeczywistych Magma Pummeler, Fireball, Consume Spirit i Epic Experiment; przejrzeć inne ścieżki czarów X i istniejące wyjątki.
- [ ] Napisać testy RED dla X=0,1,2 bez presji, X=3, przybliżonej presji przegranej i celowego ratunku; uwzględnić wygraną przy X<3 w świetle jednoznacznego wyjątku właściciela oraz dostępność ofert dla człowieka. Zachować istniejące decyzje poza rzucaniem czarów i pokrętła.
- [ ] Zastosować próg generycznie po deskryptorze kosztu X w punktach decyzji bota, bez rozpoznawania nazw kart i bez zmiany reguł gry. Niskie życie samo w sobie nie dowodzi presji przegranej; wyjątek musi być związany z zagrożeniem i użytecznością rzutu.
- [ ] Testy pokrewne, szybki zestaw, build; udokumentować ograniczenia modelu presji, commit i push. Następnie kontynuować audyt PR #177.
