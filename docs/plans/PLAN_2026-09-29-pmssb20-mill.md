# PLAN 2026-09-29 — PMSSB-20: mill (RE-AUDYT z nowym dowodem) — presja deck-outu + combo z reanimacją

**Cel rodziny**: `mill_cards` / `mill_from_bottom` — 13 kart (tome-scour,
dream-twist, sweet-oblivion, armored-skaab, returned-centaur,
merfolk-mesmerist, chronic-flooding, cellar-door, selhoff-occultist…).
Rodzina POKRYTA (9 gałęzi) — RE-AUDYT w stylu PMSSB-15 z nowym dowodem:
(1) zagrożenie deck-out z briefu PMSSB po stronie OFENSYWNEJ (wyścig
bibliotek), (2) self-mill pod reanimację jako najlepszy moment.

## Audyt przyczynowo-skutkowy

### R1 — 4 skale tego samego efektu (L41)
cast_spell: self −80 / both −50 / foe +20+3n / untargeted self −25+synergia;
aktywacja (M96): self −25 / foe +6+2n (mesmerist-2: 10 vs 26!); guard 8356
(−60/−60); plot flat +2. Unifikacja `foeMillValue` + `selfMillValue`
(L41 — jak `proliferateTargetValue`).

### R2 — foe-mill ślepy na ICH bibliotekę (wyścig deck-out)
Widok niesie obie biblioteki jako `hidden` ale ZLICZALNE (CR 402.2 —
kolejność biblioteki zakryta, liczebność jawna). S03: mill 5 przy ich 5
kartach = **dobijają do 0 — przegrywają przy najbliższym dobraniu
(CR 121.4/704.5b)** — warte tyle samo co mill w pełną bibliotekę (85)!
Drabina presji: `20+3n` + `millFoePressureWeight(4)·max(0, 12−po)`;
`po ≤ 0` → `millFoeDeckOutWinValue(400)` (wygrana opóźniona o ich krok
dobrania).

### R3 — self-mill pod reanimację niewidoczny
Targeted self = FLAT −80 (bez ucieczki), untargeted ma synergia grobu
(+6) — patchwork. Unifikacja `selfMillValue`: drabina deck-outu (−120/
−20/−10 — historyczna) + synergia grobu (+6/−25 — historyczna, M200/R:
biblioteka zakryta = MOŻLIWOŚĆ) + **`millReanimateBonus(15)` za kartę
reanimacji w ręce (cap 2)** — S05 (reanimate w ręce) musi wyraźnie
przewyższać S04 (bez) — to JEST najlepszy moment zdolności.

### R4 — guardy kierunku (historyczne, anty-over-fix)
Targeted self bez synergii = −80 dokładnie jak dawniej
(`millSelfTargetGuard(55)` na −25 z drabiny); wybór celu wroga > self
bez combo zostaje. Guard 8356 (nie tapuj jedynego blokera; nie miel
wroga przy dłuższej własnej bibliotece) — nietknięty.

## Model (5 pokręteł)
`foeMillValue(view, n)` = `20 + 3n` + presja (`4·max(0, 12−po)`) /
win `400` przy `po ≤ 0`. `selfMillValue(view, n, {targeted})` =
(drabina deck-outu) + (synergia grobu +6/−25) + `15·min(reanimaty, 2)`
− (`targeted ? 55 : 0`).

## Kotwice (POMIAR PRZED → PO)
| | PRZED | PO |
|---|---|---|
| S01 tome-scour→foe, ich bibl. 30 | 85 | 85 (baza bez zmian) |
| S02 →foe, ich bibl. 6 (po=1) | 85 | 85+44 = 129 |
| S03 →foe, ich bibl. 5 (po=0) | 85 | 485 (wygrana!) |
| S04 →self, bez synergii/reanim. | −65 | −65 (guard historyczny) |
| S05 →self + reanimate w ręce | −65 | −50 (delta 15) |
| S06 →self, moja bibl. 6 (po=1) | −65 | −85 (deck-out −20) |

Pomiar: `/tmp/pmssb20-mill-przed.mjs` (tome-scour; warianty p1/p2).
Skala aktywacji (M96 6+2n → 20+3n) — bez pinów score w audit-m96.

## Poprawki w pętli (bramy)
1. `foeLib ≤ 0` → baza płaska (nie ma CZEGO mielić — win/pressja nie
   odpalają na pustej bibliotece z artefaktu setupu; test D Escape).
2. Guard „jedyny bloker" (M202/J) — `−60 + foeMillValue` (anulacja premii):
   fine musi PREBIĆ premię mill nawet z presją deck-outu (klasa L3;
   właściciel: utrata jedynego blokera > nawet mill-domknięcie).

## Brany
fast 7020/7020 · all 7291/7291 (golden bez dryfu!) · build 70/4578.4 kB ·
tie 28.3%/10.7% · mirror 48-48×3 · Tester 3×0.
