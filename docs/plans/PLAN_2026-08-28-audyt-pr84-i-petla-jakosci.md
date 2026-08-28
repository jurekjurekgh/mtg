# PLAN 2026-08-28 — audyt PR #84 i pętla jakości (sesja arena/01a047a8)

**Sesja:** `arena/01a047a8-mtg`. **Baza:** `main` @ `e937c63` (squash PR #84).
**Prompt:** „Kontynuujemy projekt." — brak nazwanego tematu → ADR 0021 (pętla domyślna).
**Zasady:** ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity; bez force push).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3610/3610 pass**.
- `npm run build`: OK, `dist/mtg-table.html` = 2 946 198 B (~2.9 MB).
- Zgodne z opisem PR #84 (3612/3602 vs 3610 — różnica wynika z `test:all` vs `test`).

## Etap 1 — audyt PR #84 (ADR 0020 B / ADR 0016)

Przegląd zmienionych plików źródłowych (`src/engine/*`, `src/controllers/*`,
`src/protocol/types.js`, `src/table/*`, `tools/*`) pod kątem: zgodności z CR MtG,
ADR 0002 (brak przypadków po nazwie/ID karty w core), L48 (oferta = walidacja),
L41 (jedno źródło prawdy), L16 (fingerprint obejmuje decyzje wstrzymujące).

### Etapy
- [ ] Przegląd `heuristic-bot.js` (M239 trample, M241 escape-exile, M243 activatable,
      M244 equip, M245 attack-subsets, M247 pure-land, M248 fizzle).
- [ ] Przegląd `heuristic-params.js` (usunięte martwe damageCreature*, dodany removalPureLandPenalty).
- [ ] Przegląd `engine/game-state.js` (pendingEscapeExile, cantAttackStatic, activatableAbilities, widok).
- [ ] Przegląd `engine/spells.js` (dwukrokowy Escape: castEscape → pending → resolveEscapeExile).
- [ ] Przegląd `engine/effects.js`, `engine/triggers.js` (M240 sourceCardId, M242 auto-cel),
      `engine/combat.js` (staticAttackPrevented, M245 podzbiory).
- [ ] Przegląd `protocol/types.js`, `table/*`, `tools/*`.
- [ ] Weryfikacja RED→GREEN wybranych testów mutacyjnie (L61).
- [ ] Spisanie wniosków → `docs/audits/AUDYT_PR84_2026-08-28.md`.

### Znalezisko (na moment pisania)
- **E1 (fingerprint):** `pendingEscapeExile` wstrzymuje priorytet (decyzja gracza,
  `game-state.js`), ale **nie ma go w `PENDING_DECISION_FIELDS`**
  (`src/engine/fingerprint.js`). Narusza L16 („każda struktura blokująca priorytet
  musi być częścią fingerprintu"); skutek: sonda „oferta bez skutku" (L16/L18) oraz
  weryfikacja replayów mogą nie odróżnić stanu przed/po otwarciu decyzji Escape.
  Naprawa u root cause: dopisać `pendingEscapeExile` do listy + test RED→GREEN.

## Etap 2 — pętla jakości projektu (ADR 0021)

Po zamknięciu audytu (bez znalezionych błędów regułowych w engine; poprawka E1)
przejść do pętli jakości: Żywy Tester + CR-hunt. Konkretny zakres ustalany po
audycie z istniejących `tmp-audyt-*/` i `docs/audits/`.

## Ryzyka / pułapki

- Build mierzy `dist/`, nie `src/` — po każdej zmianie w `src/` przebudować przed
  Żywym Testerem (L76).
- `npm test` = szybki rdzeń; brama PR to `npm run test:all` (ADR 0019).
- Benchmark pełnego B0 tylko na komendę właściciela (ADR 0018).
- Force push zakazany (ADR 0020 D).

## Kolejność commitów

1. (ten plik) PLAN + otwarcie PR (ADR 0020 A).
2. Audyt → E1 fix + test → `docs/audits/AUDYT_PR84_2026-08-28.md`.
3. (dopełnianie w miarę pracy)
