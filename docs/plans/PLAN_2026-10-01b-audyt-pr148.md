# Plan sesji 2026-10-01b — audyt scalonego PR #148 + pętla jakości

**Tryb:** ADR 0020 (A: PR na starcie, B: audyt poprzedniego PR, C: commity
inkrementalne, D: bez force push) + ADR 0021 (prompt „Kontynuujemy projekt."
nie nazywa tematu ⇒ pętla domyślna, bez pytania o kolejkę) + ADR 0016.

## Rozpoznanie

| Pomiar | Wartość |
|---|---|
| `main` (baza sesji) | `30de664` = squash PR #148 („Audyt PR #147 + pętla jakości — sesja 2026-10-01") |
| Poprzedni scalony PR | #148, 28 plików (8 × `src/`, 6 × dokumentacja, 12 × testy, 1 × narzędzie, 1 × snapshot części golden-mastera) |
| Pliki `src/` w #148 | `heuristic-bot.js` (+44/−18), `heuristic-params.js` (+5/−2), `combat.js` (+58/−17), `game-state.js` (+10/−3), `ai-config.js` (+4), `ai-modes.js` (+99/−3), `choice-request.js` (+1/−1), `render.js` (+4/−1) |
| Baseline `npm test` / `build` | **7219/7219**, build **70 / 4673,2 kB** (zmierzone na starcie sesji) |
| Niedokończone plany na `main` | brak nieodhaczonych kryteriów (`PLAN_2026-10-01-audyt-pr147.md` kompletny) |

## Etapy

- [x] **Etap 0 — lektura startowa**: `AGENTS.md`, ADR 0001–0030 (w całości),
  `LESSONS.md` L1–L171, `ENVIRONMENT.md`, handoff `2026-10-01`, opis i diff PR #148
  (`gh pr diff 148`, 1394 linie, czytany plik po pliku).
- [x] **Etap 1 — PR na starcie** (ADR 0020 A). Kryterium: PR istnieje na GitHubie
  przed pierwszym commitem kodu.
- [x] **Etap 2 — audyt PR #148**: przegląd każdego zmienionego pliku `src/` pod
  kątem CR, ADR 0002 (zero przypadków po nazwie/ID karty) i generyczności;
  weryfikacja pinów mutacjami (RED→GREEN); sondy na żywym silniku; źródła CR
  (wydanie 2026-09-25) pobrane online przed wnioskami (ADR 0030).
  Raport: `docs/audits/AUDYT_PR148_2026-10-01.md`.
- [ ] **Etap 3 — naprawy znalezisk** osobnymi commitami (jeśli audyt je wskaże).
- [ ] **Etap 4 — pętla jakości** (ADR 0021 §4): Żywy Tester z perspektywy gracza
  + polowanie na niezgodności z CR innymi ścieżkami niż poprzednia sesja
  (ta sesja nie powtarza ścieżki „badge zakazu ataku" ani „trample w wycenie bloku").
- [ ] **Etap 5 — zamknięcie**: handoff `docs/setup/HANDOFF_2026-10-01b.md`,
  `docs/PROJECT_HISTORY.md`, opis PR, blok przekazania dla następnej sesji.

## Ryzyka

- Budżet lektury ~99 885/100 000 tokenów — nowy wpis `LESSONS.md` wymaga
  kondensacji (albo zgody właściciela na podniesienie progu).
- Re-provisioning sandboxa: na starcie każdej tury `git rev-parse HEAD` vs
  `git ls-remote`; push jest jedynym trwałym zapisem pracy (ENVIRONMENT §2).
- Golden-master bota: każda zmiana wyceny wymaga świadomej regeneracji fixture'a
  (próg regresji bez zmian).
