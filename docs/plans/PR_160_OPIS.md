# Sesja 2026-10-09 — audyt PR #159 i autoryzowane naprawy R-1–R-5

Gałąź: `arena/18b947ff-mtg` → `main`. PR #159 (audyt poprzedniego PR #158)
scalono 2026-10-09T13:24:50Z. Właściciel po audycie jawnie autoryzował
wyłącznie naprawy R-1–R-5; plan i raport:

- `docs/plans/PLAN_2026-10-09-audyt-pr159.md`
- `docs/audits/AUDYT_PR159_2026-10-09.md`

## Naprawy

- **R-1:** rozdzielono druk `cantBlockPrinted` od tymczasowego efektu
  `cantBlockUntilCleanup`; naprawiono kopiowanie w miejscu, cleanup i
  fingerprint. Regresja obejmuje token Phyrexian Mite → zwykły stwór oraz
  współistnienie druku z niezależnym efektem.
- **R-2:** S9 przypina rzeczywiste aury Bonds of Faith, Clawing Torment i Hobble
  przez `attachAuraToCreature`; sprawdza zakaz na gospodarzu i jego brak na
  kopii Moonlit.
- **R-3:** straż katalog–snapshot asertuje 616 definicji, 561 dopasowanych
  snapshotów, 55 jawnych braków i osierocony `undercity`; porównuje front
  wszystkich 11 DFC i odróżnia 9 top-level `null` od 12 pustych Oracle.
  Reverse-keywords mają jawny zakres oraz osobne mapowania.
- **R-4:** straż pola `plan` rozpoznaje basic landy, tokeny, karty specjalne i
  tyły DFC z potwierdzonym wspieranym przodem.
- **R-5:** skorygowano checklistę S0–S7, metryki obu raportów, plik i
  publikowany opis PR #159, liczby testów i kart, opis B-5 (sześć kart +
  `token_tarmogoyf`) oraz odsyłacz F-3.

## Bramki po naprawach

| Polecenie | Wynik |
|---|---|
| `npm test` | **7923/7923**, EXIT 0 |
| `npm run build` | **73 moduły / 4963,2 kB**, EXIT 0 |
| `node --test test/bot-benchmark.test.js` | **10/10**, EXIT 0 (237,7 s) |
| `node tools/cr-numery.mjs --cr .arena/cr-raw.txt` | **OK** — 518 numerów w tabeli, 517 unikalnych, 5626 cytatów |

Pełny B0 i `node tools/run-tests.mjs all` nie uruchamiano. Po publikacji tego
PR zakres pracy jest zamknięty; nie rozpoczynam nowego zadania bez polecenia
właściciela.
