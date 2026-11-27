# PLAN 2026-11-27 — Batch 75: 10 kart właściciela (artId 666–675)

Sesja: `arena/307361fc-mtg`, PR **#190** (batch wchodzi do tego samego PR —
WORKFLOW.md: jedna sesja = jeden PR, każdy commit samodzielnie zielony).

## Lista właściciela (ADR 0029 — katalog rośnie wyłącznie z tej listy)

| artId | karta | set | plan |
|---|---|---|---|
| 666 | Undersea Invader | KHM | Kaldheim |
| 667 | Gysahl Greens | FIN | Final Fantasy |
| 668 | Battle Hurda | WWK | Zendikar |
| 669 | Lightning Spear | MH2 | Kamigawa |
| 670 | Vaporkin | THS | Theros |
| 671 | Coordinated Maneuver | TDM | Tarkir |
| 672 | Malevolent Noble | ELD | Wiedźmin |
| 673 | Hired Blade | M19 | New Capenna |
| 674 | Mister Gutsy | PIP | Star Wars |
| 675 | Kozilek's Translator | OGW | Zendikar |

Plany: wszystkie mają przydziały w `WOREK_DECKS` (Kamigawa→worek-basni,
New Capenna→worek-mroczny, Star Wars→worek-legend; Kaldheim/Final Fantasy/
Theros/Tarkir/Wiedźmin/Zendikar mają własne talie po awansach) — mapa bez
edycji. Uwaga: Gysahl Greens wchodzi do `final-fantasy` = talii z próbki
benchmarku → po generatorze pomiar benchmarku quick + rozliczenie L193
(progi „zmierzone −15 p.p., tylko w górę", ślad fixture, wpis historii).

## Kroki

1. **B0** — zrzuty Scryfall PRZED kodowaniem (ADR 0010 §2a, fetch_page; ruch
   < 10 żądań/s): 1 karta = 1 plik `docs/cards/scryfall-<slug>.json` w formacie
   istniejących snapshotów. Rulingi (ADR 0028) przy dotknięciu mechaniki.
2. **B1** — wiersze 666–675 w `tools/collection-art-ids.csv` (dokładnie nazwy
   i plany właściciela) + definicje w `card-data.js` + `MANA_COSTS` — pełne
   Oracle albo `unsupported` (ADR 0022); brakujące reguły NAJPIERW jako ogólna
   reguła silnika (ADR 0002); `node tools/generate-plan-decks.mjs` (talie).
   Commit(y) per grupa mechaniczna, każdy zielony (testy + build).
3. **B2** — testy: per karta pozytywny/negatywny scenariusz; strażniki
   (proweniencja, limitations-guard, repo-decks, bot-benchmark) zielone.
4. **B3** — wyceny bota dla nowych mechanik (wzorzec PMSSB-90/91: ręczna
   pętla, bez B0, bez maszynowego tuningu; pokrętła zerowalne M429);
   benchmark quick po zmianach wycen.
5. **B4** — Żywy Tester: partie na talii z kartami batcha (pokrycie na stole;
   talia celowana M331 dla singletonów); detektory 0.
6. **B5** — dokumenty: PROJECT_HISTORY + M468, `docs/PMSSB.md` §PMSSB-92,
   aktualizacja opisu PR #190 (kumulacyjnie), rozliczenie planu.

## Ryzyka

- FIN/PIP to Universes Beyond — karty mogą nieść nowe mechaniki (Food
  warianty, roboty) → nazwać ogólnie przed implementacją.
- Kozilek's Translator (OGW) — bezbarwny/Eldrazi: sprawdzić obsługę
  bezbarwnego mana w wycenach i podziale talii Zendikar (ADR 0024).
- Talia final-fantasy (BENCH) zmienia skład → benchmark quick obowiązkowy;
  przy przesunięciu progów reguła L193.
- Awans planu do 15 kart (auto M181) — generator pokaże; nowa talia nie
  wejdzie do BENCH (sortowanie: kamigawa/new-capenna po forgotten-realms-br).
