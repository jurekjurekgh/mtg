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
- [ ] **E4** Naprawa znalezień audytu — osobny commit na znalezisko, każdy
      z testem RED przed zmianą i mutacją po (L13):
  - [ ] **F1** `docs/cards/scryfall-fireball.json` bez `rulings` (ADR 0028 §2).
  - [ ] **F2** reguła „protection blokuje celowanie" w trzech kopiach
        (L41/L140) → jeden predykat + strażnik źródła.
  - [ ] **F3** kontrakt pauz po fixie A: strażnik „bot spowodował zmianę strefy
        MOJEGO permanentu → gracz dostaje to w modalu" (pomiar A/B w audycie).
  - [ ] **F4** domknięcie dokumentacyjne po PR #112: handoff sesji, wpis
        `PROJECT_HISTORY.md`, liczby w README wg pomiaru (L92).
- [ ] **E5** Pętla jakości (ADR 0021): Żywy Tester, świeże seedy/talie/profile,
      bez pełnego B0 (ADR 0018); detektory + ręczna lektura osi 1–4.
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
