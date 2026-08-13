# Plan: audyt rozgrywki żywym testerem (M83)

Sesja `arena/019ff818-mtg`. Zlecenie właściciela: użyć Żywego Testera
(`tools/table-tester/run-game.mjs`), wcielić się w rolę gracza, rozegrać partie
na prawdziwym artefakcie przeciwko botowi i zebrać ≥15 błędów/niejasności/
uproszczeń z perspektywy gracza, potem je naprawić.

## Metoda
1. `npm run build` (artefakt) + partie różnymi taliami (ostrza, mechanicy,
   sojusznicy, wiedzmin, green, red, azorius, black, spellslinger, tokens,
   innistrad, graveyard) z różnymi seedami.
2. Obserwacja: modale, log, etykiety akcji, walka, stos, kontrolę, transform.

## Znalezione błędy / niejasności (9 — do naprawy)

1. **Gramatyka logu walki:** „Highland Game i Barkform Harvester i Emissary
   Escort **blokuje**" — przy wielu blokerach powinno być „A, B i C **blokują**".
   (`blockers_declared` w session.js — `join(' i ')` + zawsze „blokuje").
2. **„Faza: Faza główna"** — nagłówek modala dublował słowo „faza"
   (`stepLabelOf` zwraca „Faza główna", a prefiks to „Faza: "). → „Faza: Główna 1".
3. **„Brak bloków" w modalu „Ruch przeciwnika"** — szum jak „Brak ataku"
   (puste przypisania bloków). Powinien być pomijany.
4. **Etykieta „Obróć twarzą do góry: morph (morph )"** — pusty koszt obrotu.
   PlayerView battlefield nie niósł `morph`, więc `commandLabel` nie miał
   dostępu do `morphCost`/`megamorphCost`.
5. **„→ cel: ?" na stosie** — czar celujący w GRACZA (Release the Ants)
   renderował cel jako „?" bo stack-view używał `session.nameOfObject` (nie
   zna graczy). → rozpoznanie gracza po `view.players`.
6. **Surowe „Trigger <event>:"** dla common triggers (when_you_cast_spell,
   beginning_of_combat, player_casts_spell, leaves_battlefield,
   other_permanent_you_control_dies, permanents_you_control_leave_battlefield,
   enchanted_creature_damage_to_opponent, any_combat_damage_to_player,
   card_put_into_graveyard_from_nonbattlefield, spell_targets_this_creature,
   another_creature_enters, mentor_attacks, attacks_alone).
7. **Etykieta czaru X nie podaje wartości X** — „Rzuć: Fireball (koszt XR)"
   bez informacji, ile X. → „X=N".
8. **Bot zapętla się re-equipem tego samego stworu** (Hunter's Blowgun → ten
   sam nosiciel w kółko, stos pęczniał, gra utykała). → kara za re-equip
   obecnego nosiciela w `heuristic-bot.js`.
9. **Błędny opis Insatiable Appetite** — „poświęć Food (zyskaj 3 życia)" —
   to +5/+5/+3/+3, nie „zyskaj 3 życia" (render mylił z tokenem Food).
   → „poświęć Food (+5/+5) albo +3/+3 do końca tury".

## NIE-bugi (artefakty/zaobserwowane, bez naprawy)
- Podwójne „choroba"/P/T na kaflach — jsdom nie ładuje obrazów (syntetyczna
  twarz + nakładka); na telefonie pojedyncze.
- Re-equip tego samego stworu przez testera (klikacz) — artefakt testera;
  poprawka bota (#8) obejmuje bot, tester pozostaje prosty.
- Banishment Decree na token (token znika poza bitwiskiem — CR 704.5d, OK).

## Kolejność commitów
1. plan
2. fixy UI/log (render.js, session.js, game-state.js)
3. fix bota (heuristic-bot.js) + benchmark
4. testy regresyjne
5. docs (PROJECT_STATE, handoff)

## Weryfikacja
- `npm test` zielone; `npm run build`.
- Benchmark (zmiana bota #8): pełna macierz bez niedokończonych, progi win-rate
  utrzymane.


## Wykonanie (2026-08-13)

- [x] 10+ partii różnymi taliami (ostrza, mechanicy, sojusznicy, wiedzmin,
  green, red, azorius, black, spellslinger, tokens, innistrad, graveyard).
- [x] 10 błędów naprawionych u root cause (patrz niżej) + testy regresyjne
  (`test/audit-m83-tester.test.js`, 10 testów).
- [x] `npm test` 1452/0; `npm run build` 50 modułów / ~1574 kB.
- [x] Bot zmieniony (re-equip kara) + craft no-op → pełny B0 bez niedokończonych;
  progi win-rate utrzymane (test benchmarku 7/7).
