# Mapa audytu diffu scalonego PR #177

Źródło: GitHub `pulls/177/files` (111 plików, 10 123 dodania, 361 usunięć). Stan: **audyt otwarty**. Oznaczenia dotyczą wyłącznie rzeczywistego zakresu opisanych ustaleń; „częściowo” NIE oznacza, że reszta pliku jest poprawna, a „otwarte” nie oznacza wykrycia błędu. Pełne dowody w `AUDYT_PR177_2026-11-01.md`.

Zakres: zmiany PR #177 i ich realne interakcje z kartami z katalogu. Bez nowych kart oraz implementacji hipotetycznych konfiguracji na przyszłość; w razie konieczności zostaje komentarz w kodzie. Osobne A24 Heap Gate z wcześniejszej fazy nie jest teraz kolejką.

| Plik z diffu #177 | Stan audytu |
|---|---|
| `README.md` | otwarte |
| `decks/alara.txt` | otwarte |
| `decks/dominaria-brg.txt` | otwarte |
| `decks/kaldheim.txt` | otwarte |
| `decks/srodziemie.txt` | otwarte |
| `decks/tarkir-wur.txt` | otwarte |
| `decks/warhammer-ubr.txt` | otwarte |
| `decks/worek-basni.txt` | otwarte |
| `decks/worek-dziki.txt` | otwarte |
| `decks/worek-legend.txt` | otwarte |
| `decks/worek-mroczny.txt` | otwarte |
| `docs/ENGINE_MILESTONES.md` | otwarte |
| `docs/PMSSB.md` | otwarte |
| `docs/PROJECT_HISTORY.md` | otwarte |
| `docs/audits/AUDYT_PR176_2026-10-27.md` | otwarte |
| `docs/audits/UWAGI_Z_GRY_2026-10-27c.md` | otwarte |
| `docs/audits/UWAGI_Z_GRY_2026-10-29.md` | otwarte |
| `docs/cards/scryfall-ambassador-oak.json` | otwarte |
| `docs/cards/scryfall-anticipate.json` | otwarte |
| `docs/cards/scryfall-changeling-berserker.json` | otwarte |
| `docs/cards/scryfall-curse-of-the-bloody-tome.json` | otwarte |
| `docs/cards/scryfall-rumbling-rockslide.json` | otwarte |
| `docs/cards/scryfall-sphinxs-herald.json` | otwarte |
| `docs/cards/scryfall-tail-slash.json` | otwarte |
| `docs/cards/scryfall-trumpet-blast.json` | otwarte |
| `docs/cards/scryfall-vampire-hounds.json` | otwarte |
| `docs/cards/scryfall-violent-urge.json` | otwarte |
| `docs/plans/PLAN_2026-10-27b-pmssb79-batch70.md` | otwarte |
| `docs/plans/PLAN_2026-10-27c-audyt-pr176-petla-jakosci.md` | otwarte |
| `docs/plans/PLAN_2026-10-30-batch71-kolekcja-625-634.md` | otwarte |
| `docs/setup/HANDOFF_2026-10-27c.md` | otwarte |
| `docs/setup/HANDOFF_2026-11-01.md` | otwarte |
| `src/cards/card-data.js` | częściowo — batch 71, wybrane karty i Oracle; A17/A25 |
| `src/cards/mana-costs-data.js` | otwarte |
| `src/controllers/heuristic-bot.js` | częściowo — Herald, discard, ETB, Edifice, Rupture Spire (A6/A9/A10/A12/A13) |
| `src/controllers/heuristic-params.js` | otwarte |
| `src/engine/abilities.js` | częściowo — kwalifikowany discard (A12); interakcja madness A27/A28: okno i kolejność w opisanych przypadkach naprawione; inne ścieżki otwarte |
| `src/engine/counters.js` | otwarte |
| `src/engine/effects.js` | częściowo — champion, Curse, Rumbling Rockslide, Violent Urge (A1/A2/A17/A25/A26) |
| `src/engine/fingerprint.js` | otwarte |
| `src/engine/game-state.js` | częściowo — Morbid, champion (A1/A4/A26); madness A27/A28: priorytet i wybór kolejności w badanych przypadkach naprawione; pełne APNAP otwarte |
| `src/engine/permanents.js` | otwarte |
| `src/engine/resources.js` | częściowo — Converge (A3) |
| `src/engine/spells.js` | otwarte |
| `src/engine/state-based.js` | otwarte |
| `src/engine/triggers.js` | częściowo — Morbid, upkeep Curse (A2/A4); counter removal otwarty |
| `src/table/main.js` | częściowo — kreator podrzędny i rezerwacje (A8/A11/A14–A20) |
| `src/table/render.js` | częściowo — ostrzeżenia animacji (A7) |
| `test/art-ids-tool.test.js` | otwarte |
| `test/audyt-batch71-b5-dowiazania.test.js` | otwarte |
| `test/audyt-bot-walka-remisy.test.js` | otwarte |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | otwarte |
| `test/audyt-pmssb1-bounce.test.js` | otwarte |
| `test/audyt-pmssb18-proliferate.test.js` | otwarte |
| `test/audyt-pmssb19-search.test.js` | otwarte |
| `test/audyt-pmssb25-discard.test.js` | otwarte |
| `test/audyt-pmssb26-land-drabina.test.js` | otwarte |
| `test/audyt-pmssb60-batch65.test.js` | otwarte |
| `test/audyt-pmssb80-kwota-z-landow.test.js` | otwarte |
| `test/audyt-pmssb81-koszt-kwalifikowany.test.js` | otwarte |
| `test/audyt-pmssb82-delirium-trik.test.js` | częściowo — warunek delirium wyceny; A25 sprawdza czas na prawdziwych kartach |
| `test/audyt-pmssb83-klatwa-mill.test.js` | otwarte |
| `test/audyt-pmssb84-champion-okno.test.js` | otwarte |
| `test/audyt-pmssb85-pump-atakujacych.test.js` | otwarte |
| `test/audyt-pmssb86-pozostale-karty-batcha.test.js` | otwarte |
| `test/audyt-pr149-stempel-wygnania.test.js` | otwarte |
| `test/audyt-pr176-f1-prewencja-licznikow-sprzet.test.js` | otwarte |
| `test/audyt-pr176-o1-etykieta-saddle-po-aktywacji.test.js` | otwarte |
| `test/audyt-pr176-o2-converge-platnosc-kolorow.test.js` | otwarte |
| `test/audyt-pr177-a-etb-uszkodzenie-w-turze.test.js` | otwarte |
| `test/audyt-pr177-c-blok-bezkosztowy.test.js` | otwarte |
| `test/audyt-pr177-d-cuombajj-wycena.test.js` | otwarte |
| `test/audyt-pr177-mana-wizard-koszt-aktywacji.test.js` | otwarte |
| `test/audyt-typy-efektow-katalogu.test.js` | otwarte |
| `test/bot-modal-modes.test.js` | otwarte |
| `test/bot-params.test.js` | otwarte |
| `test/bot-scoring-snapshot.test.js` | otwarte |
| `test/druki-druga-strona-i-uuid-obrazu.test.js` | otwarte |
| `test/f-morbid-kreatura-zginela.test.js` | otwarte |
| `test/fixtures/bot-scoring-snapshot.json` | otwarte |
| `test/g-sea-gods-scorn-ranking.test.js` | otwarte |
| `test/h-incubator-nazwa-po-transformacji.test.js` | otwarte |
| `test/helpers/cr-numery-tabela.js` | otwarte |
| `test/i-poswiecenie-stwora.test.js` | otwarte |
| `test/j-benevolent-blessing-kolor.test.js` | otwarte |
| `test/k-rupture-spire-etb-oplata.test.js` | otwarte |
| `test/katalog-pole-plan.test.js` | otwarte |
| `test/l-ambulatory-edifice-debuff.test.js` | otwarte |
| `test/m-lorescale-coatl-obowiazkowy.test.js` | otwarte |
| `test/m348-przerwanie-kreatora-many.test.js` | otwarte |
| `test/n-wretched-banquet-least-power.test.js` | otwarte |
| `test/o-plague-reaver-darowanie.test.js` | otwarte |
| `test/o3-trigger-counter-removed.test.js` | otwarte |
| `test/o5-tester-etykiety-logu.test.js` | otwarte |
| `test/obiekty-wsparcia-poza-rejestrem.test.js` | otwarte |
| `test/panel-rozgrywka-tura-przeciwnika.test.js` | otwarte |
| `test/pmssb10-ogon-wave-b2.test.js` | otwarte |
| `test/pmssb12-pay-wave-a.test.js` | otwarte |
| `test/pmssb3-draw-wave-b.test.js` | otwarte |
| `test/pmssb5-kontry-wave-a.test.js` | otwarte |
| `test/pmssb6-discard-wave-a.test.js` | otwarte |
| `test/pmssb8-loot-wave-a.test.js` | otwarte |
| `test/real-cards-batch65.test.js` | otwarte |
| `test/real-cards-batch71.test.js` | częściowo — wybrane testy kart i mechanik, bez oceny całości |
| `test/statusy-wpisow-katalogu.test.js` | otwarte |
| `tools/benchmark.mjs` | otwarte |
| `tools/collection-art-ids.csv` | otwarte |
| `tools/generate-plan-decks.mjs` | otwarte |
| `tools/table-tester/labels.mjs` | otwarte |
| `tools/table-tester/run-game.mjs` | otwarte |
| `tools/tune-card.mjs` | otwarte |
