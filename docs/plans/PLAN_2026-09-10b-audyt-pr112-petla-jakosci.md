# PLAN 2026-09-10b — sesja arena/01a08d0e: audyt PR #112 + pętla jakości

Prompt startowy: „kontynuujemy projekt" → tryb obowiązkowy ADR 0020 (PR → audyt
poprzedniego PR → inkrementalne commity) + pętla domyślna ADR 0021.

## Stan wyjściowy (zmierzony, nie przepisany)

| Pomiar | Wynik |
|---|---|
| `git log --oneline -1` | `f7e4d11` (squash PR #112) — baza sesji |
| `npm test` (szybki rdzeń) | **5092/5092** pass, 0 fail (~182 s) |
| `npm run build` | exit 0, **61 modułów / 3463,3 kB** |
| Ostatni PR | **#112 MERGED** 2026-09-10 20:42 UTC (`arena/01a08b81-mtg`, 14 commitów, 26 plików, +1570/−96) |
| README §Status | **5055/5055, 3453,7 kB** — ROZJAZD z pomiarem (znalezisko F4) |

## Etapy (kryteria ukończenia)

- [x] **E0** Lektura obowiązkowa AGENTS.md §0: AGENTS.md, WSZYSTKIE ADR-y
      (0001–0030), `docs/LESSONS.md` (142 wpisy, 2334 linie — do ostatniej),
      `docs/setup/ENVIRONMENT.md`, PR #112 (opis + diff), handoff 2026-09-10.
- [x] **E1** Bramki bazowe: `npm test` 5092/5092, `npm run build` 61/3463,3 kB.
- [x] **E2** PR na starcie (ADR 0020 A): plan + audyt jako pierwszy commit,
      push gałęzi, otwarcie PR do `main`.
- [x] **E3** Audyt PR #112 (ADR 0020 B / ADR 0016): diff plik po pliku,
      weryfikacja CR/rulingów U ŹRÓDŁA (ADR 0030), weryfikacja mutacyjna
      KAŻDEGO fixu (L13) → `docs/audits/AUDYT_PR112_2026-09-10.md`.
- [x] **E4** Naprawa znalezień audytu — osobny commit na znalezisko, każdy
      z testem i weryfikacją mutacyjną (L13):
  - [x] **F1** `3577dc4` — snapshot Fireballa niesie 4 rulingi WotC 2017-11-17
        zapisane funkcjami produkcyjnymi `tools/fetch-card-rulings.mjs`;
        `test/audyt-pr112-rulingi-fireball.test.js` (3 testy; mutacja
        `rulings: null` → 3/3 RED). npm test **5095/5095**.
  - [x] **F2** `e222ebb` — audyt doliczył się **PIĘCIU** kopii reguły (nie trzech:
        dochodzą `castFireball` i `legalFireballCasts`, obie bez nogi jakości)
        → jeden predykat `isTargetingBlockedByProtection` (attachments.js)
        + `test/audyt-pr112-protection-jeden-predykat.test.js` (7 testów;
        5 mutacji → RED, stan sprzed F2 → 2 RED). npm test **5102/5102**.
  - [x] **F3** `f4de8b6` — strażnik dostarczenia informacji (3 seedy)
        w `test/session-bot-pausa.test.js`; mutacja (zniszczenie wyrzucone
        z bufora modala) → RED. npm test **5103/5103**.
  - [x] **F4** domknięcie dokumentacyjne: wpis `PROJECT_HISTORY.md` dla PR #112
        (został zamknięty bez niego), liczby w README wg pomiaru (L92),
        handoff `HANDOFF_2026-09-10b.md`.
- [x] **E5** Pętla jakości (ADR 0021): `npm run build` (61/3463,4 kB) → Żywy
      Tester na 3 świeżych partiach (tarkir-bg/warhammer-ubr 20260910,
      innistrad-wu/theros 161803, ravnica/dominaria-wu 3141592) — **DET0,
      0 niewycenionych ruchów bota**, wszystkie partie dograne do końca;
      quick benchmark `node tools/benchmark.mjs` → heuristic **84,7% (569/672)**,
      bez pełnego B0 (ADR 0018).
- [ ] **E6** Domknięcie: `npm run test:all`, `npm run build`, handoff,
      `PROJECT_HISTORY`, README, opis PR kumulatywnie, push.

## Ryzyka i pułapki

- `dist/` gitignorowany — po każdej zmianie `src/` **zawsze** `npm run build`
  przed Żywym Testerem (L76: tester mierzy artefakt, nie źródła).
- Mutacje testowe: kopia pliku do `/tmp` + przywrócenie KOPIĄ, nigdy
  `git checkout <plik>` (L8/L34/L136).
- `gh pr view` pada na GraphQL Projects → opis przez `gh api -X PATCH`.
- Zmiana wagi/etykiet UI potrafi zerwać piny tekstowe w kilku plikach —
  pełny rdzeń przed każdym commitem (ADR 0020 C).
- Pełny benchmark B0 tylko na komendę właściciela (ADR 0018).

## Podsumowanie wykonania

(uzupełniane kolejnymi commitami)
