# PLAN Batch 38 — 10 kart (2026-08-19)

Lista właściciela. Oracle ze Scryfalla (pobrane 2026-08-19 przez fetch_page,
ADR 0010 §2a).

## Karty

| Karta | Set | Koszt | Typ | Mechaniki |
|-------|-----|-------|-----|-----------|
| Divine Offering | MBS | {1}{W} | Instant | Destroy target artifact; gain life = its MV |
| Weftblade Enhancer | EOE | {5}{W} | Creature 3/4 | ETB: +1/+1 on up to two targets; **Warp {2}{W}** |
| Colossodon Yearling | DTK | {2}{G} | Creature 2/4 | — (vanilla) |
| Talion's Messenger | WOE | {2}{U} | Creature 1/3 Fly | Atk with Faerie → draw+discard → +1/+1 counter on Faerie |
| Fortify | TSP | {2}{W} | Instant | Modal: your creatures +2/+0 OR +0/+2 |
| Mysidian Elder | FIN | {2}{R} | Creature 1/3 | ETB: create 0/1 Wizard token (noncreature spell → 1 dmg each opp) |
| Pristine Talisman | NPH | {3} | Artifact | {T}: Add {C}, gain 1 life |
| Chatter of the Squirrel | 2XM | {G} | Sorcery | Create 1/1 Squirrel token; Flashback {1}{G} |
| Silken Strength | DFT | {1}{G} | Aura (flash) | Enchant creature or Vehicle; ETB untap; +1/+2 reach |
| Lotusguard Disciple | DFT | {2}{W} | Creature 2/2 Fly | ETB: target creature/Vehicle gains lifelink+indestructible |

## Nowe generyczne mechaniki (ADR 0002)

1. **`creature_or_vehicle`** — cel/aure (Silken, Lotusguard): stwór LUB
   Vehicle (artefakt z podtypem Vehicle). W attachments.js, resources.js
   (aura), spells.js (target offer+validate).
2. **`destroy_artifact_gain_life_mana_value`** — Divine Offering: zniszcz
   artefakt, zyskaj życie równe jego mana value.
3. **mana + `gain_life`** — Pristine Talisman: rozszerzenie
   `isActivatedManaAbility`, by zdolność many mogła też dawać życie.
4. **token ze zdolnością triggerowaną** — Mysidian Elder: token 0/1 Wizard
   z triggerem `you_cast_noncreature_spell` → damage each opponent.
5. **Warp (CR EOE)** — Weftblade: alternatywny koszt z ręki, exile przy
   następnym end step, rzut z exile w późniejszej turze.
6. **Talion's Messenger** — attack-with-Faerie trigger → draw+discard →
   +1/+1 counter na Faerie (kompozycja triggerów).
7. Reuse: create_token (Chatter), modal buff (Fortify), ETB untap + reach
   aura (Silken), grant_keywords_until_end_of_turn (Lotusguard).

## Plan commitów (każdy zielony: `npm test` + `npm run build`)

1. Plan + dane Scryfall (10 plików JSON).
2. `creature_or_vehicle` (target + aura) + testy.
3. Reuse (Colossodon, Chatter, Fortify) + talie.
4. Divine Offering (destroy+gain MV) + test.
5. Pristine Talisman (mana+gain life) + test.
6. Mysidian Elder (token z triggerem) + test.
7. Lotusguard Disciple + Silken Strength (creature_or_vehicle, grant, untap).
8. Weftblade Enhancer (Warp + ETB up-to-two).
9. Talion's Messenger.
10. Dokumentacja (PROJECT_STATE, handoff).

## Kryteria ukończenia
- [ ] Wszystkie karty zdefiniowane z Oracle (scryfall-*.json).
- [ ] Wszystkie wspierane karty obecne w taliach (repo-decks guard).
- [ ] `npm run test:all` zielony; build; push; CI; opis PR.
