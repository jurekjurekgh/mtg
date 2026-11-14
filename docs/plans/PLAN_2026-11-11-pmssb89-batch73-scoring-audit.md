# Plan PMSSB-89 — Batch 73 per-card bot-scoring audit (2026-11-11)

## Trigger / acceptance

Batch 73 dodaje 11 kart realnych (kolekcja 645–655) z nowymi deskryptorami i mechanikami, których bot jeszcze nie wycenia: `must_block_enchanted` (ward na aurze Seton's Desire), `equipped: true` / crew (Spring-Loaded Sawblades ↔ Bladewheel Chariot DFC), Craft + Transform (DFC), Explore (River Herald Guide), warunek `minGraveyardCards` (Necrosavant reanimacja z cmentarza). Owner wymaga bezpośredniej oceny scoringu bota dla każdej nowej ścieżki decyzyjnej przed zamknięciem batcha (ADR 0018: pełne B0 tylko na komendę, ale PMSSB jest obowiązkowe dla każdej nowej mechaniki — Krok 7 HOW_TO_ADD_CARD).

## Card inventory

| Card | Score-relevant mechanics / decisions |
|---|---|
| Plummet (M20) | Destroy target creature with flying — removal target ranking |
| Get the Point (RNA) | Deal 2 damage to any target — damage target valuation |
| Messenger's Speed (THS) | Aura: enchanted creature gets +1/+1 and haste — aura pump + grant haste |
| Might Beyond Reason (SOI) | Target creature gets +X/+X where X = greatest power among creatures you control — board-dependent pump |
| River Herald Guide (LCI) | Explore — reveal top card, land to hand or +1/+1 counter; explore decision |
| Seton's Desire (DMR) | Aura: enchanted creature gets +2/+2 and has ward {2} — `must_block_enchanted`, ward cost |
| Spring-Loaded Sawblades / Bladewheel Chariot (LCI) | DFC Craft+Transform — front: artifact creature; back: Vehicle crew — `equipped`, `must_block_enchanted` on back face |
| Leonin Lightbringer (ONE) | {W}, {T}: tap target creature — tap ability, restricted target |
| Necrosavant (DMR) | {3}{B}{B}: return target creature card from graveyard to battlefield — `minGraveyardCards`, reanimate target ranking |
| Kessig Flamebreather (VOW) | {1}{R}, {T}: deal 2 damage to any target — tap ability, damage target valuation |

## Prior evidence to verify, not assume

- PMSSB-34 / PMSSB-39: ability mana cost and temporary pump payoff; applies to Leonin Lightbringer ({W},{T} tap) and Kessig Flamebreather ({1}{R},{T} tap).
- PMSSB-1 / PMSSB-64: removal/destroy target valuation; applies to Plummet (flying restriction) and Get the Point (any target).
- PMSSB-23: add_counter value; applies to Messenger's Speed (+1/+1) and Seton's Desire (+2/+2).
- PMSSB-58 / PMSSB-59: graveyard count and delirium-adjacent mechanics; applies to Necrosavant's `minGraveyardCards` gate.
- PMSSB-77: token/creature pressure weight; applies to Might Beyond Reason's board-dependent X.
- PMSSB-32: mana units and tapBodyCost; applies to all tap abilities (Lightbringer, Flamebreather).

## Measurement-before findings (2026-11-11)

Fresh ad-hoc deterministic score probe found these uncovered scoring paths:

1. **Seton's Desire — ward {2} + must_block_enchanted**: bot does not account for ward cost when evaluating the aura, nor for the blocking restriction on the enchanted creature. Aura cast value may be overstated.
2. **Spring-Loaded Sawblades — Craft + Transform DFC**: bot does not recognize craft cost or transform front→back decision. Bladewheel Chariot's `crew` and `must_block_enchanted` (enchanted creature cannot block enchanted vehicle) are unscored.
3. **River Herald Guide — Explore**: explore decision (land to hand vs +1/+1 counter) has no score model. Bot may always pick one branch.
4. **Necrosavant — minGraveyardCards**: reanimation from graveyard has no graveyard-count gate in scoring. Bot may reanimate with 0 cards in graveyard (illegal) or undervalue with many.
5. **Might Beyond Reason — board-dependent X**: +X/+X where X = greatest power among creatures you control; no board-state pump valuation exists.
6. **Leonin Lightbringer / Kessig Flamebreather — tap ability**: {W},{T} and {1}{R},{T} tap abilities — `tapBodyCost` and restricted target scoring may not apply correctly.

## Procedure / gates

1. Keep this plan as the auditable gap baseline.
2. Add deterministic before/after sonda cases for all 11 cards, including ward cost, craft/transform, explore branch, graveyard gate, board-dependent pump, and tap ability restrictions.
3. Add decision pins for each previously uncovered batch-specific path.
4. Make only generic fixes justified by score measurements. Demonstrate RED with temporary code mutations and restore source.
5. Run targeted PMSSB tests, then `npm test` + `npm run build`. No full B0 benchmark.
6. Update `docs/PMSSB.md` registry (PMSSB-89 row), add crosswalk for all 11 cards. Keep PR open and unmerged.

## Final outcome

Pending execution.