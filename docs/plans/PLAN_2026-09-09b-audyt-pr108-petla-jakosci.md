# PLAN 2026-09-09b — sesja arena/01a08691: audyt PR #108 + pętla jakości

Sesja: `arena/01a08691-mtg` (1 sesja = 1 gałąź = 1 PR, ADR 0013/0020).
Tryb obowiązkowy: ADR 0020 (PR → audyt → inkrementalne commity → tylko
przyrostowo). Prompt „kontynuujemy projekt" bez nazwanego tematu = pętla
domyślna ADR 0021: audyt poprzedniego scalonego PR + pętla jakości.

## Rozpoznanie (stan na start, zmierzone)

- `main` = `0b814ed` („Sesja arena/01a08611: audyt PR #107 + pętla jakości (#108)");
  ostatni scalony PR = **#108** (4 pliki, scalony 2026-09-09 14:23 UTC).
- Handoff: `docs/setup/HANDOFF_2026-09-08k.md` — opisuje sesję #107 (P2→P5);
  sesja #108 **nie zostawiła handoffu ani wpisu w PROJECT_HISTORY** (do
  odnotowania w audycie jako finding procesowy, nie do „naprawiania" wstecz
  poza rejestrem).
- Lektura startowa wykonana w całości: AGENTS.md, wszystkie ADR-y (29 plików),
  LESSONS.md (L1–L141, linie 1–2333), ENVIRONMENT.md, diff PR #108, handoff 08k.
- Baseline (do przemierzenia w B2): `npm test` + `npm run build`.

## Etapy

### B1. Rozpoznanie + plan + PR na starcie — [X]
Kryterium: PR istnieje na GitHubie (ADR 0020 A), plan commity i wypchnięty
PRZED kodowaniem. Rozpoznanie + ten plik = pierwszy commit.

### B2. Audyt PR #108 (ADR 0020 B / ADR 0016) — [ ]
Przegląd KAŻDEGO zmienionego pliku PR #108 (4 pliki):
- **engine/reguły:** brak zmian w `src/engine` — potwierdzić grepem, że PR #108
  nie ruszył silnika ani bota (tylko `src/table/render.js` — etykiety F-A2/1);
- **fix F-A2/1:** „tap" → „zatapnij" ×3 w `describeEffect` — czy forma zgodna
  z poświadczoną stroną untap („odkręć", B54/F1); czy REGEX `RAW_TAP` w teście
  nie ma fałszywych trafień (polskie znaki, L-uwaga w komentarzu testu);
  weryfikacja RED→GREEN mutacją (L13);
- **dokumenty:** AUDYT_PR107 (czy §6 ma wypełnione hashe — w diffie placeholder
  „hash po lądowaniu"; czy F-A2/2 — dopisek A–E w HISTORY + HANDOFF_2026-09-09 —
  wylądował: w diffie go NIE MA), plan sesji #108 (checkboxy A2–A6 niezaznaczone
  w wersji scalonej), brak aktualizacji opisu PR #108 (sekcja „Komity" pusta);
- **spójność liczb:** baseline audytu (fast 4993, build 3438,3 kB) vs mój pomiar.
Kryterium: `docs/audits/AUDYT_PR108_2026-09-09.md` z rejestrem finding→commit;
wynik w opisie PR; `npm test` zielone. **Bez pełnego B0** (ADR 0018).

### B3. Fixy findings audytu — [ ]
Każdy finding: repro → naprawa u root cause (ADR 0002) → test + mutacja
(L13) → OSOBNY commit + push. Znaleziska dokumentacyjne (placeholdery,
brak handoffu sesji #108) zamykam rejestrem w moim audycie + własnym
domknięciem (B6), nie edycją historii.

### B4. Pętla jakości — otwarte itemy z handoffu 09-08k — [ ]
„Jawnie NIE robione" (kolejność wg ryzyka):
1. madness + batch-discard ×3 (interakcja mechanik),
2. Vandalize vs aura-regen (obrona przed zniszczeniem),
3. drugi atakujący przy PW (składnia `player_or_planeswalker` otestowana,
   brak kart PW — zakres: składnia + decyzja, nie karty),
4. triage Slabs / Inspiration (wycena Stomping Slabs — singleton reveal;
   Inspiration w przeciwnika — draw_cards ignoruje odbiorcę).
Dla każdego: sonda silnika → werdykt → fix u root cause + test LUB uzasadnione
zamknięcie. Osobny commit per item. CR wyłącznie ze źródeł pobranych w tej
sesji (ADR 0030) przy każdym twierdzeniu regułowym.

### B5. Żywy Tester (docs/setup/TESTER_STOLU.md) — [ ]
`npm run build` → `npm i` w `tools/table-tester` → partie (w tym na talie z
nowych mechanik); czytać transkrypty ręcznie wzdłuż 3 osi; znaleziska →
root cause + detektory (L27/L13). Braki narzędzia naprawiać w testerze (L12).
Kryterium: ≥ kilka partii, `== DETEKTORY ==` bez alarmów LUB alarmy naprawione;
`npm test` zielone.

### B6. Domknięcie sesji — [ ]
- profil SZYBKI `node tools/benchmark.mjs` (bez `--full`, ADR 0018) —
  wynik w opisie PR (bez podnoszenia progów);
- opis PR zaktualizowany kumulatywnie (rejestr finding→commit);
- `docs/PROJECT_HISTORY.md` + `docs/setup/HANDOFF_2026-09-09b.md`;
- checkboxy tego planu zaznaczone; liczby README odświeżone na końcu (L92);
- `npm run test:all` (brama PR) + `npm run build` zielone; drzewo czyste.

## Ryzyka / pułapki (z LESSONS i ENVIRONMENT)

- **reset workspace** (ENVIRONMENT §2): commit+push po KAŻDYM zielonym kroku;
  przed pushem `git log` + `git fetch` + porównanie HEAD/FETCH_HEAD; nigdy
  force push (ADR 0020 D).
- **dwa edity TEGO SAMEGO pliku w jednej turze gubią drugi** (handoff 09-08k,
  P3/F1) — po edycji `git diff` całego pliku.
- `edit_file` a polskie znaki → `python3` z `encoding='utf-8'` (ENVIRONMENT §4).
- Żywy Tester ładuje `dist/`, nie `src/` — build po każdej zmianie (L76).
- „Testy zielone" ≠ dowód (L13/L61) — mutacja obowiązkowa przy fixach.
- Komisy z CR z pamięci zakazane (ADR 0030); brak sieci → odkładam z adnotacją.
- Backlog NIE jest kolejką (ADR 0021): bez listy właściciela brak nowych kart.
- Liczby „bieżącego stanu" na KONIEC sesji (L92).

## Planowane commity (kolejność)

1. `Plan sesji: audyt PR #108 + pętla jakości` (ten plik)
2. `Audyt PR #108: …` (plik audytu + opis PR; bez fixów)
3..N. fixy per finding / per item B4 / per znalezisko B5
ostatni. `Domknięcie: handoff + PROJECT_HISTORY + opis PR` (dokumentacja,
dołączana do ostatniego commitu funkcjonalnego — ADR 0020 C wyjątek)

## Podsumowanie wykonania

_(dopisane na końcu sesji)_
