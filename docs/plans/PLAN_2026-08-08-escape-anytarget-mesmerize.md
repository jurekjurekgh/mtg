# PLAN 2026-08-08 — Escape wybór 4 kart, any-target i Mesmerize jako wybór gracza

## Kontekst

Po wyczyszczeniu any-color i tap-creature (2056738) pozostały deterministyczne wybory:

- **Sweet Oblivion Escape** — koszt wygnania 4 innych kart z grobu deterministycznie pierwsze 4 (ADR 0005). W MtG gracz wybiera które 4 wygnać (CR 702.138). Dotyczy 1 karty, ale blokuje 100% mechaniki Escape.
- **Dragonbroods Relic → Reliquary Dragon ETB** — `cel any target deterministycznie — najpierw przeciwnik` (token 4/4 trigger `any_target`). W MtG wybór any target (gracz lub stwór/planeswalker) należy do kontrolera triggera (CR 603).
- **Shiva, Warden of Ice (tył Jill) — Saga rozdziały I/II Mesmerize** — `cel wybierany deterministycznie: własny najsilniejszy stwór`. Saga chapter `cant_block` powinien być wyborem kontrolera (resolve_trigger_target lub bezpośredni wybór przy rozdziale).

Wszystkie trzy mają ten sam wzorzec: deterministyczne `find*` zamiast `pending*` + `resolve_*`.

## Cel

- Escape: `legalEscapeCasts` enumeruje **wszystkie podzbiory** 4 kart z grobu (jak crew), `castEscape` waliduje wybrany podzbiór, UI grupuje jako ChoiceRequest, bot deterministycznie pierwszy (wstecznie zgodne).
- Dragon ETB any-target: przenieść z deterministycznego `findTriggerTarget` na `pendingTriggerTargets` (player choice) — jak T2 (Forge Devil itd.).
- Shiva Mesmerize: przenieść z deterministycznego wyboru celu rozdziału na `pendingTriggerTargets` (lub bezpośredni `resolve_room_target` jeśli Saga używa kolejek).

## Zakres (1 commit)

- `src/engine/spells.js`: `legalEscapeCasts` → enumeracja podzbiorów `escapeExileIds` (kombinacje `others` choose `exileCount`, cap 32 jak crew), `castEscape` już waliduje dowolny podzbiór.
- `src/cards/card-data.js`: usunąć `limitations` deterministyczne dla `sweet-oblivion`, `dragonbroods-relic` (any target), `shiva-warden-of-ice` (Mesmerize) — po fixie `[]` lub zostaje tylko `tylna strona — nie do talii`.
- `src/engine/triggers.js` / `src/engine/effects.js` / `src/engine/sagas` — weryfikacja czy Dragon i Shiva już używają `requiresTarget` — jeśli nie, dodać `requiresTarget: { type: 'any_target' }` i `allowNone` gdzie „up to one” (Mesmerize to „target creature” — wymagany, nie up to).
- `src/table/render.js`: `commandLabel` dla `cast_escape` pokaże wygnane karty (`escapeExileIds` → nazwy), grupowanie `cast_escape` w `choiceRequestGroupKey` (jak `cast_permanent` phyrexian).
- Boty: `heuristic-bot`/`aggro-bot` wybierają pierwszą ofertę (deterministyczne wstecznie zgodne).

Weryfikacja: `npm test` 1025, `npm run build` 49 modułów, headless test: Sweet Oblivion Escape oferuje >1 wariant wygnania gdy grób ma 5+ kart; Dragon ETB po wejściu kolejkuje `resolve_trigger_target` z listą legalnych celów any target.

## Ryzyka

- Enumeracja podzbiorów Escape: grób 10 kart choose 4 = 210 > cap 32 — cap jak przy crew (32) jest akceptowalny; wszystkie warianty i tak są legalne, bot bierze pierwszy.
- Mesmerize to nie trigger tylko efekt Sagi — może wymagać innej kolejki niż `pendingTriggerTargets` (np. `pendingSagaTarget`). Weryfikacja przy implementacji — jeśli Saga używa `applyEffect` bez kolejki, dodać kolejkę lub przenieść na trigger.

## Poza zakresem

- Batch 22, README, pozostałe „jedna karta bez zdolności” — nie luki
