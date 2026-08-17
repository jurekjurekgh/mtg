# Instrukcja dla agentów i automatycznych współpracowników

Przed rozpoczęciem pracy przeczytaj kolejno:

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. najnowszy `docs/setup/HANDOFF_*.md` (stan, kolejka i pułapki z ostatniej
   sesji; zacznij od sekcji „START TUTAJ", jeśli istnieje)
4. `docs/PRODUCT.md`
5. `docs/ARCHITECTURE.md`
6. `docs/decisions/README.md`, **`docs/LESSONS.md`** (trwały rejestr lekcji —
   powtarzalne pułapki i heurystyki diagnostyczne) oraz
   **`docs/setup/ENVIRONMENT.md`** (stałe ograniczenia środowiska sesji:
   izolacja sesji, resety workspace, git/GitHub, sieć, limity czasu).
   Oba czyta się szybko, a oszczędzają powtarzania tych samych błędów
7. `docs/WORKFLOW.md` i `SECURITY.md`
8. właściwe ADR-y i dokumenty obszaru, którego dotyczy zadanie
9. **ostatni PR sesji (lub poprzedniej) i jego kompletność** — jeśli zadanie
   z PR nie jest skończone, podejmij je w miejscu, w którym praca się kończy
   (do tego służy roadmapa zadania, patrz niżej)
10. **`docs/setup/TESTER_STOLU.md`** — żywy tester stołu
    (`tools/table-tester/run-game.mjs`): automatyczny gracz na prawdziwym
    artefakcie. Używaj go do audytu UX/rozgrywki „z perspektywy gracza"
    (etykiety, modale, zachowanie bota) — testy engine tego nie łapią.

## Start zadania: rozpoznanie, plan, mini-roadmapa PRZED kodowaniem

Po otrzymaniu zadania sesja NAJPIERW rozpoznaje zadanie (stan repo, testy,
dane wejściowe), planuje wdrożenie i spisuje **szczegółową mini-roadmapę
zadania** — etapy z kryteriami ukończenia (testy/build), kolejnością planowanych
commitów i ryzykami/pułapkami. Roadmapa ląduje w `docs/plans/PLAN_<data>-<slug>.md`
i jest **wypychana jako osobny commit w PR sesji przed rozpoczęciem kodowania**.
Podczas pracy roadmapa jest aktualizowana (odhaczanie etapów kolejnymi
commitami), a na końcu zadania dopisuje się krótkie podsumowanie wykonania.

Dzięki temu po awarii sesji nowy agent odczytuje plan z repozytorium,
konfrontuje go z aktualnym stanem (commity PR, testy, odhaczone etapy) i
podejmuje zadanie w miejscu, w którym praca urwała się — zamiast zaczynać
rozpoznanie od zera. To uzupełnienie, nie zamiennik handoffu sesji
(`docs/setup/HANDOFF_*.md` opisuje stan CAŁEGO projektu; roadmapa — JEDNO
bieżące zadanie).

## Obowiązkowy audyt poprzedniego PR na starcie sesji

Każda nowa sesja, zanim rozpocznie jakiekolwiek nowe kodowanie, zaczyna się od
szczegółowego audytu poprzedniego PR (pkt 9 powyżej). Audyt obejmuje minimum:

- **poprawność zmian w engine** (reguły, stan, FoW, determinizm) — czy żadna
  zmiana nie została pominięta ani nie regresuje istniejących zachowań;
- **prawidłowe zakodowanie kart w batchu** poprzedniej sesji — zgodność z Oracle
  text (Scryfall) i mechanikami, poprawne pola i `limitations`, działanie na
  prawdziwych przykładowych scenariuszach;
- **audyt mechanik** używanych przez dodane karty — czy implementacja jest
  generyczna i czy nie ma specjalnych przypadków po nazwie/ID karty
  (zgodnie z ADR 0002).

Audyt wykonuje się **bez pełnego B0** (pełna macierz benchmarku bota może
przekroczyć limit czasu sesji); dopuszczalne potwierdzenie to `npm test` oraz
`node --test test/bot-benchmark.test.js`. Wnioski z audytu zapisuje się
w roadmapie zadania i `docs/PROJECT_STATE.md`. Szczegóły: ADR 0016.

**Pełny benchmark B0 tylko na wyraźną komendę właściciela (ADR 0018).**
Agent NIGDY nie odpala pełnej macierzy (23 400 meczów, ~40+ min) „przy
okazji" — ani w audycie, ani żeby domknąć PR. Do opisu PR wystarcza profil
SZYBKI (`node tools/benchmark.mjs` — domyślnie, ~2–4 min, ta sama próbka co
test regresji). Pełna macierz wymaga jawnego `--full` = komendy właściciela;
jej wynik trafia wtedy do `tools/b1-final-*.json|txt` i opisu PR.

**Tiers testów (ADR 0019).** `npm test` to SZYBKI RDZEŃ (pętla deweloperska,
bez plików z `tools/test-manifest.json`); ciężkie pliki: `npm run test:slow`;
pełny pakiet (brama PR, to samo co CI): `npm run test:all`. Plik trafia do
manifestu, gdy jego samodzielny czas przekracza ~5 s. Wzrost katalogu kart
nie rośnie w testy ręczne — `test/catalog-coverage.test.js` weryfikuje
KAŻDĄ kartę rejestru strukturalnie.

## Źródło prawdy

Repozytorium, testy i dokumentacja są źródłem prawdy. Historia czatu, opis zadania i komentarze mogą być niepełne. Jeżeli są sprzeczne:

1. nie ukrywaj sprzeczności;
2. sprawdź najnowsze ADR-y i `PROJECT_STATE.md`;
3. poproś właściciela o decyzję, jeśli zmiana jest nieodwracalna lub wpływa na zakres;
4. zapisz rozstrzygnięcie w repozytorium.

## Zasady pracy z repozytorium

Te reguły obowiązują każdego agenta bez wyjątku (szczegóły: `docs/WORKFLOW.md`, ADR 0007):

- **Praca istnieje dopiero po `git push`.** Nowa sesja widzi WYŁĄCZNIE `main`
  na GitHubie i tekst pierwszego promptu — pliki lokalne, `/tmp`, historia
  czatu i niewypchnięte commity przepadają (ADR 0013). Sandbox potrafi też
  zresetować workspace do świeżego klona **w trakcie** sesji. Dlatego:
  commituj i pushuj po każdym samodzielnie zielonym kroku, a po każdym
  commicie sprawdź `git log --oneline -1`. Procedura odzyskania po resecie:
  `docs/setup/ENVIRONMENT.md` §2.
- Pracuj wyłącznie na gałęzi przypisanej do sesji; nigdy nie zapisuj zmian bezpośrednio w `main`.
- Nie wykonuj push do `main` ani force push do `main` — ochrona i tak je odrzuci.
- Nie proś o dodanie kogokolwiek do bypass list i nie zmieniaj ustawień ochrony `main`
  bez wyraźnej decyzji właściciela.
- Każdą zmianę zgłaszaj jako Pull Request do `main` z wypełnionym szablonem opisu.
- **Nie wykonuj merge.** Scalenie jest jawną decyzją właściciela; preferowana metoda to
  `Squash and merge`.
- Nie zamykaj cudzych wątków komentarzy tylko po to, żeby odblokować scalanie.
- Zanim uznasz zadanie za skończone, sprawdź faktyczny stan `main` — nie zakładaj,
  że wcześniejsza sesja opublikowała swoje zmiany.
- Nie commituj sekretów ani ciężkich zasobów; zasady opisuje `SECURITY.md`.
- **„Samodzielnie zielony" znaczy: cały pakiet, nie wycinek.** Przed każdym
  commitem uruchom `npm test` (szybki rdzeń), a nie tylko testy dopisanego
  pliku. Nauczka z M109: karta dopisana do katalogu jako `supported`, ale
  jeszcze nieobecna w żadnej talii, wywraca strażnika konwencji z zupełnie
  innego pliku — CI pokazał czerwony krzyżyk przy commicie, który lokalnie
  „przechodził". Zmiana danych (karty, talie) potrafi zepsuć test odległy
  o kilka katalogów.
- Sesja agentska to relacja **1 sesja = 1 gałąź = 1 PR**. Wszystkie tematy zlecone
  w sesji dopisuj do PR tej sesji osobnymi, samodzielnie zielonymi commitami
  (testy + build po każdym) i aktualizuj opis PR kumulacyjnie. Nie otwieraj
  drugiego PR w tej samej sesji — scalenie PR to decyzja właściciela i kończy sesję.
- **Projekt jest prowadzony przez sesje Agent Arena** (ADR 0013). Scalenie lub zamknięcie
  PR sesji **kończy sesję kodowania** — po tym momencie agent nie może już modyfikować
  GitHuba (push, PR, komentarze). Nowa sesja **nie ma dostępu do stanu lokalnego**
  poprzedniej: startuje wyłącznie z gałęzi `main` i z tekstu pierwszego promptu.
- **Obowiązkowy etap zamknięcia sesji:** wypisz w czacie jeden blok tekstu —
  *instrukcję przekazania projektu* dla następnego agenta (pierwsze kroki i oczekiwane
  wyniki `npm test`/`npm run build`, dokumenty do przeczytania, zasady nienegocjowalne,
  stan po scaleniu z wynikami benchmarku, kolejka zadań, pułapki środowiska).
  Część trwałą tej treści zapisz w `docs/PROJECT_STATE.md` i `docs/setup/HANDOFF_<data>.md`.
  Blok przekazania jest sugestią dla następnej sesji — w razie rozbieżności wygrywa repozytorium.

## Nienegocjowalne granice

- Engine jest autorytetem reguł i stanu.
- UI i kontrolery wysyłają intencje/wybory; nie mutują bezpośrednio stanu.
- Core nie zawiera specjalnych przypadków rozpoznających konkretną kartę po nazwie/ID.
- Kontroler otrzymuje widok gracza, nie pełny stan z ukrytymi informacjami.
- Agent LLM nie jest walidatorem reguł.
- Nie oznaczaj karty jako obsługiwanej bez testów i jawnego zakresu.
- Nie dodawaj masowo grafik, baz i wygenerowanych artefaktów bez uzgodnienia storage/licencji.
- Nie przepisuj istniejącej aplikacji przed jej uruchomieniem i udokumentowanym audytem.
- **Znalezione błędy i uproszczenia NAPRAWIAJ u root cause, nie maskuj.**
  Jeśli kod crashuje lub daje zły wynik, znajdź przyczynę (dlaczego obiekt nie
  ma pola? dlaczego trigger odpala w złym kontekście?) i napraw ją — zamiast
  dodać `return`/`try-catch`/warunek-specjalny, który ukrywa symptom. Maskowanie
  przenosi błąd w czasie i utrudnia diagnozę. Jeśli naprawa root cause wymaga
  decyzji właściciela (np. zmiana architektury), zgłoś to jawnie.

## Narzędzia audytu rozgrywki

- **Żywy tester stołu** — `tools/table-tester/` (jsdom + zbudowany artefakt):
  rozgrywa partię jako gracz i zapisuje transkrypt (stos, akcje, ręka, log).
  Instrukcja: `docs/setup/TESTER_STOLU.md`. Wymaga `npm run build` i
  `npm i` w `tools/table-tester`. Użyj go, gdy zlecenie dotyczy tego,
  co WIDAĆ na stole (UI, etykiety, modale, zachowanie bota) — nie zastępuje
  `npm test` (reguły) ani testów na telefonie (wygląd).
  - **Trzy osie audytu** (decyzja właściciela 2026-08-14, checklista
    w `TESTER_STOLU.md` → „Czego szukać"): (1) bezsensowne działania bota,
    (2) kompletność informacji w logu i modalu „Ruch przeciwnika" — *wszystko
    poza szumem powinno tam być*, (3) ptaszki wyciszenia auto-pass przy czarach
    i zdolnościach.
  - **Braki testera naprawia się w testerze.** Gdy narzędzie się zatrzymuje
    (`[STOP]`) albo nie obsługuje mechaniki, poprawiasz `run-game.mjs` —
    nie pomijasz fragmentu gry i nie zawężasz audytu.
- Wyniki audytów zgłaszaj jak inne (wzorzec M54/M65/M73): opis objawu
  z transkryptu → naprawa u root cause → test regresyjny.

## Jak dokumentować pracę

Przy zmianie kodu lub projektu sprawdź, czy należy zaktualizować:

- `docs/PROJECT_STATE.md` — bieżąca faza, blokery, najbliższy krok;
- `docs/ROADMAP.md` — ukończone lub zmienione etapy;
- `docs/WORKFLOW.md` i `SECURITY.md` — jeśli zmieniają się zasady pracy lub ochrona repozytorium;
- ADR — nowa istotna decyzja lub zastąpienie poprzedniej;
- dokumentację wsparcia kart/mechanik;
- instrukcję uruchomienia i testów.

Nie duplikuj bieżącego statusu w wielu miejscach. Szczegóły historyczne należą do commitów/ADR, a krótki stan bieżący do `PROJECT_STATE.md`.

### Gdzie zapisać regułę, żeby nie przepadła

Decyzja właściciela (2026-08-14): **reguły trwałe nie mogą mieszkać w handoffie**
— handoff opisuje jedną sesję i traci aktualność. Zanim zapiszesz wniosek,
wybierz miejsce:

| Rodzaj treści | Miejsce | Trwałość |
|---|---|---|
| Wiążąca decyzja o granicach, modelu stanu, protokole, deploymencie | ADR (`docs/decisions/`) | trwała, formalna |
| Powtarzalny wniosek diagnostyczny, pułapka, heurystyka pracy | `docs/LESSONS.md` | trwała, nieformalna |
| Zasada obowiązująca każdego agenta | ten plik (`AGENTS.md`) | trwała |
| Stałe ograniczenie środowiska (sandbox, git, sieć, limity) | `docs/setup/ENVIRONMENT.md` | trwała |
| Stan i kolejka jednej sesji | `docs/setup/HANDOFF_*.md` | jednorazowa |
| Roadmapa jednego zadania | `docs/plans/PLAN_*.md` | jednorazowa |

Jeżeli w trakcie sesji trafisz na pułapkę, która zmarnowała Ci czas i może
powtórzyć się w przyszłości — **dopisz lekcję do `docs/LESSONS.md`** (format:
`## LN (data) — tytuł`, objaw → przyczyna → reguła). Spójności rejestru ADR
i formatu lekcji pilnuje `test/docs-decisions.test.js`.

### Diagnostyka zachowań kontrolera (ADR 0017)

Zanim uznasz zachowanie bota za błąd heurystyki, sprawdź, czy `PlayerView`
w ogóle niesie dane potrzebne do tej decyzji — kontroler dostaje widok, nie
stan, więc pole spoza widoku jest dla niego nieosiągalne. Szczegóły:
[ADR 0017](docs/decisions/0017-playerview-completeness-contract.md) i lekcja L1.

## Oczekiwania wobec zmian

- Pracuj ciągle w ramach bieżącej sesji: nie zatrzymuj się po podetapie ani nie proś o wdrożenie tylko dlatego, że zakończyła się checklista.
- Koduj aż do decyzji projektowej właściciela albo do braku niezbędnych danych wejściowych.
- Przy większym zakresie aktualizuj istniejący PR zamiast sztucznie dzielić pracę na małe PR-y.
- Preferuj małe, odwracalne przyrosty wewnątrz ciągłej pracy.
- Najpierw test odtwarzający zachowanie lub błąd, potem implementacja, gdy ma to sens.
- Testy core nie powinny wymagać DOM-u, sieci ani grafik.
- Każde źródło losowości w grze powinno być kontrolowane i seedowalne.
- Błędy walidacji powinny być maszynowo rozpoznawalne oraz czytelne dla UI.
- Zmiany formatu danych powinny mieć plan migracji lub adapter.
- Nie rozszerzaj zakresu Comprehensive Rules „na zapas”; implementuj potrzebną abstrakcję bez zamykania drogi do rozwoju.
- **Patchuj chirurgicznie.** Staraj się podmieniać minimalną ilość kodu
  (pojedyncze linie, bloki, warunki) zamiast całych funkcji czy plików.
  Jeżeli wymiana całej funkcji lub pliku jest niezbędna, przed zapisaniem
  **dwukrotnie sprawdź**, czy nowa wersja nie zgubiła istotnych elementów
  oryginału — zmiennych, pól, odwołań do innych funkcji, warunków brzegowych.
  Po zmianie przejrzyj `git diff` i wyjaśnij w opisie commita, co zostało
  zachowane. Szczegóły: ADR 0016.

## Dodawanie kart

Przed implementacją karty ustal:

- jednoznaczną definicję/Oracle text i dane wejściowe;
- mechaniki już obsługiwane;
- brakujące reguły;
- pozytywne i negatywne scenariusze testowe;
- najważniejsze interakcje z istniejącym katalogiem;
- jawne ograniczenia wsparcia.

**`limitations` kontra `notes` (M111).** Pole `support.limitations` znaczy
dokładnie jedno: **tu NIE gramy pełnego Oracle**. Opis zachowania („decyzja
jest blokująca", „one or more liczone per komenda", „bot bierze pierwszą
ofertę") to `notes`. Dzięki temu liczba kart z niepustym `limitations` jest
wiarygodnym licznikiem długu wobec Oracle. Strażnik
`test/limitations-guard.test.js` dopuszcza tylko trzy powody (token, tylna
strona karty dwustronnej, brak strefy dowodzenia w formacie 1v1) — nowe
ograniczenie wymaga świadomej decyzji: albo implementujesz pełne Oracle,
albo dopisujesz powód z uzasadnieniem.

Jeżeli karta ujawnia brak w core, najpierw nazwij brakującą ogólną regułę. Nie naprawiaj go warunkiem zależnym od nazwy karty.

## Decyzje architektoniczne

Nowy ADR jest potrzebny, gdy zmiana:

- ustala lub zmienia granice komponentów;
- wybiera istotną technologię lub sposób persistence/deployment;
- zmienia model stanu, eventów, FoW albo determinizmu;
- wprowadza trwały kompromis wpływający na wiele funkcji.

Użyj szablonu z `docs/decisions/README.md`. Nie edytuj historii zaakceptowanego ADR tak, aby zmienić znaczenie decyzji; utwórz nowy ADR, który go zastępuje.
