# PLAN 2026-09-09c — sesja arena/01a08788: audyt PR #109 + pętla jakości

Sesja: `arena/01a08788-mtg` (1 sesja = 1 gałąź = 1 PR, ADR 0013/0020).
Tryb obowiązkowy: ADR 0020 (PR → audyt → inkrementalne commity → tylko
przyrostowo). Prompt „Kontynuujemy projekt" bez nazwanego tematu = pętla
domyślna ADR 0021: audyt poprzedniego scalonego PR + pętla jakości.

## Rozpoznanie (stan na start, zmierzone)

- `main` = `f66bccd` („Sesja arena/01a08691: audyt PR #108 + pętla jakości
  (#109)"); ostatni scalony PR = **#109** (37 plików, scalony 2026-09-09).
- Handoff: `docs/setup/HANDOFF_2026-09-09.md` — opisuje sesję #109 (A4+B5+B7).
  Sesja #109 scalona — sprawdzić, czy domknęła WŁASNĄ dokumentację (wada
  F-B2/1 z audytu #108: poprzednicy nie domykali; tu handoff istnieje).
- Lektura startowa wykonana w całości: AGENTS.md, wszystkie ADR-y (0020 i
  pozostałe, w tym 0002/0005/0010/0013/0016/0021/0022/0029/0030), LESSONS.md
  (L1–L141, linie 1–2333), ENVIRONMENT.md, diff PR #109, handoff 09-09.
- PR #110 (arena/01a0873b, ten sam tytuł) CLOSED — nie w `main`, poza audytem;
  odnotowane, żeby nie mylić z bieżącą gałęzią.

## Etapy

### C1. Rozpoznanie + plan + PR na starcie — [X]
Kryterium: PR istnieje na GitHubie (ADR 0020 A), plan commity i wypchnięty
PRZED kodowaniem. Rozpoznanie + ten plik = pierwszy commit.

### C2. Audyt PR #109 (ADR 0020 B / ADR 0016) — [X]
Przegląd KAŻDEGO zmienionego pliku PR #109 (37 plików; `gh pr diff 109`).
Rdzeń audytu — kod źródłowy i reguły:
- `src/engine/objects.js`: LKI niesie `faceDownCause` (G1 rozjazd manifest vs
  morph) — czy `rememberLastKnownObject` to jedyny producent LKI i czy pole
  dochodzi do widoku/logu przez LKI (L21 — cztery warstwy);
- `src/engine/effects.js`: `manifest_dread_required` niesie `sourceCardId`
  (G1) — czy konsument (session.js `srcName(e)`) czyta to pole i czy zdarzenie
  nie wycieka nazwy źródła przy FoW (L99/L137);
- `src/engine/game-state.js`: (a) A4-1 madness `restorePriorityTo =
  pending.restorePriorityTo ?? …` (CR 117.3b) — poprawność i brak regresji
  ścieżki zwykłej; (b) zmiana komentarza w `playerView` („Aura:" zamiast
  „zaczarowana:") — czysto dokumentacyjna? potwierdzić, że żaden kod nie
  zależał od tekstu komentarza;
- `src/controllers/heuristic-bot.js` (A4-4): `reveal_top_to_bottom_order` w
  `DECK_ARRANGING_EFFECTS` (Slabs); `isDrawOnly → score=-1` (czary czysto
  doborowe startują jak czysto-utylitarne); wycena `draw_cards` zależy od
  kontrolera odbiorcy (applyTo 'target') — ADR 0002 (generycznie po polu,
  bez nazwy karty), skutek dla bota i remisów (L117), golden-master;
- `src/cards/card-data.js`: usunięty `fabricate` z keywords Glint-Sleeve
  Artisan (G3 — dubel opisu) — czy keywords nie jest czytane gdzie indziej;
- `src/table/counter-labels.js` (NOWY): `COUNTER_LABELS` wyciągnięte z
  render.js do wspólnego modułu — czy render.js i session.js czytają ten sam
  słownik, czy strażnik M126 (`card-sources-guard`) czyta nowy plik, komplet
  map (każdy licznik z bazy ma wpis — L29/L31);
- `src/table/render.js`: etykiety `attach_aura`, `buff_land_creatures`,
  DYNAMIC_PT („wartość many"), badge „Aura:/Equipment:", `cardInfo.spell`
  restrykcja stref (G2/Membrane — osad czaru aury tylko na stosie/wygnaniu) —
  czy nie gubi legalnego opisu przygody na kaflach w grze; trigger clause
  `card_put_into_graveyard_from_nonbattlefield` (Disa);
- `src/table/session.js`: `manaEffectLabel` („bezbarwne"), matrix buffa
  viewer-relative (G1/Marauder), `manifest_dread_required` przez `srcName`,
  `satyr_look_resolved` 3 fakty (G3/Prowler), „wartość many" clash, log
  liczników przez `counterLabelGen`, shield bez angielskiego nawiasu,
  untap „liczników ogłuszenia";
- `tools/table-tester/detectors.mjs`: nowy detektor `detectTileRawSlug` +
  `TILE_LINE`/`TILE_SNAKE` (G2/Membrane) — podpięty w `runDetectors`, bez
  fałszywych alarmów (kalibracja G1–G4), strażnik zweryfikowany mutacyjnie.
Weryfikacja reguł MtG wobec Oracle/CR (ADR 0030) tylko tam, gdzie zmiana ma
znaczenie regułowe — tu większość to warstwa językowa/prezentacji.
Kryterium: `docs/audits/AUDYT_PR109_2026-09-09.md` z rejestrem finding→commit;
wynik w opisie PR; `npm test` + `npm run build` zielone. Bez pełnego B0
(ADR 0018); dopuszczalne `node --test test/bot-benchmark.test.js`.

### C3. Pętla jakości (ADR 0021) — wg znalezisk audytu i otwartych uwag
Po audycie, jeśli nie ma znalezisk wymagających fixu — kierunek według
otwartego stanu (backlog/handoff), bez nowego batcha kart (ADR 0029).

## Ryzyka i pułapki (ENVIRONMENT §2, LESSONS)

- Przebudowa workspace (zrzut) — commituj+pushuj po każdym zielonym kroku;
  przed pushem `git log -3` + porównanie HEAD..FETCH_HEAD (ADR 0020 D, bez
  force). Gałąź sesji jeszcze nie istnieje na origin — pierwszy push tworzy
  ją (bezpieczne, brak historii do nadpisania).
- Równoległe edity tego samego pliku gubią treść (handoff #109 pułapka 1) —
  bez edycji równoległych tych samych plików; skryptowe cięcie tylko z
  asercjami `count()==1` i `node --check` przed `git add` (L139).
- Polskie znaki w edycji — przez `python3`/`write_file`, nie `edit_file`, gdy
  plik z polskim tekstem; bajty cytowań weryfikować.
- Lektura/budżet — `test/dokumentacja-budzet-lektury.test.js`; nie rozrastać
  LESSONS/ADR bez potrzeby.
