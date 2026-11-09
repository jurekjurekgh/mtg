# Zgłoszenie P — Twiddle jako combat trick (2026-11-08d)

PR #184, gałąź `arena/76d4141f-mtg`. Zakres: polityka bota dla efektów
tap/untap (ADR 0002 — deskryptor, nie nazwa karty). Bez nowych kart
(ADR 0029), bez pełnego B0 (ADR 0018), bez scalania.

## 1. Problem

Właściciel: Twiddle („You may tap or untap target artifact, creature, or
land.”) to typowy combat trick; bot ma go używać w czterech oknach:

1. własny atak PO deklaracji atakujących → tapnąć groźnego potencjalnego
   blokera;
2. własna tura PRZED deklaracją → odkręcić własnego tapniętego stwora,
   który dzięki temu zaatakuje;
3. combat przeciwnika PRZED deklaracją → tapnąć groźnego potencjalnego
   atakującego;
4. combat przeciwnika PO deklaracji → odkręcić własnego tapniętego
   blokera, najlepiej takiego, który zada lethal atakującemu.

Dopisek właściciela (2026-11-09): bot rzucał Twiddle w swoim podtrzymaniu,
całkowicie poza oknem walki, „jak tylko ma manę”. Karta ma być trzymana na
okna walki.

## 2. Źródła CR

Mirror `nwgarne/mtg-data`, wydanie 2026-11-06, SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`
(`.arena/cr-current.txt`, odtworzyć przez `gh api`). `tools/cr-numery.mjs
--cr` → OK.

- 509.1a: „The chosen creatures must be untapped and they can’t also be
  battles.”
- 506.4b: „Tapping or untapping a creature that’s already been declared as
  an attacker or blocker doesn’t remove it from combat and doesn’t prevent
  its combat damage.”
- 510.1d: „A blocking creature assigns combat damage to the creatures it’s
  blocking.”
- 120.6: „If the total damage marked on a creature is greater than or equal
  to its toughness, that creature has been dealt lethal damage and is
  destroyed as a state-based action (see rule 704).”
- 302.6: choroba przywołania ogranicza atak i aktywacje z tap/untap symbol.

## 3. Potwierdzenie przed kodem

Sonda `.arena/probe-twiddle.mjs`:
- A (własny atak po deklaracji): `tw->atk` +13 vs `tw->blk` −21 — bot
  odkręca własnego atakującego zamiast tapować blokera 4/4. Przyczyna:
  `pushPotential` nie uznaje zadeklarowanych, tapniętych atakujących.
- B/C/D: cel bywa trafiony, ale miara odkręcenia płaska — brak
  blokowalności/lethal po deklaracji, brak potencjału ataku przed.
- P/9 RED: rzut na wrogiego stwora we własnym upkeepie.

## 4. Naprawa

`src/controllers/heuristic-bot.js`:

- `tapTimingBonus`:
  - `declaredMyAttackers` liczą się do `pushPotential`;
  - po własnej deklaracji cel musi móc blokować zadeklarowanego
    atakującego (`attackerCanBeBlocked`) i być dla niego groźny
    (`simulateCombat`); premia `6 + threat`;
  - własny upkeep/draw → `−20/−10` (hold, dopisek właściciela);
  - tura przeciwnika przed deklaracją: stwor wymaga potencjału ataku
    (untapped, brak choroby/haste, nie defender/detained/cantAttackStatic,
    power > 0). **Wyjątek: cel już tapnięty** zostaje logice O/lock
    (`!target.tapped` w warunku kary) — tap+lock nadal woli tapniętą
    groźną kreaturę;
  - denial many w upkeepie/draw przeciwnika zostaje (+14, M405 T/3, P/8).
- `untapTargetValue`:
  - wróg / ląd / nie-stwór / nietapnięty → kara;
  - po deklaracji przeciwnika wymaga `attackerCanBeBlocked`; wartość
    `base = 8 + 2·moc`, premia tylko za wynik ponad bazę: lethal
    (`+18 + 2·combatPower`) albo przeżycie (`+6`). Zwykły chump-block
    zostaje na bazie (exact pin K/8 = 10,8 po ×0,9);
  - przed własną deklaracją wymaga zdolności ataku po odkręceniu i okna
    ofensywnego (`precombat_main`/`combat`, brak `combat`);
  - **`castingSpell`**: kara okna dotyczy rzutu czaru z ręki. Po własnej
    deklaracji czar → −4, trigger/aktywacja → `base` (wybór najlepszego
    tapniętego celu, M314/L41/L169).
- Ścieżka rzutu czaru przekazuje `{ castingSpell: true }`; trigger
  `resolve_trigger_target` i aktywacja nie przekazują flagi.
- `resolve_optional_spell_effect`: **płaskie ±8 zostaje**. Okno egzekwuje
  wycena rzutu, nie decyzja „you may” po rzucie. Próba miary celu w „may”
  łamała FixA-T6.

## 5. Piny

`test/zgloszenie-p-twiddle-combat-trick.test.js` — 13 testów:

| Pin | Treść |
|---|---|
| P/1 | po własnej deklaracji tap groźnego blokera, nie untap atakującego |
| P/1e | pełne execute: rzut → may → bloker tapnięty przed blokami |
| P/2 | po własnej deklaracji bez groźnego blokera nie marnuje Twiddle |
| P/3 | kontrola: przed własną deklaracją untap tapniętego atakującego |
| P/4 | przed deklaracją nie untap własnego obrońcy bez ataku |
| P/5 | przed deklaracją wroga tap groźnego atakującego, nie obrońcę |
| P/5b | sam obrońca nie jest wart Twiddle |
| P/6 | po deklaracji wroga untap blokera z lethal, nie większego bez bloku |
| P/7 | po deklaracji wroga nie untap stwora bez bloku |
| P/8 | kontrola: denial many w upkeepie wroga zostaje |
| P/9 | własny upkeep: brak rzutu, wszystkie warianty tw ≤ 0 |
| P/10 | własny upkeep: brak untap „bo tapnięty” |
| P/11 | anty-over-fix: darmowy trigger untap po własnej deklaracji nie remisuje celów |

RED przed fixem: `.arena/p-red.log` (8/10 fail; P/3/P/8 kontrole green),
`.arena/p-red2.log` (P/9), `.arena/p-red3.log` (P/11 na `d221fac`).
GREEN końcowy: `.arena/p-green-final2.log` 13/13; pliki celowane
(Twiddle/M146/FixA/K/O/M314/PMSSB9/batch28) `.arena/p-green5.log` 118/118.

## 6. Mutacje (końcowy kod)

Kopia `.arena/p-bot-final2.bak` przed edycją; po każdej mutacji przywrócenie
bitowe (`git diff` czysty). Logi `.arena/mut-final2-*.log`.

| Mutacja | Zmiana | RED |
|---|---|---|
| mP1 | `pushPotential` ignoruje zadeklarowanych atakujących | P/1, P/1e |
| mP2 | untap czaru po własnej deklaracji płaski `base` | P/2 |
| mP3 | untap po deklaracji wroga bez `attackerCanBeBlocked` | P/6, P/7 |
| mP4 | tap wroga przed deklaracją bez potencjału ataku | P/5, P/5b |
| mP5 | brak kary we własnym upkeep/draw | P/9 |
| mP6 | kara okna obejmuje też darmowy trigger | P/11 |
| mP7 | rzut czaru nie przekazuje `castingSpell` | P/2, P/4, P/10 |

## 7. Golden-master

Pierwszy pełny `test:all` po `d221fac`: **10431/10433**, RED 2 w
`bot-scoring-snapshot`. Lokalizacja `--dump` przed/po (L176): pierwsza
różna decyzja to `resolve_trigger_target` Tenth District Veteran w turze
18 (`ravnica-wur|innistrad-wu@1000`) — kara okna remisowała tapnięte cele
na −4. Naprawa `castingSpell` (P/11) przywróciła ślad; fixture
**nieregenerowany**. `test/bot-scoring-snapshot.test.js` 4/4,
`.arena/p-golden-test2.log`.

## 8. Bramy

- Brama szybka #1 (przed korektą O): 10162/10164, RED 2 pinów O/Chill
  (tapnięty cel). Korekta `!target.tapped`; O+P+K 32/32.
- Brama szybka #2: **10164/10164**, build 78 / 5809,4 kB → commit
  `d221fac`, push.
- P/11 + korekta CR: pliki celowane 118/118; mutacje mP1–mP7 RED;
  golden 4/4; `cr-numery` OK.
- Brama szybka #3: **10165/10165**, build 78 / 5810,3 kB → commit
  `92e4f9f`, push.
- Finalna: `npm run test:all` **10434/10434, fail 0, 0 skipped**, EXIT 0
  (~666 s); build **78 modułów / 5810,3 kB**.
- Strażnicy dokumentacji: 38/38 (`.arena/p-docs-guards.log`). Budżet
  lektury niepodniesiony; bez nowego wpisu LESSONS (klasa L41/L169/L183).

## 9. Świadome ograniczenia

- Polityka jest heurystyką na `PlayerView`, nie pełnym symulatorem CR;
  legalność bloku/ataku waliduje engine.
- `resolve_optional_spell_effect` płaskie ±8 — okno w wycenie rzutu.
- K/8 exact pin wymusza bazę bez premii za prevented damage / kary za
  śmierć blokera przy zwykłym chump-blocku.
- `.arena/` ulotne — dowody odtwarzać z testów/seedów; transkrypty nie
  trafiają do repo.
- Bez nowych kart, bez pełnego B0, bez podnoszenia progów regresji, bez
  scalania.
