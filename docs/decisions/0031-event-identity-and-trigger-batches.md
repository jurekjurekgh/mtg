# ADR 0031: Tożsamość zdarzenia i partia wyzwalaczy

- **Status:** Zaakceptowana
- **Data:** 2026-11-04

## Kontekst

A110/A112/A113: grupowanie na komendę nie wystarcza.

## Decyzja

Grupa zdarzeń ma deterministyczny identyfikator; osobne aktywacje — różne. Partia przed priorytetem: APNAP + wybór; replay/fingerprint. Płatność: zdarzenia od razu, stos/cele po zamknięciu; mana dozwolona. Refleks 603.12 w pierwszej partii; Ward czeka. Nie pełny checkpoint — ADR 0032.

## Konsekwencje

Migracja bez dubli; ryzyko UI/bot/replay.
