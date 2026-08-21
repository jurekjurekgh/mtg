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

- [ ] Etap 0: plan + dane Scryfall ×10 (commit).
- [ ] Transza A (reuse + spec creature_or_vehicle): Spin Out, Stall Out,
      Horizon Spellbomb (+talie tokens). Testy RED→GREEN.
- [ ] Transza B: Immersturm Skullcairn (target player discards) + Toll of
      the Invasion (reveal-choose-discard + Amass Zombies) (+graveyard).
- [ ] Transza C: Terminal Agony — pierwszy czar z madness (aktualizacja
      strażnika S9→karta realna; testy pełnej ścieżki inkl. cel).
- [ ] Transza D: Burning-Yard Trainer + Downwind Ambusher + Predator's
      Gambit (intimidate w canBlock) (+ostrza/graveyard).
- [ ] Transza E: Halo Forager — free-cast z grobu za {X} (nowy pending +
      oferta + wykonanie + exile-zamiast-grobu; boty; warstwy UI/log).
- [ ] Zamknięcie: `test:all` + build + benchmark próbka + dokumentacja
      + opis PR.

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

(uzupełniane na końcu)
