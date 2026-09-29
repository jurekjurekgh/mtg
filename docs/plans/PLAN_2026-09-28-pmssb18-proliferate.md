# PLAN 2026-09-28 — PMSSB-18: proliferate (rider czaru) + ujednolicenie per-cel

**Cel rodziny**: `proliferate` (CR 701.34a — „another counter of each kind
already there" — TYLKO istniejące typy liczników; dawniej 701.27a) jako
RIDER czaru — 3 karty: `courage-in-crisis` (+1/+1 counter → proliferate),
`spread-the-sickness` (destroy → proliferate), `fuel-for-the-cause`
(counter spell → proliferate). Wybór `resolve_proliferate` (podzbiory,
M341/F3 + M336) jest wyceniony — BRAKUJE wyceny ridera w cast_spell
(0 pkt — `type === 'proliferate'` nie ma gałęzi w pętli efektów).

## Audyt przyczynowo-skutkowy

### R1 — rider bez wyceny (L41)
Karta z proliferate nie zna wartości swojego drugiego efektu. Unifikacja:
`proliferateTargetValue(view, id)` (per-cel, TA SAMA skala co
`resolve_proliferate`) + `proliferateBestValue(view, opts)` = suma
dodatnich wartości per-cel = najlepszy legalny podzbiór (wybór „dowolnej
liczby" celów = exactly max over subsets).

### R2 — synergia kolejności (Courage in Crisis)
`add_counter` ROZSTRZYGA SIĘ PRZED `proliferate` — świeży licznik jest już
na planszy i ZOSTAJE proliferowany (2× +1/+1 z jednego czaru!). Model:
`opts.extraCounters` liczone z riderów add_counter TEGO SAMEGO czaru
(wzorzec `fightRiderBuffs`, L41). Analogicznie `spread-the-sickness`:
zniszczony cel WYPADA z kandydatów (`opts.exclude` — jego liczniki giną
razem z nim).

### R3 — poison nieliniowo (CR 104.3d: 10 = przegrana; 104.4b: obaj 10 = remis)
Tick trucizny na wrogu wart więcej im bliżej 10: `1 + poison` (flat 1
z M341 niedowartościowywało wyścigu); 9→10 = **wygrana** (skala 1000 jak
w resolve). Własna 9→10 = NEVER (cały podzbiór odrzucony — remis przy
obu 10 nie jest wygraną; konserwatywnie jak M341/F3).

### R4 — -1/-1 finishing (SBA 704.5a)
Tick -1/-1 na wrogu z efektywną wytrzymałością 1 = dobicie (śmierć przy
najbliższych SBA) → +4; inaczej +2. Na własnym −6/−2 (symetria).
+1/+1 = ±2 per-cel (płasko — wzrost +2/+2 niezależnie od ZASOBU liczników).

### R5 — jałowość (CR 701.34a)
Bez żadnych liczników/poison na planszy proliferate = 0. L119: inne typy
liczników (charge/oil/shield…) bez wagi — brak reguły, nie dopisujemy.

## Model (0 pokręteł — wspólne stałe jak PMSSB-14)
`proliferateBestValue(view, {extraCounters, exclude})`:
- gracze: wróg z poison>0: `1 + poison` (9→10: +1000); własna 9→10: pomijana
  w best (nigdy nie wybierana); pozostałe −1 tylko w scoringu podzbioru;
- permanenty: +1/+1 ±2; -1/-1 ±(tough−1≤0 ? 6 : 2) z kierunkiem; loyalty ±1;
- suma DODATNICH wartości = wartość ridera w cast_spell.

## Kotwice (POMIAR PRZED → PO)
| | PRZED (rider) | PO (rider) |
|---|---|---|
| S01 courage→mój 2/2, pusta plansza | 0 | +2 (synergia) |
| S02 courage→2/2 z 2×+1/+1 + wróg 4 poison | 0 | +2 (odświeżony licznik) +5 (poison 4→5) = +7 |
| S03 courage→2/2 + wróg 9 poison | 0 | +1000 (wygrana!) |
| S04 spread→ich 2/2, ich drugi 1/1 z -1/-1 | 0 | +4 (dobicie) |
| S05 spread→ich 2/2, pusta plansza | 0 | 0 (jałowy) |
| S06 fuel→ich czar, mój 2/2 z +1/+1 + wróg 4 poison | 0 | +2 +5 = +7 |

Pomiar: `/tmp/pmssb18-proliferate-przed.mjs`.
Istniejące testy (behawioralne/engine): M84/3 (counter_added total),
PR131/PR134 (typy komend), M336/M341 (komentarze wyboru) — bez pinów
scoringowych; zmiana wag per-cel wpływa też na `resolve_proliferate`
(te same liczby, L41) — testy wyboru doklejone do pliku PMSSB-18.
