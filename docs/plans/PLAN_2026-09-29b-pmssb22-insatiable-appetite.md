# PLAN — PMSSB-22: Insatiable Appetite (`sacrifice_food_choice`)

Data: 2026-09-29 (sesja 2026-09-29b, PR #146). Tryb: ADR 0021 (pętla
jakości) + PMSSB (M429: audyt przyczynowo-skutkowy JEDNEJ rodziny, fale,
piny). Nowy dowód = **zgłoszenie właściciela z gry** (uwaga A), które
otwiera rodzinę POKRYTĄ (rejestr: „pump/grant — nie ruszać bez nowego
dowodu").

## Zgłoszenie właściciela (kryterium akceptacji, dosłowny sens)

> Karta Insatiable Appetite. Bot kompletnie nie umie używać tej karty. Rzuca
> ją w mojej turze na moją kreaturę. Co za bezsens. To jest combat trick,
> który trzeba rzucać TYLKO na SWOJE KREATURY i to tylko w fazie walki —
> na swoje atakujące kreatury w swojej fazie walki po deklaracji ataku i na
> swoje blokujące w fazie ataku przeciwnika po zadeklarowaniu blokujących.
> W obu przypadkach tylko wtedy jeśli ten buff (+3/+3) cokolwiek zmieni
> w walce kreatury-celu — np. zada więcej obrażeń przeciwnikowi albo zada
> lethal obrażenia kreaturze przeciwnika.

## Rodzina

Insatiable Appetite (ELD, {1}{G} instant): „You may sacrifice a Food. If you
do, target creature gets +5/+5 until end of turn. Otherwise, that creature
gets +3/+3 until end of turn." Katalog: `spell.effects = [{ type:
'sacrifice_food_choice' }]`; silnik: `effects.js:4689` (brak Food → +3/+3 od
ręki; jest Food → `pendingFoodChoice` i decyzja `resolve_food_choice`).

## Diagnoza wstępna (przed sondą)

- **F1**: `sacrifice_food_choice` nie występuje w `heuristic-bot.js` ANI RAZU
  (`grep -c` = 0) i nie ma go w `TEMPORARY_PUMP_EFFECTS` (1061-1072). Skutek:
  `temporaryPumpOf` → null ⇒ `isPumpEffect` false ⇒ cała rodzina pump
  (okna M146/M96/M179, symulacja M218/2 `pumpChangesOutcome`, klamra
  `friendlyMisaimPenalty` M179/E przez `temporaryPumpOf`) **nie widzi karty**:
  zero wartości na własnym stworze, **zero kary** na stworze przeciwnika
  (dokładnie zgłoszenie), zero logiki okien.
- **F2**: `resolve_food_choice` (9888) = `finish(cmd.sacrifice ? 50 : 30)` —
  bot ZAWSZE poświęca Food za +2/+2 więcej, bez sprawdzenia czy to coś
  zmienia i bez wartości samego Food („{T}, poświęć: zyskaj 3 życia").
- **F3 (dane)**: `pendingFoodChoice` nie jest w `playerView` (0 trafień
  w bloku widoku 8860-8900), a komenda niesie tylko `{ sacrifice }`
  (`game-state.js:7741-7742`) — bot nie wie, KTÓREGO stwora dotyczy decyzja,
  więc nie może policzyć, czy +5/+5 zmienia wynik walki. Wymaga dosłania
  danych (zlecenie właściciela: „dorób je w engine").

## Etapy

- [ ] 0. Ten plan — commit.
- [ ] 1. Sonda PRZED `tools/pmssb22-insatiable-sonda.mjs` (scenariusze
      właściciela → tabela) + inwentarz okien.
- [ ] 2. F3: `creatureId` w komendzie `resolve_food_choice` (dane do decyzji).
- [ ] 3. F1: `sacrifice_food_choice` w `TEMPORARY_PUMP_EFFECTS` + rodzaj
      w `pumpDelta` (Food na polu → 5/5, inaczej 3/3) — L41: karta wchodzi
      do ISTNIEJĄCEJ rodziny, nie dostaje własnej gałęzi.
- [ ] 4. F2: `resolve_food_choice` z porównaniem +5/+5 vs +3/+3
      (`pumpChangesOutcome`) i wartością Food (`foodTokenValue`, życie bota).
- [ ] 5. Testy `test/audyt-pmssb22-insatiable.test.js` (wzorzec decide/trace,
      anty-over-fix, pokrętło ×0) + mutacje.
- [ ] 6. Ewaluacja: golden-master (cel: przypisany dryf), tie-audit PO,
      benchmark tylko szybki profil (ADR 0018).
- [ ] 7. Dokumentacja: raport w `docs/PMSSB.md` + wiersz rejestru +
      `docs/PROJECT_HISTORY.md` + opis PR. Bramy i push po każdym kroku.

## Pokrętła (planowane)

`food*` w `heuristic-params.js`: wartość zachowanego Food (3 życia) względem
dodatkowych obrażeń; reszta przez ISTNIEJĄCE okna pump (zero duplikatów).
