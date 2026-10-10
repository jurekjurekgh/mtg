# PLAN batch65 — kolekcja właściciela 329–350, 10 kart (2026-10-10)

Zlecenie: lista właściciela (10 kart z jego kolekcji, wklejona w czacie).
Gałąź `arena/16d5d128-mtg` (PR #162, ta sama sesja co audyt PR #161 —
kolejny batch to nowe commity, nie nowy PR; AGENTS.md „1 sesja = 1 gałąź
= 1 PR”). Procedura: `docs/cards/HOW_TO_ADD_CARD.md` (Kroki 1–9) + wzorzec
`docs/plans/PLAN_2026-10-08-batch64-kolekcja-261-328.md`.

**Lekcja sesji (L184):** poprzedni agent wykonał ten batch i stracił całą
pracę w resetcie sandboxa — **każda karta = osobny commit + push natychmiast**,
zero kumulacji na koniec. Bramki (`npm test` + `npm run build`, cicho) per
commit.

Pole **Plan z listy właściciela jest wiążące** i przepisane 1:1 (także gdy
świat „nie pasuje” do karty). Numer z kolumny „Ilustracja” = `artId`;
wiersze `tools/collection-art-ids.csv` dochodzą na swoje miejsca.

## 0. Dane źródłowe (z listy właściciela; `set=` obowiązkowe przy poborze)

| artId | Karta | Set | Plan (wiążący) |
|-------|-------|-----|----------------|
| 329 | Blinding Drone | OGW | **Zendikar** |
| 332 | Blitz of the Thunder-Raptor | IKO | **Thunder Junction** |
| 333 | Bring to Trial | RNA | **New Capenna** |
| 334 | Skyscythe Engulfer | ONE | **Mirrodin** |
| 336 | Zombie Boa | APC | **Amonkhet** |
| 338 | Brine Giant | THB | **Theros** |
| 340 | Ambulatory Edifice | ONE | **Mirrodin** |
| 341 | Pacifism | DTK | **Tarkir** |
| 348 | Impulse | DMU | **Dominaria** |
| 350 | Temple of Abandon | BLC | **Kamigawa** |

## 1. Kroki per karta (commit + push po KAŻDEJ)

1. Snapshot `docs/cards/scryfall-<slug>.json` — pola z JEDNEGO pobrania
   (`source`, `print`, `set`, `set_name`, `collector_number`, `image_uris`)
   + `pobrano` + `rulings` + `rulingsPobrano` + `rulingsSource` (ADR 0028).
2. Ewentualne zmiany silnika (generycznie, ADR 0002; Krok 4b — 4 dowiązania).
3. Definicja w `REAL_CARDS` (`src/cards/card-data.js`) z `artId`, `plan`
   (1:1), `set`, pełnym Oracle w `oracleText` + `MANA_COSTS` dla kart
   z kosztem.
4. Wiersz `tools/collection-art-ids.csv`.
5. `node tools/generate-plan-decks.mjs` — UWAGA na auto-awans planu
   i **zmiany nazw plików przy podziale kolorystycznym (L180)**: Impulse→
   Dominaria (dominaria-wu/brg), Pacifism→Tarkir (tarkir-bg/wur),
   Skyscythe/Ambulatory→Mirrodin (mirrodin-brg/wu) — sprawdzić diff.
6. Testy w `test/real-cards-batch65.test.js` (legalny + nielegalny + sanity
   danych: Oracle ↔ definicja, artId/plan ↔ słownik).
7. Bramki cicho + commit + push (bez force-push, nic na `main`).

## 2. Domknięcie batcha

Milestone w `docs/ENGINE_MILESTONES.md`, wpis `PROJECT_HISTORY.md`,
opis PR #162 uzupełniony. Bez pełnego B0 (ADR 0018).

## 3. Realizacja

- [x] Plan + L184 + usunięcie pliku transportowego patcha (commit zerowy).
- [x] 329 Blinding Drone (OGW, Zendikar) — commit 57c6158
- [x] 332 Blitz of the Thunder-Raptor (IKO, Thunder Junction) — commit 439f672
- [x] 333 Bring to Trial (RNA, New Capenna)
- [x] 334 Skyscythe Engulfer (ONE, Mirrodin)
- [ ] 336 Zombie Boa (APC, Amonkhet)
- [ ] 338 Brine Giant (THB, Theros)
- [ ] 340 Ambulatory Edifice (ONE, Mirrodin)
- [ ] 341 Pacifism (DTK, Tarkir)
- [ ] 348 Impulse (DMU, Dominaria)
- [ ] 350 Temple of Abandon (BLC, Kamigawa)
- [ ] Domknięcie: milestone + historia + opis PR.
