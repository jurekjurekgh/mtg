# PLAN PMSSB-13: persist-unification + stance-validation (2026-09-26)

Wybór celu (krok-0): forward PMSSB-9 #2 (flat-5 vs model!) + #6
(stance-0.5!). Unvalued-sweep = 0 (pokrycie pełne!) — pętla
porządkująca (micro!), nie gapowa.

## 0. Teza i klastry (krok-0)

MODEL: persist-value = 0.5 × return-body (2/1-flyer-clique!) zamiast
flat-5 (body-scaled, future-proof!). Return-body = (P−1)×2+(T−1) +
fly-bonus. Clique: (2×2+1)+fly ≈ 5+3 = 8 × 0.5 = +4 (vs flat-5!).
Stance: measured-0.80-conditional (32/40!) → unconditional
P(attackers)×0.8 ≈ 0.65×0.8 = 0.52 ≈ 0.5-ASSUMPTION-VALIDATED!
Cultist-delirium: grave-ability-no-offer (gate-closed-correct!).

OUT: delirium-model (grave-empty-gate!), forebear-recast (recursive!).

## 1. Hipotezy (krok-1)

- **H1 (persist-model):** 0.5×return-body zastępuje flat-5: clique
  71.10 → ~70.1 (−1-ish, model!) — body-scaled (nie flat!).
- **H2 (stance):** 0.5-UNCONDITIONAL validated (0.8-conditional ×
  P-attackers) — BEZ ZMIANY kodu (dokumentacja!).

## 2. Macierz sond (krok-2, `tools/pmssb13-persist-sonda.mjs`)

R01 clique-bare (flat-5?), R02 clique+grave (reanimate!), R03 cultist
(cast+ability!), R04 forebear (grave-0?).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A: F-R1 persist-model + stance-doc + piny + golden (NISKIE!).
- Ryzyka: (a) fly-bonus-w-return-body (ile?); (b) golden-churn
  (clique w deckach? Lorwyn — nie w parach!).

## Aneks A — ślady krok-0

- Unvalued-sweep-0 + stance-telemetria (32/40 = 0.80!, avg-1.9).
- Flat-5 (:5708) + SKIP-return_with_counter (:1563).

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

PRE: clique-bare 71.10, clique+grave 76.50 (+5.4-reanimate!),
cultist 67.50, forebear 66.60, cultist-ability no-offer (delirium!).
H1/H2 GO!

## Aneks B — forwardy (closeout 2026-09-26)

- Survival-model (upkeep-likelihood!) + land-90-drivers + evasion-stance
  (precyzyjna-kalibracja!) — META-forwardy (telemetria z gier!).
- Stance-decomposition: 0.5-unconditional = P(attackers) × 0.8 —
  gdyby P(attackers) dało się mierzyć LIVE (board-tracking!), likelihood
  mógłby być DYNAMICZNY (nie flat-0.5!).
- Undying-brak (0 nosicieli w katalogu!) — gdyby doszedł, ten-sam-model
  (0.5 × return-body z +1/+1!).

## Aneks C — wyniki fal (closeout 2026-09-26)

Wave-A (`8ae75d3`, F-R1): persist = 0.5 × return-body: clique
71.10→70.20 (−0.9!), +grave 76.50→75.60. Cultist/forebear SAME.
Stance 0.80-conditional (32/40!) → 0.5-validated (doc!). PMSSB-9
clique-pin OVERRIDE. 2 piny, golden CZYSTY (0!), 6840/6840 GREEN.

Hipotezy: H1 GO, H2 GO (doc-only!). PMSSB-13 ZAMKNIĘTY (micro!).
