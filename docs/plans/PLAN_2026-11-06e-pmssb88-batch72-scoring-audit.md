# Plan PMSSB-88 — Batch 72 per-card bot-scoring audit (2026-11-06)

## Trigger / acceptance

The owner rejected inferring manual bot-scoring coverage from a similar rules effect or from engine tests. Audit every mechanic and decision path on the ten cards in Batch 72 (collection 635–644). For each, cite prior executed manual scoring evidence or create a fresh PMSSB measurement and pin. If the bot's score/decision fails the expected behavior, adjust the generic scoring path and re-run the probe. Do not merge the open PR.

## Card inventory

| Card | Score-relevant mechanics / decisions |
|---|---|
| Feral Ridgewolf | Trample body; activated `{1}{R}` temporary +2/+0 pump; combat timing and mana cost |
| Creeping Peeper | Tap-for-`{U}` restricted to enchantment spell / unlock a Door / turn a permanent face up; payment-purpose scoring |
| Vortex Runner | Live 8-land threshold changes evasion and attack decision |
| Kraken Hatchling | 0/4 vanilla body cost/value baseline |
| Open the Gates | Search library for Basic Land **or** Gate; tutor value and land-screw rider across `anyOf` |
| Living History | ETB 2/2 Spirit token; attack trigger conditioned on a card leaving graveyard; +2 power target valuation |
| Banishing Light | ETB linked exile of opponent nonland permanent; target ranking; LTB return consequence |
| Pheres-Band Centaurs | 3/7 vanilla body cost/value baseline |
| Shining Aerosaur | Flying keyword body valuation |
| Lich's Caress | Targeted destroy plus 3 life in one sorcery; target choice and combined cast value |

## Prior evidence to verify, not assume

- PMSSB-2 / PMSSB-77: token body and pressure value; Living History still needs a card-specific score pin for its 2/2 ETB token.
- PMSSB-4: gain-life valuation; removal family registry says M91/M234, but linked-exile target-ranking needs an explicit decision probe.
- PMSSB-19: search-to-hand score across cast/activation/ETB; `Open the Gates`' nested `anyOf` qualifier is a distinct condition and must be probed.
- PMSSB-34 / PMSSB-39 / PMSSB-64 / PMSSB-67: ability mana cost, temporary pump payoff, keyword/body values including trample and flying; verify exact Ridgewolf/Aerosaur paths in the matrix.
- PMSSB-87: restricted mana for enchantment casts, Vortex Runner threshold, Living History attack trigger condition/target. It does not by itself cover Peeper's `turn_face_up` purpose.

## Measurement-before findings (2026-11-06)

A fresh ad-hoc deterministic score probe found two uncovered scoring defects:

1. `Open the Gates` with zero lands and a healthy 24-card library scores 59 (base cast 50 + generic search 9), with no +5 land-screw payoff. `searchFindsLand` recognizes a direct `types: ['Basic','Land']` qualifier but not the land branch nested under this card's `qualifier.anyOf`.
2. With two generic mana, an untapped Creeping Peeper, and a manifested high-value blue creature that can be turned face up only by using the Peeper's restricted `{U}`, the engine legally offers `turn_manifest_face_up`, but the bot assigns it `-Infinity` and passes. Existing `turn_face_up` score validation counts pool/lands only and rejects mana abilities that the engine can use in payment.
3. Naturalize targeting Banishing Light scores 78 both with and without a linked exiled card. The return-on-leaves interaction is absent from removal-target scoring. Returning our 4/5 should add +18 (78→96); removing our own Light and returning the opponent's 4/5 should add −18 (−130→−148).

These three are in-scope manual bot-scoring gaps and will be closed in this loop. `unlock_door` is present in Peeper's printed spend restriction, but this repository has no supported Room/door card or unlock-door action to offer; treat it as an explicit engine-coverage boundary, not as verified scoring. Do not fabricate a score result for an unavailable decision.

## Procedure / gates

1. Keep this plan as the auditable gap baseline.
2. Add deterministic before/after sonda cases for all ten cards, including the two failures above, linked-exile high-vs-low target, Lich's Caress high-vs-low target, creature-body baselines, trample/pump, Flying, and token/trigger choices.
3. Add decision pins for each previously uncovered batch-specific path, including no-land search vs parameter-zero control; purpose-restricted turn-up vs no eligible action; target ranking and cast/pass controls.
4. Make only generic fixes justified by score measurements. Demonstrate RED with temporary code mutations and restore source.
5. Run targeted PMSSB/rules tests, then fast + slow suites and build. No full B0 benchmark.
6. Update `docs/PMSSB.md`, the Batch 72 deck report/handoff if needed, and project history with a per-card crosswalk. Keep PR open and unmerged.

## Final outcome (2026-11-06)

All ten cards have direct score evidence in the PMSSB-88 crosswalk in
`docs/PMSSB.md`. Three measured gaps were closed: recursive `anyOf` land
recognition (**Open the Gates 59→64; zero-weight control 59**), accepting an
engine-legal face-up action paid through Creeping Peeper (**4 vs pass 0,
chosen/executed; without Peeper no offer**), and linked-exile return value on
cast and activated removal (**+18/-18**, including Capsule **27→45**). Lich's
Caress rider was isolated against a same-cost destroy-only control.

Mutation checks were RED for each changed scoring path and source was restored.
The combined targeted PMSSB-72/88 suites passed **12/12**; fast passed
**10,060/10,060**; slow **268/268**; build **78 modules / 5,757.7 kB**.
`git diff --check` passed. No full B0 benchmark was run.
`unlock_door` remains explicitly unscored because there is no Room card or
unlock action in the repository. PR remains open and unmerged.
