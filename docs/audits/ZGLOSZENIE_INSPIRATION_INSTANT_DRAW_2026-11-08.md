# Zgłoszenie właściciela — Inspiration: instant-draw na EOT przeciwnika

- **Data:** 2026-11-08
- **PR:** #184, gałąź `arena/76d4141f-mtg`
- **Plan:** `docs/plans/PLAN_2026-11-08e-inspiration-bot.md`
- **Commity:** `0bd187b` (plan), `49f9a30` (fix + piny), dokumentacja finalna
- **Zakres:** polityka bota po deskryptorze (ADR 0002), bez nowych kart
  (ADR 0029), bez pełnego B0 (ADR 0018), bez scalania.

## 1. Problem

Właściciel: „Bot rzuca ją w swojej fazie podtrzymania jak tylko ma manę
z untapu i uniemożliwia sobie rzucenie innych czarów w tej turze. Ta karta
to instant i powinna być rzucana w ostatniej fazie tury przeciwnika za
manę, która i tak za chwilę się odtapuje.”

Nośnik: **Inspiration** — Instant {3}{U}, `draw_cards amount:2
applyTo:'target'`. Silnik i oferta rzutu są poprawne (CR 117.1a: instant
w każdym priorytecie). Błąd jest w **wycenie bota**: premia
`instantDrawFoeEndBonus` (+10) istnieje tylko na end stepie przeciwnika,
ale nic nie trzyma karty poza tym oknem. Bot rzucał dobór w pierwszym
możliwym kroku (własny upkeep/draw, upkeep/main przeciwnika, własny end),
wydając manę potrzebną na czary tej tury.

## 2. Diagnoza (sonda przed fixem)

`.arena/probe-inspiration.mjs`, trace bota:

| Okno | Wybór | Inspiration self |
|---|---|---|
| własny upkeep (+ Skaab w ręce) | `cast_spell(ins->p1)` | 11 |
| własny draw | `cast_spell(ins->p1)` | 11 |
| upkeep przeciwnika | `cast_spell(ins->p1)` | 11 |
| main1 przeciwnika | `cast_spell(ins->p1)` | 11 |
| własny end | `cast_spell(ins->p1)` | 11 |
| własna main1 bez konkurencji | `cast_spell(ins->p1)` | 11 |
| własna main1 + Skaab (4 many) | `cast_permanent(big)` | 11 (nadal dodatnie) |
| **end step przeciwnika** | `cast_spell(ins->p1)` | **21** |

Exact piny PMSSB3/A4 (`main=11`, `foe EOT=21`, `foe-target=−13`,
`sorcery Reunion=17`, `lib5 pass`) ograniczają naprawę: nie wolno nałożyć
płaskiej kary na każdą własną mainę ani na każdy dobór.

## 3. Naprawa

`src/controllers/heuristic-bot.js`:

- `isPureInstantSelfDraw(view, spell, effects, cmd)` — klasa po
  deskryptorze: timing `instant`, cała treść wariantu to `draw_cards`
  z odbiorcą = bot, **bez** `spell.additionalCost` (Village Rites poza
  klasą) i bez mieszanych riderów (Curate/Withstand/… poza klasą).
  `draw_cards_both_players` poza klasą (prezent dla wroga).
- `instantDrawManaContested(view, cmd, card)` — inna legalna oferta rzutu
  (`UNLOCK_CAST_TYPES`, inny obiekt, koszt > 0) i
  `manaAvailableNow < kosztDoboru + kosztInnegoCzaru`. Bez fikcyjnego
  konfliktu, gdy many wystarcza na oba rzuty.
- `instantDrawHoldDelta` — end step przeciwnika bez kary (istniejące +10
  zostaje); własna main bez konfliktu bez kary; pozostałe okna
  `−P.instantDrawHoldPenalty`.
- `src/controllers/heuristic-params.js`: `instantDrawHoldPenalty: 120`
  (skala rodziny D, ×0 = zachowanie sprzed zgłoszenia).

Poza zakresem (świadomie, L41): `activate_ability`,
`resolve_optional_trigger_choice`, `freeCast*` — nie płacą kosztu
opportunities z ręki; ich exact piny zostają.

## 4. Piny i mutacje

`test/zgloszenie-inspiration-instant-draw-timing.test.js` — **16/16**:

| Pin | Treść | Przed |
|---|---|---|
| ID/1 | własny upkeep: pass, self < 0 | RED |
| ID/2 | własny draw: pass, self < 0 | RED |
| ID/3 | upkeep przeciwnika: pass | RED |
| ID/4 | main1 przeciwnika: pass | RED |
| ID/5 | foe EOT: rzut w siebie, 21 | GREEN |
| ID/6 | main bez konkurencji: 11, rzut | GREEN |
| ID/7 | main + Skaab, 4 many: self < 0 | RED |
| ID/8 | 7 many na oba czary: 11 bez kary | GREEN |
| ID/9 | sorcery Reunion main1=main2=17 | GREEN |
| ID/10 | foe-target −13 | GREEN |
| ID/11 | deck-out lib5: pass | GREEN |
| ID/12 | Village Rites upkeep/main = 8 | GREEN |
| ID/13 | Curate upkeep/main = 44 | GREEN |
| ID/14 | Scholar main = 4, EOT = 14 | GREEN |
| ID/15 | syntetyczny nośnik klasy: upkeep hold / EOT cast | RED |
| ID/16 | pełny execute: upkeep pass → main1 Skaab → Inspiration w ręce | RED |

RED: `.arena/id-red.log` (7 fail / 16). Mutacje na końcowym kodzie
(`.arena/mut-id-mID*.log`), źródło przywrócone bitowo:

| Mutacja | Efekt | Piny RED |
|---|---|---|
| mID1 | hold wyłączony | ID/1,2,3,4,7,15,16 |
| mID2 | brak wyjątku EOT wroga | ID/5, ID/15 |
| mID3 | kara także w main bez konkurencji | ID/6, ID/8 |
| mID4 | brak rezerwy many | ID/7 |
| mID5 | `additionalCost` w klasie | ID/12 |
| mID6 | ridery (surveil/scry) w klasie | ID/13 |

## 5. Świadoma aktualizacja pinu PMSSB-58 (L181)

Pierwsza pełna brama szybka była RED 6: PMSSB-58 A16/A17 (5) + CR-numery (1).

- **PMSSB-58 A16/A17/A18** używały Inspiration jako nośnika „biblioteczny
  instant rzucalny w walce” dla polityki `manaSacrificeLosesLastBlock`.
  Po naprawie Inspiration jest poprawnie **trzymane do EOT**, więc
  `castScoreForUnlock` w walce jest ujemne i mana Spawn nie odblokowuje
  rzutu — pin cementował zachowanie będące treścią zgłoszenia.
  Nośnik zmieniony na syntetyczny instant `surveil+draw` (mieszany rider,
  poza klasą hold). Exact piny polityki mana-sacrifice zostały:
  OFF `+6`, lethal `<0`, kontrole A17 `>0`. Plik:
  `test/audyt-pmssb58-zasoby.test.js`, komentarz L181 w scenie.
- **CR 513.1**: literał istnieje w CR 2026-11-06, ale nie był w tabeli
  numerów cytowanych. Dopisany przez
  `node tools/cr-numery.mjs --zapisz --cr .arena/cr-current.txt`
  (575→576, tabela nie maleje; ADR 0030).

## 6. Bramy

- Pliki celowane: **121/121** (`.arena/id-targeted3.log`).
- Pełny szybki rdzeń: **10181/10181, fail 0, 0 skipped**
  (`.arena/id-fast-2.log`, ~215 s) → commit `49f9a30` + push.
- Build: **78 modułów / 5813,9 kB** (`.arena/id-build.log`).
- Finalnie `npm run test:all`: **10450/10450, fail 0, 0 skipped**
  (`.arena/id-test-all.log`, ~673 s).
- Golden-master: `test/bot-scoring-snapshot.test.js` **4/4**, fixture
  **bez regeneracji** (Inspiration tylko w `decks/wiedzmin-wur.txt`,
  poza parami snapshotu i BENCH_DECKS).
- `cr-numery` OK; budżet lektury niepodniesiony
  (`test/dokumentacja-budzet-lektury.test.js` 2/2).
- Strażnicy dokumentacji/CR/card-agnostic: **60/60**
  (`.arena/id-docs-guards.log`).

## 7. CR (świeże literały)

Mirror `nwgarne/mtg-data`, CR **2026-11-06**, SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`
(`.arena/cr-current.txt`):

- **117.1a** — instant można rzucić w każdym priorytecie; nieinstant tylko
  we własnej mainie przy pustym stosie.
- **513.1** — end step nie ma akcji turowych, aktywny gracz dostaje
  priorytet; to ostatnie okno rzutu przed cleanupem.
- **500.5 / 106.4** — niewykorzystana mana próżnieje na końcu kroku/fazy.
- **502.3** — odkręcanie permanentów w untap stepie.
- **307.1** — sorcery we własnej fazie głównej.
- **121.4** — próba dobrania z pustej biblioteki = przegrana (deck-out
  guard bez zmian).

## 8. Anty-over-fix i OUT

- Sorcery-draw (Reunion) nie czeka; foe-target Inspiration zostaje ujemny;
  deck-out lib5 pass; Village Rites (koszt dodatkowy) bez zmian; Curate
  (mieszany rider) bez zmian; zdolności/trigger/darmowe rzuty bez zmian.
- OUT: pełna polityka „rezerwy many pod odpowiedzi” dla wszystkich
  instantów (osobna rodzina), strojenie `instantDrawHoldPenalty` pod
  benchmark, need-now gating z PMSSB-3 (wciąż przyszłość).
- Bez nowego wpisu LESSONS (budżet ~99,7k/100k; klasa L41/L181/L183 już
  opisana). Bez scalania PR #184.
