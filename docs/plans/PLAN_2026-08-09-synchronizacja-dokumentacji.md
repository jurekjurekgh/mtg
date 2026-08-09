# PLAN 2026-08-09 — synchronizacja dokumentacji po Batch 25 i odznakach + przygotowanie kolejnego kroku

Data: 2026-08-09. Sesja: `arena/019fe7bf-mtg` (kontynuacja po PR #37 / 0afe5a4).
Cel: domknięcie rozjazdu kod ↔︎ docs po scaleniu PR #37 oraz przygotowanie kolejki.

## Kontekst (rozpoznanie)

- **HEAD `0afe5a4`** (squash PR #37) — 38 plików, +1364/-101. Zawiera:
  - Batch 25 (10 kart: Trestle Troll, Lab Rats, Anthem of Champions, Goblin Deathraiders, Fertile Thicket, Reassembling Skeleton, Idyllic Grange, Deadly Recluse, Benevolent Blessing, Springbloom Druid) + Scryfall JSONy + plan,
  - UI A–F (choice grouping, obrazki, fullscreen, bot modal, badge host, Kor Cartographer grouping),
  - B2-w2 lookahead (evalView + simpleChoice + próg + wiring `helpers.simulate`),
  - brązowa odznaka po Batch25 (5 bugów: protection D/E, cleanup doc, declareBlockers protection, Fertile opcjonalność),
  - srebrna odznaka po Batch25 (5 bugów: plot later-turn, protection combat D, protection blocking kierunek, protection non-combat, detach protection own-exception).

- **Stan faktyczny vs docs:**
  - `src/cards/card-data.js`: **179 supported** (token_rat +10 kart), HEAD poprzedni `bcdcd36` miał 169. Docs (`PROJECT_STATE.md` linia 3, `ROADMAP.md` nagłówek) nadal: **168 kart, 1139 testów, 49/1228.5 kB** — stale (przed Batch25).
  - `test`: faktycznie **1153/1153** (potwierdzone `node --test`, 85130 ms), build **50 modułów / 1269.6 kB** (50 nie 49 — nowy moduł `attachments.js` rozdział `effectiveProtectionFromColors`).
  - `docs/ENGINE_MILESTONES.md` kończy się na **M58 / Platynowa** — brak rozdziałów M59–M63 dla Batch25 + A–F + B2-w2 + brąz/srebro po Batch25.
  - `docs/ROADMAP.md` checklist: `[x] Batche 1–23` + `[x] Batch 22` + `[ ] Kolejne batche (Batch 23 czeka)` — Batch 23/24/25 zaznaczone jako „czeka”, mimo że Batch 23 (#35), Batch 24 i 25 są już w `main`. Blokada „czeka na listę właściciela” nieaktualna dla Batch25.
  - `docs/setup/HANDOFF_2026-08-09a.md` opisuje stan po M58 (przed Batch25) — HEAD `cff42dd`. Po scaleniu brak nowego handoffu `2026-08-09b`.
  - `tools/collection-art-ids.csv`: +10 wpisów Batch25 — ok.

- **PR-y:** #37 (mana badges) scalony 2026-08-09 18:18 jako `0afe5a4` — zawiera squasha 8 commitów. Poprzednie: #36 (M54+M55+M56+M57+M58), #35, #34, #33, #32. Branch sesji `arena/019fe7bf-mtg` świeży (0 commity vs main).

- **Pułapki środowiska (potwierdzone w handoffach):**
  - `edit_file` psuje PL znaki → używać `python3 Path.read_text/write_text`.
  - `src/engine`: `player.poison` vs `player.counters`, wspólna `zones.library`, `ownerId` vs `controllerId`, `untilEndOfTurnBuffs`, `protectFrom` kierunek, `plottedAtTurn`.
  - Testy z seedami sesji — hunter pattern po zmianie talii.
  - `commit-msg.txt` w repo — uważać przy commit — używać plików /tmp dla message.

## Zakres planu (kolejność commitów)

1. **Commit Plan** — ten plik (osobny commit PRZED kodowaniem, AGENTS.md).
2. **Docs sync** — jedno-commitowe wyrównanie dokumentów do kodu (47–50 modułów, 1153 testy, 179 kart):
   - `docs/PROJECT_STATE.md`: nagłówek „Ostatnia aktualizacja”, tabela faktyczna (179, 1153, 50/1269.6, B0), sekcja „Sesja 2026-08-09 — M59–M63” (Batch25, A–F, B2-w2, brąz, srebro), kolejka „Batch 26 czeka na listę”.
   - `docs/ROADMAP.md`: nagłówek + checklist `[x] Batch 23/24/25`, zaktualizowane liczby, blokada.
   - `docs/ENGINE_MILESTONES.md`: 5 nowych podrozdziałów **M59–M63** ( Batch25, UI A–F, B2-w2, brąz po Batch25, srebro po Batch25) + korekta nagłówka testów/build.
   - `docs/setup/HANDOFF_2026-08-09b.md` — nowy handoff po synchronizacji.
   - Weryfikacja: `npm test` 1153/1153 + `npm run build` 50/1269.6.
3. **Opcjonalnie (jeśli właściciel dostarczy listę):** Batch 26 — Scryfall z `set=` via `fetch_page`, definicje, talie singleton, testy, B0. Jeśli brak listy — PR kończy się na docs sync i czeka na dane (nie blokuje scalenia).

## Nowe mechaniki już w kodzie (dokumentacja, nie implementacja)

- Buyback CR 702.26 (`pendingSpellReturnToHand`), protection CR 702.16 (`effectiveProtectionFromColors`, `isDamagePreventedByProtection`, `canBlock` kierunek, `removeIllegalAttachments`), `minOtherPlains`, `pendingFertileThicket`, `pendingSpringbloom`, `all_creatures_you_control` w `staticBonuses`.
- UI: `choiceRequestGroupKey`, `isBotAdvancing` w session, `effectiveProtectionFromColors` cycle fix.
- Bot B2-w2: `evalView` keywords/evasion/deck-pressure, `simpleChoice`, threshold 2→1, `helpers.simulate` wiring.

## Kryteria ukończenia (per commit)

- Commit 1 (plan): plik istnieje, `git log` pokazuje go jako pierwszy na branchu, PR opis zawiera link.
- Commit 2 (docs sync): `npm test` 1153/1153, `npm run build` 50 modułów, `grep supported` 179, handoff zawiera pułapki + benchmark 1080 meczów 0 crashy.
- PR: zielony CI, docs zgodne z kodem, szablon PR wypełniony, push po każdym commicie.

## Ryzyka

- Nadpisanie PL znaków — używać python3 dla edits z PL.
- Liczby w docs: źródłem prawdy jest `src/cards/card-data.js` (179) i `node --test` (1153), nie nagłówek commit message (1139).
- Duplikacja nazw odznak (M56/M57 vs nowe brąz/srebro) — rozróżnić numeracją M62/M63 i dopiskiem „po Batch25”.
- Branch `arena/019fe7bf-mtg` to 1 sesja = 1 PR — nie otwierać drugiego PR-a; dopisywać kolejne tematy jako kolejne commity.

## Kolejka po docs sync

- Batch 26 — czeka na listę właściciela (ADR 0010: Scryfall ZAWSZE z `set=`; api zablokowane → `fetch_page`).
- B2-w2 lookahead domyślnie OFF (4× wolniej) — przeprojektowanie ewaluacji jeśli właściciel chce włączonego.
- Talie singleton rosną z batchami (strażnik `repo-decks`).
