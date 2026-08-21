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

- [x] Commit roadmapy + push gałęzi + `gh pr create` — PR #69, commit 421e8fb.

### Etap 1 — baseline

- [x] `npm test` zielony na gałęzi sesji (2580/2580 fast).
- [x] `npm run build` zgodny z PROJECT_STATE (52 moduły / 2208.3 kB).

### Etap 2 — audyt PR #68 (ADR 0020 B / 0016)

- [x] Przegląd zmian engine — zgodność z CR, ADR 0002 (zero przypadków
      po nazwie/ID karty w core). ✓
- [x] Weryfikacja kart Batch 40 wobec plików Scryfall (Oracle 1:1). ✓
- [x] Weryfikacja mutacyjna próbki (M170 gate, adamant, landfall — 3×RED). ✓
- [x] Wynik: `docs/audits/AUDYT_PR68_2026-08-21.md` (commit d4dd7b2);
      znalezisko N1 naprawione osobnym commitem a88d596 (test RED→GREEN
      `test/m171-adamant-multicolor-mana.test.js`, 3).

### Etap 3 — pętla jakości (ADR 0021 pkt 4)

- [x] (a) audyt Żywym Testerem: 8 partii (tokens/ostrza/graveyard —
      talie z kartami Batch 40 po obu stronach; profile greedy/impatient/
      aggressive). Naprawy u root cause: Z1 (odmiana + DRUGA_OSOBA),
      Z3 (cel-gracz w wielocelowej wycenie triggera — bot dzielił obrażenia
      we własną twarz, klasa L50), Z4/Z4b (LKI celów w zdarzeniach podziału
      — bez „?" po śmierci celu; tokeny przez name), Z5 (tester appendował
      przebiegi do jednego pliku — klasa L33). Commit 2647f7b.
- [x] (b) detektory: detectThirdPersonAboutHuman + PLACEHOLDER „?:";
      weryfikacja wsteczna (archiwalne g2 = 2 zgłoszenia, audyt-m159 = 0)
      + strażnik czasowników w teście (L29/L31) + strażnik flush (L33).
- [x] (c) bez nowego batcha kart. ✓

## Ryzyka / pułapki

- Polskie znaki: edycje plików .md przez `python3`, nie `edit_file`.
- Push weryfikować `git ls-remote` (nauczka M167 — ciche odrzucenie).
- Zmiany zdolności z ręki / talii → `test:all` przed pushem (L25, M166).
- Benchmark tylko profil szybki; pełne B0 wyłącznie na komendę (ADR 0018).

## Podsumowanie wykonania

- **Etap 0–1:** PR #69 (421e8fb), baseline zgodny (2580 fast / 52 moduły).
- **Etap 2:** audyt PR #68 POZYTYWNY (d4dd7b2); znalezisko N1 (Adamant nie
  liczył jednostek wielokolorowych — Skarb płacący pip {B}; CR 106.7)
  naprawione u root cause w a88d596; obserwacje U1 (komentarz Enrage —
  poprawiony), U2 (epicCastOffers bez filtra additionalCost na ścieżce
  EPIC — pilnować przy pierwszym takim zestawieniu talii).
- **Etap 3:** pętla jakości — 5 znalezisk Z1–Z5 naprawionych + 2 detektory
  + 2 strażniki (2647f7b). Transkrypty w `tools/table-tester/audyt-m171/`.
- **Stan końcowy:** `test:all` **2599/2599**, build **52 moduły /
  2211.4 kB**, benchmark regresji bota 9/9 (po zmianie wyceny Z3).
