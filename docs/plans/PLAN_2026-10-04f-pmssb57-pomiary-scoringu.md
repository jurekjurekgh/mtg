# PLAN 2026-10-04f — PMSSB-57: pomiary scoringu (zapłaty, mulligan, przestrzeń wyboru)

Wejście: dyrektywa właściciela z 2026-10-04 („dodawaj mechaniki i pomiary, które
są niezbędne do poprawnego scoringu bota — nie pomijaj problemów, tylko je
rozwiązuj”) + kolejka 2 z handoffu 04e („rodziny zapłat z kolejki handoffu”).
Runda **pomiarowa**: żadnych zmian wag bez dowodu misplayu (ADR 0021/0026).

## Pytanie 1 — czy rodziny zapłat w ogóle występują w pomiarach?

Nowe narzędzie `tools/scoring-pay-census.mjs`: census decyzji czterech rodzin
zapłat (`resolve_ward_pay_choice`, `resolve_counter_pay_choice`,
`resolve_pay_or_sacrifice`, `resolve_optional_pay_choice`) w prawdziwych
partiach; tryby `--all` (wszystkie typy komend) i `--decks=all` (23 talie
repozytorium zamiast 6-talii BENCH_DECKS — rotująca próbka, ADR 0024).

**Wynik:** BENCH_DECKS (36 partii, seedy 2 i 6) — **0 decyzji zapłat**; żadna
z 9 kart z polem `payMana` nie leży w 6 taliach próbki. `--decks=all` (23
partie) — jedyna zmierzona rodzina `resolve_pay_or_sacrifice`: **2 decyzje,
pay=2, koszty {1:1, 3:1}** (za mała próba na zmianę `finish(cmd.pay ? 90 : 5)`).

## Pytanie 2 — czy polityka mulliganu trzyma kryteria jakości?

Nowe narzędzie `tools/scoring-mulligan-audit.mjs`: rozkład lądów keep/mulligan
+ trzy klasy naruszeń (keep bez polityki, mulligan mimo 2+ lądów, keep bez
grywalnego czaru). **Wynik (23 partie, 53 decyzje):** 0 lądów 0 keep/1 mulligan;
1: 0/6; 2: 21/0; 3: 12/0; 4: 12/0; 5: 1/0 — **0 naruszeń**.

## Pytanie 3 — czy decyzje ze stałym `finish(0)` bota mają NAPRAWDĘ jeden wariant?

Nowe narzędzie `tools/scoring-choice-space-audit.mjs`: histogram liczby legalnych
komend tego samego typu przy decyzji dla czterech typów z komentarzem „jedna
komenda / jeden wariant / regułowo równoważne”. **Wynik (69 partii, 23 talie):**
`resolve_damage_assignment` 39 decyzji — zawsze 1; `resolve_index_choice` 1/1;
pozostałe dwa typy nie wystąpiły w próbce. Komentarze POPRAWNE tam, gdzie
próba istnieje.

Tryb `--all-decisions` daje mapę wszystkich typów: `pass_priority` zawsze
1 wariant (19369), `declare_blockers` wybór 1..32, `resolve_mulligan_choice`
zawsze 2, `resolve_optional_trigger_choice` zawsze 1 — z DEFINICJI oferty
(odmowa przez `pass_priority`, game-state.js:7637).

## Domknięcie i koszty

- Wszystkie trzy pytania mają wynik **negatywny z liczbami** — problemów nie
  pominięto: każdy jest zmierzony i udokumentowany (L179).
- Narzędzia zostają jako trwałe (rodzina `scoring-*`), wpisane do strażnika
  L179; exit 1 tylko dla audytu przestrzeni wyboru przy realnym trafieniu.
- Koszt budżetu lektury: L179 zapłacone kondensacjami L54, L59 i L48
  (proza w `LESSONS_PRZYPADKI`); zapas po rundzie ≥ 250 t.
- Bramy: `npm test`, `npm run build`, brama PR `npm run test:all` na tipie kodu.
