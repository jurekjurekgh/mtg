# Plan sesji — Batch 73: kolekcja 645–655 (11 kart realne)

**Cel:** dodać 11 kart z kolekcji właściciela (pozycje 645–655, kontynuacja po Batch 72 kończącym się na 644) do `src/cards/card-data.js` w sekcji `REAL_CARDS`, przydzielić je do talii przez `node tools/generate-plan-decks.mjs`, dodać testy `test/real-cards-batch73.test.js` i ewentualnie nowe mechaniki generyczne w engine (ADR 0002). PMSSB dla nowych mechanik (Krok 7 HOW_TO_ADD_CARD.md).

## Lista kart (wiążące `plan` z listy właściciela — nie kwestionować)

| # | Karta | Set | Plan | Mechaniki |
|---|-------|-----|------|-----------|
| 645 | Might Beyond Reason | SOI | Teenage Mutant Ninja Turtles | Instant {3}{G}, Delirium (4+ typów w grobie), +1/+1 counters |
| 646 | Messenger's Speed | THS | Theros | Aura {R}, enchant creature, grant trample + haste |
| 647 | Get the Point | RNA | Ravnica | Instant {3}{B}{R}, destroy target creature + Scry 1 |
| 648 | Seton's Desire | DMR | Dominaria | Aura {2}{G}, +2/+2, Threshold (7+ w grobie → blokowanie wymuszone) |
| 649/650 | Spring-Loaded Sawblades // Bladewheel Chariot | LCI | Forgotten Realms | TDFC Transform, Craft {3}{W}, Flash, ETB 5 dmg, Vehicle 5/5, Crew 1 |
| 651 | Leonin Lightbringer | ONE | Mirrodin | Creature {2}{W} 3/2, Ward {2}, as long as equipped → +1/+1 |
| 652 | River Herald Guide | LCI | Ixalan | Creature {2}{G} 3/1, Vigilance, ETB explore |
| 653 | Necrosavant | DMR | Arcavios | Creature {3}{B}{B}{B} 5/5, activated from graveyard {3}{B}{B}, sacrifice creature, upkeep only |
| 654 | Kessig Flamebreather | VOW | Innistrad | Creature {1}{R} 1/3, trigger you_cast_noncreature_spell, 1 dmg do każdego przeciwnika |
| 655 | Plummet | M20 | Ixalan | Instant {1}{G}, destroy target creature with flying |

## Inwentarz mechanik (nowe vs istniejące)

| Mechanika | Status | Precedent |
|-----------|--------|-----------|
| Delirium (condition {delirium: true}) | ISTNIEJĄCA | card-data.js:3048, triggers.js:232 |
| Explore (effect {type: 'explore'}) | ISTNIEJĄCA | card-data.js:1978 (Guidestone Compass) |
| Craft + Transform DFC | ISTNIEJĄCA | card-data.js:1929 (Lodestone Needle // Guidestone Compass) |
| Ward (keywords: ['ward'], ward: N) | ISTNIEJĄCA | effects.js:2759, abilities.js:2244 |
| fromGraveyard activated | ISTNIEJĄCA | abilities.js:1365 |
| you_cast_noncreature_spell | ISTNIEJĄCE | effects.js:1660, triggers.js:3806 |
| Aura grant keywords (aura.keywords) | ISTNIEJĄCE | card-data.js:13309 (Infectious Bloodlust) |
| Static condition {minLandsControlled: N} | ISTNIEJĄCE | card-data.js:1185 (Scorpion Sentinel) |
| condition {minGraveyardCards: N} | **NOWA** | brak — potrzebna dla Seton's Desire Threshold |
| condition {equipped: true} + pump | **NOWA** | brak — potrzebna dla Leonin Lightbringer "as long as equipped" |
| Blocking restriction (must block enchanted) | **NOWA** | brak — potrzebna dla Seton's Desire Threshold efekt |

## Plan commitów (każdy samodzielnie zielony: npm test + npm run build)

1. **docs:** snapshoty Scryfall `docs/cards/scryfall-*.json` (10 plików) + ten plan — commit przed kodowaniem.
2. **engine:** jeśli potrzebne — dodanie `condition: { minGraveyardCards: N }` w `permanents.js` (Seton's Desire) i `condition: { equipped: true }` (Leonin Lightbringer) + blokada blokowania dla zaklętego stworzenia. RED→GREEN + mutacje.
3. **cards:** defineCard dla prostych kart (Plummet, Get the Point, Messenger's Speed, River Herald Guide) — commit.
4. **cards:** defineCard dla Might Beyond Reason (Delirium) — commit.
5. **cards:** defineCard dla Kessig Flamebreather (you_cast_noncreature_spell) — commit.
6. **cards:** defineCard dla Necrosavant (fromGraveyard activated) — commit.
7. **cards:** defineCard dla Spring-Loaded Sawblades // Bladewheel Chariot (TDFC Transform + Craft) — commit.
8. **cards:** defineCard dla Leonin Lightbringer (Ward + equipped bonus) — commit.
9. **cards:** defineCard dla Seton's Desire (Aura + Threshold) — commit.
10. **decks:** `node tools/generate-plan-decks.mjs` + `git diff decks/` — commit.
11. **tests:** `test/real-cards-batch73.test.js` (legalny + nielegalny + sanity dla każdej karty) — commit.
12. **PMSSB:** nowa pętla dla nowych mechanik (threshold, equipped bonus) — sonda PRZED, pokrętła, piny RED→GREEN — commit.
13. **docs:** `docs/PROJECT_HISTORY.md`, `docs/ENGINE_MILESTONES.md`, `docs/PMSSB.md` — commit.
14. **BRAMA:** `npm test` + `npm run build` + opis PR.

## Kryteria ukończenia

- Wszystkie 11 kart mają `support: { status: 'supported', limitations: [] }` (pełne mechaniki, bez limitations)
- `test/real-cards-batch73.test.js` zielone (legalny + nielegalny scenariusz per karta)
- `test/repo-decks.test.js` zielone po przydziale talii
- `npm test` zielone, `npm run build` podaje liczby modułów/rozmiar
- Nowe mechaniki mają 4 dowiązania (L84): EVENT_TYPES + opis zdarzenia, etykieta PL, wycena bota (albo REVIEWED_UNVALUED), `gameObjectDataOf`
- PMSSB zrobione dla nowych mechanik (threshold, equipped bonus)

## Ryzyka i pułapki

- **Seton's Desire Threshold:** efekt "wszystkie stworzenia zdolne do blokowania zaklętego stworzenia muszą blokować" to ograniczenie blokowania, nie pump — może wymagać nowej ścieżki w engine blokowania.
- **Leonin Lightbringer "as long as equipped":** warunek static zależny od stanu załączenia (equipped) — nowy typ condition.
- **TDFC Spring-Loaded Sawblades:** front ma Craft + Flash + ETB damage, back to Vehicle z Crew — dwa deskryptory, `transformTo`, back face `status: 'back'`.
- **Plan wiążący:** niektóre karty mają plan różny od setu (np. Leonin Lightbringer ONE → plan Mirrodin) — przepisuję 1:1, nie poprawiam.
- **artId:** żadna z nowych kart nie ma wpisu w `tools/collection-art-ids.csv` → bez artId (spada na Scryfall).

## Powiązane pliki

- `src/cards/card-data.js` — definicje kart (sekcja REAL_CARDS)
- `src/cards/registry.js` — `defineCard`, `createAbility`, `ABILITY_TYPE`
- `src/engine/permanents.js` — obsługa condition (minLandsControlled, nowa minGraveyardCards/equipped)
- `src/engine/effects.js`, `src/engine/triggers.js` — efekty i triggery
- `src/cards/materialize.js` + `src/engine/deck.js` — gameObjectDataOf / installDeck (L84, dwa miejsca)
- `test/real-cards-batch73.test.js` — testy kart (do napisania)
- `docs/cards/scryfall-*.json` — snapshoty (Krok 1, zrobione)
