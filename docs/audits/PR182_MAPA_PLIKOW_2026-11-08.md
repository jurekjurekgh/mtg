# Mapa plików PR #182 (audyt 2026-11-08b)

Scalenie `12aac62` (= HEAD `main` w chwili startu sesji), baza `5f8ede8`
(scalenie #181). Rozmiar: **17 plików, +994/−68, 3 commity** (obiekt PR
`pulls/182`: `commits: 3, changed_files: 17, additions: 994, deletions: 68`;
lista plików z REST `pulls/182/files` — L190). Zero zmian funkcjonalnych:
komentarze CR + 2 nowe strażniki + tabela CR + dokumenty.

| Plik | +/− | Stan audytu |
|---|---|---|
| `src/engine/game-state.js` | +5/−3 | komentarze CR zweryfikowane u źródła: 732.1+502.2 (znacznik), 732.2b (per-gracz), 502.2+732.2a/b (untap, nie upkeep) — wszystkie ZGODNE z CR 2026-11-06. ✔ |
| `src/engine/triggers.js` | +9/−6 | 502.2/732.2 (untap ×2), 732.1+702.145 (setDayNight), 715.3c (Saga, cytat dosłowny) ZGODNE. **F-1**: wiersz ETB `CR 732.2c / 702.145 … ustawia dzień` — 732.2c to reguła SPRAWDZENIA w untapie („it remains neither”), nie wejścia; zachowanie implementują 702.145d/g, a „ustawia dzień” przeczy gałęzi nocnej kodu. |
| `src/engine/spells.js` | +2/−1 | 702.145b z cytatem dosłownym („it enters transformed”) ZGODNY z CR. ✔ |
| `src/engine/tokens.js` | +1/−1 | 712.8a→712.6a: 712.8a to rzut „transformed” (błędny), 712.6a to front-face poza polem/stosem — ZGODNE z resetem K5 i z cytatami w `objects.js`/`effects.js`/`identity.js`. ✔ |
| `src/cards/card-data.js` | +3/−2 | 732.1 (znacznik Day//Night), 702.145 (daybound/nightbound) ZGODNE. ✔ |
| `src/table/render.js` | +1/−1 | 732.1 (znacznik na stole) ZGODNE. ✔ |
| `test/audyt-pr181-cytaty-cr-dzien-noc.test.js` | +127/−0 | strażnik znaczenia (4 testy): zakaz 730/731 w `src/`, pin 732.1/732.2[abc], pin 715.3c, dowód RED wbudowany. MUT-CR powtórzona: 732.2b→731.2b → RED (test 2). **O-1**: skan tylko `src/` (tabela trzyma martwe 730/731 jako dane — świadome). ✔ |
| `test/zgloszenie-undo-granica-tury-z-komendy-gracza.test.js` | +136/−0 | pin MUT-UNDO: `canUndoTurn` W PAUZIE startu + kontrakt „początek tury, którą gracz zobaczył” + zejście do poprzedniej. MUT-UNDO powtórzona: test 1 RED, test 2 GREEN (ścieżka `advance()`). ✔ |
| `test/helpers/cr-numery-tabela.js` | +13/−3 | +5 numerów (702.145b, 715.3c, 732.1, 732.2b, 732.2c — wszystkie ZWERYFIKOWANE w tekście CR), nagłówek unii, data pobrania; 575 numerów, sha256 = pin. ✔ |
| `tools/cr-numery.mjs` | +10/−1 | WYKLUCZONE + nowy strażnik z POWODEM (fixture cytuje gołe 730.2/731.2 spoza tabeli — bez wyłączenia czerwony); nagłówek generatora = nagłówek tabeli (L41). `--cr` → OK na pliku o sha pin. ✔ |
| `docs/LESSONS.md` | +35/−50 | dopisek L13 (trafny, z narracją) + kondensacja 11 wpisów: reguły NIETKNIĘTE. **O-2**: glosa „Wzorzec” z L14 skasowana zamiast przeniesiona do PRZYPADKI (do odtworzenia). |
| `docs/LESSONS_PRZYPADKI.md` | +12/−0 | narracja dopisku L13 (MUT-UNDO: dwa źródła migawek, pin w pauzie) ZGODNA z kodem i testem. ✔ |
| `docs/PROJECT_HISTORY.md` | +65/−0 | wpis sesji: liczby bram (10133/10402/575) i opis znalezisk ZGODNE. **F-2a**: „23 commity” — REST mówi 24. |
| `docs/audits/AUDYT_PR181_2026-11-08.md` | +278/−0 | raport rzetelny: mapa 88 wierszy danych (przeliczone), grep pusty (powtórzony), MUT-O sprawdzona (fail 2 — zgodnie z tabelą). **F-2a**: „23 commity” (obiekt: 24). **F-2b**: akapit „Metoda” (§3) myli mapowanie (dzień/noc 731→732, merge 730→731 — nie „730→732” ani „merge 731→732”). **F-2c**: wiersz tabeli „732.2c → staje się dniem/nocą” — FAŁSZYWA parafraza (732.2c: „it remains neither”). **F-2d**: „712.6a = charakterystyki drugiej strony” → przedniej. |
| `docs/audits/PR181_MAPA_PLIKOW_2026-11-08.md` | +117/−0 | 88 wierszy danych (przeliczone), format i werdykty spójne. **F-2a**: nagłówek „23 commity” → 24; wiersz PROJECT_HISTORY cytuje nieistniejącą liczbę (do uproszczenia). |
| `docs/plans/PLAN_2026-11-08-audyt-pr181.md` | +100/−0 | plan z kryteriami, E1–E4 odhaczone zgodnie ze stanem (raport, strażniki, 3 partie, handoff). Liczby commitów nie podaje. ✔ |
| `docs/setup/HANDOFF_2026-11-08.md` | +80/−0 | bramy (10133/10402/78/5800,5kB/575) i kolejka (budżet, suspend, cap, J) ZGODNE ze stanem. **F-2a**: „23 commity” → 24. |

Legenda: ✔ = bez zastrzeżeń; **F-1/F-2** = znaleziska (naprawione w tej
sesji; commity niżej); **O-1/O-2** = obserwacje (O-2 naprawiona, O-1 bez zmian
— decyzja projektowa sesji #182).
