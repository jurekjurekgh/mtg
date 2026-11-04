# ADR 0031: Tożsamość zdarzenia i partia wyzwalaczy

- **Status:** Zaakceptowana
- **Data:** 2026-11-04
- **Decydenci:** właściciel, agent audytowy

## Kontekst

Grupowanie „na komendę” i osobne kolejki nie wystarczą (A110/A112/A113). Inwentarz: `../audits/INWENTARZ_ZDARZEN_I_TRIGGEROW_2026-11-04.md`.

## Decyzja

1. Jednoczesna grupa zdarzeń ma deterministyczny identyfikator; osobne aktywacje — różne.
2. Wyzwalacze grupy tworzą jedną partię przed priorytetem: aktywny→nieaktywny, wewnątrz gracza wybór.
3. Identyfikatory i wybory w replay/fingerprint; migracja etapami, bez podwójnych wpisów.

Płatność: zdarzenia/znaczniki od razu, stos/cele po zamknięciu; mana dozwolona przy żądaniu zapłaty. Refleks CR 603.12 jest w pierwszej partii. Ward z celu czeka na koniec partii; `pendingWardAnnouncements` w fingerprint. Dowody: `../plans/PLAN_2026-11-03-bezpieczne-kroki-zdarzen.md`. Nie pełny checkpoint ani zamknięcie #178.

## Konsekwencje

Grupowanie niezależne od komendy, kolejność jawna. Koszty: stan, komendy, UI/bot, replay; ryzyko dubli i regresji.

## Rozważone alternatywy

Lokalne łatki i pełna wymiana silnika odrzucone; wspólna partia z identyfikatorem przyjęta etapami.

## Powiązania

ADR 0002/0005/0016/0020/0030; A84–A113.
