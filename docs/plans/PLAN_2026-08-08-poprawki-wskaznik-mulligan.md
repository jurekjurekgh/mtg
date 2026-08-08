# PLAN 2026-08-08 — Poprawki A+B: wskaźnik tury jako warstwa + etykiety mulligana

Zgłoszenie właściciela (2026-08-08, sesja arena/019fde70-mtg):
- **A.** Wskaźnik „Tura N, gracz, faza” miał być **warstwą (overlay) zawsze widoczną w lewym górnym rogu**, a trafił jako element na szczycie HTML-a w pasku górnym (`.topbar`). Ma wrócić do warstwy fixed z z-index poniżej modali/fullscreenu.
- **B.** Partia startuje z dwiema identycznymi opcjami o technicznej nazwie `resolve_mulligan_choice`. Obie opcje mają tę samą etykietę, bo `commandLabel` w `render.js` nie obsługuje `resolve_mulligan_choice` / `resolve_mulligan_bottom_choice`.

## Rozpoznanie (zrobione przed planem)

- `src/table/index.html`:
  - `#turn-indicator` jest **wewnątrz** `<div class="topbar">` (linia ~614), a CSS `.turn-indicator` nie ma `position: fixed` — jest `inline-flex` w flow paska. Komentarz CSS zapowiada warstwę fixed z z-index < 2600, ale deklaracji brakuje.
  - `src/table/main.js:515-540` (`updateTurnIndicator`) poprawnie wypełnia wskaźnik spanami `.ti-turn/.ti-player/.ti-phase`, ale element jest w złym miejscu w DOM i bez fixed — na iPadzie po przewinięciu znika.
- `src/engine/game-state.js`:
  - `setupGame` kolejkuje `pendingMulligans = [human, bot]` + `pendingMulliganBottom`, `playerView` oferuje `resolve_mulligan_choice {keep:true|false}` oraz `resolve_mulligan_bottom_choice {cardIds: [...]}`. Boty deterministycznie biorą pierwszą ofertę (keep).
  - `playerView` i `legalCommands` — oferty są poprawne, nie blokują gry.
- `src/table/render.js`:
  - `REASONING_ACTION_LABELS` ma wpisy dla obu mulliganów, ale `commandLabel` (linia ~309) ma `switch` bez case dla `resolve_mulligan_choice` / `resolve_mulligan_bottom_choice` → `default: return cmd.type` — stąd techniczna nazwa i identyczność obu opcji keep:true/false.
  - `choiceRequestGroupKey` nie grupuje mulliganów — przy bottom (7 kombinacji) powstaje 7 identycznych technicznych przycisków.
  - `heuristic-bot.js:655` — polityka keep jest OK (pierwsza oferta).

## Cel

- **A** — wskaźnik jako **fixed warstwa** w lewym górnym rogu, zawsze widoczny przy scrollu, poniżej `fullscreen` (2600) i modali (1500), nie zasłania ilustracji.
- **B** — polskie, **rozróżnialne** etykiety obu mulliganowych decyzji; bottom pokazuje nazwy kart odkładanych na spód; brak technicznych `resolve_*` w UI.

## Zakres (2 commity po planie, 1 PR)

### Commit 1 — wskaźnik tury jako warstwa (A)

- `src/table/index.html`:
  - Przenieś `#turn-indicator` poza `.app` — jako bezpośrednie dziecko `<body>` przed `.app` (warstwa viewportu, nie element paska).
  - CSS `.turn-indicator`: dodaj `position: fixed; top: 8px; left: 8px; z-index: 1100; box-shadow: 0 4px 12px rgba(0,0,0,.25); max-width: 80vw;` (1100 < 1500 modalu < 2600 fullscreen, zgodnie z komentarzem). `display: inline-flex` zostaje.
  - Opcjonalnie `body { padding-top }` nie jest potrzebny — fixed nie zajmuje flow; `.app { padding-top: 6px }` kompensuje, jeśli wskaźnik zachodzi na topbar na wąskich ekranach — test wizualny po buildzie.
- `src/table/main.js`: bez zmian logiki `updateTurnIndicator` (działa z nowym położeniem w DOM); weryfikacja że `getElementById('turn-indicator')` nadal znajduje element.
- **Kryteria:** po `npm run build` artefakt ma wskaźnik fixed; przewinięcie strony nie chowa wskaźnika; fullscreen (z-index 2600) przykrywa wskaźnik.

### Commit 2 — etykiety mulligana (B)

- `src/table/render.js`:
  - `commandLabel` — dodaj:
    - `case 'resolve_mulligan_choice': return cmd.keep ? 'Mulligan: Zatrzymaj rękę (7 kart) — keep' : 'Mulligan: Weź mulligana — nowa ręka 7 kart (odłożysz karty na spód)';`
    - `case 'resolve_mulligan_bottom_choice':` — lista nazw kart z `cmd.cardIds` (przez `nameOfObjectId`), np. `Mulligan — odłóż na spód (${count}): ${names.join(', ')}` lub `Odłóż 1 kartę na spód: ${names}`; fallback gdy `cardIds` puste → „Odłóż karty na spód”.
  - Rozważ `choiceRequestGroupKey` / `choiceRequestType` dla `resolve_mulligan_bottom_choice` → group `mulligan-bottom` (jak `resolve_scry`), żeby 7/35 kombinacji przy bottom=2 nie zalewało panelu akcji — ale przy `keep` (tylko 2 opcje) zostawiamy 2 osobne przyciski z rozróżnialnymi etykietami (prostsze, bez modalu). Decyzja: **etykiety wystarczą**; grupowanie bottom jest opcjonalne i nie blokuje zgłoszenia B. Jeśli panel zalewa się przy count=2/3, dopisujemy grupowanie w tym samym commicie.
  - `ACTION_RANK` — nadaj priorytet mulliganom ujemny (np. `resolve_mulligan_choice: -3`, `resolve_mulligan_bottom_choice: -3`) żeby były nad `pass` — spójnie z decyzjami scry/backup.
- `src/table/main.js` — bez zmian (play obsługuje oba typy przez `session.apply`).
- **Testy:**
  - `npm test` musi przejść (1025 → 1025+? bez regresji).
  - Manual: `npm run build` → `dist/mtg-table.html` — start partii pokazuje dwa **różne** polskie przyciski mulligana, a po mulliganie lista „Odłóż na spód: <nazwy>” jest czytelna.
  - Boty: `node tools/benchmark.mjs` — B0 bez zmian (mulligan — boty keep), progi 0.78/0.57.

## Kolejność

1. Ten plan (commit 1 w PR).
2. Commit A — warstwa wskaźnika (HTML+CSS) — test wizualny builda.
3. Commit B — etykiety mulligana (render.js) — `npm test` + build + benchmark informacyjny.
4. Aktualizacja `docs/PROJECT_STATE.md` (dopisek M49 — poprawki UX A/B) i `docs/ENGINE_MILESTONES.md` tylko jeśli zmienia się artefakt — niekonieczne dla etykiet.

## Ryzyka

- Edycja `index.html` przez `edit_file` psuje polskie znaki — użyć `python3` heredoc (patrz HANDOFF).
- CSS `position: fixed` wewnątrz `.app` z `transform` mógłby tworzyć nowy containing block — dlatego element przenosimy na poziom `<body>`.
- `commandLabel` używa `innerHTML` z `escapeHtml` dla nazw — nowe etykiety też muszą escape'ować nazwy kart.

## Poza zakresem tej sesji

- Batch 22 kart, zmiany silnika, strojenie bota — czekają na listę właściciela / osobny plan.
