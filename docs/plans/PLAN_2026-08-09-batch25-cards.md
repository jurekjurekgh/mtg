# PLAN 2026-08-09-batch25-cards

## Batch 25 — 10 kart (owner list 2026-08-09)

### Karty i mechaniki

| # | Karta | Set | Typ | Nowe mechaniki |
|---|-------|-----|-----|----------------|
| 1 | Trestle Troll | RTR | Creature 1/4 BG | (regenerate + defender + reach — existing) |
| 2 | Lab Rats | STH | Sorcery B | **Buyback** (CR 702.26) |
| 3 | Anthem of Champions | FDN | Enchantment GW | (static +1/+1 anthem — existing) |
| 4 | Goblin Deathraiders | ALA | Creature 3/1 BR | (trample — existing) |
| 5 | Fertile Thicket | BFZ | Land | entersTapped + ETB reveal top 5 (basic land selection) |
| 6 | Reassembling Skeleton | M19 | Creature 1/1 B | (fromGraveyard + return_to_battlefield_tapped — existing) |
| 7 | Idyllic Grange | ELD | Land — Plains | conditional entersTapped (≥3 other Plains) + ETB +1/+1 counter |
| 8 | Deadly Recluse | M10 | Creature 1/2 G | (reach + deathtouch — existing) |
| 9 | Benevolent Blessing | CMR | Aura W | Flash + **choose color** + **protection** (CR 702.16) |
| 10 | Springbloom Druid | MH1 | Creature 1/1 G | ETB sacrifice land → search 2 basic lands tapped |

### Nowe mechaniki engine (krok 4, generyczne ADR 0002)

1. **Buyback (CR 702.26):** additional cost on spell; if paid, card returns to hand
   after resolving instead of graveyard. Deskryptor `spell.buyback: { cost, colors }`.
   In `resolveTopOfStack` / `finishPendingSpell`: if `wasBuyback`, move to hand
   instead of graveyard. Enumerate in `legalSpellCasts` as variant.

2. **Protection from color (CR 702.16):** keyword on object, `protectionFromColors: ['W']`.
   Effects: can't be targeted by spells/abilities of that color; can't be blocked by
   creatures of that color; damage from that color is prevented; can't be enchanted
   by Auras of that color. For Benevolent Blessing's "doesn't remove your own
   Auras/Equipment" — filter by controllerId on detach check.
   IMPLEMENTATION: modify `validateTargets` (reject color), `legalBlockerOptions`
   (reject color), `preventDamageTo` (filter color), `removeIllegalAttachments`
   (skip controller's own). Choose color = `pendingColorChoice` +
   `resolve_color_choice` (new pending type).

3. **Conditional entersTapped (Plains count):** Idyllic Grange: enters untapped
   if controller has ≥3 OTHER Plains. Existing `entersTappedCondition` pattern
   (M29: life ≤13). Add `entersTappedCondition: { minPlains: 4 }` (3 others + self
   not counted — count Plains excluding self).

4. **ETB with optional sacrifice + search N:** Springbloom Druid: "you may sacrifice
   a land. If you do, search for up to 2 basic lands tapped." Pattern: ETB trigger
   with `pendingSacrificeSearch` — if player has land → offer sacrifice choice →
   if accepted → search 2 basic lands to battlefield tapped. New queue type.

5. **ETB reveal top N + select:** Fertile Thicket: look at top 5, reveal basic land,
   put on top, rest bottom. Similar to `reveal_top_to_bottom_order` (Stomping Slabs)
   but simpler — just pick 0-1 basic land from top 5. Reuse `pendingRevealOrder`
   pattern or new `pendingTopReveal`.

6. **ETB +1/+1 counter on target (when enters untapped):** Idyllic Grange: ETB
   trigger fires only when land entered untapped. Check `wasUntapped` on ETB event.

### Etapy (commity)

1. **Plan** — ten plik
2. **Engine** — buyback, protection, conditional Plains entersTapped, sacrifice-search ETB, top-reveal ETB
3. **Cards feat 1** — Trestle Troll, Goblin Deathraiders, Deadly Recluse, Anthem of Champions (simple)
4. **Cards feat 2** — Lab Rats (buyback), Reassembling Skeleton (fromGraveyard), Fertile Thicket (reveal), Idyllic Grange (Plains condition)
5. **Cards feat 3** — Benevolent Blessing (protection), Springbloom Druid (sacrifice-search)
6. **Decks + test** — update singleton decks, write batch test, run npm test + build
7. **Docs** — PROJECT_STATE, ENGINE_MILESTONES

### ArtId (ze słownika kolekcji)

- trestle-troll: 235RTR
- lab-rats: 535STH
- anthem-of-champions: 231FDN
- goblin-deathraiders: 8ALA
- fertile-thicket: 273BFZ
- reassembling-skeleton: 248M19
- idyllic-grange: 187ELD
- deadly-recluse: 375M10
- benevolent-blessing: 422CMR
- springbloom-druid: 470MH1

### Pułapki

- Buyback: spell goes to hand AFTER resolving, not before (CR 702.26)
- Protection: need to check color of source, not just type
- Springbloom Druid: "up to two" = player chooses 0, 1, or 2 (search choice)
- Fertile Thicket: "up to one" basic land = may reveal 0 or 1
- Idyllic Grange: is a Plains itself, "three or more OTHER Plains" excludes self
- Benevolent Blessing: flash = can cast at instant speed; aura needs enchant creature
- Test seeds reshuffled after deck changes (hunter pattern)
