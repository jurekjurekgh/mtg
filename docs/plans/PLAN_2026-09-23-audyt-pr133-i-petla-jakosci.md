# PLAN 2026-09-23 — audyt scalonego PR #133 + pętla jakości (ADR 0020 B / ADR 0021)

- **Sesja:** 2026-09-23, gałąź `arena/01a0ceb4-mtg`, PR sesji tworzony na starcie (ADR 0020 A).
- **Baza:** `main` = `5dfde0c` (squash PR #133, scalony 2026-09-23T14:39:01Z).
- **Zakres obowiązkowy:** audyt PR #133 (ADR 0020 B / ADR 0016) — zanim ruszy nowe kodowanie.

## 0. Rozpoznanie (stan zmierzony na starcie sesji)

| Pomiar | Wynik |
|---|---|
| `node tools/run-tests.mjs all` (baza) | **6180/6180**, 0 fail (~374 s) |
| README „Bieżący stan" (po PR #133) | szybki rdzeń 6166/6166, artefakt 59 modułów / 4041,4 kB, ostatni milestone **M412** |
| Zakres PR #133 (`351126a..5dfde0c`) | **58 plików, +5279/−232** (rodzina M404–M412) |
| Benchmark w PR #133 | `--quick` 672 mecze; heuristic 86,6% (M410), bez pełnego B0 (ADR 0018) |
| Katalog kart | **0 nowych kart** (ADR 0029) |

Rozpoznanie wstępne (przed raportem) wykazało już dwie pozycje do domknięcia w audycie:
`src/engine/permanents.js:1304` nadal resetuje **dawne** pole `cantBeBlocked`,
a pin `test/m380-restrykcje-bloku-jedno-zrodlo.test.js` podaje w scenariuszu
„unblockable" **stare** pole (po zmianie M407 = scenariusz pusty — do potwierdzenia mutacją).

## 1. Etapy audytu PR #133 (kolejność i kryteria ukończenia)

- [x] **A1. Engine — przegląd każdej zmienionej ścieżki** (`src/engine/*`,
      `src/table/*`): reguły, stan, FoW, determinizm; zgodność z CR (cytaty
      źródłowe, ADR 0030) i ADR 0002 (zero gałęzi po nazwie/ID karty).
      Kryterium: każdy plik z diffu ma werdykt (OK / znalezisko F-n / notka Z-n).
- [x] **A2. Rename `cantBeBlocked` → `cantBeBlockedUntilTurn` (M407)** — czy
      wszystkie czytniki/zapisy i fixture'y testowe mówią nowym językiem;
      kryterium: mutacja strażnika bloku czerwieni co najmniej jeden test
      (obecnie: brak — do naprawy pinem), `permanents.js` bez martwego pola.
- [x] **A3. Bot (heuristic) — 799 linii diffu**: nowe wyceny (`blockExchangeOf`
      CR 510.4/702.7b, `cantBeBlockedTargetValue`, `crewValue`, trucizna jako
      drugi zegar, `tapTimingBonus`/lock-untap, pip w triggerze) — zgodność
      z CR, brak wyceny „przebijalnej" karą jak w L3, WHITELISTY ze strażnikiem.
- [x] **A4. Karty w batchu M407/M412** — zgodność definicji z Oracle/Snapshot
      Scryfall (Shiva FIN #58: „Target creature", nie `creature_you_control`;
      Dead Ringers `targetWord: 0`; kalibracja talii G).
- [x] **A5. Testy** — czy nowe pliki pinów mierzą to, co deklarują (RED→GREEN,
      L13/L159): mutacje per gałąź dla nowych bramek; brak pinów martwych.
- [~] **A6. Raport** `docs/audits/AUDYT_PR133_2026-09-23.md` + wpis w opisie PR
      sesji; naprawy znalezisk F-n OSOBNYMI commitami (ADR 0020 C).

### Stan audytu (2026-09-23) — ETAP A ZAMKNIĘTY

Raport: `docs/audits/AUDYT_PR133_2026-09-23.md` — werdykt **APPROVE** (bramy PR
odtworzone: `run-tests all` 6180/6180, build 59 / 4048,4 kB). Znaleziska
naprawione osobnymi, zielonymi commitami:

- **F-1** + **F-3** — `a0b5f68` (cleanup bez emerytowanej flagi; pin `fingerprint`
  na `cantBeBlockedUntilTurn`),
- **F-2** — `f2bc1ae` (scenariusz `m380` na nowym polu + pin absolutny **M380/E**;
  mutacja czytnika w `combat.js` czerwieni pin),
- **F-4** — `a6ab5f9` (`cantBeBlockedTargetValue` liczy moc efektywną; pin **F/8**
  w pliku M407 — RED przy sumie `power + grantedPower`, GREEN po naprawie).

Bramy po naprawach: `run-tests all` **6182/6182** (0 fail, ~372 s), `npm test` **6172/6172**, build **59 / 4048,9 kB**.
Notki do pętli (etap B): **Z-1** (podwójne liczenie bonusów w trzech miejscach
sprzed PR), **Z-2** (klauzula `bestow == null` bez pinu).

## 2. Etapy pętli jakości (ADR 0021, po audycie)

- [ ] **B1. Żywy Tester** (`npm run build` + `tools/table-tester`): partia
      domyślna (seedy z nowego zakresu) + ręczna lektura transkryptów (L27),
      każda klasa znaleziona ręcznie → detektor albo pin.
- [ ] **B2. Łowy CR** ścieżką inną niż poprzednia sesja (kolejka z handoffu:
      CR 704.5* tabele SBA, CR 603.8 may-triggery, 509.4 banding) — każdy
      claim z dosłownym cytatem źródła (ADR 0030); znaleziska naprawiane
      u root cause z pinem i mutacją.
- [ ] **B3. Higiena**: budżet lektury (`test/dokumentacja-budzet-lektury.test.js`),
      analizator kontraktów (`tools/event-contract-audit.mjs` w `npm test`).

## 3. Bramy i domknięcie sesji

- Po każdym zielonym kroku: `npm test` + `npm run build` → commit + push (ADR 0020 C).
- Bramy końcowe: `node tools/run-tests.mjs all`, `npm run build`,
  `node --test test/bot-benchmark.test.js`; pełne B0 tylko na komendę (ADR 0018).
- Domknięcie: `docs/audits/AUDYT_PR133_2026-09-23.md`, milestone w
  `docs/ENGINE_MILESTONES.md`, `docs/PROJECT_HISTORY.md`, handoff
  `docs/setup/HANDOFF_2026-09-23.md`, aktualizacja opisu PR (kumulatywnie).

## 4. Ryzyka i pułapki (znane z rejestru)

- **L136/ENVIRONMENT §2:** `git status` przed każdym `checkout`/`restore`; kopie
  plików do `/tmp` przed mutacjami; jeden finding = jeden commit = push.
- **L159:** mutacja musi się WYKONAĆ (dokładny blok, `git diff` po próbie);
  zielona mutacja to pytanie „czy droga była wykonywana".
- **L21:** fixture'y buduj realną drogą (`setupCardMatch`/`putCard`), nie
  własnym helperem — inaczej pole zniknie po cichu.
- **L143:** numer CR sprawdzaj w aktualnej treści, nie z pamięci.
- **Budżet lektury** (~95,8k/100k): nowy wpis lekcji płaci się skróceniem innego.
- **`sh`-safety:** polecenia przez `bash`, polskie pliki edytowane `python3`.
