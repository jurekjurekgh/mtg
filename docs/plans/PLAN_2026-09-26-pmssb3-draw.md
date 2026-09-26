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
- `cast_spell`: `P.drawCardValue(6) x amount + drawDeckingPenalty`
  (odbiorca-znak A4-4: cel-wróg = -6x; draw-only startuje od -1, M146).
- `activate_ability`: 6x + guard (Batch 52 + PR #121, L41 z cast).
- tryb modalnego TRIGGERA: 6x (L41 trzyma).
- tabela ETB: **9x** — BEZ guardu deck-outu (podejrzenie H1+H10).
- decyzje free-cast (suspend/epic/rebound): +5 nudge — PRZEJRZANE,
  czyste (inna decyzja: rzut-za-darmo vs rezygnacja, nie wycena karty).

Inwentarz (43 + 2 brzegowe): czary instant 8 (kantripy x6: curate, lunar-rejection,
withstand, chill, fleeting-distraction, curate-stx; x2: village-rites
CMC1+sac!, inspiration CMC4-celowa) / sorcery 4 (x1: enigma,
forever-young; x3: feed-the-infection CMC4, cathartic-reunion CMC2+
discard2!); ACT 10 (w tym looting scholar/fisher, floodhound-
investigate!); ETB 9 (w tym trade-route-envoy-conditional!);
triggery 10 (dies-dobór x4: spellbomby/prowler/familiar; obrażeniowe:
scroll-thief, curiosity; ataki: balamb, talions; you_cast: tellah x2;
murder-of-crows loot). Osobliwości: mysteries (conditional 3/2),
your-temple (obie strony x2), force-away (ferocious loot).

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
  CMC4 (ten sam x2, koszt nie występuje — grosz F7 jest tokenowy!).
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
- **H11 (symetria):** your-temple (obie strony x2) = +12 jak własny
  dobór (wróg ignorowany? kod: drawerId default=self!).
- **H12 (kantrip vs deep):** liniowość 6/kartę — pomiar (3. karta
  warta mniej? decyzja w audycie, nie zgadywanie).

Martwe z natury (nie findingi): modale 0 kart, ilości dynamiczne 0
kart (wszystko fixed!), Clue-makerzy spoza investigate — brak.

## Precedensy do naśladowania

M429 (wzorzec), bounce-F1/token-F1 (okna), PMSSB-1/C (overflow ±12,
`handSizeOf`), F5 (connect-gating, first-tick), F8 (ubezpieczenie),
A4-4 (znak odbiorcy), M146 (draw-only -1), drawDeckingPenalty (guard).

## Kroki

0. Plan (ten plik) — commit.
1. POMIAR PRZED: `/tmp/pmssb3-draw-przed.mjs` (~12 scenariuszy H1–H12
   → tabela wynik/FINDING) + inwentarz z oknami (powyżej).
2. AUDYT: macierz ścieżka x odbiorca x timing x stan → F1…Fn → fale
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
| S2b | inspiration→wróg | -13 | A4-4 żyje (-1-12) |
| S3 | Reunion main1 vs main2 | 17 = 17 | **H3 ✓ flat** |
| S4a | mysteries (conditional 3/2) | 50 (goła baza!) | **H4 ✓ cast** |
| S4b | Envoy ± licznik | 68.4054 = 68.4054 | **H4 ✓ ETB (obie gałęzie 0)** |
| S5a | Reunion = -1+18 | 17 | **H5b ✓ discard-2 = 0** |
| S5b | rites: nomad / 1/1-token / 5/5-token | 6 / 8 / -4 (= 11-(2P+T+CMC) co do punktu!) | **H5a ZREWIDOWANE: sac wyceniane** (hojnie, bez zniżki-fodder) |
| S6 | inspiration ręka 3 vs 8 | 11 = 11 | **H6 ✓ brak waste** |
| S7a | thief otwarty vs zablokowany | 12 vs -10 (= 1+11, proca 0) | **H7 ✓ connect-gated 0** |
| S7b | curiosity cast | 61.1982 | H7 pin (proce przyszłościowe 0) |
| S8 | prowler-blok 2/2 | +4 (= 2+6-3-1, bez ubezpieczenia) | **H8 ✓ dies-draw 0** |
| S9a | floodhound ACT (investigate) | 2 (goła baza!) | **H9 ✓** |
| S9b | force-away | 90 (sam bounce) | **H9 ✓ ferocious 0** |
| S10 | Rager bibl.10 vs bibl.0 | 71.1018 = 71.1018 | **H10 ✓ ETB bez guardu** |
| S11 | temple tryb-1 (obie x2) | 62 (= 50+12, wróg ignorowany!) | **H11 ✓** |
| S12 | inspiration x2 → 6/kartę + kod | liniowe | **H12 ✓** |

EXTRA (poza H1–H12): `drawDeckingPenalty` NIE ma egzempcji pustej
biblioteki (E2/K2/CR1), którą ma rodzeństwo `libraryLossPenalty-
WithMargin` — stany testowe bez talii dostają -(120+6a) za każdy
dobór z czaru/zdolności (v1: -121/-126/-132). Finding L41-guardów.
H5c (CMC nie występuje) i H1 (9 vs 6) udowodnione czytaniem kodu.
Balamb to pojazd (ataki po animacji) — niewłaściwy pojazd H7;
thief + curiosity wystarczą. Scroll-of-Avacyn (-118: koszt
sac-self zdolności) to historia cross-family, nie H4.

---

## Aneks B — krok-2: recon + S-piny v3 (2026-09-26, dc3a6a5)

Harness: `/tmp/pmssb3-draw-v3.mjs` (biblioteka 10/10, trace-based scoring, seed 9).
Stan bazowy: main1, tura 5, priorytet p1 (chyba że scenariusz mówi inaczej).

### B1. S-piny v3 (wszystkie rozłożone na czynniki pierwsze)

| S | scenariusz | pin | dekompozycja (rozstrzygnięta) |
|---|---|---|---|
| S01 | rager-cast | 71.1018 | (76 + 9 - 6) x 0.9 + eps; ciało 2/2=76, ETB-draw-9 (tabela!), self-lose-1 = -6 (skala M169/K-permanent, OUT-life) |
| S02 | inspiration self / foe | 11 / -13 | isDrawOnly-start -1 (A4-4!) + 12 / -12; brak bazy spellBase |
| S03/S03b | reunion main1 / main2 | 17 = 17 | -1 + 18 + discard-0; F3-FLAT (wynik negatywny: flat POPRAWNY, sorcery nie czeka) |
| S04a/b/c | rites 1/2-CMC2 / 1/1-CMC0 / 5/5-CMC5 | 5 / 8 / -9 | -1 + 12 - sac(6/3/20); sac = 2P+T+CMC (M149/A3, H5a-revised POTWIERDZONE) |
| S05 | hand3 = hand8 | 11 = 11 | brak wrażliwości na rozmiar ręki (H-flat) |
| S06a | thief-attack vs vanilia | 12 = 12 | dyferencjał 0 — trigger combat-damage→draw NIEWYCENIONY (H6-attack, OUT-trigger) |
| S07 | curiosity na własnym 1/1 | -62.1 | aura-wroga-na-własnym (NIGDY nie rzuca); mechanizm -69-raw = internals-aura (OUT), trigger-0 |
| S07b/c | curiosity na wrogim 3/3 i 1/1 | -169.2 = -169.2 | niezależne od rozmiaru; internals-aura (OUT); v3-wspomnienie +61.2 NIEDAŁO się odtworzyć (superseded) |
| S08a/c | prowler-ginie vs vanilia-ginie | -10 = -10 | trigger dies→draw = DOKŁADNIE 0 (H8, OUT-trigger); v3-+4 superseded |
| S08b | prowler-bez-blokera | +13 | 2 + through-3 + open-8 (bez doboru — przeżywa) |
| S09 | force-away fero-ON / OFF | 88 / 100 | rider = 0 w OBU (F5!); inwersja = efekt-planszy (bounce-względny), nie rider |
| S10 | murder-mayFire fire/decline @lib10 i @lib0 | 50/0 = 50/0 | SAMOBÓJSTWO przy pustej biblioteczce (F9b!); tax = 0 na lib0 (drabina nie ratuje) |
| S10b | murder-cast | -54.0 | ciało + trigger-liability (generyczny-trigger, OUT); bot nigdy nie rzuca |
| S11 | temple mode1 (pakt) / mode0 | 62 / -26 | mode1 = 50 + 12 + foe-0 (noga-foe IGNOROWANA! F-temple); mode0 = buff-rodzina (OUT) |
| S12 | mysteries dropped-false/true | 50 = 50 | conditional = 0 (pętla-cast NIE rozwija wrapperów! R7-skorygowane); F-mysteries |
| S13 | envoy ±counter | 68.4054 = 68.4054 | 81 - 5(CMC+pip!) + 0(ETB-miss!) → x0.9; równe, bo OBA-0 (F-envoy!) |
| S14 | scroll-ability ±Angel | 8 = 8 | 2 + 6 + 0 + 0 (sac-self-0! conditional-0!; v1-„-118" = konfuzja z bounce-own); F-scroll-sac |
| S15 | feed-cast | 62 | 50 + 18 - 6(2xlose3, life>5) + 0(poison-rider, OUT-poison!) |
| S16 | quicksilver-cast | 74.7036 | (81 + flying-2 - 6(CMC+pip) + 6(ETB-loot!)) x 0.9 + eps |
| S17 | tellah-cast | -75.6 | trigger-liability (OUT!); Tellah-you_cast OUT-POTWIERDZONE (manaSpentAtLeast = generyk) |
| S19 | game-ball-ability | -17 | sac-threat + counter-terms (generyk-sac, ODRZUCONY pojazd — zakłócony) |
| S20 | deepwood-ability {6G} | 8 | 2 + 6 + koszt-0 (mana-opp-OUT!) |
| S21 | floodhound-ability | 2 | sama baza — investigate = 0 (OUT-doc; investigate ∉ rodziny-45!) |
| S22 | inspiration foe-EOT | 11 / -13 | IDENTYCZNE z main (H2! brak okna; F2) |

Rodzina-45 ZWERYFIKOWANA programowo (`reg.all()` 562 → 45 trafień draw-kluczy, dokładnie lista z Aneksu A).

### B2. Mechanizmy (rozstrzygnięcia strukturalne)

- **0.9** = `scoreWeights.permanent` (B4-strategia!); reszta 1 (mana 1.1). Trostani/Tools/Servant-superseded (dowód z tabeli, nie z pinów).
- **-1** = `isDrawOnly`-start (A4-4: Inspiration/Rites/Reunion — „startuje od zera jak M146", dokładnie `score = -1`). Ramka-50 (spellBase) vs ramka--1: drawOnly-ścisłe (`type === 'draw_cards'`).
- **Epsilon** = `0.001 x (epsBody - wxepsCost)` pre-weight (x0.9 → kroki .0009; .0018 = 2 kroki). Never-flip (L3).
- **Null→then** (`unwrapConditionals`) istnieje, ale pętle wartości (cast/ETB/ability) jej NIE wołają (tylko `selfDamageOfEffects`) → conditional-draw = 0 w wycenie (mysteries-50, envoy-ETB-0, scroll-Angel-0).
- **viewConditionalHolds** wspiera tylko 3 warunki; brak `landEnteredThisTurn` (widok go nie niesie — potwierdzone komentarzem L3377), brak `controlsCreatureSubtype`, brak ferocious/manaSpentAtLeast.
- **Draw2/draw3 liniowe** (6xN w ramce); brak dyskonta drugiej-karty.
- **Net-swing zbieżny**: loot jako decyzja (M67: +5 vs -2 = swing 7) ≈ loot jako czar (A1b: +6 vs 0 = swing 6) — ramki różne, ekonomia ta sama (NIE dryf!).
- **M67 (+5) vs A1b (+6)**: ramki-decyzji różne, nie do unifikacji.
- **R5**: discards-Reunion = decyzja bota `resolve_discard_choice` = `20 + discardCostPreference` (M408: unplayable-off-color-first!). Koszt-discard w wycenie rzutu = 0 (H5a).
- **Rites-sac** = wolumen ofiary 2P+T+CMC (M149/A3-dup z free-cast; F6-nit: board-scale-clean (nie ruszać w PMSSB-3)).
- **Floodhound**: investigate-abilities ∉ rodziny (token-pośredni, jak scry-riders-OUT).
- **Poison-rider** (feed): 0, OUT (przyszła pętla-poison).
- **Curiosity/murder/tellah-cast + thief/prowler-triggery**: cała zawartość-triggerów = 0 lub liability — JEDNA skonsolidowana przyszła pętla „generyczna-wycena-triggerów" (cast-time + fire-time, F9c w niej).

### B3. F-itemy fal A/B (specyfikacje zamknięte)

**Fala A (strażnicy, wąskie-śmiertelne):**
- **F9b**: `resolve_optional_trigger_choice`-fallback: fire-z-draw + pusta-biblioteka → -100 (lustro E2/A1b!); czytanie `pendingOptionalEffects(view)` (bot-side, bez dotykania silnika; triggery-draw w katalogu = tylko bezpośrednie (murder/curiosity — conditional-draw-triggerów brak)).
- **F10**: tabela-ETB draw/draw_then_discard BEZ `drawDeckingPenalty` (cast/ability go mają!) → dołożyć guard (lustro). Testy z pustą-lib maskujące draw — wypełnić lib (konwencja pr92).

**Fala B (luki wyceny; wszystkie prognozy do weryfikacji post-fali):**
- **F1**: tabela-ETB `draw_cards` 9 → `P.drawCardValue` (param! unifikacja L41); literal-6 modal-trigger → param (no-behavior); ETB-loot-6 → param (no-behavior). Rager 71.1018 → 68.4. (Dostarczane: 8.1 → 5.4 — spójne z globalnym dyskontem-permanent-0.9!)
- **F2**: instant-draw na foe-EOT +10 (lustro M211-scry: ta sama racja fizzle-many!); reszta 0 (pozytywne-tylko, bez pałek — draw użyteczny od razu); sorcery = flat (F3-negatywny!). S22-post: 21. Luka need-now (threat/land-need-gating) = udokumentowana przyszłość (spójne z M211-bez-gatingu).
- **F5**: `ferocious_draw_discard` w cast-spell: ferocious? +nowy-param(5, lustro-M67!) : 0. Force-ON 88 → 93.
- **F-temple**: (1) noga-foe both-draw = lustro inspiration-foe (-13!); (2) `isDrawOnly`-extend o `draw_cards_both_players` (duch-A4-4: treść-foe + maskowanie-spellBase!). Post: 62 → -2 (flip rzut→trzymaj, uzasadniony: parytet + tempo-loss!).
- **F-scroll-sac**: ability-draw + `sacrificeSelf` → lustro gałęzi-token (-= 4/1 creature/non!). Post: 8 → 7.
- **F-envoy**: unwrap-conditionals w pętli-ETB (lustro selfDamage, L41!). Post: 68.4054 → 72.9/76.5 (dywergencja ±counter!).
- **F-mysteries**: unwrap-conditionals w pętli-cast (lustro selfDamage!) + `landEnteredThisTurn` w widoku i w `viewConditionalHolds`. Post: 50 → 68/62.

**Fala C:** regeneracja fixture (`tools/bot-scoring-snapshot.mjs --write`), benchmark, pełny-suit, domknięcie-dokumentów.

### B4. OUT (potwierdzone, z odesłaniem)
gain_life-scroll-Angel; scry/surveil-ridery; mana-opp-cost (istnieje zgrubny CMC+pip w cast_permanent!); Tellah-you_cast (+ manaSpentAtLeast-generyk); generyczna-wycena-triggerów (F9c, curiosity/murder/tellah/thief/prowler); investigate; poison-ridery; mode0-temple (buff); aura-hostile-internals (curiosity--69/-188); game-ball-sac-threat; need-now-gating (F2-przyszłość).
