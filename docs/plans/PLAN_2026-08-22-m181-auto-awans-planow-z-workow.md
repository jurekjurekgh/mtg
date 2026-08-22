# PLAN 2026-08-22 — M181: automatyczny awans planu z worka (ADR 0023 §2/§4)

Zlecenie właściciela: gdy plan w worku osiągnie 15 kart — automatycznie
wychodzi z worka jako nowa talia jednoplanowa, całość przeliczana
i aktualizowana; do tego strażnik.

## Stan przed

Generator (tools/generate-plan-decks.mjs) przy planie ≥15 kart spoza
SINGLE_PLAN_DECKS rzucał BŁĄD i wymagał RĘCZNEJ edycji obu map.

## Kroki

- [ ] 1. Plan — commit.
- [ ] 2. Generator: AUTO-AWANS — plan z ≥15 kartami dostaje własną talię
  automatycznie (slug z nazwy planu: małe litery, bez diakrytyków,
  spacje→myślniki), nawet jeśli mapa WOREK_DECKS wciąż go wymienia;
  SINGLE_PLAN_DECKS zostaje jako nadpisania nazw/plików istniejących talii
  (wiedzmin ← Wiedźmin + Świat Wiedźmina). Landy przeliczane jak dotąd.
  Worek, który po awansie spada poniżej 15 nielandów → CZYTELNY błąd
  (przetasowanie worków to świadoma decyzja w mapie, nie automat).
- [ ] 3. Strażniki: (a) test auto-awansu na syntetycznym rejestrze (plan
  workowy dobity do 15 → wychodzi z worka jako własna talia, worek bez
  jego kart); (b) test slugify (diakrytyki/spacje); (c) istniejący strażnik
  „pliki = generator” wymusza regenerację po każdym batchu (komunikat
  błędu wskazuje `node tools/generate-plan-decks.mjs`).
- [ ] 4. ADR 0023: §2/§4 + procedura batchów — awans automatyczny,
  jedyny krok ręczny to uruchomienie generatora; PROJECT_STATE; PR; CI.

## Wynik

(uzupełnić po wykonaniu)
