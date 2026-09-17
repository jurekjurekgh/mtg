# Plan 2026-09-17d — pociągnięcie OTWARTEGO znaleziska L48 z E7 (grant lądu w płatności)

Sesja: kontynuacja PR #125 (`arena/01a0ae26-mtg`), po E7 (M369).
Znalezisko „do pociągnięcia" z `docs/setup/HANDOFF_2026-09-17c.md` (sekcja
„Pomiary") i `docs/ENGINE_MILESTONES.md` (M369/E7): quick-25 przerwany na
2400/5952 komunikatem `illegal_spell: Niewystarczająca mana` — mecz
`random(wiedzmin-bg) vs heuristic(tarkir-wur)`, seed 2039. Powtórka pary przez
61 „sąsiednich" seedów nie odtwarzała, bo harness dobiera pary/seedy
deterministycznie **w innym miejscu macierzy** — punktem zaczepienia było
powtórzenie DOKŁADNIE tej samej komendy i sonda na `playerView`.

## Etapy

| Etap | Zakres | Status | Commit |
| --- | --- | --- | --- |
| F1 | repro + rozbiór (sonda w chwili błędu: komenda, `playerView`, źródła many, plan kolorów, stack rzutu) | `[x]` | sonda poza repo (`/home/user/probes/`) |
| F2 | naprawa u root cause + pin z mutacjami | `[x]` | `55e0461` (M374/1) |
| F3 | pomiar quick-25 (komenda z E7) + bramki (test:all, build) | `[ ]` | — |
| F4 | dokumentacja (M374, historia, handoff 2026-09-17d, lekcja L149, README) + PR | `[ ]` | — |

## F1 — repro i root cause (bez zgadywania)

1. Sonda `probe-l48-repro.mjs`: kopia pętli `runSimulation`, która po odrzuceniu
   NIE rzuca, tylko zapisuje komendę i widok → błąd w 0,4 s, komenda:
   `{type: cast_spell, playerId: p2, objectId: drawn-37 (Vandalize), targets:
   [land-30], modeIndex: 1}`.
2. `probe-l48-offer.mjs`: w chwili błędu `playerView.legalCommands` ma 7 wariantów
   tego rzutu i `execute` odrzuca pierwszy → klasa L48 potwierdzona
   (oferta != płatność), bez „bota" w łańcuchu winy.
3. `probe-l48-sources.mjs`: rozbiór `producibleMana` = 5 → Góra z Nature's
   Embrace (`grantMana.amount = 2`, grant=2) + 3 lądy; `planGrantManaColors`
   = `[]` (grant uznany za zużyty finansowaniem Jeskai Devotee `{1},{T}: Add
   {U}{R}{W}`).
4. `probe-l48-stack.mjs`: stack rzutu → `spendMana` (bramka sumy po fazie
   pipów); `probe-l48-before-after.mjs`: odrzucona komenda zostawia tapniętą
   Górę i `{R}` w puli (drugi objaw tej samej klasy, CR 601.2h).

## F2 — naprawa (`55e0461`)

- `src/engine/resources.js`, faza PIPÓW: ląd z grantem produkuje CAŁY grant —
  bez wiersza planu kolor bierze `firstUncoveredPipColor` (jak auto-tap sumy),
  warunek wejścia zna grant.
- `src/engine/resources.js`, atomowość: bramka sumy PRZED pierwszą mutacją.
- Pin `test/m374-l48-grant-w-pipach.test.js` (M374/1–4), mutacje:
  bez fallbacku koloru grantu → 1 i 4 RED; bez bramki atomowości → 2 i 3 RED.
- Bramka etapu: `npm test` 5723/5723.

## F3 — pomiar i bramki

- Quick-25: DOKŁADNIE komenda z E7 (`--quick --self --seeds 16 --decks
  <25 nazw> --progress 400`) — harness ma przejść 5 952 mecze bez przerwania.
- `npm run test:all` (pełny tier) i `npm run build`.
- Pełne B0 tylko na wyraźną komendę właściciela (ADR 0018).

## F4 — dokumentacja i PR

- M374 w `docs/ENGINE_MILESTONES.md`, wpis w `docs/PROJECT_HISTORY.md`,
  `docs/setup/HANDOFF_2026-09-17d.md`, lekcja **L149** (rejestr przycięty:
  narracja L48(B7)/L54/L91/L108/L125 → `docs/LESSONS_PRZYPADKI.md`), README
  (liczby testów/build), opis PR #125 sekcją M374.

## Zakres poza planem (świadomie)

- Brak nowych kart (ADR 0029) i brak zmian reguł — poprawka jest wyłącznie
  w rachunku płatności (L48/L147), bez nowych interpretacji CR.
- Bramki „na zielono" bez pomiaru quick-25 nie zamykają F3: znalezisko było
  znaleziskiem POMIARU, więc dowodem jest przebieg tej samej macierzy.
