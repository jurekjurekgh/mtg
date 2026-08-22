# PLAN 2026-08-21 — M174: Batch 41 (10 kart, lista właściciela)

- **Sesja:** `arena/01a02534-mtg`, PR #69.
- **Dane:** `docs/cards/scryfall-*.json` ×10 (ADR 0010 §2a, printy wg setów
  właściciela). Pełny Oracle albo unsupported (ADR 0022).
- **Talie (zamrożone seedy green/azorius/red/black — tylko tokens/ostrza/
  graveyard):** tokens ← Stall Out, Horizon Spellbomb; ostrza ←
  Burning-Yard Trainer; graveyard ← Immersturm Skullcairn, Toll of the
  Invasion, Terminal Agony, Predator's Gambit, Downwind Ambusher,
  Spin Out, Halo Forager (+2x Island — Forager jest {1}{U}{B}, a żadna
  dozwolona talia nie ma U+B; graveyard tematycznie pasuje idealnie).

## Karty → mechaniki (rozpoznanie)

| Karta | Mechaniki | Reuse / NOWE |
|---|---|---|
| Horizon Spellbomb {1} art. | {2},{T},sac: szukaj basic land DO RĘKI; dies: „you may pay {G} → draw" | reuse: search destination hand; trigger dies+optionalPay (wzorzec Panic Spellbomb) |
| Immersturm Skullcairn (land) | enters tapped; {T}: {B}; {1}{B}{R}{R},{T},sac (sorcery): 3 dmg w GRACZA + ten gracz odrzuca | reuse: land tapped/mana, damage target player; NOWE: „target player discards" (decyzja odrzucającego — pendingDiscardChoice) |
| Toll of the Invasion {2}{B} sorc. | odsłoń rękę wroga, WYBIERASZ nonland, odrzuca; Amass Zombies 1 | reuse: reveal-choose-discard (sprawdzić istniejący efekt), amass (wariant Zombies) |
| Terminal Agony {2}{B}{R} sorc. | Destroy target creature; **Madness {B}{R}** | **PIERWSZY czar z madness** — strażnik S9 (M161) czerwienieje; ścieżka castMadnessSpell dostaje realną kartę (testy pełnego przepływu discard→exile→cast z celem) |
| Halo Forager {1}{U}{B} 3/1 flying | ETB: you may pay {X} → cast target instant/sorcery MV=X z DOWOLNEGO grobu za darmo; zamiast do grobu — exile | **NOWA mechanika**: free-cast z grobu za X (wzorzec flashback: cele + exile po rozstrzygnięciu; oferta per X/karta) |
| Burning-Yard Trainer {4}{R} 3/3 | trample+haste; ETB: inny celowany Rycerz pod twoją kontrolą +2/+2 + trample+haste EOT | reuse: pump+grant na celu triggera; NOWE spec celu „other creature you control with subtype" |
| Predator's Gambit {B} aura | +2/+1; intimidate póki kontroler nie ma innych stworów | NOWE: keyword intimidate w canBlock (artefaktowe stwory / wspólny kolor) + warunkowy grant aury |
| Downwind Ambusher {3}{B} 4/2 flash | ETB modal: −1/−1 na stwora wroga ALBO destroy stwora wroga ranionego w tej turze | reuse: modal trigger; NOWE spec celu „damagedThisTurn" |
| Stall Out {1}{U} sorc. | tap stwora/Vehicle + 3 stun; Cycling {2} | reuse: tap+stun+cycling; NOWE spec celu „creature or Vehicle" |
| Spin Out {1}{B}{B} instant | Destroy target creature or Vehicle | reuse destroy; spec j.w. |

## Transze (osobne, samodzielnie zielone commity)

- [x] Etap 0: plan + dane Scryfall ×10 (9213fc5).
- [x] Transza A: Spin Out, Stall Out, Horizon Spellbomb — pełny reuse
      (creature_or_vehicle/tap+stun/cycling/search-to-hand/dies+payMana);
      artId 308→311 (fc30ba2). Testy A1–A3.
- [x] Transza B: Skullcairn (damage+discard celu — discard_cards
      applyTo target) + Toll (reveal_hand_choose_discard z NOWYM wariantem
      mandatory + amass Zombies/token_zombie_army). Strażnik L51 wymusił
      wycenę amass; artId→313 (132931b). Testy B1–B2b.
- [x] Transza C: Terminal Agony — PIERWSZY czar z madness (S9 z kotwicą
      terminal-agony + bramka zakresu). Przy okazji 2 fixy L48/L4: oferta
      zdolności z {T} własnego źródła many liczyła jego pipy
      (excludeSourceId w producibleMana/canPayColoredCost) i odrzucona
      aktywacja tapowała ląd (prewalidacja kolorów). artId→314 (98d6fcb).
      Testy C1–C3+B3.
- [x] Transza D: Trainer (buff innego Rycerza — reuse), Ambusher (modal
      ETB z celami per tryb), Gambit (INTIMIDATE w canBlock + walidacji
      declareBlockers; conditionalKeywords aury — fix L47 w registry
      i identity). Strażniki: opis pola aury, proporcja lądów graveyard
      (+2 Islands), artId→317, seed 3→35 (dbb0734). Testy D1–D3b.
- [x] Transza E: Halo Forager — pendingGraveFreeCast (decyzja: rezygnacja
      albo karta=X+cele z DOWOLNEGO grobu; czar pod kontrolą kontrolera;
      exileInsteadOfGraveyard po rozstrzygnięciu i fizzle; pełne warstwy
      engine/boty/UI/log; strażniki M122+A3). artId→318 (31d86c0).
      Testy E1–E3. KOMPLET 10/10.
- [x] Zamknięcie: pełny pakiet wykrył DEADLOCK modalnego triggera
      (Ambusher z oboma trybami celowanymi przy pustym stole = „tylko
      kapituluj") — fix wg CR 603.3b + pas skip (L48), test D2c (867ab5e).
      `test:all` **2646/2646**, build **52 moduły / 2264.4 kB**,
      bot-benchmark 9/9.

## Ryzyka / pułapki (z LESSONS)

- Strażnik M33+ wymaga talii w TYM samym commicie co karta (M166).
- `npm test` przed każdym commitem — zmiana talii psuje odległe seedy
  (L25); graveyard dostaje +2 Islands → testy seedowe graveyard mogą
  wymagać przelosowania.
- Nowe typy efektów → wycena w OBU ścieżkach bota (L50) + strażniki
  klasyfikacji celów (L51) wymuszą wpisy.
- Koszty: MANA_COSTS + manaCost + cost.colors — strażnik L23 pilnuje.
- Madness czaru: bramka ofert playerView (additionalCost/X — Terminal
  Agony jest w zakresie), pipy kosztu madness {B}{R} ≠ pipy karty.

## Podsumowanie wykonania

**BATCH 41 KOMPLET 10/10** w 6 commitach (9213fc5, fc30ba2, 132931b,
98d6fcb, dbb0734, 31d86c0, 867ab5e). Nowe mechaniki: mandatory
reveal-discard, amass Zombies, pierwszy czar z madness (ścieżka M161
zużyta produkcyjnie), intimidate (CR 702.13), conditionalKeywords aur,
free-cast z grobu za {X} (Halo Forager). Fixy klas L48/L4/L47 + deadlock
CR 603.3b wykryty benchmarkiem. Talie: tokens +2, ostrza +1, graveyard
+7 kart +2 Islands. Testy `test/batch41-kart.test.js` (21).
