# Plan: Batch 32 — 10 realnych kart (2026-08-13)

## Karty (Scryfall z set=)
1. Dream Twist (ISD) — mill 3 + **Flashback** {1}{U}
2. Voice of the Vermin (SNC) — **shield counter** + base 4/4 EOT
3. Setessan Skirmisher (THB) — **Constellation** +1/+1
4. Fathom Fleet Cutthroat (M20) — ETB destroy damaged-this-turn
5. Fierce Empath (2XM) — search creature MV>=6
6. Soulbright Flamekin (MM2) — 3. resolve → 8 {R}
7. Rustvine Cultivator (ONE) — oil + untap land
8. Trained Arynx (OTJ) — **Saddle 2** + attacks while saddled
9. Nature's Embrace (VOW) — aura creature **or land**
10. Ballista Watcher (VOW) — daybound/nightbound + ping

## Nowe mechaniki (ADR 0002)
- flashback (cast z grobu, potem exile)
- shield counters (zastępują damage/destroy)
- constellation (enchantment you control enters)
- saddle (jak crew, sorcery; flaga do cleanup)
- base P/T until EOT
- damagedThisTurn tracker
- search minManaValue
- abilityResolveCount + add 8 R
- aura enchant creature_or_land + grantMana na lądzie

## Etapy
- [x] E0 Scryfall + plan
- [x] E1 engine
- [x] E2 definicje + MANA_COSTS + talie
- [x] E3 testy
- [x] E4 docs + npm test/build

## Ryzyka
- shield vs SBA/destroy/deathtouch
- flashback vs escape (inna ścieżka, exile po resolve)
- Nature's Embrace land-host SBA
