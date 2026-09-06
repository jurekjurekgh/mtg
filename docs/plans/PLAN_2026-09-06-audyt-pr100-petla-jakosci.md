# Plan sesji 2026-09-06 (arena/01a07682): audyt PR #100 + pętla jakości

## Kontekst

- Start: `main` = commit `448ed55` (scalony PR #100 „audyt PR #99 + pętla jakości", 17 plików, +922/−109).
- Prompt właściciela: „kontynuujemy projekt" (brak nazwanego tematu → ADR 0021, pętla domyślna).
- Bramki na starcie (zmierzone w tej sesji): `npm test` **4488/4488** (2m41s), `npm run build` 59 modułów / 3310.3 kB.
- Otwarte wątki z `docs/setup/HANDOFF_2026-09-05e.md`: (1) czy „GROZY" block (5) /
  attack (7) w audycie remisów to uczciwe remisy, czy ślepota modelu; (2) fałszywy
  detektor końca partii w Żywym Testerze (czeka na „Nowa partia" po `== KONIEC PARTII ==`).
- 1 sesja = 1 gałąź = 1 PR (ADR 0013/0020).

## Wstępna teza audytu (potwierdzona pomiarami PRZED pisaniem kodu)

`node tools/bot-tie-audit.mjs --kind=manifest` na HEAD: partia seed 4025, tura 6,
`resolve_manifest_dread(p2-library-20)` = 6 i `(p2-library-29)` = 6 przy klasifikacji
`rozróznialne` (= GROZA). Czyli wycena i projekcja widzą INNE dane — a wycena czyta
`view.zones.library`, którego wpisy w `playerView` (game-state.js ~5381) to
`{ id, controllerId, hidden: true }` BEZ `kind`/`manaCost`/`power`/`toughness`.

## Etapy (kolejność commitów)

### E1. Audyt PR #100 (ADR 0020 B) → `docs/audits/AUDYT_PR100_2026-09-06.md`
Znaleziska do udokumentowania (każde ze statusem POTWIERDZONE / ODRZUCONE / OBSERWACJA):
- **A1 (istotne)**: wyceny `resolve_*` czytające pola karty z `view.zones.library` /
  cudzej ręki są inertne: `resolve_search_choice`, `resolve_satyr_look_choice`,
  `resolve_manifest_dread`, `resolve_reveal_exile_hand` (+ gałąź `resolve_discard_choice`).
  Naprawa u root cause: jedno źródło danych = payload decyzji
  (`pendingSearchChoice.cards`, `pendingManifestDread.cards`), a tam gdzie go brak —
  rozszerzyć widok (jawne dane odsłoniętych kart), NIE zgadywać.
- **A2**: `SINGLE_PICK_FIELDS` + `found` grupuje oferty po id karty, silnik dedupuje po
  `cardId|destination` (game-state ~6199) → drugi wariant celu gubi wiersz w pickerze.
- **A3**: `tieProjection` — `obj.types ?? obj.cardId ? … : []` (`??` wiąże silniej niż `?:`).
- **A4**: vigilance (M221/B) — `myTurnCombat` dopuszcza 3 kroki, warunek zawęża do 1
  (dwa martwe, L5); komentarz mówi „ujemne względem ataku", kod dodaje `2 + toughness`.
- **A5**: `isNonePickCommand` dla `found == null` nie sprawdza `mandatory`, choć komentarz obiecuje.
- **A6**: `resolve_exploit_choice` = `finish(40 - value)` — próg 20/punkty ciała zamiast
  modelu triggera exploitowanego (arbitralne, nie koniecznie błędne — zmierzyć).
- Pozytywy do odnotowania: `m221d-vigilance-window.test.js` jako realny gate RED→GREEN,
  `candidateIds` w `pendingSearchChoice` (UI nie odtwarza filtra), dedup ofert w UI.

### E2. Naprawy (każda: test RED → naprawa u root cause → GREEN, osobny commit)
- N1 = A1 + strażnik: test, że wycena i projekcja `resolve_*` czytają TO SAMO źródło i
  że realnie różnicują kandydatów (L131, L1, L102). Martwe gałęzie `if (!card) return 0`
  usuwane, nie maskowane.
- N2 = A2 (grupowanie po krotce kandydat + `destination`).
- N3 = A3 + A5 (drobnostki, jedna poprawka literowa + dopisanie sprawdzenia).
- N4 = A4 (spójność komentarz↔kod i usunięcie martwych kroków; semantyka okna w silniku
  potwierdzona: `combat.js:264` tapuje przy DEKLARACJI atakujących).

### E3. Pętla jakości (ADR 0021 4a/4b)
- (a) Żywy Tester na dotkniętych rodzinach (szukanie, manifest, reveal-exile, vigilance);
  naprawa fałszywego detektora końca partii z HANDOFF.
- (b) Ścieżka statyczna INNA niż poprzednie sesje: `tools/bot-tie-audit.mjs`
  (`--gate=<kind>`) jako bramka remisów + `tools/event-contract-audit.mjs`.

### E4. Domknięcie
- `npm test` + `npm run build` + `node tools/benchmark.mjs` (szybki) przed pushem.
- `docs/audits/AUDYT_PR100_2026-09-06.md`, `docs/PROJECT_HISTORY.md` (odświeżyć licznik
  testów — L92: dok. mówi 4486, pomiar 4488), `docs/setup/HANDOFF_2026-09-06a.md`, kumulatywny opis PR.

## Ryzyka / pułapki

- Bez nowych kart (ADR 0021 4c). Pełny B0 tylko na jawną komendę (ADR 0018).
- Zmiana `playerView` = ryzyko golden-mastera i fingerprinta → zawsze `npm test` cały.
- core bez przypadków specjalnych od nazwy/ID karty (ADR 0002): naprawa w warstwie
  widoku/wyceny, nie przez whitelisty kart.
- Każdy commit pushowany od razu (ADR 0020 C/D); nigdy `--force`; przed pushem `git fetch`
  + porównanie `HEAD..FETCH_HEAD`.
- Komunikaty commitów przez plik poza repo, polskie znaki przez `python3` + `pathlib`.
