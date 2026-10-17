# Plan — batch 68 (kolekcja 400–411), 10 kart

**Gałąź:** `arena/4fcdc89b-mtg` · **PR:** #167 (ten sam PR sesji, opis uzupełniany kumulatywnie)
**Zlecenie właściciela (2026-10-17):** lista 10 wpisów z artId 400–411. Plan każdej karty
(`Plan`) przepisujemy z listy 1:1 (wiążące, `HOW_TO_ADD_CARD.md` — sekcja „Zanim zaczniesz").
Zlecenie: **wszystkie karty w 100%** (`supported`), brakujące mechaniki dokodowujemy generycznie
(ADR 0002), z ręcznym strojeniem scoringu bota dla nowych mechanik.

## Lista kart

| artId | karta | set | plan (lista) | typ | mechaniki |
| --- | --- | --- | --- | --- | --- |
| 400 ECL | Kulrath Zealot | ECL | Lorwyn | Creature 6/5 R | ETB: exile top, play until end of your next turn; basic landcycling {1}{R} |
| 402 KTK | Bloodfire Expert | KTK | Tarkir | Creature 3/1 R | prowess |
| 404 DMU | Meteorite | DMU | Dominaria | Artifact {5} | ETB: 2 damage to any target; {T}: any color |
| 405 BRO | Raze to the Ground | BRO | Dominaria | Sorcery {2}{R} | **can't be countered** (także wobec warda); destroy target artifact; if its MV ≤1, draw |
| 406 THS | Stymied Hopes | THS | Kaldheim | Instant {1}{U} | counter unless its controller pays {1}; scry 1 |
| 407 M21 | Secure the Scene | M21 | Ravnica | Sorcery {4}{W} | exile target nonland permanent; **its controller** creates a 1/1 Soldier |
| 408 SNC | Halo Scarab | SNC | New Capenna | Artifact Creature 2/1 {2} | {2}, exile from graveyard: Treasure |
| 409 M19 | Child of Night | M19 | Warhammer Fantasy | Creature 2/1 B | lifelink |
| 410 CLB | Austere Command | CLB | Kaldheim | Sorcery {4}{W}{W} | **choose two** modes: destroy all artifacts / enchantments / creatures MV ≤3 / MV ≥4 |
| 411 SOM | Neurok Invisimancer | SOM | Mirrodin | Creature 2/1 U | **stały „can't be blocked"**; ETB: target creature can't be blocked this turn |

## Stan silnika (zmierzony przed zmianami)

- Istnieje już: `exile_top_playable_until_next_turn`, basic landcycling (Fiery Fall), prowess,
  lifelink, `counter_spell_unless_pays` (Abstruse Interference), `scry`, `add_mana` z kolorami
  WUBRG (Meteorite), `any_target`, `cant_be_blocked` (ETB/zaklęcie), `create_token` z kontrolerem
  zdarzenia, zdolność z cmentarza z kosztem `exileFromGraveyard` (Goldmeadow Nomad), `exile_all`
  z filtrem typów i `manaValueAtMost` (Ruinous Rampage), `drawPlayerCards`.
- **Brak — do zbudowania generycznie:**
  1. czar „can't be countered" (flaga na czarze; kontra i ward nie mogą go zniszczyć),
  2. `destroy_permanent` z warunkiem „jeśli jego wartość mana była ≤ N, dobierz kartę" (wartość z chwili zniszczenia),
  3. token dla **kontrolera celu** (`create_token` z `controllerOfTarget`, kontroler zapisany przed wygnaniem),
  4. stały „can't be blocked" na permanencie (statyczna zdolność; `combat.js`),
  5. `destroy_all` z filtrem (typy, MV ≤ N / ≥ N) — wzorzec `exile_all`,
  6. **wybór wielu trybów** (`chooseModes: N`): komenda niesie listę indeksów; oferta = każda
    kombinacja N różnych trybów; tryby bez celów (Austere ma wyłącznie tryby bez celów).
- Uwaga (zgłoszone z katalogu): w katalogu NIE MA karty Vandalize; Ruinous Rampage to „Choose one”
  (jeden tryb), więc wzorca wyboru dwóch trybów nie było — budujemy go od zera.

## Etapy

- [x] **G0 — plan + słownik kolekcji** (ten commit): 10 wierszy w `tools/collection-art-ids.csv`.
- [ ] **G1 — pobranie danych**: snapshoty Scryfall (`set=`) + rulingi (ADR 0028) — w `.arena/batch68/`
      (katalog roboczy, poza repo; wchodzą do repo razem z definicjami).
- [ ] **G2 — mechaniki silnika** (po jednym commicie na mechanikę, każda z testem RED→GREEN
      na kartach SYNTETYCZNYCH w pliku testu, ADR 0029).
- [ ] **G3 — definicje 10 kart** + snapshoty + `artId` + generator talii (`node tools/generate-plan-decks.mjs`).
- [ ] **G4 — testy** `test/real-cards-batch68.test.js` (legalny, nielegalny, sanity danych).
- [ ] **G5 — 4 dowiązania nowych deskryptorów** (EVENT_TYPES, etykieta PL, wycena bota, gameObjectDataOf/installDeck).
- [ ] **G6 — bot**: wycena nowych mechanik (ręczne strojenie, PMSSB-style) + pomiar.
- [ ] **G7 — bramy**: `npm test`, `npm run build`, `cr-numery`; dokumentacja (PROJECT_HISTORY, ENGINE_MILESTONES, HANDOFF).
