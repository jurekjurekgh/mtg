# ADR 0014: Definicje kart w pojedynczym module `src/cards/card-data.js`

- **Status:** Zaakceptowana
- **Data:** 2026-08-03
- **Decydenci:** właściciel projektu

## Kontekst

ADR 0010 §1 przewidywał **jedna karta = jeden plik** w `src/cards/definitions/`.
Ta część nie została wprowadzona w życie: od pierwszego batcha realnych kart (M8,
2026-08-01) definicje trafiają do jednego modułu `src/cards/card-data.js`, a
`src/cards/definitions/` nigdy nie powstał. Rozjazd odnotowano w
`docs/PROJECT_HISTORY.md` („Odstępstwo od ADR 0010 §1").

Po Batche 1–11 (44 wspierane karty realne + strony transform i tokeny w jednym
module) pojedynczy moduł sprawdził się w praktyce i kierunek się nie zmienił.
Zgodnie z zasadą „nie zmieniamy znaczenia historycznej decyzji; nowy ADR
zastępuje poprzedni" formalizujemy to w osobnym ADR.

## Decyzja

Definicje kart są **danymi** w pojedynczym module `src/cards/card-data.js`, w
nazwanych sekcjach:

- `SYNTHETIC_CARDS` — karty testowe, niedostępne w grze (ADR 0010 §7);
- `REAL_CARDS` — karty z katalogu właściciela, każda jako `defineCard({ ... })`
  (dane reguł + zachowanie + `support`);
- `VIRTUAL_BASIC_LANDS` — wirtualne landy podstawowe (ADR 0010 §7, P7);
- obok nich stałe pomocnicze, np. `UNDERCITY_DUNGEON`.

Moduł eksportuje `createCardRegistry()` budujący rejestr ze wszystkich trzech
sekcji. Pozostałe reguły ADR 0010 bez zmian: tekst dosłowny wg Oracle text (§2),
obowiązkowy pobór ze Scryfall przed kodowaniem (§2a), offline i determinizm (§3),
brak `supported` bez danych i testów (§4), nazwa/tekst jako dane (§5), powiązanie
z kolekcją przez `artId` (§6).

**Ten ADR zastępuje §1 ADR 0010** w zakresie układu definicji.

## Konsekwencje

### Pozytywne

- Jeden moduł = jedno miejsce przeglądu definicji, spójnie z resztą katalogu
  (`registry.js`, `materialize.js`, `deck-*.js`).
- Brak kosztu utrzymania 44+ plików i rejestru powielającego importy.
- Formalizuje rzeczywistość akceptowaną w Batchach 1–11 — usuwa rozjazd ADR/kod.
- Sekcje utrzymują jawny rozdział katalogu testowego od gier.

### Koszty i ryzyka

- **Plik rośnie liniowo z katalogiem** (po 11 batchach ~1100 linii). Łagodzenie:
  definicje grupowane komentarzami wg batchy; jeśli plik stanie się nieczytelny,
  można wydzielić podmoduły per-batch — ewolucja, nie zmiana decyzji.
- **Konflikty przy równoległych zmianach** w jednym pliku. Łagodzenie: praca
  sesyjna (1 PR naraz) i małe przyrosty wg `AGENTS.md`.
- Dodanie karty to **dwa miejsca**: sekcja definicji oraz (jeśli nowa) sekcja
  stałych zależnych (tokeny/loch) — procedura w
  `docs/cards/HOW_TO_ADD_CARD.md`.

## Rozważone alternatywy

- **Powrót do „jeden plik na kartę"** — odrzucone: 44+ plików i nadmiarowy
  rejestr bez zysku; katalog i tak jest sekcjowany, a engine pozostaje
  niezależny od nazw kart (ADR 0002).
- **Podmoduły per-batch teraz** — odroczone; moduł jest czytelny, podział
  zostaje opcją.
- **Rozszerzenie arkusza o reguły** — odrzucone w ADR 0010, tu bez zmian.

## Powiązania

- [ADR 0010](0010-card-rules-data-in-repository.md) (ten ADR zastępuje jego §1)
- [ADR 0002](0002-authoritative-card-agnostic-engine.md) · [ADR 0011](0011-modular-sources-single-file-artifact.md)
- [docs/cards/HOW_TO_ADD_CARD.md](../cards/HOW_TO_ADD_CARD.md)
