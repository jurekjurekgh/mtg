# PLAN 2026-08-21 — M171: audyt PR #68 + pętla jakości

- **Sesja:** `arena/01a02534-mtg` (PR otwierany na starcie — ADR 0020 A)
- **Prompt startowy:** „Kontynuujemy projekt" — brak nazwanego tematu →
  pętla domyślna ADR 0021 (audyt poprzedniego PR → niedokończony plan →
  pętla jakości).
- **Stan wejściowy:** `main` = 1565033 (squash PR #68, M161–M170);
  build 52 moduły / 2208.3 kB; oczekiwane `test:all` 2589/2589.

## Rozpoznanie

- PR #68 (scalony 2026-08-21 16:43) obejmuje milestony M161–M170:
  gotowość madness na czary, uwagi właściciela M162/M163 (A/B/C, A/B),
  badge sagi (M164), badge liczników (M165), Batch 40 KOMPLET (M166,
  transze A–E), uwagi A–I + K1/K2 kreator (M167), A–D+C2 (M168),
  J–N (M169), Incubator transform jednorazowy (M170). 58 plików.
- Wszystkie plany `docs/plans/PLAN_2026-08-2*.md` mają odhaczone kryteria
  (0 nieodhaczonych checkboxów) → brak urwanego zadania do podjęcia.

## Etapy

### Etap 0 — PR na starcie (ADR 0020 A)

- [ ] Commit roadmapy + push gałęzi + `gh pr create`.

### Etap 1 — baseline

- [ ] `npm test` zielony na gałęzi sesji.
- [ ] `npm run build` zgodny z PROJECT_STATE (52 moduły / 2208.3 kB).

### Etap 2 — audyt PR #68 (ADR 0020 B / 0016)

- [ ] Przegląd zmian engine (spells/abilities/effects/game-state/combat/
      triggers/resources/fingerprint) — zgodność z CR, ADR 0002 (zero
      przypadków po nazwie/ID karty w core).
- [ ] Weryfikacja kart Batch 40 wobec plików Scryfall (Oracle 1:1,
      ADR 0022 — pełny Oracle albo unsupported).
- [ ] Kontrola testów RED→GREEN (weryfikacja mutacyjna próbki).
- [ ] Wynik: `docs/audits/AUDYT_PR68_2026-08-21.md` + wpis w opisie PR;
      znaleziska naprawiane od razu (osobne, samodzielnie zielone commity).

### Etap 3 — pętla jakości (ADR 0021 pkt 4)

- [ ] (a) audyt Żywym Testerem z perspektywy gracza (build + `npm i` w
      `tools/table-tester`; osie z `TESTER_STOLU.md`), naprawy u root cause.
- [ ] (b) nowy detektor na każdą klasę błędu znalezioną ręcznie (L27).
- [ ] (c) bez nowego batcha kart (karty tylko od właściciela).

## Ryzyka / pułapki

- Polskie znaki: edycje plików .md przez `python3`, nie `edit_file`.
- Push weryfikować `git ls-remote` (nauczka M167 — ciche odrzucenie).
- Zmiany zdolności z ręki / talii → `test:all` przed pushem (L25, M166).
- Benchmark tylko profil szybki; pełne B0 wyłącznie na komendę (ADR 0018).

## Podsumowanie wykonania

(uzupełniane na końcu zadania)
