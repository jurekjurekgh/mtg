# Roadmapa

Roadmapa opisuje kolejność zdolności systemu, a nie sztywne terminy. Każdy etap powinien
kończyć się działającym, testowalnym przyrostem.

**Aktualizacja 2026-07-31:** roadmapa została przeliczona po audycie istniejącej aplikacji
([AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)) i po decyzjach ADR 0009–0011. Największe zmiany:
Etap 5 zmienia charakter z „adapter starego stołu" na „UI nowego, samodzielnego stołu",
Etap 6 w dużej części odpada, a doszedł krok budowania jednoplikowego artefaktu
i publikacji na GitHub Pages, wymuszony wymaganiem gry na iPadzie
([ADR 0011](decisions/0011-modular-sources-single-file-artifact.md)).

## Legenda statusów

- `[x]` — zrobione
- `[ ]` — do zrobienia
- 🔒 — **zablokowane** do czasu decyzji lub danych od właściciela

## Etap 0 — repozytorium i audyt

**Cel:** bezpiecznie przejąć istniejący kod i ustalić fakty zamiast projektować na podstawie założeń.

- [x] Zapisać wizję, zakres i decyzje początkowe.
- [x] Utworzyć punkt wejścia dla przyszłych agentów/współpracowników.
- [x] Ustalić i udokumentować workflow bezpieczeństwa: chroniony `main`, obowiązkowe PR, squash merge.
- [x] Zaimportować aplikację kolekcjonerską wraz z Wirtualnym Stołem (wersja z wyciętymi sekretami).
- [x] Udokumentować sposób uruchomienia i zweryfikować, że aplikacja działa.
- [x] Wykonać audyt architektury, danych, storage i zależności od DOM-u.
- [x] Zinwentaryzować model danych kart, talii i zasobów graficznych.
- [x] Ustalić politykę dla ciężkich/licencjonowanych zasobów (grafiki poza repozytorium).
- [x] Wybrać stos technologiczny i sposób organizacji repozytorium (ADR 0008, ADR 0011).
- [x] Rozstrzygnąć strategię wydzielenia stołu (ADR 0009).
- [x] Rozstrzygnąć źródło danych reguł kart (ADR 0010).
- [x] Rozstrzygnąć sposób uruchamiania i dystrybucji, w tym wsparcie iPada (ADR 0011).
- [ ] Zbudować pierwszy, stabilny workflow CI (`node --test`, opcjonalnie `tsc --checkJs`).
- [ ] Po kilku PR-ach potwierdzających stabilność CI włączyć required status checks
      i zaktualizować `WORKFLOW.md` oraz ADR 0007.

**Exit criteria:** audyt zapisany, stos i strategia wybrane, CI uruchamia testy przy każdym PR.

## Etap 0b — dystrybucja i uruchamianie

**Cel:** właściciel może otworzyć stół na iPadzie i na komputerze, nie instalując niczego.

Etap równoległy do Etapu 1 — powinien powstać wcześnie, żeby każdy kolejny przyrost
był od razu sprawdzalny na docelowym urządzeniu, a nie dopiero na końcu.

- [x] `tools/build.mjs` — sklejanie modułów ESM w jeden plik HTML, bez zależności zewnętrznych.
- [x] **Wykrywanie cyklicznych importów z twardym błędem.** Zweryfikowano prototypem:
      naiwna implementacja przy cyklu po cichu gubi moduły zamiast zgłosić problem.
- [x] Wykrywanie kolizji nazw po sklejeniu (jeden wspólny zasięg, brak izolacji modułów).
- [x] Testy pilnujące obu zabezpieczeń oraz braku `import`/`export` w artefakcie.
- [x] Szkielet `src/table/` z testem własnym widocznym po otwarciu pliku.
- [ ] 🔒 Workflow CI i publikacja na GitHub Pages — pliki gotowe w `docs/setup/workflows/`,
      **wymagają skopiowania przez właściciela** (agent nie ma uprawnienia `workflows`).
- [ ] 🔒 Włączenie GitHub Pages w ustawieniach repozytorium — tylko właściciel.
- [ ] Moduł rozwiązywania adresu obrazu: `./img/` właściciela z fallbackiem na Scryfall,
      z ręcznym przełącznikiem.

**Exit criteria:** właściciel otwiera adres URL na iPadzie i pobrany plik na komputerze;
oba pokazują ten sam stan gry, różniąc się wyłącznie źródłem ilustracji.

**Blokada:** dwa ostatnie punkty wymagają uprawnień właściciela.
Instrukcja: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md).

## Etap 1 — minimalny headless engine bez kart

**Cel:** uruchomić i testować szkielet gry bez UI.

Wszystko w `src/engine/` i `src/protocol/`, bez `document`, `window`, `fetch` i `localStorage`.

- [x] Tożsamość definicji karty, instancji w talii i obiektu gry; zmiana strefy tworzy nowy obiekt.
      Gracz pozostaje częścią konfiguracji `GameState`.
- [x] Strefy (`library`, `hand`, `battlefield`, `graveyard`, `exile`, `stack`) i niemutująca zmiana strefy.
- [x] Minimalna konfiguracja partii i autorytatywny `GameState`.
- [ ] Tura, fazy i kroki zgodne z CR, active player.
- [x] Minimalny protokół `Command` i `Event` z maszynowo rozpoznawalnymi odrzuceniami.
- [x] Projekcja `PlayerView` jako **nowy obiekt kopiujący tylko dozwolone pola**,
      z testem braku wycieków (kluczowe, bo JS nie odróżni widoku od stanu — ADR 0008 §„Czego
      świadomie nie dostajemy").
- [ ] Seedowane RNG, poprawne tasowanie Fishera-Yatesa, powtarzalny log.
      Zastępuje `sort(() => Math.random() - 0.5)` ze starego kodu.
- [ ] Interfejs kontrolera oraz `RandomBot` do testów.
- [ ] Format zapisu partii jako seed + sekwencja komend, z odtwarzaniem
      ([ADR 0011](decisions/0011-modular-sources-single-file-artifact.md)).
      Powstaje tu, bo jest jednocześnie testem determinizmu.

**Exit criteria:** dwaj kontrolerzy przechodzą przez minimalną symulację tur,
a ten sam seed i te same komendy dają identyczny wynik. Zapisana partia odtwarza się
krok po kroku do identycznego stanu końcowego.

## Etap 2 — podstawy rozgrywki i pierwsze karty

**Cel:** pierwsza pionowa ścieżka od definicji karty do legalnego działania.

- [ ] Biblioteka, opening hand, draw, przegrana z pustej biblioteki.
- [ ] Land drop z limitem na turę i podstawowy system many.
- [ ] Rzucanie prostego czaru, stos i priority pass.
- [ ] Permanent na battlefield, tap/untap, summoning sickness.
- [ ] Podstawowe statystyki stworzeń i obrażenia.
- [ ] Format definicji karty i registry statusu wsparcia (`unsupported`/`in-development`/`supported`/`limited`).
- [ ] Format talii jako pliku w repozytorium + test odrzucający talię z kartami
      spoza statusu `supported` ([ADR 0011](decisions/0011-modular-sources-single-file-artifact.md)).
- [ ] 🔒 Pierwsze realne karty z listy właściciela — **każda poprzedzona pobraniem danych
      ze Scryfall** (ADR 0010 §2a).
- [ ] Testy legalnych i nielegalnych przypadków każdej karty.

**Blokada:** implementacja realnych kart czeka na listę od właściciela (ADR 0010).
Do tego czasu Etap 2 rozwijamy na kartach syntetycznych oznaczonych jako testowe.

**Exit criteria:** headless test rozgrywa kontrolowany scenariusz z pierwszymi kartami.

## Etap 3 — combat i zestaw około 20 kart

**Cel:** pełna, mała rozgrywka człowiek/bot na ograniczonym katalogu.

- [ ] Declare attackers / declare blockers.
- [ ] Combat damage i pierwsza obsługa śmierci stworzeń.
- [ ] Podstawowe state-based actions.
- [ ] Instant/sorcery timing i targetowanie z walidacją celu.
- [ ] Co najmniej jeden removal i jeden combat trick.
- [ ] Activated, triggered i prosty static ability zgodnie z wybranymi kartami.
- [ ] 🔒 Około 20 wspieranych kart tworzących grywalne talie testowe.
- [ ] Symulator headless z raportem i replayem z seeda.

**Exit criteria:** boty wielokrotnie kończą partie na obsługiwanych taliach
bez ręcznej ingerencji w stan.

## Etap 4 — bot heurystyczny

**Cel:** przeciwnik wykonujący celowe, diagnozowalne ruchy.

- [ ] Ocena stanu gry.
- [ ] Reguły dla land drop, wykorzystania many, ataku i bloków.
- [ ] Ważony wybór spośród ruchów o zbliżonej wartości.
- [ ] Konfigurowany poziom losowości korzystający z seeda.
- [ ] Ślad uzasadnienia punktowego do debugowania.
- [ ] Benchmark scenariuszy i regresji jakości decyzji.

**Exit criteria:** bot podejmuje legalne i podstawowo sensowne decyzje bez LLM.

## Etap 5 — standalone Wirtualny Stół (UI)

**Cel:** człowiek gra przez interfejs, a engine rozstrzyga reguły.

Zmiana względem poprzedniej wersji roadmapy: nie budujemy adaptera do starej aplikacji,
tylko samodzielny stół (ADR 0009). Zachowania przenosimy z listy w §8 audytu.

- [ ] Własny `index.html` i punkt wejścia w `src/table/`, bez zakładek aplikacji kolekcjonerskiej.
- [ ] Renderowanie `PlayerView` zamiast pełnego stanu.
- [ ] Interakcja jako intencja: kliknięcie/przeciągnięcie wysyła `Command`, UI czeka na odpowiedź engine.
- [ ] UI dla `ChoiceRequest` (cele, tryby, wartość X, sposób płatności).
- [ ] Prezentacja przyczyn odrzucenia komendy w formie czytelnej dla człowieka.
- [ ] Sterowanie turą człowieka i automatyczne kroki bota.
- [ ] **Faktyczne ukrycie ręki przeciwnika** — dziś jej brak jest jawnie zakodowany w starym UI.
- [ ] Przeniesienie sprawdzonych elementów: inspektor stref, menu biblioteki, liczniki,
      tokeny, załączniki, log akcji, podgląd hover (FOT/KON/Scryfall), autosave.
- [ ] Bezpieczne renderowanie danych użytkownika (`textContent` zamiast `innerHTML` — §7 audytu).
- [ ] Eksport i import zapisu partii jako pliku (seed + ruchy), działający w Safari na iPadzie.
- [ ] Instrukcja uruchomienia dla obu trybów: adres URL oraz pobrany plik.

**Exit criteria:** człowiek rozgrywa przez UI pełną partię z botem na małym wspieranym katalogu
— sprawdzone zarówno na komputerze, jak i na iPadzie.

## Etap 6 — integracja z kolekcją i trwałość

**Cel:** połączyć stół z realnym katalogiem właściciela bez duplikowania danych.

Etap znacznie mniejszy niż w poprzedniej wersji roadmapy — samodzielność stołu
jest już osiągnięta w Etapie 5.

- [ ] Jeden interfejs źródła kart z dwiema implementacjami: definicje w repozytorium
      oraz opcjonalny odczyt katalogu właściciela.
- [ ] Mapowanie karty z kolekcji na definicję reguł (bez arytmetyki ID `+100000`/`+200000`).
- [ ] Kreator talii w interfejsie **lub** świadome potwierdzenie, że talie pozostają
      plikami w repozytorium (ADR 0011 przyjmuje brak edycji talii z iPada jako koszt).
- [ ] Decyzja o backendzie i docelowym poziomie ochrony FoW — osobny ADR.
- [ ] Usunięcie snapshotu `card_viewer_12_10_for_Github.html` z repozytorium.

## Etap ciągły — kolejne karty

Dla każdej karty lub małej partii:

1. zarejestrować dokładne dane i tekst reguł wraz z datą weryfikacji;
2. rozłożyć zachowanie na istniejące i nowe mechaniki;
3. zaimplementować brakujące klocki wielokrotnego użytku;
4. dodać definicję i status wsparcia;
5. napisać testy jednostkowe i interakcyjne;
6. uruchomić symulacje i regresje;
7. udokumentować ograniczenia;
8. dopiero wtedy dopuścić kartę do normalnej gry.

## Możliwe późniejsze kierunki

Nie są obecnie zobowiązaniem:

- search bot / MCTS;
- agent LLM korzystający z tego samego protokołu kontrolera;
- **generator SKIT-ów** jako osobny konsument logu partii, całkowicie poza ścieżką reguł
  (dziś wpleciony w prompt decyzyjny — §6 audytu);
- backend z realną ochroną ukrytych informacji;
- narzędzia do analizy partii;
- import nowych danych kart;
- dodatkowe formaty lub multiplayer.
