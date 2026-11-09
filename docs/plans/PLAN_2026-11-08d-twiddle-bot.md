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

## Naprawa

- `tapTimingBonus`/`tapTargetValue`: własna tura po deklaracji uznaje
  `view.combat.attackers` za potencjał ataku; premia za blokerę, który
  może blokować zadeklarowanych atakujących i zagraża im (model CR 510).
  Tura przeciwnika przed deklaracją: tapnięcie stwora wymaga potencjału
  ataku celu (nie obrońcy/chorego); denial many w upkeepie zostaje.
- `untapTargetValue`: po własnej deklaracji odkręcenie nie dokłada akcji
  ( kara); po deklaracji przeciwnika wymaga blokowalności i premiuje
  lethal/przeżycie/blocked damage tym samym modelem walki co reszta bota.
- `resolve_optional_spell_effect`: decyzja „you may” czyta tę samą miarę
  celu (L41), nie płaskie ±8.

## Kryteria ukończenia

- [ ] Testy P/1–P/8 (+ kontrole anty-over-fix) RED przed fixem, GREEN po.
- [ ] Mutacje wyłączają konkretne piny; stare Twiddle/M146/T1–T4/K green.
- [ ] Pełny szybki rdzeń + build, commit + push; finalnie `test:all`.
- [ ] Historia/handoff/PR opisane; bez scalania.
