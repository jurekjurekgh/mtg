# PMSSB-3: dobieranie (draw_cards / draw_then_discard) — plan

Zlecenie właściciela: kolejna rodzina po tokenach (PMSSB-2 DONE).
Metoda M429 + procedura hubu (`docs/PMSSB.md`).

## Wybór celu (uzasadnienie)

Rejestr: dobieranie 40+ (BACKLOG) vs zysk życia 23 vs kontry 5
(mikro-pętla?). Wybór: **dobieranie** — największa otwarta rodzina
(zmierzone: **43 karty**), wymiary z gotowymi lustrami (timing EOT jak
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

Inwentarz (43): czary instant 8 (kantripy ×6: curate, lunar-rejection,
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
