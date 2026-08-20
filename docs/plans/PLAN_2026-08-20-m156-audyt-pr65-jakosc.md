# PLAN M156 — Audyt PR #65 + pętla jakości (2026-08-20)

## Kontekst startu

- Prompt startowy bez nazwanego tematu → **ADR 0021**: pętla domyślna, bez
  pytania właściciela o kolejkę i bez nowego batcha kart z inwencji sesji.
- Ostatni scalony PR: **#65** (squash `1a5accc`, 2026-08-20) — zawiera
  M147 (audyt PR #64 + Batch 37), Batch 38, M148–M155 oraz audyt Żywym
  Testerem Batch 38 (10 znalezisk Z1–Z10, wszystkie naprawione).
- Katalog: karty Batch 37/38 dodane; talie uaktualnione.

## Etapy (kryteria ukończenia)

1. **PR na start (ADR 0020 A).** Gałąź `arena/01a01eb3-mtg` wypchnięta,
   PR otwarty po pierwszym commicie (plan). — *kryterium: PR istnieje na GitHubie*
2. **Baseline.** (done: npm test 2431/2431, build 51/2071.3 kB, benchmark 9/9) `npm test` + `npm run build` + `node --test test/bot-benchmark.test.js`
   na `main`; wynik porównany z PROJECT_STATE (spodziewane ~2428+ testów,
   build ~51 modułów / ~2 MB). — *kryterium: zielono, liczby zanotowane*
3. **Audyt PR #65 (ADR 0020 B / 0016).** Przegląd diffu `c536182..1a5accc`:
   - engine (reguły, stan, FoW, determinizm) — M148 scry order, M149 bot/UI,
     M150, M153 station/blokowanie/day-night, M155 craft no-op;
   - karty Batch 37/38 vs Oracle (Scryfall przez fetch_page, ADR 0010 §2a);
   - mechaniki generyczne (ADR 0002 — brak specjalnych przypadków po nazwie);
   - testy RED→GREEN na próbce.
   Raport: `docs/audits/AUDYT_PR65_2026-08-20.md`. Znalezione błędy naprawiam
   od razu u root cause. — *kryterium: raport + (jeśli były) fixy zielone* (raport: docs/audits/AUDYT_PR65_2026-08-20.md — znaleziska F1–F4, D1)
4. **Zaległość dokumentacyjna PR #65.** `docs/PROJECT_STATE.md` nie ma wpisów
   M147–M155; nie ma handoffu po PR #65. Uzupełniam zwięzłe wpisy stanu
   (bez rekonstrukcji szczegółów — źródłem są opisy commitów squash `1a5accc`
   i plany M147–M155). — *kryterium: PROJECT_STATE odzwierciedla stan main*
5. **Pętla jakości (ADR 0021 pkt 4).** W miarę budżetu sesji:
   (a) audyt Żywym Testerem innej osi niż poprzednia sesja, albo
   (b) polowanie na niezgodności z CR (odznaka) ścieżkami innymi niż poprzednio.
   Każde znalezisko: repro → fix root cause → test regresyjny → commit. —
   *kryterium: każdy fix zielony, push po każdym kroku*

## Kolejność commitów (plan)

1. Plan sesji (ten plik).
2. Raport audytu PR #65 (+ ewentualne fixy osobno, każdy zielony).
3. Aktualizacja PROJECT_STATE (może być ostatni commit funkcjonalny + docs).
4. Fixy z pętli jakości — osobne commity.

## Ryzyka / pułapki

- **Płytki klona** (`--depth 1`): diff PR #65 wymaga `git fetch --depth=2`
  (zrobione; rodzic = `c536182`).
- **`edit_file` psuje polskie znaki** → edycje przez `python3`+`pathlib`
  (ENVIRONMENT §4).
- **GH_TOKEN może wygasnąć** → push retry, bez proszenia o token w czacie.
- **Dziwny artefakt FS**: `docs/audits/AUDIT_BATCH38_ZYWTESTER_2026-08-20.md`
  widoczny w `ls`, ale `stat`/`cat` z bash nie znajdują go (python3 czyta OK)
  — do zbadania przy okazji; nie blokuje audytu.
- **Benchmark pełny B0 tylko na komendę właściciela** (ADR 0018) — używam
  wyłącznie próbki regresji.
- Nowe typy efektów z Batch 37/38 → sprawdzić wyceny w heuristic-bocie (L50)
  — część zrobił audyt Z3/Z4/Z9/Z10; weryfikuję pozostałe.

## Podsumowanie wykonania

(do uzupełnienia na końcu sesji)
