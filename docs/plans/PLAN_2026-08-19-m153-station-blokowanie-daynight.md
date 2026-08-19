# PLAN sesji M153 — uwagi właściciela (A1/A2/B/C)

Gałąź: `arena/01a01a7b-mtg` (PR #65).

## Uwagi z testów (2026-08-19)

- **A1.** Warmaker Gunship — aktywacja Station w logu/Rozgrywce pokazuje tylko
  „liczniki charge ze Station (moc zatapniętego stwora)”, bez nazwy stwora,
  który został TAPNIĘTY. Ma być nazwa (albo Morph, gdy zakryty).
- **A2.** Warmaker Gunship — bot tapuje wszystkie stwory ASAP, żeby osiągnąć
  próg charge Station, i potem nie ma kim atakować/blokować. Strategia: tapowanie
  kreatur na Station tylko w turze gracza, w Głównej 2 (po jego ataku).
- **B.** Bot nie blokuje: atak 4/4, obrońca ma 5 stworów (2/2,3/4,2/2,2/2,3/2)
  i mógłby zablokować dwoma (zabić atakującego), a przepuszcza 4 obrażenia.
  Bot ma blokować, by nie dostawać obrażeń — nawet kosztem utraty stworów.
- **C.** Karta specjalna Day/Night jest nieklikalna i nie ma hovera z powiększoną
  wersją (powinna działać jak basic landy). Sprawdzić też inne karty specjalne
  (np. Undercity — ma klik, ale brak hovera).

## Rozpoznanie (fakty z kodu)

- A1: `src/engine/abilities.js` — Station używa kosztu `tapOtherCreature`
  (`otherCreatureToTap`), który ląduje w `effectTargets`, ale zdarzenie
  `ability_activated` (i wpis na stosie) nie niesie go dla bezcelowej zdolności
  (pole `targets` tylko, gdy `ability.targets?.length`). `session.js` loguje
  tylko sztywny label `station_counters`. Naprawa: nieść `stationTappedCreatureId`
  w evencie i nazwać stwora w logu (nameOfObject — obsługuje Morph).
- A2: `src/controllers/heuristic-bot.js` — gałąź `station_counters` dodaje
  `4 + threshold - charge` bez gatingu na fazę; `tapsCreature` nie obejmuje
  `tapOtherCreature`. Naprawa: bonus tylko w `postcombat_main` własnej tury bota,
  poza nim kara poniżej passu; kara za tapnięcie wartościowego obrońcy.
- B: `src/controllers/heuristic-bot.js` — `declare_blockers`: karze utratę
  blokerów i sprawdza `killsAttacker` PER bloker (nie sumę mocy). Multi-block,
  który zabija atakującego, jest liczony jako strata. Naprawa: sumować moc
  blokerów vs wytrzymałość atakującego (multi-block kill), nagradzać zablokowane
  obrażenia i usunięty zagrożenie, karać tylko realną stratę blokerów.
- C: `src/table/render.js` — `renderDayNight` buduje `<img>` bez click/hover;
  `renderUndercity` ma click (fullscreen) ale bez hovera. `main.js` ma
  `openUndercityFullscreen`; brak `openDayNightFullscreen`. Naprawa: dodać
  click→fullscreen i hover (mouseenter/mouseleave/wheel) do obu kart specjalnych.

## Kryteria ukończenia (commit po commit, zielone: `npm test` + `npm run build`)

- [ ] A1: log Station nazywa tapniętego stwora (lub Morph). Test regresyjny.
- [ ] A2: Station tylko w Głównej 2 własnej tury bota; test (bot nie aktywuje
      w Main 1 / nie tapuje obrońcy).
- [ ] B: bot blokuje multi-blockiem zabijającym atakującego i blokuje, by
      nie dostawać obrażeń. Test regresyjny (scenariusz właściciela 4/4 vs 5 stworów).
- [ ] C: Day/Night i Undercity klikalne (fullscreen) + hover. Test render.
- [ ] `npm run test:all` zielony; push; CI zielony; opis PR zaktualizowany.
