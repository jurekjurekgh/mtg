# PLAN 2026-10-02b — PMSSB-36: mechaniki kart batcha 62 (exploit z zasobami, cel własny ETB, wypłata liczników na polu)

Pętla z procedury `docs/PMSSB.md`. Zgłoszenie właściciela 2026-10-02: „czy exploit
Vulturous Aven jest robiony z głową (poświęcać tylko gdy dość stworów, najmniejszego
bez zdolności)? czy przeszedł PMSSB? sprawdź WSZYSTKIE mechaniki nowych kart”.
Uwaga proceduralna: sonda PRZED i kod powstały przed spisaniem planu (rekonesans
na żądanie właściciela); plan idzie jako osobny commit PRZED kodem i testami.

## 1. Przegląd 10 kart batcha 62 pod kątem rodzin PMSSB

| Karta / mechanika | Rodzina PMSSB | Werdykt PRZED |
|---|---|---|
| Vulturous Aven — exploit: dobierz 2 + strać 2 życia | PMSSB-11 (exploit; powstał dla 3 kart BEZ takiego triggera) | **LUKA** — decyzja `resolve_exploit_choice` miała stałą `exploitBase` 40: ślepa na życie i bibliotekę; rzut karty liczył „impuls x=4” (cudzy trigger) |
| Jade Bearer — ETB licznik na INNEGO Merfolka | PMSSB-3 (ETB) | **LUKA** — bramka celu ETB `etbEnemyHasTarget` pytała o WROGÓW; wartość zależała od wroga, nie od celu (też Moogle, Weftblade) |
| Tackle Artist — Opus (licznik przy rzucie instant/sorcery) | PMSSB-10/23 (rzut nosiciela jest wyceniony) | **LUKA po stronie wypłaty** — rzut czaru przy Artyście na polu nie dostawał nic (Shock wypadał GORZEJ niż bez Artysty) |
| Oreplate Pangolin — licznik za {1} przy wejściu artefaktu | PMSSB-12 (pay-trigger) | **LUKA po stronie wypłaty** — rzut artefaktu przy Pangolinie nic nie dostawał |
| Chocobo Kick — kicker (zwrot lądu), bite ×2 | PMSSB-16 | OK (sonda: bez kicka gdy 1× zabija, z kickiem gdy tylko 2× zabija); bite bez zabicia ma dodatnią „chip” — świadoma kotwica PMSSB-16, nie ruszane |
| Mnemonic Wall — regrowth instant/sorcery | PMSSB-3 (ETB) | OK (sonda: Wall wygrywa z gołym stworem, gdy w grobie jest czar do zagrania; cel = zagrywalny kolorem) |
| Golem-Skin Gauntlets — +1/+0 za Equipment | PMSSB-34 (sprzęt) | OK (sonda: wybór celu z uwzględnieniem już przypiętych) |
| Fiery Justice — podział obrażeń + gain 5 wroga | batch 62 (`damageDivision`) | OK (osobny tor, pin B62) |
| Crumbling Vestige — ETB-mana | PMSSB-26/32 | naprawione w `8653c9d` |
| Lionheart Maverick — pump {4}{W} | PMSSB-34 (koszt aktywacji) | OK (pump POKRYTE) |

## 2. Fale

- **A — exploit z zasobami (PMSSB-11 → uzupełnienie):** trigger exploita z `draw_cards`/`lose_life`
  liczony NETTO z deskryptora (`exploitSelfResourceGain`): `drawCardValue × n` + drabina
  deck-outu (`drawDeckingPenalty`) − koszt życia (jedna drabina `selfLifeLossPenalty`,
  wspólna z `cast_spell` i ETB, L48). Decyzja: sac gdy `zysk − cena ofiary − cienka plansza − margines > 0`
  (skip = `exploitSkipBase`). Rzut karty liczy TĘ SAMĄ miarę (L41a), nie „impuls x=4”.
  „Dość stworów”: po wymianie < 2 moje stwory przy wrogich stworach → `exploitThinBoardPenalty`.
  Ofiara: najniższa `cena` (P/T + keywordy + zdolności z rejestru − token) — jak dotąd.
- **B — cel własny ETB:** licznik z ETB na „target creature (you control)” — dostępność celu po
  stronie własnej (`etbFriendlyCounterTargetAvailable`), `notSelf`/`subtype` z deskryptora.
- **C — wypłata liczników na polu:** `boardCastPayoffValue` — trigger „you cast instant/sorcery”
  (Opus, gałęzie `manaSpentBelow/AtLeast` od many rzutu) i „another artifact enters” (`payMana`,
  tylko gdy po koszcie rzutu zostaje mana) liczone `counterHostValue` × `boardPayoffWeight` (0,5).
- **D — dowody:** `test/audyt-pmssb36-nowe-karty.test.js`, golden-master (świadomie), raport w hubie.

## 3. Anty-over-fix i granice

Debuff (Silumgar) i mill (Drowner) zostają na dawnych ścieżkach; wycena z zasobami tylko dla
triggerów z `draw_cards`/`lose_life`. Pokrętła: `exploitThinBoardPenalty` 6, `exploitNetMargin` 1,
`boardPayoffWeight` 0,5 (0 przywraca stan sprzed zmiany). Poza zakresem (forward): wypłata innych
efektów niż licznik (dobranie/token) przy rzucie z payoffem na polu; zysk bite „bez zabicia”.
