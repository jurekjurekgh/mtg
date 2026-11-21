# PMSSB-91 — Żywy Tester na taliach z kartami Batcha 74 (2026-11-16)

Narzędzie: `tools/table-tester/run-game.mjs` na artefakcie `dist/mtg-table.html`
(79 modułów / 5978,8 kB, build po naprawach F-91/1…/5). Bot po obu stronach
(`--human <talia> --bot <talia>` = dwie talie, sterowanie bota), profile domyślne.

## Wynik zbiorczy

| partia | seed | kroki | NIEWYCENIONE | DETEKTORY | karty batcha 74 widziane na stole |
|---|---|---|---|---|---|
| `eldraine` vs `tarkir-wur` | 91 | 300 | brak | brak zgłoszeń | — (partia skończona przed dobraniem) |
| `tarkir-wur` vs `eldraine` | 1 | 260 | brak | brak zgłoszeń | **Arrow Storm** (5), **Temur Banner** (8), **Gylwain** (23) |
| `tarkir-wur` vs `eldraine` | 3 | 260 | brak | brak zgłoszeń | **Temur Banner** (7) |
| `worek-legend` vs `warhammer-ub` | 1 | 240 | brak | brak zgłoszeń | **Saltfield Recluse**, **Grollub** |
| `worek-dziki` vs `innistrad-brg` | 1 | 240 | brak | brak zgłoszeń | **Mirelurk Queen** |
| `dominaria-wu` vs `mirrodin-wu` | 2 | 300 | brak | brak zgłoszeń | **Memorial to Genius** (6) |
| `dominaria-wu` vs `mirrodin-wu` | 4 | 300 | brak | brak zgłoszeń | **Memorial to Genius** (12) |
| `forgotten-realms-wug` vs samo | 4 | 300 | brak | brak zgłoszeń | **Frilled Sea Serpent** (29) |
| `innistrad-brg` vs samo | 6 | 320 | brak | brak zgłoszeń | **Lambholt Harrier** (10) |
| `mirrodin-wu` vs samo | 6 | 320 | brak | brak zgłoszeń | **Loxodon Partisan** (41) |

**Pokrycie: 10 / 10 kart batcha 74** widzianych na żywym stole.
**Zero `NIEWYCENIONE`** (każdy wybrany ruch bota miał dedykowaną wycenę) i
**zero zgłoszeń detektorów** w KAŻDEJ z 10 partii.

## Uwaga metodyczna

Talii z kartami batcha jest 9 (jedna karta — `Temur Banner` i `Arrow Storm` —
dzieli `tarkir-wur`), a w każdej talii karta występuje w **1 kopii** na 19–32
wpisy, więc pojedyncza partia losuje je rzadko. Dlatego pokrycie wymagało
kilku par/seedów — pierwsza partia (`eldraine` vs `tarkir-wur`, s91) nie
wylosowała ANI JEDNEJ karty batcha. To nie defekt: `decks/*.txt` mają po 1
kopii, a tester tasuje pełną talię.

Transkrypty: `/tmp/*.txt` (poza repo — `.gitignore:30 tools/table-tester/**/*.txt`).
