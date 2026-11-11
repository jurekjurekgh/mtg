# Plan 2026-11-08d — zgłoszenie P: Twiddle jako combat trick

## Problem i zakres

Właściciel: „Karta Twiddle. «You may tap or untap target artifact, creature,
or land.» To jest typowy combat trick. Bot dalej nie umie go używać.”
Oczekiwane okna:
1. własny atak PO deklaracji atakujących: tapnąć groźnego potencjalnego
   blokera;
2. własna tura PRZED deklaracją: odkręcić własnego tapniętego stwora,
   który dzięki temu zaatakuje;
3. combat przeciwnika PRZED deklaracją: tapnąć groźnego potencjalnego
   atakującego;
4. combat przeciwnika PO deklaracji: odkręcić własnego tapniętego blokera,
   najlepiej takiego, który zada lethal atakującemu.

**Dopisek właściciela (2026-11-09):** bot rzucał Twiddle w swoim
podtrzymaniu — całkowicie poza oknem walki — „jak tylko ma manę”, bez
sensu. Karta ma być trzymana na okna walki (piny P/9, P/10).

Zakres: polityka wyceny bota dla efektów tap/untap (ADR 0002 — po
deskryptorze, nie po nazwie Twiddle). Bez nowych kart, bez pełnego B0.
PR sesji #184 już otwarty; każdy przyrost produkcyjny osobno zielony.

## Potwierdzenie przed kodem

Sonda `.arena/probe-twiddle.mjs` (trace bota):
- A (własny atak po deklaracji): bot wybiera `cast_spell(tw->atk)`
  (odkręcenie własnego, już atakującego stwora, +13) zamiast tapnąć
  blokera 4/4 (`tw->blk` = −21). Przyczyna: `pushPotential` nie uznaje
  zadeklarowanych, tapniętych atakujących za realny atak.
- B/C/D w wariancie podstawowym wybierają cel, ale miara odkręcenia jest
  płaska: nie wymaga blokowalności/lethal po deklaracji i nie odróżnia
  groźnego atakującego od obrońcy przed deklaracją.
- Dopisek: P/9 RED przed fixem — bot rzuca Twiddle na wrogiego stwora we
  własnym upkeepie.

## Naprawa

- `tapTimingBonus`/`tapTargetValue`:
  - własna tura po deklaracji uznaje `view.combat.attackers` za potencjał
    ataku; premia za blokerę, który może blokować zadeklarowanych
    atakujących i zagraża im (`simulateCombat`, CR 509.1b/510);
  - **własny upkeep/draw → kara −20/−10** (trzymaj combat trick, dopisek
    właściciela);
  - tura przeciwnika przed deklaracją: tapnięcie stwora wymaga potencjału
    ataku celu (nie obrońcy/chorego), **z wyjątkiem celu już tapniętego**
    (logika O/lock: „tap + nie odkręcaj” nadal woli tapniętą groźną
    kreaturę); denial many w upkeepie przeciwnika zostaje (+14).
- `untapTargetValue`:
  - po deklaracji przeciwnika wymaga blokowalności (`attackerCanBeBlocked`)
    i premiuje lethal/przeżycie tym samym modelem walki co reszta bota;
    zwykły chump-block zostaje na bazie `8+2·moc` (exact pin K/8);
  - przed własną deklaracją wymaga zdolności ataku po odkręceniu i okna
    ofensywnego;
  - **`castingSpell`**: kara „trzymaj kartę na okno walki” dotyczy rzutu
    czaru z ręki, nie darmowego triggera/aktywacji. Po własnej deklaracji
    czar dostaje −4, ale trigger/aktywacja nadal wybiera najlepszego
    tapniętego stwora (M314/L41/L169). Bez tego rozróżnienia golden-master
    dryfował: trigger Tenth District Veteran remisował cele na −4.
- `resolve_optional_spell_effect`: **świadomie zostaje płaskie ±8**.
  Okno egzekwuje wycena rzutu (`tapTimingBonus`/`untapTargetValue`), nie
  decyzja „you may” po już rzuceniu czarze. Próba czytania miary celu w
  „may” łamała FixA-T6 („tap wrogiego: Tak” bez własnego potencjału ataku).

## Kryteria ukończenia

- [x] Testy P/1–P/11 (+ kontrole anty-over-fix) RED przed fixem, GREEN po.
- [x] Mutacje mP1–mP7 wyłączają konkretne piny na końcowym kodzie; stare
      Twiddle/M146/FixA/K/O/M314/batch28 green (118/118 w plikach
      celowanych).
- [x] Pełny szybki rdzeń + build, commit + push; finalnie `test:all`
      **10434/10434, fail 0, 0 skipped**, build **78 / 5810,3 kB**.
- [x] Historia/handoff/PR opisane; bez scalania.

## Wykonanie

- Commity: `453fc49` (plan), `d221fac` (naprawa okien + P/1–P/10),
  `92e4f9f` (anty-over-fix P/11: `castingSpell`, CR komentarze), dokumentacja
  finalna.
- RED: `.arena/p-red.log` (8/10 fail, kontrole P/3/P/8 green),
  `.arena/p-red2.log` (P/9 fail), `.arena/p-red3.log` (P/11 fail na
  `d221fac`).
- GREEN: `.arena/p-green-final2.log` (P 13/13), `.arena/p-green5.log`
  (118/118), brama szybka `.arena/p-fast-3.log` (10165/10165), finalna
  `.arena/p-test-all-final.log` (10434/10434).
- Mutacje końcowe: `.arena/mut-final2-mP1…mP7*.log`; źródło przywrócone
  bitowo, `git diff` czysty.
- Golden-master: pierwszy full `test:all` po `d221fac` RED 2 (dryf śladu).
  Lokalizacja `--dump` przed/po (L176): pierwsza różna decyzja to
  `resolve_trigger_target` Veterana w turze 18. Naprawa P/11 przywróciła
  fixture **bez regeneracji** (`test/bot-scoring-snapshot.test.js` 4/4).
- CR: mirror `nwgarne/mtg-data` 2026-11-06, SHA-256
  `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`;
  `cr-numery` OK. Raport:
  `docs/audits/ZGLOSZENIE_P_TWIDDLE_COMBAT_TRICK_2026-11-08.md`.
