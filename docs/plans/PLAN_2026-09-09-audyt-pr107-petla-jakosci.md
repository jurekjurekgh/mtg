# PLAN 2026-09-09 — sesja arena/01a08611: audyt PR #107 + pętla jakości

Sesja: `arena/01a08611-mtg` (1 sesja = 1 gałąź = 1 PR, ADR 0013/0020).
Tryb obowiązkowy: ADR 0020 (PR → audyt → inkrementalne commity → tylko
przyrostowo). Prompt „kontynuujemy projekt" bez nazwanego tematu = pętla
domyślna ADR 0021: audyt poprzedniego scalonego PR + pętla jakości.

## Rozpoznanie (stan na start, zmierzone)

- `main` = `6e67895` („Sesja arena/01a08274: audyt PR #106 + pętla jakości (#107)");
  ostatni scalony PR = **#107** (122 pliki, +1566/−239, scalony 2026-09-08 19:19 UTC).
- Brak otwartych PR. Handoff: `docs/setup/HANDOFF_2026-09-08k.md`.
- **Baseline:** `npm test` (fast) = **4993/4993 pass, 0 fail** (~3 min);
  `npm run build` = **60 modułów, 3438.3 kB**.
  Rozjazd z handoffem 09-08k („fast 4965/4965, build 3433.2 kB") — do
  wyjaśnienia w etapie A2 (prawdopodobnie commity P4/P5 po pomiarze;
  potwierdzić, że to przyrost testów, a nie regresja środowiska).

## Etapy

### A1. Rozpoznanie + plan + PR na starcie — [X]
Kryterium: PR istnieje na GitHubie (ADR 0020 A), plan commity i wypchnięty
PRZED kodowaniem. Rozpoznanie + ten plik = pierwszy commit.

### A2. Audyt PR #107 (ADR 0020 B / ADR 0016) — [ ]
Przedgląd KAŻDEGO zmienionego pliku PR #107:
- **engine/reguły:** D (okno odpowiedzi po deklaracji ataku, CR 508.2) i
  „naprawa 170 testów" — czy zmiana jest zgodna z CR i nie regresuje
  istniejących zachowań; E (etykieta rzutu z wygnania) — bez zmian reguł?
- **batch #106 (10 kart 599–608 + Animator + wspólny wybór odrzucenia):**
  zgodność z Oracle (snapshotty `docs/cards/scryfall-*.json`), generyczność
  mechanik (ADR 0002), `limitations`/`notes` wg ADR 0022;
- **fixy z audytu #106 (P2–P3, F1–F5):** czy weszły u root cause, czy testy
  są weryfikowane mutacyjnie (L13) — nie tylko zielone;
- **pętla jakości (A–E, B54):** etykiety, wyceny bota (B, C), okno 508.2 (D);
- **spójność:** `git log` commity vs opis PR; liczby testów (rozjazd 4965→4993);
  README/`PROJECT_HISTORY`/handoff zgodne ze stanem.
- **CR tylko ze źródeł pobranych w tej sesji** (ADR 0030) — gdy audyt
  wymaga twierdzenia regułowego.
Kryterium: `docs/audits/AUDYT_PR107_2026-09-09.md` z rejestrem finding→commit;
wynik w opisie PR; `npm test` zielone. **Bez pełnego B0** (ADR 0018).

### A3. Fixy findings audytu — [ ]
Każdy finding: repro → naprawa u root cause (ADR 0002) → test + mutacja
(L13) → OSOBNY commit + push.

### A4. Pętla jakości — otwarte itemy z handoffu 09-08k — [ ]
„Jawnie NIE robione" (kolejność wg ryzyka):
1. madness + batch-discard ×3 (interakcja mechanik),
2. Vandalize vs aura-regen (obrona przed zniszczeniem),
3. drugi atakujący przy PW (protection/planeswalker — rozdział atakujących),
4. triage Slabs / Inspiration (pre-existing z sesji #106 — potwierdzić lub
   zamknąć).
Dla każdego: sonda silnika → werdykt → fix u root cause + test LUB uzasadnione
zamknięcie. Osobny commit per item.

### A5. Żywy Tester (docs/setup/TESTER_STOLU.md) — [ ]
`npm run build` → `npm i` w `tools/table-tester` → partie (w tym na talie z
nowych mechanik); czytać transkrypty ręcznie wzdłuż 3 osi; znaleziska →
root cause + detektory (L27/L13). Braki narzędzia naprawiać w testerze (L12).
Kryterium: ≥ kilka partii, `== DETEKTORY ==` bez alarmów LUB alarmy naprawione;
`npm test` zielone.

### A6. Domknięcie sesji — [ ]
- profil SZYBKI `node tools/benchmark.mjs` (bez `--full`, ADR 0018) —
  wynik w opisie PR (bez podnoszenia progów);
- opis PR zaktualizowany kumulatywnie (rejestr finding→commit);
- `docs/PROJECT_HISTORY.md` + `docs/setup/HANDOFF_2026-09-09.md`;
- `npm run test:all` (brama PR) + `npm run build` zielone; drzewo czyste.

## Ryzyka / pułapki (z LESSONS i ENVIRONMENT)

- **reset workspace** (ENVIRONMENT §2): commit+push po KAŻDYM zielonym kroku;
  przed resetem sprawdzać drzewo; nigdy force push (ADR 0020 D).
- **dwa edity tego samego pliku w jednej turze gubią drugi** (handoff 09-08k,
  P3/F1) — po edycji `git diff` całego pliku.
- `edit_file` a polskie znaki → `python3` z `encoding='utf-8'` (ENVIRONMENT §4).
- Żywy Tester ładuje `dist/`, nie `src/` — build po każdej zmianie (L76).
- „Testy zielone" ≠ dowód (L13/L61) — mutacja obowiązkowa przy fixach.
- Komisy z CR z pamięci zakazane (ADR 0030); brak sieci → odkładam z adnotacją.
- Backlog NIE jest kolejką (ADR 0021): bez listy właściciela brak nowych kart.

## Planowane commity (kolejność)

1. `Plan sesji: audyt PR #107 + pętla jakości` (ten plik)
2. `Audyt PR #107: …` (pliki audytu + opis PR; bez fixów)
3..N. fixy per finding / per item A4 / per znalezisko A5
ostatni. `Domknięcie: handoff + PROJECT_HISTORY + opis PR` (dokumentacja,
dołączana do ostatniego commitu funkcjonalnego — ADR 0020 C wyjątek)

## Podsumowanie wykonania

_(dopisane na końcu sesji)_
