# Handoff 2026-09-17d-m374 — domknięcie OTWARTEGO znaleziska L48 z E7 (grant lądu w płatności, M374)

PR: [#125](https://github.com/jurekjurekgh/mtg/pull/125) (scalony) → PR #127 (ta dokumentacja; **zamknięty bez scalania**) · gałąź `arena/01a0ae26-mtg`.

> **Uwaga o nazwie pliku:** handoff powstał jako `HANDOFF_2026-09-17d.md`; tę nazwę
> zajmuje handoff sesji #126 (audyt #125 + pętla jakości), więc dokument zaległego
> PR #127 wcielono tu pod nazwą z sufiksem (konwencja repo dopuszcza sufiks opisowy,
> np. `HANDOFF_2026-08-12-m80.md`). Treść bez zmian merytorycznych; odsyłacze
> w README, milestone M374 i wpisie historii wskazują ten plik.

Plan: [`docs/plans/PLAN_2026-09-17d-l48-grant-w-pipach.md`](../plans/PLAN_2026-09-17d-l48-grant-w-pipach.md) (F1–F4, wszystkie `[x]`).
Poprzedni handoff: [`docs/setup/HANDOFF_2026-09-17c.md`](HANDOFF_2026-09-17c.md) (znaleziska A–J; sekcja „Pomiary" niosła to znalezisko jako OTWARTE).
Zlecenie właściciela (2026-09-17d): „Pociągnij ten otwarty błąd z handoffu klasy l48".

## Znalezisko (z E7) i root cause

Mecz `random(wiedzmin-bg) vs heuristic(tarkir-wur)`, seed 2039 — harness
przerwał quick-25 na 2400/5952 komunikatem `illegal_spell: Niewystarczająca
mana`. Powtórka „sąsiednich" seedów tej pary nie odtwarzała błędu, bo harness
dobiera pary/seedy deterministycznie w innym miejscu macierzy.

Sonda (kopia pętli `runSimulation`, która po odrzuceniu NIE rzuca, tylko
zapisuje komendę i widok) odtworzyła błąd w **0,4 s**: komenda
`cast_spell` Vandalize {4}{R} (tryb „Zniszcz ląd", `modeIndex 1`), a
`playerView` w chwili błędu oferował **7 wariantów** tego rzutu — silnik
odrzucał komendę z własnej oferty (klasa L48).

Rozbiór stanu: p2 miał Górę z **Nature's Embrace** p1 („{T}: Add two mana of
any one color", `grantMana.amount = 2`), 2 Równiny, Wyspę i **Jeskai Devotee**
(`{1},{T}: Add {U}{R}{W}`). `producibleMana` = 5 (grant liczony jako 2), ale
`planGrantManaColors` zwracał `[]` — grant „zużyty" finansowaniem źródła
kosztowego — więc **faza PIPÓW** tapowała Górę z `grantColor: null`, czyli
**za 1**. Suma płatności 4 < 5 → `spendMana` rzucał „Niewystarczająca mana",
a że bramka sumy stała PO fazie pipów, odrzucona komenda zostawiała ślad:
tapniętą Górę i `{R}` w puli (CR 601.2h).

## Naprawa (`55e0461`, `src/engine/resources.js`)

1. **Grant w pipach** — ląd z grantem, którego płatność dotyka, produkuje CAŁY
   grant: bez wiersza planu kolor bierze `firstUncoveredPipColor` (ten sam
   wybór co auto-tap sumy i blok naprawy seeda 2027/L147), a warunek wejścia
   zna grant (`grantColor == null`, nie `!plannedGrant`).
2. **Atomowość** — bramka sumy przeniesiona PRZED pierwszą mutację płatności:
   nieudana płatność nie tapnie źródła ani nie wpłaci many do puli.

## Piny i mutacje (M374)

`test/m374-l48-grant-w-pipach.test.js` (4, fikstura z repro: Góra z grantem,
2 Równiny, Wyspa, Jeskai Devotee, Vandalize w ręce):

- **M374/1** grant w pipach = pełny grant (zdarzenie `mana_produced`
  `amount: 2`, `grantMana: true`, kolor = kolor pipa; pula rozliczona do zera)
  + dowód triggera: `planGrantManaColors(...)` = `[]`;
- **M374/2** atomowość — nieopłacalna płatność nie zostawia śladu;
- **M374/3** kontrola negatywna bez aury (4 many → brak oferty);
- **M374/4** KAŻDA pozycja oferty tego rzutu jest wykonywalna (klasa L48).

Mutacje: `grantColor = plannedGrant` → **M374/1 i M374/4 RED**; wyłączona
bramka atomowości → **M374/2 i M374/3 RED**.

## Bramki i pomiary (head sesji)

- `npm test` — **5723/5723** (4 nowe piny wliczone),
- `npm run test:all` — **5733/5733** (pełny tier; golden-master bit w bit,
  progi regresji bota zielone),
- `npm run build` — **64 moduły / 3810,4 kB**,
- **quick-25** (`--quick --self --seeds 16 --decks <25 nazw> --progress 400`,
  komenda DOKŁADNIE z E7) — **ukończony: 5 952/5 952 meczów**, 0 niedokończonych,
  0 zgłoszeń harnessu, 1 269 s (~213 ms/mecz). Poprzednio: PRZERWANY na
  2400/5952 (`illegal_spell`, seed 2039).
  - heuristic **87,0%** (5178/5952), aggro 23,7% (705/2976), random 2,3% (69/2976),
  - pary botów: `heuristic | random` 97,7% / `heuristic | aggro` 76,3%,
  - próbka: 93 z 325 par talii (seedy 2026–2041, `seedBase` 2026) — ta sama
    komenda co E7 ⇒ ten sam kształt macierzy; porównania z quick-6 (84,1%)
    i batch-56 (86,0%) dotyczą innych próbek, więc nie są 1:1.
- Pełne B0 wyłącznie na wyraźną komendę właściciela (ADR 0018).

## Rejestr lekcji

Nowa **L149** (grant lądu = jeden rachunek oferty i płatności; bramka sumy
przed pierwszą mutacją). Przy okazji narracja **L48 (B7)**, **L54**, **L91**,
**L108** i **L125** została wyniesiona do `docs/LESSONS_PRZYPADKI.md` (rejestr
przycięty, nie usunięty) — budżet lektury 100k wraca z zapasem (99 696/100 000).

## Co dalej (punkt zaczepienia dla następnej sesji)

- **Właściciel scala PR #125** (squash) — agent nie scala (ADR 0007/0020).
- Znalezisk otwartych z pomiarów **brak**; przy kolejnych pomiarach quick-25
  używać tej samej komendy (kształt macierzy zależy od `--seeds`/`--decks`).
- Kolejne zlecenia: nowy batch kart wyłącznie z listy właściciela (ADR 0029),
  `supported` = 100% Oracle albo `unsupported` (ADR 0022).
