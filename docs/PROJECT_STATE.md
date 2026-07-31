# Bieżący stan projektu

- **Ostatnia aktualizacja:** 2026-07-31
- **Faza:** Etapy 1–3 zamknięte na katalogu syntetycznym; Etap 0b (dystrybucja) działa
- **Kod produkcyjny:** headless engine (`src/engine/`, `src/protocol/`), warstwa kart
  (`src/cards/`) z syntetycznym katalogiem i taliami w `decks/`, szkielet stołu
  (`src/table/`) publikowany przez Pages

Ten plik jest krótkim punktem wejścia dla właściciela, nowych współpracowników i agentów.
Powinien być aktualizowany po każdej istotnej zmianie zakresu, architektury lub etapu prac.

## Proces pracy

Gałąź `main` jest chroniona i każda zmiana wchodzi przez Pull Request: bez bezpośredniego pusha
i force pusha, z pustą bypass list, 0 wymaganymi approvals, obowiązkiem rozwiązania komentarzy
i scalaniem metodą `Squash and merge` po jawnej decyzji właściciela. Required status checks
włączymy dopiero po zbudowaniu stabilnego CI.

Szczegóły: [workflow](WORKFLOW.md), [polityka bezpieczeństwa](../SECURITY.md),
[ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Co już wiemy o istniejącej aplikacji

Właściciel wgrał do repozytorium `card_viewer_12_10_for_Github.html` — jeden plik,
9 257 linii, z wyciętymi sekretami. Aplikacja została uruchomiona i przeanalizowana.
Pełny opis: **[docs/AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)**.

Najważniejsze ustalenia:

1. **Wirtualny Stół jest logicznie niezależny** — 30% kodu w dwóch blokach, sześć zależności
   od reszty aplikacji, jedno wywołanie w drugą stronę. Rozplątywanie nie jest potrzebne.
2. **Arkusz kolekcji nie zawiera danych reguł** — brak kosztu many, typów i P/T. To dlatego
   obecny prompt każe modelowi wyszukiwać statystyki kart w internecie.
3. **Stan gry jest mutowany z 105 miejsc** w handlerach UI, bez walidacji i warstwy komend.
4. **Fog of War nie istnieje** — ręka przeciwnika jest renderowana w całości, celowo.
5. **Brak determinizmu** — tasowanie przez `sort(() => Math.random() - 0.5)`, brak seeda.
6. **Kilka reguł MtG jest już poprawnie zakodowanych** (zmiana strefy czyści znaczniki,
   summoning sickness, znikanie tokenów) — to gotowa lista wymagań dla engine.

## Decyzje podjęte po audycie

| Decyzja | ADR |
|---|---|
| Czysty JavaScript (ESM) — język, testy i struktura katalogów | [0008](decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona przez 0011) |
| Budujemy standalone Wirtualny Stół, nie adapter w starej aplikacji | [0009](decisions/0009-standalone-game-table-instead-of-extraction.md) |
| Dane reguł kart pobierane ze Scryfall przed kodowaniem, potem trzymane w repozytorium | [0010](decisions/0010-card-rules-data-in-repository.md) |
| Modularne źródła, jednoplikowy artefakt, dwa tryby uruchomienia | [0011](decisions/0011-modular-sources-single-file-artifact.md) |

Konsekwencja dla zakresu: repozytorium **nie utrzymuje** aplikacji kolekcjonerskiej,
mang, komiksów, teleturnieju ani rankingu modeli AI. Właściciel ma własną kopię z tymi funkcjami.

### Jak to będzie działać w praktyce

- **Właściciel nie instaluje ani nie buduje niczego.** Sklejaniem modułów w jeden plik
  zajmuje się CI przy każdej zmianie na `main`.
- **iPad:** wejście na adres GitHub Pages, ilustracje ze Scryfall.
- **Komputer:** pobrany plik HTML otwierany bezpośrednio, ilustracje z lokalnego `./img/`.
- **Reguły, talie i przebieg partii są w obu trybach identyczne** — różni je tylko warstwa obrazów.
- **Talie są plikami w repozytorium.** Świadomy koszt: nowej talii nie zbuduje się z iPada
  w trakcie grania.
- **Partie zapisują się jako seed i lista ruchów**, więc każdy błąd da się odtworzyć
  z małego pliku tekstowego.
- **Cała warstwa AI znika** — brak klucza API, brak listy modeli, brak wywołań LLM.

Ważne zastrzeżenie techniczne: Safari na iOS kasuje `localStorage` po siedmiu dniach bez
wejścia na stronę (polityka ITP Apple). Dlatego przeglądarka służy wyłącznie jako wygodny
cache, a trwałość zapewniają pliki w repozytorium i eksport zapisu partii.

## Ustalony kierunek

- Budujemy **core engine bez zakodowanych konkretnych kart**.
- Core zawiera pojęcia i procedury gry, a karty są osobnymi definicjami korzystającymi
  ze współdzielonych mechanik.
- Karty dodajemy pojedynczo lub małymi partiami wraz z testami i danymi reguł.
- Nie dążymy do obsługi wszystkich kart MtG.
- Pierwszym praktycznym celem jest rozgrywka z taliami zbudowanymi z około 20 obsługiwanych kart.
- Engine jest jedynym autorytetem stanu i legalności działań.
- Wirtualny Stół powstaje jako samodzielna aplikacja korzystająca z engine.
- Gra ma zapewniać widok gracza zgodny z Fog of War; kontroler nie dostaje ukrytych danych przeciwnika.
- Pierwszy przeciwnik jest algorytmiczny i deterministyczny. Agent LLM pozostaje opcjonalny.

Szczegóły i uzasadnienia: [rejestr decyzji](decisions/README.md).

## ~~⚠️ Wymaga działania właściciela~~ ✔ Wykonane

Właściciel wgrał workflow CI i publikacji oraz włączył GitHub Pages
(instrukcja: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md)).
Oba workflow (`ci.yml`, `pages.yml`) przechodzą na `main`, więc artefakt
jednoplikowy publikuje się automatycznie po każdym scaleniu — testowanie
z iPhone'a/iPada działa.

## Najbliższe zadanie

**M1–M3 są zamknięte (sandbox, zasoby, combat z pełnym kontraktem komend); M4 ma kompletną warstwę danych na katalogu syntetycznym.**

Stan techniczny:

- M1: odtwarzalny headless sandbox — zamknięty, z formalnym testem pełnej ścieżki replay;
- M2: land drop, mana, creature permanent, koszt, tap/untap i summoning sickness — zamknięte;
- M3: combat syntetyczny w kontrakcie `legalCommands` (test własnościowy: każda oferowana
  komenda jest akceptowana), centralne state-based actions po każdej komendzie, spójny automat
  kroków — zamknięte; znane uproszczenia udokumentowane w `docs/ENGINE_MILESTONES.md`;
- M4: registry, statusy wsparcia, parser/writer tekstu talii, walidacja kopii, filtry
  i podsumowania — gotowe; **syntetyczny katalog testowy** (`src/cards/card-data.js`)
  z materializacją do obiektów gry i taliami wersjonowanymi w `decks/`;
- artefakt jednoplikowy zawiera już silnik: self-test w HTML uruchamia komendy przez
  `PlayerView`, a moduły źródeł są strzeżone przed cyklami importów i kolizjami nazw;
- pełna partia syntetyczna (talia z pliku → definicja → obiekt gry → symulacja → replay)
  kończy się rozstrzygnięciem w engine;
- UI kreatora talii — celowo jeszcze niezaimplementowane (ADR 0012).

Następny krok bez decyzji właściciela: wzmocnienie botów i pokrycie reguł na katalogu
syntetycznym (np. timing instant/sorcery, gdy pojawi się pierwsza potrzebująca karta).
Wejście w realne karty, kreator talii UI i UI stołu wymaga listy kart właściciela
oraz danych `Set`/`Plan`.

Milestone’y i kryteria są zapisane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

Historyczna kolejność pierwszych kroków (zrealizowana w bieżącym PR):

1. Szkielet `src/engine/`, `src/protocol/` i `test/` zgodny z ADR 0011.
2. CI uruchamiający `node --test` przy każdym PR.
3. `build.mjs` + publikacja na GitHub Pages — żeby każdy kolejny przyrost był od razu
   sprawdzalny na iPadzie, a nie dopiero na końcu projektu.
4. Tożsamość obiektów i strefy z kontrolowaną zmianą strefy.
5. Seedowane RNG i poprawne tasowanie.
6. `GameState` → `PlayerView` z testem braku wycieku ukrytych informacji.

## Otwarte pytania

Audyt zamknął większość pytań z poprzedniej wersji tego dokumentu (zob. §9 audytu).
Pozostają:

1. **Które karty wchodzą do pierwszego zestawu?** Właściciel poda listę ze swojego katalogu.
   To blokuje realne karty w Etapie 2 i 3 — engine rozwijamy tymczasem na kartach syntetycznych.
2. **Jaki rozmiar talii dla pierwszych rozgrywek?** Pełne 60 kart czy mniejszy format testowy.
3. **Jaki docelowy poziom ochrony FoW?** W aplikacji czysto klienckiej realnie osiągalne jest
   „uczciwe UI + kontroler bez dostępu do ukrytych danych". Pełna poufność wymaga backendu.
   Decyzja potrzebna dopiero przy Etapie 6.
4. **Czy stół ma zachować tryb swobodny (sandbox)** jako narzędzie diagnostyczne obok
   trybu sterowanego regułami?
5. **Kreator talii:** rozstrzygnięte w ADR 0012 — powstanie po pierwszych kartach; bez `localStorage`,
   z filtrami `Plan`/`Set`/nazwa, walidacją talii i wspólnym tekstowym formatem eksportu oraz plików repozytorium.
6. **Czy podnieść [ADR 0005](decisions/0005-deterministic-replayable-execution.md)
   ze statusu „Proponowana" na „Zaakceptowana"?** ADR 0011 opiera na nim zapis partii
   (seed + lista ruchów), więc determinizm przestaje być postulatem, a staje się wymogiem
   działania funkcji zapisu. Zmiana statusu należy do właściciela.

## Aktualny bloker

Brak listy pierwszych kart. Nie blokuje Etapu 1 — blokuje zamknięcie Etapu 2 i 3.

## Kryterium ukończenia aktualnej fazy

Etap 1 kończy się, kiedy:

- istnieje uruchamialny headless engine bez zależności od DOM-u i sieci;
- `node --test` przechodzi lokalnie i w CI;
- kontrakty `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest` są zaimplementowane
  i opisane w JSDoc;
- test potwierdza brak wycieku ukrytych informacji do `PlayerView`;
- ten sam seed i ta sama sekwencja komend dają identyczny przebieg symulacji;
- dwa `RandomBot`-y przechodzą przez minimalną symulację tur.

## Zasada aktualizacji

Każdy PR zmieniający kierunek projektu powinien odpowiednio aktualizować:

- ten plik — jeśli zmienia się bieżący stan lub następny krok;
- `docs/ROADMAP.md` — jeśli zmienia się kolejność etapów;
- ADR — jeśli zapada lub zmienia się decyzja architektoniczna;
- dokumentację karty/mechaniki — jeśli zmienia się zakres jej obsługi.
