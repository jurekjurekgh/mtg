# Mapa plików PR #190 — inwentarz roboczy (2026-11-27)

Baza `dd1f587c3c053080bf32be19158fb55a4a461ffd`, head `7ea66dfefcafaf989194c5c658a2af3aaf8a8265`; różnice z dokładnych commitów PR, 71 plików. To inwentarz, **nie poświadczenie zakończonego audytu**: wszystkie wiersze wymagają dalszej weryfikacji do zamknięcia E1. Liczności +/− są względem oryginalnego PR, a nie późniejszych poprawek sesji #191. Wyniki i ograniczenia: `AUDYT_PR190_2026-11-27.md`.

| Plik | +/− | Zakres dalszego przeglądu |
|---|---:|---|
| `README.md` | +12/−12 | liczności i zgodność z generatorem |
| `decks/final-fantasy.txt` | +3/−2 | generator, przydział i zgodność składu |
| `decks/kaldheim.txt` | +3/−2 | generator, przydział i zgodność składu |
| `decks/tarkir-wur.txt` | +2/−1 | generator, przydział i zgodność składu |
| `decks/theros.txt` | +1/−0 | generator, przydział i zgodność składu |
| `decks/wiedzmin-bg.txt` | +3/−2 | generator, przydział i zgodność składu |
| `decks/worek-basni.txt` | +2/−1 | generator, przydział i zgodność składu |
| `decks/worek-legend.txt` | +2/−1 | generator, przydział i zgodność składu |
| `decks/worek-mroczny.txt` | +3/−2 | generator, przydział i zgodność składu |
| `decks/zendikar-rg.txt` | +1/−0 | generator, przydział i zgodność składu |
| `decks/zendikar-wu.txt` | +3/−2 | generator, przydział i zgodność składu |
| `docs/ENGINE_MILESTONES.md` | +125/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/LESSONS.md` | +6/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/LESSONS_PRZYPADKI.md` | +20/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/PMSSB.md` | +135/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/PROJECT_HISTORY.md` | +29/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/audits/AUDYT_PR189_2026-11-27.md` | +262/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/audits/PR189_MAPA_PLIKOW_2026-11-27.md` | +61/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/cards/scryfall-battle-hurda.json` | +32/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-coordinated-maneuver.json` | +31/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-gysahl-greens.json` | +63/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-hired-blade.json` | +32/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-kozileks-translator.json` | +33/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-lightning-spear.json` | +32/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-malevolent-noble.json` | +30/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-mister-gutsy.json` | +47/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-undersea-invader.json` | +32/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/cards/scryfall-vaporkin.json` | +32/−0 | snapshot Oracle/rulingi; porównać semantykę i przypadki brzegowe |
| `docs/plans/PLAN_2026-11-27-audyt-pr189-i-petla-jakosci.md` | +128/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/plans/PLAN_2026-11-27-batch75-kart.md` | +81/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `docs/setup/HANDOFF_2026-11-27.md` | +111/−0 | porównać twierdzenia z kodem/pomiarami, nie tylko przepisać |
| `src/cards/card-data.js` | +273/−0 | 10 kart + token; deskryptory i wspólne interakcje |
| `src/cards/mana-costs-data.js` | +12/−0 | dane kosztów i spójność z Oracle |
| `src/controllers/heuristic-bot.js` | +136/−12 | wyceny i drenaż; F-190/2, progi, anty-overfix |
| `src/engine/abilities.js` | +27/−3 | koszty, wycena osiągalności i wykonanie; F-190/1,6–7 |
| `src/engine/combat.js` | +24/−0 | restrykcja blokera, warunkowe statyki; F-190/4 |
| `src/engine/effects.js` | +33/−0 | liczniki źródła, drenaż i tworzenie tokenów |
| `src/engine/game-state.js` | +9/−1 | projekcja widoku, legalne oferty i budżet życia |
| `src/engine/triggers.js` | +11/−0 | warunek cast i LKI; F-190/5; test bestow |
| `src/table/render.js` | +26/−2 | etykiety kosztów, triggerów i P/T |
| `test/art-ids-tool.test.js` | +5/−3 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-bot-walka-remisy.test.js` | +12/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-deskryptory-celow-katalog.test.js` | +3/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-katalog-dane-vs-snapshoty.test.js` | +22/−10 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-pmssb92-batch75.test.js` | +194/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-pr177-a33-bounce-stun.test.js` | +10/−5 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/audyt-pr177-a70-bounce-investment-real.test.js` | +5/−2 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/bot-modal-modes.test.js` | +8/−6 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/bot-scoring-snapshot.test.js` | +11/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/bug-ptpair-description.test.js` | +27/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/fixtures/bot-scoring-snapshot.json` | +2/−2 | golden-master; różnice śladu F-190/12 |
| `test/g-sea-gods-scorn-ranking.test.js` | +1/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/katalog-pole-plan.test.js` | +3/−2 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/limitations-guard.test.js` | +9/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/m247-czysty-lad-removal.test.js` | +1/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/oracle-restrykcje-aktywacji-straznik.test.js` | +7/−4 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/petla-jakosci-samodrenaz-kompletnosc.test.js` | +92/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/pmssb3-draw-wave-b.test.js` | +8/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/pmssb7-hold-wave-a.test.js` | +8/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/real-cards-batch75.test.js` | +567/−0 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/statusy-wpisow-katalogu.test.js` | +2/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/uwaga-m-keepout-chip.test.js` | +14/−8 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/uwaga-z-gry-2026-09-23-p-vandalize.test.js` | +3/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/uwaga-z-gry-czary-modalne-2026-09-22.test.js` | +3/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/zgloszenie-d-pipy-zdolnosci-podzial.test.js` | +3/−2 | asercje i siła pinów; szukać fałszywie zielonych |
| `test/zgloszenie-i-wrap-in-flames.test.js` | +4/−1 | asercje i siła pinów; szukać fałszywie zielonych |
| `tools/collection-art-ids.csv` | +10/−0 | źródło danych lub historyczny pomiar; zachować kontekst |
| `tools/pmssb92-batch75-pomiar-po.txt` | +386/−0 | źródło danych lub historyczny pomiar; zachować kontekst |
| `tools/pmssb92-batch75-sonda.mjs` | +773/−0 | sceny i porównanie z realnymi obiektami; F-190/9,14 |
| `tools/quick-2026-11-27-b75c.txt` | +74/−0 | historyczny wynik benchmarku; porównać opisy |
| `tools/quick-2026-11-27-pmssb92.txt` | +74/−0 | historyczny wynik benchmarku; porównać opisy |

## Odnotowane weryfikacje i granice

- Dziesięć nowych kart: porównano nazwy, Oracle, wartości i koszty ze snapshotami; nie oznacza to zweryfikowania każdej interakcji mechanicznej. Test bestow Gutsy oraz przypadki Nobla i Coordinated Maneuver rozliczono w raporcie.
- Silnik i bot: F-190/1–7 obejmują ofiarę, ubytek biblioteki, cel planeswalkera, komunikat blokowania, LKI oraz budżet życia. Warunkowe restrykcje bloku i koszty wielu typów pozostają do głębszego przejrzenia.
- Testy: przywrócono pin Mutagen, wzmocniono precyzję celu/trybu Vandalize, skontrolowano ślady golden-mastera oraz fixture sondy; dopasowania po prefiksie w pozostałych testach wymagają oceny realnych wariantów, nie automatycznego uznania za błąd.
- Dokumenty: F-190/12–14 ujawniły i sprostowały m.in. etykietę wybranego wariantu, wyniki par benchmarku i GYS-02. Oryginalny raport audytu PR #189 w tabeli §8.1 historycznie podaje n−1; aktualna naprawa F-190/2 oraz raport tej sesji wyjaśniają, dlaczego prawidłowo n.
- Pliki sondy i pomiarów: zweryfikowano VAP-01 oraz opisy HUR/SPE/CM/NOB, GYS-02; historyczne wyniki nie są nadpisywane. Dalsza kontrola całej macierzy nadal konieczna.
- Pełna brama na nieruchomym `33e916d`: `npm run test:all` **10 928/10 928**, RC=0. Pełny B0 nie był uruchamiany.

**Otwarte:** dalsze badanie wskazanych plików, źródeł reguł i interakcji; dopiero po tym można oznaczyć E1 jako ukończone.
