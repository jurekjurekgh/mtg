# PLAN 2026-11-05 — zgłoszenie F: żadnego ucinania enumeracji wariantów

## Polecenie właściciela

> „enumeracja silnika (limit 32 wariantów) ucina najpierw warianty
> jedno- i dwucelowe. Nie zgadzam się na żadne ucinanie. W żadnej gałęzi
> ani żadnym efekcie. Jeśli takie coś występuje, to trzeba to usunąć.”

## Inwentarz limitów w enumeracji legalnych opcji (pomiar 2026-11-05)

Usuwamy wszystkie limity, które odcinają legalne warianty komend:

1. `COMBAT_OPTION_CAP = 32` (src/engine/combat.js) — `legalAttackerOptions`
   i `legalBlockerOptions` przycinają listy deklaracji ataku/bloku
   (`slice(0, cap)`); spożycie w game-state (oferty `declare_attackers`,
   `declare_blockers`, bramka końca walki).
2. `MULTI_TRIGGER_TARGET_CAP = 32` (game-state) — podzbiory celów triggera
   wielocelowego (m.in. Inferno Titan ze zgłoszenia E).
3. `MULLIGAN_BOTTOM_OPTION_CAP = 35` (game-state) — podzbiory kart
   odkładanych na spód po mulliganie (wiąże przy ręce > 7 kart).
4. `UNTAP_CHOICE_CAP = 32` (game-state) — podzbiory „zostaw w tapie”
   przy wyborze odkręceń.
5. `DELVE_OPTION_CAP = 32` (game-state + spells) — podzbiory kart
   wyganianych do delve.
6. `DIVIDED_POOL_CAP = 8` (spells) — pula kandydatów czaru z podziałem
   obrażeń (Fiery Justice) przycinana rankingiem do 8.
7. Limit ofert Fireballa (spells): łączny limit wariantów i przycinanie
   wartości X (`limit 15`) — enumeracja ma pokrywać każdy legalny
   podzbiór celów i każde X w budżecie.
8. `xCap ?? 15` (game-state) — wartości X czarów z `{X}` powyżej 15
   nieodstępne ofertą mimo many.
9. `combos.slice(0, 12)` (abilities) — kombinacje artefaktów do tapnięcia
   za `{T} X artefaktów` (koszt tap-X) obcinane do 12.

Poza zakresem (jawnie): `MAX_TRIGGER_EVENTS_SCANNED = 512` w triggers.js
to hamulec bezpieczeństwa skanowania łańcucha zdarzeń (stabilność
silnika, nie enumeracja opcji gracza) — zostaje; gdyby właściciel chciał
usunąć także go, to osobna decyzja. Limity w botach (`LOOKAHEAD_TOP_K`
itp.) to heurystyka wyboru bota, nie enumeracja legalnych opcji silnika;
zostają i są wymienione tutaj dla pełnego obrazu.

## Zasady wdrożenia

- Usuwamy limit, nie porządek: kolejność generowania wariantów zostaje
  bitowo ta sama (pierwsze oferty bez zmian — determinizm M203/2),
  enumeracja po prostu nie przerywa po N.
- Stałe eksportowane, których używają testy/UI (np. `COMBAT_OPTION_CAP`
  jako parametr domyślny), usuwamy wraz ze spożyciem; testy pinujące
  limit aktualizujemy świadomie.
- Pomiar wydajności przed/po: czas `npm test` i `test:all` oraz
  golden-master scoringu (dryf tylko świadomy, z notą; bot dostaje
  więcej legalnych wariantów, więc trajektorie mogą się zmienić).

## Dowód

- Testy kompletności enumeracji: scena z 8 kandydatami triggera
  wielocelowego daje wszystkie podzbiory 0..3 (93 warianty z pustym);
  pula podziału bez przycięcia przy >8 kandydatach; deklaracje walki
  przy >5 atakujących bez sufitu 32; mulligan/delve/untap bez sufitu.
- Istniejące testy silnika i UI, mutacja nie dotyczy (usunięcie kodu —
  dowodem są liczby wariantów), `npm test`, build, `test:all`,
  golden-master tylko świadomie. Bez scalania PR.
