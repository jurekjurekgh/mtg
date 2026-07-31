# Roadmapa

Roadmapa opisuje kolejność zdolności systemu, a nie sztywne terminy. Każdy etap powinien kończyć się działającym, testowalnym przyrostem.

## Etap 0 — repozytorium i audyt

**Cel:** bezpiecznie przejąć istniejący kod i ustalić fakty zamiast projektować na podstawie założeń.

- [x] Zapisać wizję, zakres i decyzje początkowe.
- [x] Utworzyć punkt wejścia dla przyszłych agentów/współpracowników.
- [ ] Zaimportować aplikację kolekcjonerską i Wirtualny Stół.
- [ ] Udokumentować sposób uruchomienia.
- [ ] Wykonać audyt architektury, danych, storage i zależności od DOM-u.
- [ ] Zinwentaryzować bazę kart, talie i zasoby graficzne.
- [ ] Ustalić politykę dla ciężkich/licencjonowanych zasobów.
- [ ] Wybrać stos technologiczny i sposób organizacji repozytorium.
- [ ] Utworzyć backlog małych zadań na Etap 1.

**Exit criteria:** obecna aplikacja działa z repozytorium, a plan wydzielenia stołu nie wymaga zgadywania.

## Etap 1 — minimalny headless engine bez kart

**Cel:** uruchomić i testować szkielet gry bez UI.

- [ ] Tożsamość gracza, definicji karty, instancji i obiektu gry.
- [ ] Podstawowe strefy i kontrolowane zmiany stref.
- [ ] Konfiguracja partii i autorytatywny `GameState`.
- [ ] Tura, podstawowe fazy/kroki i active player.
- [ ] Protokół `Command`, `ChoiceRequest`, `Event` i błędów walidacji.
- [ ] Projekcja `PlayerView` z testami braku wycieków.
- [ ] Seedowane RNG, tasowanie i powtarzalny log.
- [ ] Interfejs kontrolera oraz `RandomBot` do testów.

**Exit criteria:** dwaj kontrolerzy mogą przejść przez pustą/minimalną symulację tur, a ten sam seed i komendy dają ten sam wynik.

## Etap 2 — podstawy rozgrywki i pierwsze karty

**Cel:** pierwsza pionowa ścieżka od definicji karty do legalnego działania.

- [ ] Biblioteka, opening hand, draw i podstawowa obsługa końca gry.
- [ ] Land drop i podstawowy system many.
- [ ] Rzucanie prostego czaru, stos i priority pass.
- [ ] Permanent na battlefield.
- [ ] Podstawowe creature stats i damage.
- [ ] Pierwsze karty oraz registry statusu wsparcia.
- [ ] Testy legalnych i nielegalnych przypadków każdej karty.

**Exit criteria:** headless test rozgrywa kontrolowany scenariusz z pierwszymi realnymi kartami.

## Etap 3 — combat i zestaw około 20 kart

**Cel:** pełna, mała rozgrywka człowiek/bot na ograniczonym katalogu.

- [ ] Declare attackers/blockers.
- [ ] Combat damage.
- [ ] Podstawowe state-based actions.
- [ ] Instant/sorcery timing i targetowanie.
- [ ] Co najmniej jeden removal i combat trick.
- [ ] Activated, triggered i prosty static ability zgodnie z wybranymi kartami.
- [ ] Około 20 wspieranych kart tworzących grywalne talie testowe.
- [ ] Symulator CLI/headless z raportem i replayem.

**Exit criteria:** boty mogą wielokrotnie kończyć partie na obsługiwanych taliach bez ręcznej zmiany stanu.

## Etap 4 — bot heurystyczny

**Cel:** przeciwnik wykonujący celowe, diagnozowalne ruchy.

- [ ] Ocena stanu gry.
- [ ] Reguły dla land drop, wykorzystania many, ataku i bloków.
- [ ] Ważony wybór spośród ruchów o zbliżonej wartości.
- [ ] Konfigurowany poziom losowości korzystający z seeda.
- [ ] Ślad uzasadnienia punktowego do debugowania.
- [ ] Benchmark scenariuszy i regresji jakości decyzji.

**Exit criteria:** bot podejmuje legalne i podstawowo sensowne decyzje bez LLM.

## Etap 5 — adapter istniejącego Wirtualnego Stołu

**Cel:** UI steruje engine przez komendy zamiast bezpośrednich mutacji.

- [ ] Warstwa mapowania istniejących danych kart.
- [ ] Renderowanie `PlayerView`.
- [ ] Drag-and-drop jako intencja.
- [ ] UI dla `ChoiceRequest` (cele, tryby, płatności itp.).
- [ ] Obsługa walidacji i przyczyn odrzucenia.
- [ ] Sterowanie turą człowieka oraz automatyczne kroki bota.
- [ ] Ukrycie ręki i innych prywatnych danych przeciwnika.

**Exit criteria:** człowiek rozgrywa przez UI pełną partię z botem na małym wspieranym katalogu.

## Etap 6 — wydzielenie standalone Game Table

**Cel:** oddzielić cykl życia gry od funkcji kolekcjonerskich bez duplikowania potrzebnych danych.

- [ ] Stabilna granica między kolekcją, kartami i grą.
- [ ] Samodzielny entry point/build/deployment stołu.
- [ ] Wspólne lub mapowane dane kart i artów.
- [ ] Decyzja o backendzie i poziomie ochrony FoW.
- [ ] Migracja bez regresji aplikacji kolekcjonerskiej.

## Etap ciągły — kolejne karty

Dla każdej karty lub małej partii:

1. zarejestrować dokładne dane/tekst reguł;
2. rozłożyć zachowanie na istniejące i nowe mechaniki;
3. zaimplementować brakujące klocki wielokrotnego użytku;
4. dodać definicję i status wsparcia;
5. napisać testy jednostkowe i interakcyjne;
6. uruchomić symulacje/regresje;
7. udokumentować ograniczenia;
8. dopiero wtedy dopuścić kartę do normalnej gry.

## Możliwe późniejsze kierunki

Nie są obecnie zobowiązaniem:

- search bot/MCTS;
- agent LLM korzystający z tego samego protokołu kontrolera;
- backend z realną ochroną ukrytych informacji;
- narzędzia do analizy partii;
- import nowych danych kart;
- dodatkowe formaty lub multiplayer.
