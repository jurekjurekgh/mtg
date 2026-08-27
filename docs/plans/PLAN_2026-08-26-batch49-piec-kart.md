# PLAN 2026-08-26 — Batch 49 (5 kart z listy właściciela)

- **Sesja:** `arena/01a03e9e-mtg`, PR #83 (kontynuacja)
- **Baza:** `main` @ #81; gałąź na `696d73e`. `npm test` 3403, build 54 / 2733.8 kB.
- **Tryb:** ADR 0010 (dane Scryfall przed kodowaniem — ZROBIONE), ADR 0014
  (definicje w `card-data.js`), ADR 0002 (mechaniki generyczne, bez nazw kart),
  ADR 0020 (commit po każdym samodzielnie zielonym kroku), ADR 0022 (100% Oracle
  albo `unsupported`), ADR 0023 (talie per plan / worki, generator).
- **Procedura:** `docs/cards/HOW_TO_ADD_CARD.md`.

## Lista właściciela (artId + set + plan)

| artId | Karta | Set | Plan |
|---|---|---|---|
| 567 | Jwar Isle Avenger | OGW | Zendikar |
| 568 | Nanoform Sentinel | EOE | The Edge |
| 569 | Manifest Dread | DSK | Duskmourn |
| 570 | Dimir Guildgate | GRN | Ravnica |
| 571 | Vow of Flight | CMR | Fiora |

## Dane Scryfall (pobrane — ADR 0010 §2a) ✅

- [x] `docs/cards/scryfall-jwar-isle-avenger.json` — {4}{U} 3/3 Sphinx, Flying, Surge {2}{U}
- [x] `docs/cards/scryfall-nanoform-sentinel.json` — {2}{U} 3/2 Artifact Robot, „whenever becomes tapped, untap another target permanent (once/turn)"
- [x] `docs/cards/scryfall-manifest-dread.json` — {1}{G} Sorcery, „Manifest dread"
- [x] `docs/cards/scryfall-dimir-guildgate.json` — Land — Gate, enters tapped, {T}: U or B
- [x] `docs/cards/scryfall-vow-of-flight.json` — {2}{U} Aura, +2/+2, flying, can't attack you

## Rozpoznanie mechanik (co już jest w engine)

| Karta | Mechanika | Stan w engine |
|---|---|---|
| Dimir Guildgate | dual land entersTapped + {T}: add U/B | ✅ ISTNIEJE (wzorzec Dismal Backwater / Heap Gate) — trywialne |
| Vow of Flight | aura pump + flying + cantAttackYou | ✅ ISTNIEJE (`aura.pump`, `keywords`, `cantAttackYou`) — wzorzec Serra's Embrace |
| Nanoform Sentinel | trigger „this becomes tapped" → untap target, once/turn | ⚠️ CZĘŚĆ: `object_tapped` event i `untap_permanent` istnieją; brak triggera `self_becomes_tapped` z CELEM i `oncePerTurn` dla triggera |
| Jwar Isle Avenger | Flying + Surge (alt-cost {2}{U} jeśli rzucono inny czar w tej turze) | ⚠️ NOWA MECHANIKA: Surge (alt-cost); `spellsCastThisTurnByPlayer` już śledzone |
| Manifest Dread | Sorcery: manifest dread (top 2 → 1 face-down 2/2, 1 do grobu; face-up za koszt jeśli stwór) | ⚠️ NOWA MECHANIKA: manifest (face-down 2/2 z biblioteki); infra faceDown/turnFaceUp istnieje (morph) |

## Kolejność (najprostsze najpierw — commit po każdej karcie zielonej)

### Etap 0 — plan (ten commit)
- [x] Scryfall pobrany, plan zapisany
- [ ] artId 567–571 dopisane do `tools/collection-art-ids.csv`
- [ ] commit + push planu (ADR 0020 A)

### Etap 1 — Dimir Guildgate (land, zero nowych mechanik)
- [ ] `defineCard` (entersTapped, {T}: add U/B) — wzorzec Dismal Backwater bez lifegain
- [ ] dopisz do talii planu Ravnica (generator); test
- [ ] `npm test`+build → commit+push

### Etap 2 — Vow of Flight (aura, zero nowych mechanik)
- [ ] `defineCard` aura: pump +2/+2, keywords flying, cantAttackYou — wzorzec Serra's Embrace
- [ ] talia planu Fiora (worek?) — sprawdzić przydział generatora; test
- [ ] `npm test`+build → commit+push

### Etap 3 — Nanoform Sentinel (trigger self-tap → untap target, once/turn)
- [ ] Mechanika generyczna: trigger `self_becomes_tapped` (event object_tapped,
      źródło == tapnięty obiekt), z CELEM (`untap_permanent`) i `oncePerTurn`
      dla triggera (nowy licznik triggerFiredThisTurn albo reuse).
- [ ] Wyprowadzić na powierzchnię: playerView (oferta celu), etykieta, bot.
- [ ] test RED→GREEN (self-tap→untap, tylko raz/turę, cel dowolny permanent)
- [ ] `npm test`+build (+benchmark jeśli tknięty bot) → commit+push

### Etap 4 — Jwar Isle Avenger (Flying + Surge alt-cost)
- [ ] Mechanika generyczna Surge: alt-cost rzutu, legalny gdy
      `spellsCastThisTurnByPlayer[playerId] > 0`; deskryptor `surge: { cost, colors }`.
- [ ] Enumeracja w legalCommands (jak warp/madness), etykieta, bot (wycena).
- [ ] test RED→GREEN (surge legalny po 1. czarze, nielegalny bez; koszt normalny zawsze)
- [ ] `npm test`+build → commit+push

### Etap 5 — Manifest Dread ✅ DONE (commit M222/5, re-implementacja po resecie workspace)
DONE: efekt `manifest_dread` (look top 2 → decyzja `resolve_manifest_dread` →
face-down 2/2 przez `manifestCardFaceDown`, druga do grobu); obrót
`turn_manifest_face_up` (specjalna akcja, koszt many, tylko karty stworów).
Reuse infra faceDown/turnFaceUp/faceDownOriginal. Nowe: pendingManifestDread,
manifestReady/manifestTurnUpCost (identity/game-state/fingerprint/ADD_OBJECT_FIELDS),
COMMAND_TYPES + EVENT_TYPES, etykiety PL + DRUGA_OSOBA. Plan Duskmourn.
Testy batch50 (5). npm test 3420, benchmark 9/9, build 54/2751.6 kB.

### Etap 5 (oryginalny opis)
- [ ] Mechanika generyczna `manifest_dread`: look top 2, decyzja gracza która
      karta na pole bitwy face-down jako 2/2 (bez cech karty, CR 701.34), druga
      do grobu; face-down można obrócić za koszt many, jeśli to karta stwora.
      Reuse infra faceDown/turnFaceUp z morpha; różnica: manifest może obrócić
      DOWOLNĄ kartę stwora (nie tylko z morph descriptor).
- [ ] Decyzja blokująca (resolve_*), playerView, etykieta, bot.
- [ ] test RED→GREEN (2 karty z wierzchu, wybór, face-down 2/2, face-up za koszt;
      nie-stwór nie da się obrócić)
- [ ] `npm test`+build → commit+push

### Etap końcowy
- [ ] `node tools/generate-plan-decks.mjs` — przydział kart do talii (ADR 0023)
- [ ] `test/catalog-coverage.test.js` + `test/repo-decks.test.js` zielone
- [ ] benchmark szybki jeśli bot tknięty (ADR 0018)
- [ ] `docs/PROJECT_HISTORY.md` + `docs/ENGINE_MILESTONES.md`; podsumowanie PR

## Ryzyka / pułapki
- **Manifest**: pole face-down 2/2 z biblioteki NIE ma cech karty (CR 701.34a);
  obrót face-up tylko dla kart STWORÓW, za ich koszt many. Nie mylić z morph
  (morph obraca za koszt morph z deskryptora). Kopiowalność cech (L47) —
  sprawdzić, że face-down manifest ma poprawny zestaw pól.
- **Surge**: to alt-cost, NIE redukcja kosztu; kolory kosztu surge liczą się
  osobno (bramka kolorów wg AKTYWNEGO kosztu — L52/M161).
- **Nanoform once/turn**: „triggers only once each turn" dotyczy TRIGGERA, nie
  zdolności aktywowanej — potrzebny licznik per (obiekt, trigger) na turę.
- **Talie/plany**: „The Edge"/„Fiora"/„Duskmourn"/„Zendikar"/„Ravnica" — część
  może być workiem (ADR 0023). Generator sam przydzieli; nie edytować map ręcznie
  poza dopisaniem nowego planu do worka, jeśli generator się wywali.
- **ADR 0002**: każda nowa mechanika generyczna (surge, manifest, self-tap
  trigger) — bez warunków na nazwę karty; strażnik catalog-coverage.
