# PLAN 2026-08-09 — Batch 26: 10 realnych kart (Kabira Vindicator … Lurking Green Dragon)

Data: 2026-08-09. Sesja: `arena/019fe7bf-mtg` (kontynuacja po M59–M63 / PR #38). Branch `arena/019fe7bf-mtg` już ma plan sync (62ad783) + docs sync (53ff016) — Batch 26 dopisuje się do tego samego PR.

## Karty (lista właściciela 2026-08-09) — Scryfall ZAWSZE z `set=` (fetch_page, api zablokowane)

| # | Karta | Set | Typ | Oracle | Nowe mechaniki |
|---|-------|-----|-----|--------|----------------|
| 1 | Kabira Vindicator | ROE | Creature 2/4 W {3}{W} | Level up {2}{W} (sorcery), LEVEL 2-4 3/6 other +1/+1, LEVEL 5+ 4/8 other +2/+2 | **Level Up** CR 702.86 — liczniki level, statyczne progi P/T i buff |
| 2 | Great Furnace | MRD | Artifact Land | {T}: Add {R} | artifact land (typy Artifact+Land) |
| 3 | Bomat Bazaar Barge | KLD | Vehicle 5/5 {4} Crew 3 ETB draw | When enters draw 1, Crew 3 | (istniejące: draw + crew) |
| 4 | Index | APC | Sorcery {U} | Look at top 5 put back any order | **Index** — reorder top 5 (pendingIndex) |
| 5 | Bladed Sentinel | MBS | Artifact Creature 2/4 {4} | {W}: vigilance until EOT | (istniejące: activated vigilance) |
| 6 | Might of the Masses | 2XM | Instant {G} | Target creature +1/+1 per creature you control | **pump_by_creature_count** |
| 7 | Magic Damper | FIN | Instant {U} | Target creature you control +1/+1 hexproof until EOT, untap | hexproof+untap (temporaire untilEndOfTurnBuffs + untap) |
| 8 | Hecteyes | FIN | Creature 1/1 {1}{B} | ETB each opponent discards 1 | **discard_each_opponent** |
| 9 | Carapace Forger | SOM | Creature 2/2 {1}{G} | Metalcraft +2/+2 if ≥3 artifacts | (istniejące: metalcraft static) |
|10| Lurking Green Dragon | CLB | Creature 4/4 {3}{G} flying | Can't attack unless defending player controls flying | **attack restriction** |

## ArtId (ze słownika `tools/collection-art-ids.csv` — plan + numeric)

- kabira-vindicator: 143ROE (Ravnica? w csv Zendikar) → artId 143
- great-furnace: 97MRD → 97
- bomat-bazaar-barge: 541KLD → 541
- index: 179APC → 179 (APC, istniejący index; plan Warhammer Fantasy w csv)
- bladed-sentinel: 73MBS → 73
- might-of-the-masses: 268_2XM → 268
- magic-damper: 283FIN → 283
- hecteyes: 439FIN → 439
- carapace-forger: 488SOM → 488
- lurking-green-dragon: 519CLB → 519

## Nowe mechaniki engine (generyczne, ADR 0002 — root-cause, nie per-karta)

1. **Level Up (CR 702.86)** — `levelUp` ability: activated {2}{W} sorcery-speed, dodaje `level` counter (`add_counter {counter:'level'}`). Static: self P/T i buff `other_creatures_you_control` zależne od liczby level counters (thresholds 0/2/5). Implementacja: `createAbility type:activated cost:{mana, colors, sorcerySpeed}` + `effect: {type:'add_counter', counter:'level'}` + static `levelThresholds` w deskryptorze karty, czytane w `permanents.js` effective stats (non-mutating, CR 611).
2. **Index reorder (top 5 any order)** — `pendingIndex { cards: [...] (5 top id) }` + `resolve_index_choice {order: [...ids]}` — biblioteka wspólna, tylko własne top 5. Rejestrac w `game-state.js` `pendingIndex`, kolejka w `execute`, `legalCommands` oferuje warianty permutacji? Ale 5! =120 — nie enumerować; zamiast tego nowy wizards jak scry: UI sekwencyjne, engine dostaje finalną kolejność (1 wariant). W `effects.js` `look_at_top_five` → zakolejkuj.
3. **pump_by_creature_count** — efekt `pump_by_creature_count { targetIndex, powerPerCreature:1, toughnessPerCreature:1 }` liczy `battlefield.filter(c=>c.controllerId===controller && c.types.includes('Creature')).length` przy resolucji.
4. **discard_each_opponent** — efekt `discard_each_opponent { amount:1 }` → dla każdego przeciwnika (w 1v1 jeden) `pendingDiscard`? Istniejący `discard_cards amount, applyTo:target` obsługuje jednego gracza; nowy typ iteruje po opponents, wymaga `resolve_discard` per opponent (sekwencyjnie?). Dla 1v1 prosto: jeden pendingDiscard.
5. **Attack restriction flying** — `cantAttackUnless { condition: 'defendingPlayerControlsFlying' }` na obiekcie; sprawdzane w `legalAttackerOptions`/`declareAttackers` (jak `cantAttackYou` z Vow). Lurking Green Dragon: warunek `defendingPlayer has creature with flying` na bitwisku.

Pozostałe to reuse: Great Furnace `Artifact Land` types (metalcaraft liczy artefakty), Bomat draw+crew, Bladed vigilance, Carapace metalcraft, Magic Damper pump+hexproof+untap (hexproof via `untilEndOfTurnBuffs` keyword grant, untap via `untap_permanent`).

## Etapy (commity w PR #38, każdy zielony)

1. **Plan** — ten plik (osobny commit PRZED kodowaniem, AGENTS.md).
2. **Scryfall data** — 10 plików `docs/cards/scryfall-*.json` pobranych via `fetch_page` z `set=` (ADR 0010 §2a) + wpis `tools/collection-art-ids.csv` już istnieje.
3. **Engine — levelUp + index + pumpCount + discardEach + attackRestriction** — generyczne mechaniki w `src/engine/*` (`game-state`, `effects`, `permanents`, `resources`/`combat`). Bez kart.
4. **Cards feat 1 (proste reuse):** Great Furnace, Bomat Bazaar Barge, Bladed Sentinel, Carapace Forger (4).
5. **Cards feat 2 (średnie):** Index, Might of the Masses, Magic Damper, Hecteyes, Lurking Green Dragon (5).
6. **Cards feat 3 (level):** Kabira Vindicator (1, z progami i testami poziomów).
7. **Decks + test + docs** — 9 talii singleton (hunter seed, singleton strażnik), `test/real-cards-batch26.test.js` (10 end-to-end legal/nielegal + Scryfall sanity + determinizm + level thresholds), `docs/ENGINE_MILESTONES.md` M64, `docs/PROJECT_STATE.md` / `docs/ROADMAP.md` (179→188 realnych, 1153→~1165 testów, 50 modułów), handoff.

## Weryfikacja per commit

- `npm test` zielony (1153 → ~1165), `npm run build` 50 modułów / ~1280 kB, benchmark 1080 meczów 0 crashy (heuristic vs random/aggro progi 0.78/0.57).
- `node -e registry.supported().length` = 188 realnych (189 wpisów z tokenem Rat) po batchu.
- Legalność: każdy nowy `legalCommands` wariant testowany + nielegalne (np. Kabira level up jako instant odrzucone, Dragon atak bez flyer przeciwnika odrzucone, Index bez 5 kart w bibliotece — fizzler?).

## Pułapki

- Level Up tylko jako sorcery (CR 702.86b) — `canActivate` sprawdza timing sorecery + pusta stos? (`activate_ability` sorcerySpeed jak inne sorcery).
- Level counters ≠ +1/+1 — osobny typ `level`, buffy nie kumulują liczników tylko progów.
- Index: 5! nie enumerować — 1 pending z wyborem kolejności (jak scry wizard).
- Lurking Dragon: defender = przeciwnik w 1v1, check `battlefield.any(c=>c.controllerId===defender && hasFlying)`.
- Magic Damper: hexproof tymczasowy nie chroni przed już istniejącymi aurami (tylko targeting prewencja).
- Great Furnace jako Artifact — metalcraft liczy go od razu po wejściu (SBA nie opóźnia).
- Scryfall ZAWSZE z `set=` — `fetch_page` nie `curl` (sandbox blokada SSL).

