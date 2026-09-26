# PMSSB-3: dobieranie (draw_cards / draw_then_discard) — plan

Zlecenie właściciela: kolejna rodzina po tokenach (PMSSB-2 DONE).
Metoda M429 + procedura hubu (`docs/PMSSB.md`).

## Wybór celu (uzasadnienie)

Rejestr: dobieranie 40+ (BACKLOG) vs zysk życia 23 vs kontry 5
(mikro-pętla?). Wybór: **dobieranie** — największa otwarta rodzina
(zmierzone: **43 karty** + 2 brzegowe: your-temple (modal both-draw), force-away (ferocious loot) = 45), wymiary z gotowymi lustrami (timing EOT jak
bounce-F1/token-F1; overflow jak PMSSB-1/C; connect jak F5; dies jak
F8) i podejrzeniem rozjazdu skal L41 (9 vs 6). Odrzucone: zysk życia
(węższy — jeden duży finding L41, dobry NASTĘPNY), kontry (wymagają
modelowania blefu many — ryzykowny zakres jak na tę pętlę).

## Wycena dziś (rekonesans kodu — fakty, nie zgadywanie)

Pięć ścieżek, TRZY skale (podejrzenie L41):
- `cast_spell`: `P.drawCardValue(6) × amount + drawDeckingPenalty`
  (odbiorca-znak A4-4: cel-wróg = −6×; draw-only startuje od −1, M146).
- `activate_ability`: 6× + guard (Batch 52 + PR #121, L41 z cast).
- tryb modalnego TRIGGERA: 6× (L41 trzyma).
- tabela ETB: **9×** — BEZ guardu deck-outu (podejrzenie H1+H10).
- decyzje free-cast (suspend/epic/rebound): +5 nudge — PRZEJRZANE,
  czyste (inna decyzja: rzut-za-darmo vs rezygnacja, nie wycena karty).

Inwentarz (43 + 2 brzegowe): czary instant 8 (kantripy ×6: curate, lunar-rejection,
withstand, chill, fleeting-distraction, curate-stx; ×2: village-rites
CMC1+sac!, inspiration CMC4-celowa) / sorcery 4 (×1: enigma,
forever-young; ×3: feed-the-infection CMC4, cathartic-reunion CMC2+
discard2!); ACT 10 (w tym looting scholar/fisher, floodhound-
investigate!); ETB 9 (w tym trade-route-envoy-conditional!);
triggery 10 (dies-dobór ×4: spellbomby/prowler/familiar; obrażeniowe:
scroll-thief, curiosity; ataki: balamb, talions; you_cast: tellah ×2;
murder-of-crows loot). Osobliwości: mysteries (conditional 3/2),
your-temple (obie strony ×2), force-away (ferocious loot).

## Hipotezy (H1–H12, falsyfikowalne — sonda krok-1 rozstrzyga)

- **H1 (skala ETB, L41):** ETB-dobór = 9/kartę vs 6 w cast/ability —
  ten sam dobór-1 wart raz 9, raz 6 (Rager vs kantrip).
- **H2 (timing instantu):** brak wyrazu okna (kod!) — inspiration EOT
  = main (lustro: token-F1 — mana do spożytkowania + max info).
- **H3 (timing sorcery):** main1 = main2 (lustro F2-flat? — ten sam
  użytek, czy premia precombat-info? sonda mierzy, nie zgaduje).
- **H4 (conditional = 0):** pętla cast NIE rozwija wrapperów
  (`unwrapConditionals` wołane tylko w selfDamage!) — mysteries ≈ 50
  (goła baza! nie draw-only), Envoy-ETB ≈ 0 (pudło w tabeli).
- **H5 (koszty niewidzialne):** additionalCost TYLKO we free-castach
  (zwykły cast nie woła scorera!) — Reunion discard-2 = 0 (≈17!);
  rites-sac = ? (sonda z/bez fodderu); S11: rites CMC1 = inspiration
  CMC4 (ten sam ×2, koszt nie występuje — grosz F7 jest tokenowy!).
- **H6 (overflow):** dobór przy ręce 7+ = pełna wartość (brak wyrazu
  waste; maszyneria `handSizeOf`±12 z PMSSB-1/C gotowa do lustra).
- **H7 (silniki = 0):** proce powtarzalne niewycenione — thief/
  curiosity (connect-gated, lustro F5!), balamb (attacks, lustro
  drainOnAttack!), tellah (you_cast — warunkowy, kandydat do
  odroczenia jak Wizard w PMSSB-2/C).
- **H8 (dies-dobór = 0):** rodzeństwo F8 — spellbomby/prowler/familiar
  w bloku (i sac?) bez ubezpieczenia doborem.
- **H9 (mikro-typy = 0):** `investigate` (floodhound ACT ≈ 2; Clue to
  NIE create_token — PMSSB-2 go nie widziało!) i `ferocious_*`
  (force-away = sam bounce) — po 1 karcie.
- **H10 (ETB bez guardu):** ETB-dobór przy pustej bibliotece = +9
  (deck-out niewidzialny — cast/ability mają guard).
- **H11 (symetria):** your-temple (obie strony ×2) = +12 jak własny
  dobór (wróg ignorowany? kod: drawerId default=self!).
- **H12 (kantrip vs deep):** liniowość 6/kartę — pomiar (3. karta
  warta mniej? decyzja w audycie, nie zgadywanie).

Martwe z natury (nie findingi): modale 0 kart, ilości dynamiczne 0
kart (wszystko fixed!), Clue-makerzy spoza investigate — brak.

## Precedensy do naśladowania

M429 (wzorzec), bounce-F1/token-F1 (okna), PMSSB-1/C (overflow ±12,
`handSizeOf`), F5 (connect-gating, first-tick), F8 (ubezpieczenie),
A4-4 (znak odbiorcy), M146 (draw-only −1), drawDeckingPenalty (guard).

## Kroki

0. Plan (ten plik) — commit.
1. POMIAR PRZED: `/tmp/pmssb3-draw-przed.mjs` (~12 scenariuszy H1–H12
   → tabela wynik/FINDING) + inwentarz z oknami (powyżej).
2. AUDYT: macierz ścieżka × odbiorca × timing × stan → F1…Fn → fale
   (A: wartość/skala; B: timing; C: kontekst — tentative).
3. IMPLEMENTACJA: `draw*` w params + wspólny helper (L41).
4. TESTY: `test/audyt-pmssb3-draw.test.js` RED→GREEN.
5. EWALUACJA: snapshot (cel: bez regeneracji), mirror-eval.
6. DOKUMENTACJA: hub (rejestr + §PMSSB-3) + PROJECT_HISTORY.
7. Bramy, push po każdym kroku, PR.

## Zakres świadomie OUT

- `gain_life` (następna rodzina — gałąź Angel scroll-of-avacyn też).
- Scry/surveil-ridery (pokryte M218/4); loot-jakość vs ilość — w H5
  tylko koszt, nie teoria filtrowania.
- Pełny opportunity-cost many (jak w PMSSB-2: osobna pętla).
- Tellah-you_cast: tentative OUT (jak Wizard) — audyt potwierdza.

## Aneks A: POMIAR PRZED (krok-1, 2026-09-26)

Sonda `/tmp/pmssb3-draw-przed{,2,3}.mjs` (v3: biblioteka 10 — stany
realne; v1/v2 wykryły skażenie deck-outem w stanach bez talii, patrz
EXTRA). Format: scenariusz → wynik → hipoteza.

| # | Scenariusz | Wynik | Hipoteza |
|---|---|---|---|
| S1 | Rager (ETB draw-1) cast | 71.1018 | H1 pin (9 z kodu) |
| S2 | inspiration→ja EOT vs main1 | 11 = 11 | **H2 ✓ flat** |
| S2b | inspiration→wróg | −13 | A4-4 żyje (−1−12) |
| S3 | Reunion main1 vs main2 | 17 = 17 | **H3 ✓ flat** |
| S4a | mysteries (conditional 3/2) | 50 (goła baza!) | **H4 ✓ cast** |
| S4b | Envoy ± licznik | 68.4054 = 68.4054 | **H4 ✓ ETB (obie gałęzie 0)** |
| S5a | Reunion = −1+18 | 17 | **H5b ✓ discard-2 = 0** |
| S5b | rites: nomad / 1/1-token / 5/5-token | 6 / 8 / −4 (= 11−(2P+T+CMC) co do punktu!) | **H5a ZREWIDOWANE: sac wyceniane** (hojnie, bez zniżki-fodder) |
| S6 | inspiration ręka 3 vs 8 | 11 = 11 | **H6 ✓ brak waste** |
| S7a | thief otwarty vs zablokowany | 12 vs −10 (= 1+11, proca 0) | **H7 ✓ connect-gated 0** |
| S7b | curiosity cast | 61.1982 | H7 pin (proce przyszłościowe 0) |
| S8 | prowler-blok 2/2 | +4 (= 2+6−3−1, bez ubezpieczenia) | **H8 ✓ dies-draw 0** |
| S9a | floodhound ACT (investigate) | 2 (goła baza!) | **H9 ✓** |
| S9b | force-away | 90 (sam bounce) | **H9 ✓ ferocious 0** |
| S10 | Rager bibl.10 vs bibl.0 | 71.1018 = 71.1018 | **H10 ✓ ETB bez guardu** |
| S11 | temple tryb-1 (obie ×2) | 62 (= 50+12, wróg ignorowany!) | **H11 ✓** |
| S12 | inspiration ×2 → 6/kartę + kod | liniowe | **H12 ✓** |

EXTRA (poza H1–H12): `drawDeckingPenalty` NIE ma egzempcji pustej
biblioteki (E2/K2/CR1), którą ma rodzeństwo `libraryLossPenalty-
WithMargin` — stany testowe bez talii dostają −(120+6a) za każdy
dobór z czaru/zdolności (v1: −121/−126/−132). Finding L41-guardów.
H5c (CMC nie występuje) i H1 (9 vs 6) udowodnione czytaniem kodu.
Balamb to pojazd (ataki po animacji) — niewłaściwy pojazd H7;
thief + curiosity wystarczą. Scroll-of-Avacyn (−118: koszt
sac-self zdolności) to historia cross-family, nie H4.
