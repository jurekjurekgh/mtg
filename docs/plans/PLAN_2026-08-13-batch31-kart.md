# Plan: Batch 31 — 10 realnych kart + nowe talie

Sesja `arena/019ff818-mtg`. Lista właściciela (10 kart):

Furious Forebear (TDM), Jwari Shapeshifter (WWK), Floodhound (MH2),
Inspire Awe (THB), Cogwork Assembler (2XM), Dread Warlock (M10),
Steel Sabotage (2XM), Warrior's Sword (FIN), Awaken the Sleeper (ONE),
Impact Tremors (DTK).

Procedura: ADR 0010 §2a (Scryfall — dane pobrane i zapisane w
`docs/cards/scryfall-*.json`), ADR 0014 (definicje w `src/cards/card-data.js`),
HOW_TO_ADD_CARD.md. Karty `supported` w 100% mechaniki (`limitations` pusty).
artId ze słownika kolekcji.

## Pobrane dane Scryfall (set=)

| Karta | set | koszt | typy / P/T | oracle (skrót) |
|---|---|---|---|---|
| Furious Forebear | TDM | {1}{W} | Creature 3/1 | Whenever a creature you control dies while this card is in your graveyard, you may pay {1}{W}. If you do, return this card from your graveyard to your hand. |
| Jwari Shapeshifter | WWK | {1}{U} | Creature 0/0 | You may have this creature enter as a copy of any Ally creature on the battlefield. |
| Floodhound | MH2 | {U} | Creature 1/2 | {3},{T}: Investigate (create Clue token). |
| Inspire Awe | THB | {3}{G} | Instant | Prevent all combat damage this turn except by enchanted creatures and enchantment creatures. Scry 2. |
| Cogwork Assembler | 2XM | {3} | Artifact Creature 2/3 | {7}: Create a token copy of target artifact. It gains haste. Exile it at next end step. |
| Dread Warlock | M10 | {1}{B}{B} | Creature 2/2 | This creature can't be blocked except by black creatures. |
| Steel Sabotage | 2XM | {U} | Instant | Choose one — counter target artifact spell OR return target artifact to owner's hand. |
| Warrior's Sword | FIN | {3}{R} | Artifact — Equipment | Job select (ETB create 1/1 Hero token, attach). Equipped creature +3/+2 and is a Warrior. Equip {5}. |
| Awaken the Sleeper | ONE | {3}{R} | Sorcery | Gain control of target creature until EOT, untap, haste until EOT. If equipped, may destroy all Equipment attached. |
| Impact Tremors | DTK | {1}{R} | Enchantment | Whenever a creature you control enters, deal 1 damage to each opponent. |

## Nowe / rozszerzone mechaniki generyczne (ADR 0002)

1. **Trigger z grobu „kreatura kontrolowana umiera + zapłać”** (Furious Forebear)
   — trigger `other_creature_you_control_dies` ze źródłem w grobie + optional
   pay → return źródła do ręki.
2. **Copy na wejściu (Ally)** (Jwari Shapeshifter) — „you may enter as a copy"
   — blokująca decyzja kopiowania stworów-Ally z bitwiska.
3. **Investigate / Clue token** (Floodhound) — efekt `investigate` + token_clue.
4. **Prewencja combat „except by enchanted/enchantment creatures”** (Inspire Awe)
   — nowy filtr prewencji.
5. **Token-kopia artefaktu z haste + delayed exile** (Cogwork Assembler).
6. **„can't be blocked except by [kolor]”** (Dread Warlock) — statyczna
   restrykcja blokowania.
7. **Counter artifact spell** (Steel Sabotage) — nowy typ celu czaru-stosu.
8. **Job select** (Warrior's Sword) — ETB equipment: create Hero token + attach.
9. **Equipment nadaje podtyp Warrior** + `+3/+2` (Warrior's Sword).
10. **Czasowa kontrola do EOT + untap + haste + zniszcz equipment** (Awaken the Sleeper).
11. **Trigger „kreatura kontrolowana wchodzi”** (Impact Tremors) + damage each opponent.

## Talie (B)

Stworzyć 2-3 nowe ciekawe talie wykorzystujące karty batcha + dopisać karty
do istniejących talii singleton (paradygmat M32).

## Testy

`test/real-cards-batch31.test.js` — dla każdej karty legalny + nielegalny +
sanity Scryfall + interakcje. Aktualizacja `test/repo-decks.test.js`,
`test/art-ids-tool.test.js` (withArt) jeśli wymagane.

## Kolejność commitów
1. plan
2. mechaniki generyczne w engine (każda osobno / grupowo)
3. definicje kart
4. talie
5. testy
6. docs


## Wykonanie (2026-08-13)

- [x] Plan + Scryfall (10 kart).
- [x] Mechaniki generyczne: trigger z grobu+pay, enterAsCopy, investigate/Clue,
  prewencja combat except-enchanted, create_copy_token, cantBeBlockedExceptByColors,
  artifact_spell_on_stack, job_select+Warrior subtype, gain_control_until_EOT
  + destroy_equipment, creature_you_control_enters.
- [x] Root cause: legalActivatedAbilities (tylko stwory jako cele) — Cogwork.
- [x] Definicje kart + token_clue.
- [x] Talie: ostrza, mechanicy, sojusznicy + dopiski do istniejących.
- [x] Testy batch31 (12); aktualizacje istniejących; `npm test` 1442/0;
  `npm run build` 50 modułów / ~1570.3 kB.
- [x] Docs: PROJECT_STATE (M82), ENGINE_MILESTONES, HANDOFF.
