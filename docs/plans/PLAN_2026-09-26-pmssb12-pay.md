# PLAN PMSSB-12: pay-trigger-net (2026-09-26)

Wybór celu (krok-0): forward PMSSB-9 (pay-trigger-net!) — triggery
z płatnością (payMana!) SKIPowane w PMSSB-9/F-T1 (spellbomb-SKIP!).
5 nosicieli: spellbomby ×2, descendant, spire, forebear.

## 0. Teza i klastry (krok-0)

MODEL: pay-net = max(0, benefit×likelihood − payMana×manaW − color-gate!)!
OPT-IN (may-pay!): bot płaci iff worth (lustro resolve_optional_pay!).
benefit z tabeli-ETB × likelihood-eventu (dies-0.5!, attacks-0.5×gate!).
manaW = P.creatureManaCostWeight? (wartość-many!). color-gate:
payColors ⊆ pool (jak spellColorsInclude!).
Spire: land-pay-or-sac (NEGATYW: −payMana×manaW OR −land-value!).
Forebear: GRAVE-trigger (cast-0! SKIP — trigger żyje w grobie!).

Klastry: spellbomby (dies-pay-draw!), descendant (attacks-pay-endure!),
spire (land-negatyw!), forebear (grave-SKIP!).

OUT: pay-or-sacrifice (rodzina-osobna!), counter-pay (osobna!),
treść-na-rezolucji (konwencja-50!).

## 1. Hipotezy (krok-1)

- **H1 (spellbomb-net):** max(0, 0.5×draw6 − 1×manaW): panic/horizon
  +2-ish przy kolorze-w-poolu; BEZ koloru = 0 (gate!).
- **H2 (descendant-net):** max(0, 0.5×gate×endure − 2×manaW):
  endure-1 (counter/token ≈ +4-5?) − koszt ≈ mały-dodatni/0.
- **H3 (spire/forebear):** spire-pay-or-sac (land-negatyw!), forebear
  grave-SKIP (cast-0-correct!).

## 2. Macierz sond (krok-2, `tools/pmssb12-pay-sonda.mjs`)

P01 panic (pay-0?), P02 horizon (pay-0?), P03 descendant (pay-0?),
P04 spire (land-pay-0?), P05 forebear (grave-0?).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-P1 spellbomb/descendant-net + F-P2 spire +
  forebear-SKIP + piny + golden (ryzyko NISKIE: 5 nosicieli!).
- Ryzyka: (a) manaW-kalibracja (ile warta 1-mana?); (b) color-gate
  (pool-vs-lands?); (c) spire-land-branch (osobna-gałąź!).

## Aneks A — ślady krok-0

- Census payMana-triggerów (5 nosicieli) + treść-efektów.
- resolve_optional_pay_choice (silnik!) pokrywa rezolucję — GAP tylko
  anticipacja-cast (jak exploit!).

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

PRE (R/W-lands + foe): panic 65.70 (0!), horizon 65.70 (0!),
descendant 69.30 (0?), spire 82.00 (land!), forebear 70.20 (body!).
GAP = pay-net-anticipacja (H1/H2 GO, H3 do weryfikacji!).

## Aneks B — forwardy (WYPEŁNIĆ w closeout)

(none yet)
