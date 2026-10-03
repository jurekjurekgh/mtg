# Plan sesji 2026-10-03f — PMSSB-45: brakujące deskryptory zdolności statycznych w PlayerView (następcy landwalka)

**Tryb:** ADR 0021 §4 (kontynuacja pętli jakości po PMSSB-43/44).
**Wejście:** pozycja 3 kolejki HANDOFF_2026-10-03 (pozycja 2 sprawdzona bez zmian w kodzie, PMSSB-44).

## Diagnoza (sonda)

PMSSB-41 runda 2 odkryła lukę klasy L1: publiczny fakt (landwalk) nie był
reprezentowany w PlayerView. Po skanowaniu `src/engine/abilities.js`
w poszukiwaniu statycznych deskryptorów, które są już zdefiniowane w silniku
ale NIE są wystawiane w PlayerView ani nie są czytane przez bota przy ocenie
ewazji/agresji/blokowania, znalazłem 4 karty wspierane:

- `skyhunter-skirmisher` (cantAttackUnlessDefenderHasFlying) — ograniczenie ATAKU, nie ewazja;
- `dauthi-voidwalker` (cantBeBlockedExceptByColors: ['B']) — ewazja koloru;
- `thunderstaff` (preventCombatDamageToController:1) — redukcja obrażeń (właśnie dodana w M255 w batchu 57, obsługiwana w walkach silnikowo; bot już ma preventCombatDamage w symulacjach?);
- `aerial-maurer` (cantBeBlockedByPower: 2) — nie może być blokowany przez stwory o mocy ≤ 2.

Krytyczny dla pompy/ewazji jest tylko `cantBeBlockedExceptByColors` i `cantBeBlockedByPower` — one determinują, czy atak uchodzi (podobnie jak flying/menace/landwalk). Bot w `hostEvadesBlockers` sprawdza flying/menace/landwalk, ale nie te dwa.

## Naprawa

1. PlayerView wystawia deskryptory statyczne dla każdego permanentu:
   - `cantBeBlockedExceptByColors?: color[]`
   - `cantBeBlockedByPower?: number`
   (pozostałe nie wymagają zmian w bocie na tę chwilę — bez kodu na zapas).
2. Bot `hostEvadesBlockers` rozpoznaje te dwa deskryptory (ta sama forma co silnik w `combat.js`/`blockRestrictionError`):
   - `cantBeBlockedExceptByColors` (np. Dauthi Voidwalker: tylko czarne stwory go blokują) → nieuchwytny, jeśli wszyscy blokujący nie mają ŻĄDNEGO z wymienionych kolorów;
   - `cantBeBlockedByPower: N` → nieuchwytny, jeśli każdy bloker ma moc ≤ N.
3. Piny:
   - B1: Dauthi Voidwalker wobec 3 białych/zielonych blokerów → evades = true;
   - B2: ten sam wobec jednego czarnego blokera → evades = false;
   - B3: Aerial Maurer (≤2) wobec blokerów 1/2 i 2/3 → evades = true;
   - B4: ten sam wobec blokera 3/3 → evades = false;
   - B5: widok niesie oba deskryptory (sprawdzenie PlayerView).
4. Mutacje m14/m15: usunięcie obsługi kolorów/mocy z hostEvadesBlockers czerwieni B1–B4.

## Etapy

- [x] Etap 0 — sonda (baseline): hostEvadesBlockers nie zna tych deskryptorów
- [x] Etap 1 — PlayerView wystawia cantBeBlockedExceptByColors + cantBeBlockedByPower (dla widzącego permanent, publiczny fakt ADR 0017)
- [x] Etap 2 — hostEvadesBlockers rozpoznaje oba deskryptory (reguła jak combat.js/blockRestrictionError, L41/L48)
- [x] Etap 3 — piny A1/A2 w test/pmssb45-desktopy-ewazji.test.js
- [x] Etap 4 — bramki: fast **7488/7488** (+2 piny), build **70 / 4797,5 kB**, event-contract-audit 0 naruszeń
- [x] Etap 5 — docs (PMSSB §44/§45, HISTORY wpis 2026-10-03f, handoff 03d)
