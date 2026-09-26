# PLAN PMSSB-8: loot-net-unification (2026-09-26)

Wybór celu (krok-0): forward PMSSB-6 „loot-net-unification" (Aneks B NO-F)
+ BACKLOG pusty (erg PMSSB-7). To samo zdarzenie ekonomiczne
(loot-1: dobierz-1-potem-odrzuć-1) ma TRZY liczby w trzech pisowniach.

## 0. Teza i inwentarz (krok-0)

| Pisownia | Nosiciele | Wycena PO-7 | Ścieżka |
|---|---|---|---|
| combined `draw_then_discard` | fisher-ETB, scholar-activated, crows-trigger | +6 (P.drawCardValue, BEZ kosztu discardu!) | ETB-table ~1420, ability ~7720 |
| split `[draw_cards, discard_cards]` | evangel-ETB, talions-trigger | +6 − 4 = +2 (discard-self −4 z tabeli ETB) | ETB-table (dwa wpisy) |
| may-draw (NIE loot!) | M67 ferocious-rider | 5 (P.ferociousLootExpected) | cast ~6287, modal ~4972 |

Korekta forwardu: M67 to may-DRAW (bez nogi discardu!) — discount 6→5
za „may" jest ZASADNY (nie loot, OUT z unifikacji, adnotacja w kodzie).
crows-mayFire = flat 50/0 (konwencja trigger-choice ~8931, bez treści —
jak Angel's Feather; OUT chyba że sonda pokaże misfire).

MODEL (hipoteza H1): loot-1 = +6 (draw) + (−6 + premia-selekcji) (discard
najgorszej) = SAMA premia-selekcji ≈ +1…3 (+ paliwo-grobowe niemodelowane).
Combined-+6 ZAWYŻA (liczy kartę wracającą do grobu jak zatrzymaną!);
split-+2 jest BLIŻEJ, ale −4 za discard to pełna strata karty (za ostro —
odrzucasz NAJGORSZĄ, cherry-pick-discount). Unifikacja L41: helper
`lootNetValue` (obie pisownie → jedna liczba), migracja ETB-table +
ability-branch. Zero gałek (kotwica: premia-selekcji z modelu PMSSB-6:
info-2 + filtr-1 ≈ +2…3 do skalibrowania sondą).

## 1. Hipotezy (krok-1)

- **H1:** obie pisownie loota → jedna wartość sieciowa (+2…3):
  fisher-ETB-leg 6→2ish, evangel-ETB-leg 2→2ish (zbieg!), scholar
  activated 8→4ish (6+2-EOT → 2+2-EOT). Golden: churn TYLKO w śladach
  z fisher/evangel/scholar (weryfikacja testem; wyjaśnienie per-flip).
- **H2:** M67 = may-draw (OUT, adnotacja + pin-photoniczny „5").
- **H3:** crows-mayFire flat-50 + guard deckoutu −100 (PMSSB-3/F9b) WYSTARCZA
  (brak misfire w sondzie; zmiana konwencji = OUT).

## 2. Macierz sond (krok-2, `tools/pmssb8-loot-sonda.mjs`)

L01 fisher-cast (ETB-loot-leg: dekompozycja 74.70 z D07b — ile to +6?),
L02 evangel-cast (ETB-split-leg: ile to +2?),
L03 scholar-activated-main (+6?) i EOT-foe (+8 = D07a?),
L04 talions-trigger-fire (kontekst faerie-attack),
L05 crows-mayFire fire/skip (50/0? guard −100 przy lib0?),
L06 M67-ferocious-rider (5 przy P≥4?),
L07 loot-przy-pustej-rece (discard-bez-kosztu? combined-bez-zmian?),
L08 loot-przy-1-karcie (odrzut tej dobranej? model-selekcji!).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-L1 helper `lootNetValue` + migracja ETB-table
  (combined wpis + split discard-self wpis W KONTEKŚCIE loota —
  uwaga: discard-self-ETB −4 poza lootem (cost!) ZOSTAJE) +
  ability-branch + piny (zbieg fisher/evangel!) + golden-verify.
- Ryzyka: (a) split-vs-cost: `[draw,discard]` to loot, ale SAMOTNY
  `discard-self` w ETB to koszt (−4 ZOSTAJE!) — detektor kontekstu
  (para w jednym triggerrze) musi być precyzyjny;
  (b) scholar-transform-rider (loot-then-transform: premia-transformu
  NIEZALEŻNA — nie ruszać);
  (c) golden-churn w fisher/evangel-śladach (oczekiwany MAŁY —
  ruch −4 na nodze, decyzje rzadko na krawędzi; weryfikacja!).

## Aneks A — ślady krok-0

- ETB-table: `draw_then_discard` → P.drawCardValue × n + decking (bot ~1420).
- ability-branch: ten sam combined +6 (bot ~7720, guard deckoutu).
- trigger-choice: flat fire-50/skip-0 + guardy (bot ~8931; F9b −100).
- P.drawCardValue = 6, P.ferociousLootExpected = 5 (params 301-302).
- Nosiciele: scholar (activated-combined), crows (trigger-combined-may),
  fisher (ETB-combined), evangel (ETB-split), talions (trigger-split).
- Push ZABLOKOWANY od commita 9ae29ae (auth GitHub) — commity w kolejce
  lokalnej, do wypchnięcia po rekonnekcie.

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

STATS: fisher MV5 4/3 fly, evangel MV2 2/3, scholar MV3 0/1,
talions MV3 1/3 fly, crows MV5 4/4 fly.
L01 fisher-cast = 74.7 (D07b-repro ✓, noga-ETB +6);
L02 evangel-cast = 67.5 (noga-split +2); luka-4 STRUKTURALNA
(wpis `draw_then_discard` +6 vs para 6−4 w TEJ SAMEJ tabeli!).
L03a scholar-main = 8 = 2 (baza-ability!) + 6;
L03b scholar-EOT = 18 = 2+6+10 (P.instantDrawFoeEndBonus=10 ✓).
L04 talions / L05a crows przy lib10 = −57.6/−54.0 (ARTEFAKT cienkiej
biblioteki — repeatable-drain-fear, NIE loot!); przy lib30: +66.6/+70.2.
talions+faerie BEZ ZMIAN (trigger-condition ignorowany przy cast —
future-trigger-content NIEWYCENIANY: zero kodu po eventach
non-ETB w bocie, osobna rodzina → FORWARD).
L06 ferocious − L06b = 87−82 = **+5.0 DOKŁADNIE** (M67 żyje ✓ H2).
L07/L08 = 8.0 (combined ignoruje rękę ✓ kształt H1).

Kotwica unifikacji: CYCLING = +2 (bot ~7932, non-land) — loot-1 ≡
cycle-1 (to samo zdarzenie!). Unifikacja NA +2 = pryncypialna
(nie tylko minimalna): split-+2 JUŻ DOBRY (bez zmian!),
rusza się TYLKO combined +6→+2 (wpis ETB + gałąź ability).
Predykcje Wave-A: scholar-main 8→4, scholar-EOT 18→14,
fisher 74.7→71.1 (noga −4 ×0.9 = −3.6), evangel BEZ ZMIAN.

Audyt: H1 GO (lootNetValue=+2, parytet-cyclingu), H2 GO (M67 adnotacja
„may-draw, nie loot" + pin 5), H3 GO (crows-flat-50 + F9b wystarcza).
Scope-gate: future-trigger-anticipation (crows/talions-cast) = FORWARD
(osobna rodzina, nie wycena-loota); body-model-trivia (+1-crows) = SKIP.

## Aneks B — forwardy (WYPEŁNIĆ w closeout)

(none yet)
