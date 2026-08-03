# ADR 0014: Definicje kart w pojedynczym module `src/cards/card-data.js`

- **Status:** Zaakceptowana
- **Data:** 2026-08-03
- **Decydenci:** właściciel projektu

## Kontekst

ADR 0010 §1 przewidywał, że **jedna karta = jeden plik** w katalogu
`src/cards/definitions/` — z danymi reguł, zachowaniem zbudowanym z mechanik
i deklaracją zakresu wsparcia. Ta część decyzji **nie została wprowadzona w życie**:
od pierwszego batcha realnych kart (M8, 2026-08-01) definicje trafiają do
pojedynczego modułu `src/cards/card-data.js`, a `src/cards/definitions/` nigdy nie
powstał.

Rozjazd został odnotowany w `docs/PROJECT_STATE.md` („Odstępstwo od ADR 0010 §1")
z adnotacją: *„Aktualizacja ADR lub wydzielenie katalogu definicji do rozważenia
przy większych partiach kart."*

Po Batche 1–11 (44 wspierane karty realne + strony transform i tokeny w jednym
module) pojedynczy moduł sprawdził się w praktyce. Kierunek się nie zmienił —
repozytorium ewoluowało do single-module i to jest obowiązująca rzeczywistość.
Zgodnie z zasadą „nie zmieniamy znaczenia historycznej decyzji; nowy ADR zastępuje
poprzedni" (§ Rejestru ADR) decyzję o układzie definicji formalizujemy w osobnym ADR.

## Decyzja

Definicje kart są przechowywane jako **dane** w pojedynczym module
`src/cards/card-data.js`, w jawnych, nazwanych sekcjach:

- `SYNTHETIC_CARDS` — karty testowe, niedostępne w grze (ADR 0010 §7);
- `REAL_CARDS` — karty z katalogu właściciela, każda jako wywołanie
  `defineCard({ ... })` (dane reguł + zachowanie + `support`);
- `VIRTUAL_BASIC_LANDS` — wirtualne landy podstawowe (ADR 0010 §7/rozstrzygnięcie
  P7, 2026-08-01);
- obok nich stałe pomocnicze, np. `UNDERCITY_DUNGEON`.

Moduł eksportuje `createCardRegistry()` budujący rejestr ze wszystkich trzech
sekcji (`src/cards/card-data.js`). Pozostałe reguły ADR 0010 pozostają bez zmian:
dane wpisywane dosłownie wg Oracle text (§2), obowiązkowy pobór ze Scryfall przed
kodowaniem (§2a), offline i determinizm (§3), brak statusu `supported` bez danych
i testów (§4), nazwa/tekst jako dane, nie warunki w kodzie (§5), powiązanie
z kolekcją przez `artId` (§6).

Niniejszy ADR **zastępuje §1 ADR 0010** w zakresie układu definicji
(„jedna karta = jeden plik"). Pozostałe § ADR 0010 pozostają w mocy.

## Konsekwencje

### Pozytywne

- Jeden moduł to jedno miejsce do przeglądu definicji kart — spójnie z resztą
  katalogu kart (`registry.js`, `materialize.js`, `deck-*.js`).
- Brak kosztu utrzymania 44+ osobnych plików i rejestru powielającego importy;
  `createRegistry` buduje rejestr wprost z list.
- Formalizuje rzeczywistość, którą właściciel wielokrotnie akceptował (Batche 1–11
  scalane na tej podstawie) — usuwa rozjazd między ADR a kodem.
- Sekcje `SYNTHETIC_CARDS` / `REAL_CARDS` / `VIRTUAL_BASIC_LANDS` utrzymują jawny
  rozdział katalogu testowego od gier.

### Koszty i ryzyka

- **Pojedynczy plik rośnie liniowo z katalogiem** (po 11 batchach ~1100 linii).
  Łagodzenie: definicje są zgrupowane komentarzami wg batchy; jeżeli plik stanie
  się nieczytelny, można wydzielić podmoduły per-batch (np. `src/cards/real-batch12.js`)
  — to ewolucja, nie zmiana decyzji, bo rejestr i tak jest składany z list.
- **Ryzyko konfliktów przy równoległych zmianach** w jednym pliku. Łagodzenie:
  praca sesyjna (1 PR naraz) i małe, odwracalne przyrosty wg `AGENTS.md`.
- Trzeba pamiętać o **dwóch miejscach** przy dodawaniu karty: sekcja definicji
  oraz (jeśli nowa) sekcja zależnych stałych (np. tokeny/loch). Procedura jest
  udokumentowana w `docs/cards/HOW_TO_ADD_CARD.md`.

## Rozważone alternatywy

- **Wrócić do „jedna karta = jeden plik"** (oryginalny §1) — odrzucone: po 44
  kartach to 44+ plików i nadmiarowy rejestr; nie przynosi zysku, bo katalog i tak
  jest sekcjowany, a engine pozostaje niezależny od nazw kart (ADR 0002).
- **Wydzielić podmoduły per-batch teraz** — odroczone: pojedynczy moduł jest
  nadal czytelny; podział zostaje opcją na przyszłość (patrz „Koszty i ryzyka").
- **Rozszerzyć arkusz właściciela o reguły** — odrzucone w ADR 0010 i tu bez zmian.

## Powiązania

- [ADR 0010 — dane reguł kart w repozytorium](0010-card-rules-data-in-repository.md)
  (niniejszy ADR zastępuje jego §1)
- [ADR 0002 — engine niezależny od konkretnych kart](0002-authoritative-card-agnostic-engine.md)
- [ADR 0011 — modularne źródła, jednoplikowy artefakt](0011-modular-sources-single-file-artifact.md)
- [docs/cards/HOW_TO_ADD_CARD.md](../cards/HOW_TO_ADD_CARD.md)
