# Plan: Batch 30 — 10 realnych kart (lista właściciela)

Sesja `arena/019ff280-mtg` (PR #44). Kolejka właściciela (handoff po PR #43:
„Batch 30 — czeka na listę właściciela"). Lista w tym zleceniu:

Banishment Decree (MBS), Crew Captain (SNC), Consume Spirit (MRD),
Altar of the Goyf (MH2), Instant Ramen (FIN), Inspiring Bard (AFR),
Seismic Monstrosaur (LCI), Epic Experiment (OTC), Gurmag Drowner (DTK),
Wavecrash Triton (THS).

Procedura: ADR 0010 §2a (Scryfall z `set=` przez fetch_page — api w sandboxie
zablokowane dla curl), ADR 0014 (definicje w `src/cards/card-data.js`),
HOW_TO_ADD_CARD.md. Wszystkie karty `supported` w 100% mechaniki (decyzja
właściciela — `limitations` pusty). Karty dopisane do istniejących talii
singleton (paradygmat M32).

## Pobrane dane Scryfall (set=)

| Karta | set | koszt | typy / P/T | oracle (skrót) |
|---|---|---|---|---|
| Banishment Decree | MBS | {3}{W}{W} | Instant | Put target artifact, creature, or enchantment on top of its owner's library. |
| Crew Captain | SNC | {B}{R}{G} | Creature 4/2 | Haste; has indestructible as long as it entered this turn |
| Consume Spirit | MRD | {X}{1}{B} | Sorcery | Spend only black mana on X. deals X dmg to any target, you gain X life |
| Altar of the Goyf | MH2 | {5} | Kindred Artifact — Lhurgoyf | attacks_alone: +X/+X (X = card types in all graveyards); Lhurgoyf you control have trample |
| Instant Ramen | FIN | {2} | Artifact — Food | Flash; ETB draw; {2},{T},sacrifice: gain 3 life |
| Inspiring Bard | AFR | {3}{G} | Creature 3/3 | ETB choose one: target creature +2/+2 OR gain 3 life |
| Seismic Monstrosaur | LCI | {4}{R}{R} | Creature 6/5 | Trample; {2}{R}, sacrifice a land: draw; Mountaincycling {2} |
| Epic Experiment | OTC | {X}{U}{R} | Sorcery | Exile top X, cast inst/sorc MV<=X free, rest to graveyard |
| Gurmag Drowner | DTK | {3}{U} | Creature 2/4 | Exploit; when exploits, look top 4, put one to hand rest to grave |
| Wavecrash Triton | THS | {2}{U} | Creature 1/4 | Heroic: when you cast spell targeting this, tap creature opponent controls (no untap next) |

## Nowe / rozszerzone mechaniki generyczne (ADR 0002)

1. **Bounce na wierzch biblioteki** (Banishment Decree) — nowy efekt
   `bounce_to_library_top` (obiekt na bitwisku → wierzch biblioteki WŁAŚCICIELA,
   CR 108.3/400.7; wzorzec `bounce_permanent`). Typy celów: artifact/creature/
   enchantment (cel `artifact_or_creature_or_enchantment`).
2. **X-cost czar generycznie** (Consume Spirit, Epic Experiment) — rozszerzenie
   `castSpell`/`legalSpellCasts` o `spell.xCost` (X wybiera gracz, koszt {X}+
   podstawa, obrażenia/efekt wg X), niezależnie od Fireballa. Consume Spirit:
   „Spend only black mana on X" (kolorowa walidacja X), damage any target +
   gain X life.
3. **„entered this turn"** (Crew Captain) — znacznik `enteredThisTurn` na
   permanentach (ustawiany przy wejściu na bitwisko, czyszczony w cleanup),
   statyczny warunek `enteredThisTurn` + `indestructible`.
4. **atakuje samotnie + dynamiczny pump** (Altar of the Goyf) — trigger
   `attacks_alone` (istnieje — exalted), pump `card_types_in_all_graveyards`
   (istnieje jako dynamiczna wartość) do końca tury; **statyczny grant
   trample stworkom z podtypem Lhurgoyf** (`affects: 'creatures_with_subtype'`).
5. **Flash artefakt** (Instant Ramen) — rzut artefaktu z `keywords:['flash']`
   poza main phase (mechanika istnieje dla stworów — upewnić, że obejmuje
   artefakty).
6. **Modalny ETB trigger z celem** (Inspiring Bard) — `trigger.modes` z
   opcjonalnym `targets` (wzorzec modal trigger Etherwrought Page + cel trybu).
7. **Aktywowana zdolność „sacrifice a land"** (Seismic Monstrosaur) — koszt
   `sacrificeLand` w `createAbility` (wybór własnego landa — blokująca decyzja
   `resolve_sacrifice_land_choice`), efekt draw.
8. **Mountaincycling** (Seismic Monstrosaur) — `cycling: { subtypes: ['Mountain'] }`
   (wzorzec Swampcycling).
9. **Exploit + „look at top 4, one to hand, rest to grave"** (Gurmag Drowner)
   — exploit istnieje; trigger `exploits` + nowa kolejka `pendingLookTopN`
   (wybór jednej karty z wierzchu N do ręki, reszta do grobu).
10. **Heroic (spell targets this)** (Wavecrash Triton) — nowy event
    `spell_targets_this_creature` w `tryFire` + trigger; efekt: tap stwora
    przeciwnika + `lock_untap` (istnieje — Entrancing Lyre).

## Talie singleton (dopisać)

- azorius (W/U): Banishment Decree, Crew Captain? (BRG — nie), Epic Experiment
  (UR → spellslinger), Wavecrash Triton (U), Inspiring Bard (G → green),
  Gurmag Drowner (U → azorius/spellslinger).
- Przydział kolorystyczny: W → azorius; U → azorius/spellslinger; B → black;
  R → red; G → green; BG → graveyard; BRG → red/graveyard; UR → spellslinger.

## Testy

`test/real-cards-batch30.test.js` (dla każdej karty legalny + nielegalny +
sanity Scryfall + interakcje). Aktualizacja `test/repo-decks.test.js` i
`test/art-ids-tool.test.js` (withArt 218 → 228) jeśli wymagane.

## Kolejność commitów

1. plan (ten plik)
2. silnik (bounce-top, X-cost, enteredThisTurn, subtype trample, flash
   artefakt, modal ETB, sacrificeLand, lookTopN, heroic)
3. 3× feat (3+3+4 karty)
4. docs (PROJECT_STATE + HANDOFF)
