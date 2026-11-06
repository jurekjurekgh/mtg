# Handoff — Batch 72 (2026-11-06)

## Current state

- Branch: `arena/5d931b5a-mtg` (Arena PR status: open).
- B0–B7 for collection 635–644 completed. Commits, each pushed to this branch:
  - `d8438c2` B0 plan
  - `331b5c6` B1 Scryfall snapshots and collection data
  - `4e88651` B2 rules inventory
  - `322cc6b` B3 rules and card definitions
  - `2ac2ff4` B4 tests and integrations
  - `11987b1` B5 PMSSB probes, pins, and report
  - `29b1143` B6 generated decks and affected references
- The PR has not been merged. Do not merge or close without the owner's explicit
  instruction.

## Batch and engine changes

Ten cards Feral Ridgewolf, Creeping Peeper, Vortex Runner, Kraken Hatchling,
Open the Gates, Living History, Banishing Light, Pheres-Band Centaurs, Shining
Aerosaur, and Lich's Caress were added per the B0 owner plan and B1 snapshots.
The new generic paths are purpose-restricted mana (`enchantment_spell`,
`unlock_door`, `turn_face_up`), a per-owner per-turn card-left-graveyard fact,
and live static-condition handling for Vortex Runner. Trigger event, Polish
labels, player view, materialization, and heuristic valuation are wired through
shared paths; no card-name branches or `support.limitations` were added.

B5 PMSSB-87 recorded focused score probes and mutation sensitivity. No bot
weights were added. Details are in `docs/PMSSB.md`, with the B5 plan and sonda
under `docs/plans/PLAN_2026-11-06c-pmssb72.md` and
`tools/pmssb72-batch72-sonda.mjs`.

## Deck result

The generator produced 32 files. Forgotten Realms crossed 30 supported
nonlands and split into `forgotten-realms-br.txt` and
`forgotten-realms-wug.txt`; all other additions and basic-land changes are
listed in `docs/plans/PLAN_2026-11-06d-batch72-deck-report.md`. README table
counts match generated files; test and tool references to the removed unsplit
filename were updated.

## Verification

- Focused catalog/deck tests: 86 passed.
- Fast suite: 10,051 passed, 0 failed.
- Slow suite: 268 passed, 0 failed.
- Build: 78 modules, 5,755.8 kB.
- Quick benchmark: 672 games, 0 unfinished; heuristic 80.7% vs aggro and
  97.6% vs random. The quick sample changed after the generated deck split, so
  this is not a strict before/after win-rate comparison.
- Three temporary mutations (mana purpose, attack-trigger scan, static
  condition) each made its PMSSB pin fail; all source files were restored.

Full B0 was intentionally not run; the plan reserves it for an explicit owner
request. Continue from the current pushed branch and do not switch branches.
