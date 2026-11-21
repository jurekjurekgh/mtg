# HANDOFF 2026-11-21 (2) — audyt PR #188 + pętla jakości

> Kolejna sesja ADR 0020/0021: audyt scalonego PR #188 + domyślna pętla
> jakości. Kontynuuje `HANDOFF_2026-11-21.md` (tamten: audyt PR #187
> zamknięty, `test:all` zostawiony „w toku" — **ten handoff zamyka
> `test:all`**: 10 828/10 828).

## Zadanie

Właściciel: „Kontynuujemy projekt." — bez nazwanego tematu → tryb domyślny
(ADR 0020): (1) PR na starcie, (2) audyt poprzedniego scalonego PR (#188),
(3) inkrementalne zielone commity, (4) inkrementalnie, bez force-pusha;
jakość wg ADR 0021 — inna ścieżka niż w poprzednich sesjach (poprzednie:
event contract/cr-numery/tie-audit/osi testera; **ta: statyczny skan
kafli + kompletność map kwot + Żywy Tester na świeżych parach**).

## Bramy (zamknięte)

| Bramka | Wynik |
|---|---|
| `npm test` (fast) | **10 546/10 546** (po E2a; baza sesji 10 543, baza #187 `c1324c07` = 10 542) |
| `npm run test:all` | **10 828/10 828, fail 0, skipped 0** (~631 s, `.arena/testall.log`) |
| `npm run build` | **79 modułów / 5 988,7 kB** (5988,7 stabilne; wpis #188 podawał 5988,3 — 0,4 kB różnic rozliczone w audycie jako zaokrąglenie) |
| `node tools/cr-numery.mjs` | OK (563/6857) |
| `node tools/bot-tie-audit.mjs --gry=2` | RC=0 |

## Stan sesji — zamknięte

- **E0** `5d4f4b3` — plan sesji.
- **E1** `1ddf659` — audyt PR #188: `docs/audits/PR188_MAPA_PLIKOW_2026-11-21.md`
  (mapa 7/7) + `docs/audits/AUDYT_PR188_2026-11-21.md` — **0 błędów**
  (zmiana wyłącznie w `DYNAMIC_AMOUNT_NOUNS`, test RED→GREEN przy użyciu
  prawdziwej reguły; 3 mutacje potwierdziły siłę pinów).
- **E2a** `72e8bc8` — `test/surowy-slug-kafel-katalog.test.js`: klasowy
  strażnik „surowy slug w tekście" na **całym rejestrze 726 kart**,
  dwie warstwy (`rulesText`+`describeSpellEffects` oraz `renderTableView`
  ręka/pole), samosprawność detektora + walidacja mutacyjna obu warstw
  (L27, L112, M122).
- **E2b** `663405d` — Żywy Tester: **23 partie**, świeżE pary talii
  (batch 74 poza BENCH + ścieżki nieobjęte benchmarkiem), 6 profili +
  `--tick-rate 0.25`; **wszystkie kończą się naturalnie, DETEKTORY 0,
  NIEWYCENIONE 0, 0 błędów runtime**; ręczna lektura (L27) bez znalezisk;
  triage 5 odrzuć (wszystkie `impatient`, oczekiwane) i potrójnej
  regeneracji Trestle Troll (**poprawna wg CR** — tarcze kumulują się;
  silnik push bezwarunkowy + zdarzenie `regeneration_shield_added`,
  cleanup kasuje na końcu tury, bot −25 za dubel); batch 74 na stole:
  Lambholt/Memorial/Loxodon zagrane i przeczytane, kafle Gylwain/Grollub
  odczytane. Szczegóły: §4a raportu audytu.
- **E3** — `PROJECT_HISTORY` (wpis na dole), ten handoff, PR #189 body.

## Otwarte (kolejna sesja)

1. **PR #189** — gotowy do scalenia przez właściciela (autor nie scala).
2. Karty batcha 74 **Grollub/Arrow Storm/Frilled/Memorial-ability/Saltfield/
   Temur Banner** — nie zagrały w żadnej z moich partii (singleton +
   losowanie; drewonly oferty widziane tam, gdzie karta była w ręce).
   Kolejna sesja może dobrać seedy, jeśli właściciel chce komplet żywego
   pokrycia — albo uznać pokrycie unit/Pin z sesji #187/#186.
3. Profile testerów o niskim pokryciu modalu (`greedy` = 0 modali,
   `random` = 1) — dla modalnych ścieżek używać `defensive`/`hoarder`.
4. `test:all` od tej sesji **odnotowany jako zielony** — następna sesja
   startuje od `10 828` (nie 10 549).

## Wnioski (dopisać do LESSONS przy przeglądzie)

- Statyczny skan kafli MiniEl po całym rejestrze (bez portu do testera)
  łapie klasę „surowy slug" taniej niż partia żywa — utrzymywać jako
  test klasowy przy zmianach `describeEffect`/`renderTableView`.
- `--list-decks` i `BENCH_DECKS` w `tools/benchmark.mjs:108` to jedyne
  źródła prawdy o taliiach — nie zgadywać z README (kolumna „Plany"
  potrafi nie nadążać za jednoplaniowymi taliami).
- Próbkowanie kart singletonowych wymaga wielu seedów — nie mylić
  „nie wylosowane" z „nie zaoferowane" (tutaj: 0 takich przypadków
  po sprawdzeniu ofert w AKCJE).
