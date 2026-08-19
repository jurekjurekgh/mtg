# PLAN sesji M149 — uwagi właściciela A–D (bot + UI)

Gałąź: `arena/01a01a7b-mtg` (PR #65).

## Uwagi z testów (2026-08-19)

- **A1.** Bot aktywuje Treasure (mana) i nic nie rzuca — bezsensowne
  zmarnowanie tokena.
- **A2.** Fake Your Own Death (trick bojowy) rzucany w draw phase zamiast
  podczas walki.
- **A3.** Bot buffuje Guildsworn Prowler, po czym go poświęca dla Bone
  Splinters. Bone Splinters powinien porównać TMC (Total Mana Cost) —
  poświęcenie opłaca się tylko gdy TMC zabijanej kreatury jest wyższe.
- **B.** Komunikat kroku kolejności w Surveil/Scry: zamiast „Kolejna karta na
  wierzchu” ma być czytelna enumeracja („Wybierz w kolejności od najwyższej do
  najniższej na szczycie biblioteki:").
- **C.** Cuombajj Witches — wybór celu (1 dmg) u gracza pokazuje się jako „X
  opcji zagrania” zamiast modala z celami. Niespójne z innymi modalami.
- **D.** Bot rzuca Grave Exchange, wybiera „target player sacrifices a creature”
  i wybiera SIEBIE — bez sensu.

## Rozpoznanie

- A1/A2/A3/D: heurystyka bota (`src/controllers/heuristic-bot.js`) — wycena
  `add_mana` (Treasure), pump „do końca tury” (Fake Your Own Death),
  `player_sacrifices_creature` (Grave Exchange), `resolve_sacrifice_choice`.
- B: `src/table/choice-request.js` — tekst kroku kolejności.
- C: sposób oferowania celu zdolności Cuombajj Witches (opponentChoosesTarget?).

## Kryteria ukończenia (commit po commit, zielone: `npm test` + `npm run build`)

- [x] A1: bot nie aktywuje Treasure bez celu do zagrania (już chronione przez `unlocksSomething`; zweryfikowane testem).
- [x] A2: trick bojowy (pump do końca tury) we własnym upkeep/draw/end → kara -60 (poniżej passu); main przed atakiem OK.
- [x] A3: Bone Splinters — porównanie TMC (poświęcenie tylko gdy TMC celu wyższy); PlayerView battlefield niesie manaCost (ADR 0017, z wyjątkiem face-down CR 708.2).
- [x] B: komunikat kolejności w Surveil/Scry — „Wybierz w kolejności od najwyższej do
   najniższej na szczycie biblioteki:" + enumeracja („1. na wierzchu: …").
- [x] C: resolve_opponent_target (Cuombajj Witches) grupowany w modal z celami
   (choiceRequestGroupKey + choiceRequestType 'target' + descriptor).
- [x] D: player_sacrifices_creature celuje w przeciwnika; self = kara, foe = zysk.
- [ ] `npm run test:all` zielony; push; CI zielony.
