# Plan: audyt żywym testerem M86

Data: 2026-08-13. Gałąź `arena/019ffc52-mtg` (PR #49). Nie merge.

## Źródło

`tools/table-tester/run-game.mjs` na `dist/mtg-table.html`:
- innistrad vs wiedzmin seed 201
- tokens vs spellslinger seed 88
- graveyard vs mechanicy seed 55
- ostrza vs sojusznicy seed 33

Transkrypty: `tools/table-tester/audyt-m86-*.txt`.

M85 (Negate, Fireball, Fertile Thicket, …) **nie** wchodzi w te 15.

## 15 unikalnych błędów

1. Log `cards_milled` fromBottom twardo „(Sweet Oblivion)” — Cellar Door też mieli od spodu (ADR 0002).
2. Bot Sweet Oblivion / mill celuje w siebie.
3. Bot Reclusive Artificer ETB damage we własnego stwora.
4. Selhoff Occultist: surowy `Trigger any_creature_dies`.
5. `daybound` / `nightbound` surowe na kaflu.
6. Cloak of the Bat: kafelek tylko `{2}` — brak Equip/keywordów nosiciela.
7. Podwójny log flip: `object_flipped` + `turned_face_up`.
8. Flurry of Wings: surowe `(attacking_creatures_count)`.
9. Log „Ty tworzy token” — zła odmiana (Ty tworzysz).
10. Goblin Construct: `cantBlock` nie w opisie static.
11. Keyword `infect` / uzupełnienie etykiet day/night (surowe snake_case).
12. `enchantment_you_control_enters` (konstelacja) bez opisu.
13. `set_base_pt_until_end_of_turn` bez opisu (Voice of the Vermin).
14. `mill_from_bottom` bez opisu w `describeEffect`.
15. `grant_abilities` bez opisu.

## Naprawy

- `src/table/session.js` — mill bez nazwy karty; `object_flipped` → null.
- `src/table/render.js` — keywordy, dynamic amounts, trigger/effect/equip/cantBlock.
- `src/controllers/heuristic-bot.js` — mill na przeciwnika; trigger damage nie we własne.

## Testy

`test/audit-m86-tester.test.js`.

## Poza zakresem (DOM testera)

Sklejony modal Mulligan, twarz+tekst w bot-move, zdublowane P/T na kaflu (face + overlay).
