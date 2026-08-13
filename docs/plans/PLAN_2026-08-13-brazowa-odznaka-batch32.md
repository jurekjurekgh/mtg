# Plan: brązowa odznaka — 5 błędów vs CR (po Batchu 32)

Sesja `arena/019ffb43-mtg` (PR #47). Wyzwanie: znaleźć i naprawić 5
naruszeń Comprehensive Rules w istniejących kartach/mechanikach.

## Znalezione błędy

### BUG 1 — szukanie ignoruje `minManaValue` / `kind` (CR 701.19 / Fierce Empath)
`queueSearchChoice` filtruje `minManaValue` i `kind`, ale oferta i walidacja
w `game-state.js` (`resolve_search_choice` + enumeracja) sprawdzają tylko
`types`/`subtypes`. Fierce Empath („creature card with mana value 6 or greater")
pozwala wybrać dowolnego stwora z biblioteki (np. Highland Game MV 2).

### BUG 2 — Flashback nie wygania karty przy zejściu ze stosu (CR 702.34b)
„If the flashback cost was paid, exile this card instead of putting it anywhere
else any time it would leave the stack." Kontrczar (`counter_spell`) zawsze
kładzie czar do grobu — flashbackowany Dream Twist wraca do grobu i można
go rzucać w kółko.

### BUG 3 — Soulbright Flamekin: 3. resolve jest obowiązkowe (CR 608.2d / „you may")
Oracle: „If this is the third time this ability has resolved this turn, you
**may** add {R}×8." Engine zawsze dodaje 8 many.

### BUG 4 — „can't block this way" bez zadanych obrażeń (CR 609.3 / Ballista Wielder)
„A creature **dealt damage this way** can't block this turn." Przy prewencji
(dealt = 0) `cant_block` i tak się aplikuje.

### BUG 5 — tarcza ustawia `damagedThisTurn` (CR 122.1b)
Replacement: „would be dealt damage … instead remove a shield counter."
Obrażenia NIE są zadane. Engine przy tarczach ustawia `damagedThisTurn`,
więc Fathom Fleet Cutthroat może niszczyć stwora, który tylko zużył tarczę.

## Kolejność
1. Plan.
2. Testy RED + fixy (wspólny matcher szukania, moveObjectDirectly flashback,
   optional 3. resolve, cant_block ifDealtDamage, shield bez damagedThisTurn).
3. `npm test` (bez bot-benchmark) + build.
4. Docs PROJECT_STATE.

## Weryfikacja
- Nowe testy w `test/bug-hunt-2026-08-13-bronze2.test.js`.
- Aktualizacja Soulbright w batch32 (wybór „tak").
