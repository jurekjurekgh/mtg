# Batch 72 — B6 generator outcome

Date: 2026-11-06. Generator only: `node tools/generate-plan-decks.mjs`.
No `decks/*.txt` files were edited by hand. It generated 32 deck files; the
second run left the same generated tree (verified by `test/repo-decks.test.js`).

## Batch 72 card destinations

| Card | Owner plan | Generated deck |
|---|---|---|
| Feral Ridgewolf | Wiedźmin | `wiedzmin-wur.txt` |
| Creeping Peeper | Duskmourn | `worek-mroczny.txt` |
| Vortex Runner | Arcavios | `worek-legend.txt` |
| Kraken Hatchling | Wiedźmin | `wiedzmin-wur.txt` |
| Open the Gates | Bloomburrow | `worek-basni.txt` |
| Living History | Arcavios | `worek-legend.txt` |
| Banishing Light | Kamigawa | `worek-basni.txt` |
| Pheres-Band Centaurs | Theros | `theros.txt` |
| Shining Aerosaur | Ixalan | `ixalan.txt` |
| Lich's Caress | Forgotten Realms | `forgotten-realms-br.txt` |

## Generated changes and rationale

- Added the ten Batch 72 cards to their owner-plan decks above; adjusted basics
  where the 2:1 land ratio requires it.
- Forgotten Realms crossed the 30-nonland split threshold at 30 cards. The
  former `forgotten-realms.txt` was replaced by `forgotten-realms-br.txt` and
  `forgotten-realms-wug.txt` (15 nonlands each, balanced split; each has 8
  basics). This is the expected ADR 0024 generator behavior, not a manual move.
- Refreshed generated counts/land bases in `ixalan`, `theros`, `wiedzmin-wur`,
  `worek-basni`, `worek-legend`, and `worek-mroczny`. No unrelated card
  reassignment was found in `git diff -- decks/`.
- Updated all executable test/tool references to the removed unsplit filename,
  the README deck table/counts, and benchmark `--help` (28 benchmark decks
  after the split). README counts were independently compared to every listed
  generated file.

## Validation

- `node --test test/repo-decks.test.js test/deck.test.js test/batch47-kart.test.js test/audyt-pr177-a47-readme-decks.test.js test/m203-talie-testera-i-dokumentacji.test.js test/m338-pomoc-benchmarku-liczby.test.js` — **86 passed, 0 failed**.
- Generator's idempotence and exact coverage are also pinned by
  `test/repo-decks.test.js`.
