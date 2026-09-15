# Plan 2026-09-15 — znaleziska A–G z testów właściciela (ADR 0020 A)

**Zlecenie:** 7 znalezisk z testów właściciela (Savage Surge, Spare from Evil, Civilized Scholar log, Powerstone restricted mana, Murder of Crows/Armored Skaab deck-out, Altar of Goyf badge).

**Stan wejściowy (zmierzony 2026-09-15):**
- `main` = `0acf09a` (squash PR #119); `origin/main` ten sam.
- Gałąź sesji `arena/01a0a487-mtg` czysta od main.
- `npm test` 5496/5496 (0 fail), `npm run build` 61 modułów / 3660,4 kB — zgodne z handoffem.

**Pętla:** ADR 0020 A/B/C/D — PR przed kodem → audyt PR #119 → inkrementalne commity (każdy zielony, push) → plan+raport.

## 0. Audyt PR #119 (B)
PR #119 = `0acf09a` — wyłącznie dokumentacja: `docs/plans/PLAN_2026-09-15-audyt-pr118.md`, `docs/audits/AUDYT_PR118_2026-09-15.md`, `docs/setup/HANDOFF_2026-09-15.md`, `README`. Zero zmian logiki → APPROVE (zielone). Bramki odtworzone: 5496/5496, 5506/5506, build 61/3660,4kB. Raport audytu w `docs/audits/AUDYT_PR119_2026-09-15.md`.

## 1. Zakres A–G
| ID | Karta/mechanika | Objaw | Root cause (wstęp) |
|---|---|---|---|
| A | Savage Surge {1}{G} instant +2/+2 untap | bot w untap, bez ataku/bloku | pump+untap wyceniany poza oknem tricku; brak premi/kary za untap w walce |
| B | Spare from Evil {1}{W} protection non-Human | bot w Main1, bez wpływu | `grant_protection` premiowane tylko combatOn, bez oceny lethal vs non-Human |
| C | Civilized Scholar log discard | w Rozgrywce brak karty odrzuconej | `card_discarded` logowane, ale `discard_choice_resolved` wyciszony + panel Rozgrywki nie pokazuje karty |
| D | Powerstone spendOnly:artifact | wizard pozwala na non-artefakt | mana-wizard liczy warianty bez `spendOnly`, `producibleMana` OK, UI nie |
| E | Murder of Crows may draw/discard | deck-out przy 4 kartach | `LIBRARY_DRAIN_EFFECTS` nie zawiera `draw_then_discard`, kara tylko repeat, optional trigger bez kary |
| F | Armored Skaab mill 4 | rzut przy 2 kartach → deck-out | ETB mill to ONE_SHOT, `repeatLibraryDrain` go ignoruje → 0 kary przy cast |
| G | Altar of the Goyf badge X | brak badge X na artefakcie | efekt `card_types_in_all_graveyards` ma tylko `rulesText`/`ptPair`, brak badge UI |

E+F: wymaga **wspólnej mechaniki** wyceny uszczuplania własnej biblioteki (draw/mill/decay) zamiast łatek per karta (zgłoszenie właściciela).

## 2. Etapy (inkrementalnie, każdy commit zielony)
- [x] **E0** — ten plan + audyt PR #119 (commit + push + PR) — ADR 0020 A/B
- [x] **E1** — **D Powerstone**: `src/table/mana-wizard.js` + `src/engine/resources.js` — wizard respektuje `spendOnly`, liczy `restrictedPool` per cel (`spellManaPurpose`)
- [x] **E2** — **E+F wspólna mechanika**: `src/controllers/heuristic-bot.js` — unifikacja `libraryDrain*` dla `draw_cards|mill_cards|draw_then_discard|discard` + ETB + `resolve_optional_trigger_choice` (may draw) + ETB mill (Skaab)
- [x] **E3** — **G Altar badge**: `src/table/render.js` — badge X live na kaflu Altar (`allGraveyardsCardTypeCount` przez view), test
- [x] **E4** — **C Scholar log**: `src/engine/game-state.js`/`effects.js` + `src/table/session.js` + `src/table/render.js` — `card_discarded` z `sourceCardId` i log „odrzuca <Karta> (Civilized Scholar)”; panel Rozgrywki nie wycisza
- [x] **E5** — **A Savage Surge combat trick**: wycena `buff_creature_until_end_of_turn` + `untap_permanent` tylko w oknach: własna tura przed `declare_attackers` na atakera ALBO cudza tura przed `declare_blockers` na blokera + pumpChangesOutcome + untap value
- [x] **E6** — **B Spare from Evil timing**: `grant_protection` tylko gdy lethal od non-Human w zadeklarowanej walce (symulacja z/without protection), po `declare_blockers`; w pozostałych oknach kara przebija bazę
- [x] **E7** — bramki końcowe: **sprostowanie (L142)** — bramki (`npm test`/`build`) były zielone, ale sesja domknęła się BEZ handoffu (P2) i BEZ testów na A–G (A2); audyt PR #120 tej sesji (docs/audits/AUDYT_PR120_2026-09-15.md) ustalił REWORK: A1 blokujący (E nieczynne), domknięte w tej samej sesji (E2/E4/E6).

## 3. Weryfikacja (ADR 0030)
CR cytaty w kodzie/komentarzach/testach:
- 702.16 protection (Spare), 506/508 combat steps (Savage/Spare okna), 106.3 restricted mana (Powerstone), 121.4 deck-out (E/F), 613.3 continuous X (G). Źródła: yawgatog/mtg.wiki + Scryfall snapshot (docs/cards/*.json) — data dostępu w raporcie/commicie.

## 4. Granice
- Bez nowych kart, bez zmian Oracle.
- Zero wyjątków po nazwie karty w core (ADR 0002) — deskryptory.
- Bot czyta PlayerView (ADR 0017) — kompletność jawna.
- Surgical patching (ADR 0016) + L13 mutacyjność.
