# PLAN 2026-09-01 — batch 52 kart (580–588, lista właściciela)

**Sesja:** `arena/01a05d4f-mtg` (PR #92 — nośnik batcha).
**Baza:** `main` @ `3c23e03` (squash PR #91, merged 2026-09-01T13:42Z).
**Prompt (właściciel):** „Najwyższa pora na nowy batch kart" — 9 kart:
580FIN Loporrit Scout · 581SOS Ulna Alley Shopkeep · 582FIN Vaan, Street
Thief · 583KTK Kill Shot · 584ZNR Merfolk Falconer · 585MKC Jolrael, Mwonvuli
Recluse · 586AER Fourth Bridge Prowler · 587DFT Leonin Surveyor · 588EMN
Cemetery Recruitment.

Zasady: **ADR 0010 §2a** (Scryfall najpierw → `artId` ze słownika →
`defineCard` w `REAL_CARDS` → talie → testy → dokumentacja; procedura
`docs/cards/HOW_TO_ADD_CARD.md`), **ADR 0002** (mechaniki generyczne, bez
warunków po nazwie karty), **ADR 0022** (`supported` = 100% Oracle albo
nieobsługiwana; `limitations` puste lub tylko strukturalne), **ADR 0020**
(inkrementalne commity na gałęzi sesji, bez force push, squash właściciela).

## Pomiar startowy (przed kodowaniem)

- [x] `npm test` (fast): **4084/4084 pass**, 0 fail.
- [x] `npm run build`: OK — **57 modułów / 3033,4 kB**.
- [x] Baza `3c23e03`, gałąź `arena/01a05d4f-mtg`.
- [x] Oracle 9 kart pobrany ze Scryfalla → `docs/cards/scryfall-*.json`
      (data pobrania 2026-09-01).

## Etap 1 — dane kart (ADR 0010 §2a)

- [x] Scryfall `named?exact=…&set=…` dla wszystkich 9 kart; zapis JSON.
- [x] Rulingi WotC dla Vaana (rzut tylko póki zdolność na stosie; ostatnia
      zdolność rozstrzyga się przed czarem, nawet skontrowanym).
- [x] `tools/collection-art-ids.csv` dopisane 580–588 (trzykolumnowy format
      `Ilustracja,Nazwa Karty,Plan`); `test/art-ids-tool.test.js` 579→588.

## Etap 2 — mechaniki silnika (generyczne, ADR 0002)

- [x] `loporrit-scout`: reuse `another_creature_enters` + `youControl` + `pump`.
- [x] `ulna-alley-shopkeep`: licznik `state.lifeGainedThisTurn` (`changeLife`)
      + reset tury + static condition `gainedLifeThisTurn` (pump +2/+0).
- [x] `kill-shot`: reuse `attacking_creature` + `destroy_permanent`.
- [x] `fourth-bridge-prowler`: reuse ETB `mayFire` + optional `requiresTarget`
      + `buff_creature_until_end_of_turn` -1/-1.
- [x] `leonin-surveyor`: wzorzec Glitch Ghost Surveyor (`start_engines`,
      `maxSpeed` z grobu) + static `activePlayerIsController` → first strike.
- [x] `merfolk-falconer`: nowy trigger `you_cast_kicked_spell` (rzut z
      kickerem → scry 2; `permanent_cast.kicked`/`object.wasKicked`).
- [x] `cemetery-recruitment`: `return_card_from_graveyard_to_hand` +
      `drawIfSubtypes` (podtyp Zombie → dobranie).
- [x] `jolrael`: trigger `you_draw_second_card_each_turn` (licznik
      `cardsDrawnThisTurn` >= 2) → token 2/2 Cat; aktywowane masowe bazowe
      X/X (X = karty w ręce) → per-creature `tempBasePT` + `stats_modified`.
- [x] `vaan-street-thief`: trigger `any_combat_damage_to_player` z filtrem
      podtypów (Scout/Pirate/Rogue, dedup per kontroler|podtypy) →
      `exile_top_of_player_library_and_may_cast` (blokująca decyzja
      `resolve_exile_cast`, rzut TERAZ ignorujący timing, inaczej Treasure);
      trigger `you_cast_spell_you_dont_own` (ownerId ≠ controllerId) →
      `add_counter_to_creatures_you_control` per podtyp.
- [x] `hasColorForCardId`/`spellManaPurpose`/`effectiveSpellManaCost` w
      ofercie i walidacji rzutu z wygnania (L48: oferta = walidacja).

## Etap 3 — definicje kart

- [x] 9 × `defineCard` w `src/cards/card-data.js` (plan wg CSV).
- [x] `MANA_COSTS` dla 9 kart (`src/cards/mana-costs-data.js`).
- [x] Token Cat (Jolrael) w `TOKEN_IMAGES` + wpis katalogowy (M202/K).

## Etap 4 — etykiety, klasyfikacje, talie, testy

- [ ] Etykiety PL dla nowych zdarzeń/efektów (strażnik M122, M202/C,
      KEYWORD_LABELS / KEYWORD_EVENT_LABELS).
- [ ] Klasyfikacja nowych efektów w heuristic-bocie (strażnik 616/618) +
      klasyfikacja zdolności aktywowanej Jolrael bez `{T}` (B1, M255/C1).
- [ ] `node tools/generate-plan-decks.mjs` → decks/ (M178 + M33).
- [ ] Testy nowych mechanik (per `test/real-cards-batchNN.test.js` / wzorzec).
- [ ] `npm test` + `npm run build` zielone; aktualizacja README,
      PROJECT_HISTORY, ENGINE_MILESTONES.
- [ ] Push na `arena/01a05d4f-mtg`, opis PR #92 (batch 52).
