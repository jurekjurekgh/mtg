# Zgłoszenie właściciela FJ — Fiery Justice: bot nie marnuje czaru o zerowym efekcie netto

- **Data:** 2026-11-09
- **PR:** #184, gałąź `arena/76d4141f-mtg`
- **Plan:** `docs/plans/PLAN_2026-11-09-fiery-justice-netto.md`
- **Commity:** `b69636e` (plan), `6c215e4` (fix + piny FJ), dokumentacja finalna
- **Zakres:** wyłącznie wycena bota (`src/controllers/heuristic-bot.js`).
  Silnik, protokół, stół i katalog kart **bez zmian**. Bez nowych kart
  (ADR 0029), bez pełnego B0 (ADR 0018), bez scalania.
- **Prefiks:** `FJ/` — litera `T` zajęta przez zgłoszenie 2026-10-26
  (`test/zgloszenie-t-atak-zero-mocy.test.js`).

## 1. Problem

Właściciel: bot rzuca Fiery Justice z celem w przeciwnika; przeciwnik
traci 5 życia, po czym odzyskuje 5 życia. „Kompletnie bezsensowne
zmarnowanie tej karty.”

Nośnik: **Fiery Justice** (`fiery-justice`, Sorcery {R}{G}{W}):
„Fiery Justice deals 5 damage divided as you choose among any number of
targets. Target opponent gains 5 life.”

## 2. Diagnoza — niezależne nogi jednego rozstrzygnięcia

Sonda `.arena/probe-fiery.mjs` (bot p1, Fiery Justice w ręce, {R}{G}{W}
z lądów, biblioteki 12/12):

| Scena | Przed: wybór | Przed: najlepszy cast | Po: wybór | Po: najlepszy cast |
|---|---|---:|---|---:|
| pusty stół, 20 życia | cast 5→p2 | **31** | **pass** | **−45** |
| wróg 5 życia | cast 5→p2 | **1015** | **pass** | **−45** |
| wróg 4 życia | cast 5→p2 | **1015** | **pass** | **−45** |
| 6/6 wroga (chip nie zabija) | cast 5→p2 | 31 | **pass** | −45 |
| dwa 2/2 wroga | cast 2+2+1 | 95 | cast 2+2+1 | 95 |
| jeden 3/3 wroga | cast 3+2 | 65 | cast 3+2 | 65 |
| 5/5 wroga (ginie od 5) | cast 5→stwór | 63 | cast 5→stwór | 63 |
| darmowy rzut z ręki, 20 życia | cast 5→p2 | **10** (skip 4) | **decline** | **−50** (skip 4) |
| grób/Halo, 20 życia | decline | −4 | decline | −4 |

Przyczyna źródłowa w `cast_spell`:

1. `damage_divided_among_targets` sumowało `damageTargetValue` po porcjach
   bez wiedzy o riderze. Dla twarzy wroga: `6+40*pct`, a przy
   `amount >= foeLife` — **1000** („dobicie”).
2. `gain_life_target` we wroga było karane tylko przez
   `friendlyMisaimPenalty`: `30+amount` = **35**.
3. `isDamageOnly` nie łapie karty z riderem `gain_life_target`, więc baza
   `P.spellBase` (~50) zostawała.

Suma: `50 + 16 − 35 = 31 > 0` → rzut o zerowym netto. Przy 5 życia wroga
`50 + 1000 − 35 = 1015` → fałszywe „dobicie”; silnik poprawnie rozstrzyga
5−5+5=5 i gra trwa (SBA dopiero po rozstrzygnięciu).

Dodatkowo `resolve_hand_free_cast` (`freeCastVariantScore`) nie wyceniało
`damage_divided_among_targets` wcale: baza 45 − kara 35 = **10 > skip 4**.
Okna suspend/epic/rebound (`freeCastEffectsScore`) miały tę samą lukę.

Skan katalogu: tylko 3 karty łączą obrażenia i zysk życia w jednej liście
efektów — `consume-spirit` i `douse-in-gloom` dają życie **kontrolerowi**
(nie celowi), `fiery-justice` daje życie **temu samemu graczowi**, który
może dostać obrażenia. Żadna karta nie ma więcej niż jednej nogi
`damage`/`damage_divided_among_targets` w `spell.effects`.

## 3. Podstawa w CR i Oracle (dosłownie)

CR: mirror `nwgarne/mtg-data` (`rules/cr-raw.txt`), wydanie 2026-11-06,
SHA-256 `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`.

- **CR 119.3**: „If an effect causes a player to gain life or lose life,
  that player’s life total is adjusted accordingly.”
- **CR 608.2c**: „The controller of the spell or ability follows its
  instructions in the order written. However, replacement effects may
  modify these actions. In some cases, later text on the card may modify
  the meaning of earlier text […] Don’t just apply effects step by step
  without thinking in these cases—read the whole text and apply the rules
  of English to the text.”
- **CR 704.3**: „Whenever a player would get priority […] the game checks
  for any of the listed conditions for state-based actions, then performs
  all applicable state-based actions simultaneously as a single event.”
- **CR 704.5a**: „If a player has 0 or less life, that player loses the game.”
- **CR 601.2d**: „If the spell requires the player to divide or distribute
  an effect (such as damage or counters) among one or more targets, the
  player announces the division. Each of these targets must receive at
  least one of whatever is being divided.”

Ruling WotC 2017-03-14 (`docs/cards/scryfall-fiery-justice.json`):
„The target opponent for the life-gaining effect may also be a target for
the damage-dealing effect. If this happens and the damage brings that
player's life total to 0 or less, the life-gaining effect will raise their
life total above 0 again before the player would lose the game.”

## 4. Naprawa (generyczna po deskryptorze, ADR 0002)

- `sameResolutionLifeGain(view, effects, cmd, targetId)` — suma zysku życia
  tego samego gracza w jednej liście efektów: `gain_life_target` po
  `targetIndex` (domyślnie 0), `gain_life` gdy odbiorcą jest kontroler
  źródła; X rozwiązany z komendy. Zero nazw/ID kart.
- `damageTargetValue(..., lifeRecovered = 0)` — w gałęzi twarzy wroga
  `net = amount − lifeRecovered`; `net <= 0` → kara jak za zerowe
  obrażenia; próg dobicia i procent życia od **netto**. Domyślny argument
  0 zachowuje wszystkie dotychczasowe wołania.
- `dividedDamageValue(view, effect, cmd, effects)` — agregacja porcji per
  cel + netto; jedno źródło miary (L41) dla `cast_spell`,
  `freeCastVariantScore` (ręka/grób/madness/exile/discover) i
  `freeCastEffectsScore` (suspend/epic/rebound).
- Bez zmian w `friendlyMisaimPenalty` (dar życia dla wroga nadal karany —
  Fiery Justice oddaje 5 życia nawet gdy zabija stwory), bez zmian
  w `isDamageOnly`, bez zmian w silniku/stole/katalogu.

## 5. Piny i mutacje

Piny: `test/zgloszenie-fj-fiery-justice-netto.test.js` (FJ/1–FJ/14).
RED przed fixem: **6 fail / 8 pass** (FJ/2, FJ/3, FJ/4, FJ/8, FJ/9, FJ/12).
GREEN po: **14/14**.

| Pin | Treść |
|---|---|
| FJ/1 | ruling WotC: 5−5+5 przy 5 życia nie dobija (silnik, SBA) |
| FJ/2 | pusty stół 20 życia: bot nie rzuca w twarz, cast < 0 |
| FJ/3 | wróg 5 życia: brak fałszywego dobicia |
| FJ/4 | wróg 4 życia: zero netto poniżej passu |
| FJ/5 | anty-over-fix: syntetyk 10 dmg / +5 życia przy 5 życia DOBIJA (netto 5) |
| FJ/6 | dwa 2/2: bot rzuca i zabija oba |
| FJ/7 | jeden 3/3: bot dobija stwora |
| FJ/8 | 6/6: chip 5 poza walką nie zabija, bot nie marnuje czaru |
| FJ/9 | darmowy rzut z ręki, zero netto: decline > cast |
| FJ/10 | darmowy rzut z ręki, 2/2: bot rzuca i zabija |
| FJ/11 | obrażenia wroga + `gain_life` kontrolera: bot rzuca (cudze życie nie offsetuje) |
| FJ/12 | `gain_life_target` na slocie 1 tego samego przeciwnika: zero netto, pass |
| FJ/13 | `gain_life_target` na slocie 1 w siebie: bot rzuca w przeciwnika |
| FJ/14 | czyste obrażenia 5 w twarz bez ridera: nadal rzucane |

Mutacje (`.arena/mut-fj-mFJ*.log`, źródło przywrócone bitowo
`sha256sum -c .arena/fj-source.sha256` → OK):

| Mutacja | Zmiana | RED na |
|---|---|---|
| mFJ1 | `net = amt` (ignores recovered) | FJ/2,3,4,8,9,12 |
| mFJ2 | helper zawsze 0 | FJ/2,3,4,8,9,12 |
| mFJ3 | helper ignoruje `targetIndex` | FJ/13 |
| mFJ4 | `gain_life` kontrolera offsetuje każdy cel | FJ/11 |
| mFJ5 | brak podziału w `freeCastVariantScore` | FJ/9 |
| mFJ6 | `dividedDamageValue` bez netto | FJ/2,3,4,8,9,12 |

## 6. Bramy

- Sąsiednie pliki Fiery/bot + FJ: **132/132** (`.arena/fj-neighbours.log`).
- Golden-master: **4/4**, fixture nietknięty, bez `--write`
  (`.arena/fj-golden.log`).
- Szybki rdzeń `npm test`: **10210/10210, fail 0, skipped 0**
  (`.arena/fj-fast.log`, ~165 s).
- Build: **78 modułów / 5821,5 kB** (`.arena/fj-build.log`).
- Pełny pakiet `npm run test:all`: **10479/10479, fail 0, skipped 0**
  (`.arena/fj-test-all.log`, ~532 s).
- Strażnicy dokumentacji/CR/card-agnostic: **94/94**
  (`.arena/fj-docs-guards.log`).
- `node tools/cr-numery.mjs --cr .arena/cr-current.txt`: **OK**
  (576 numerów, 6617 cytatów, bez regeneracji).

## 7. Uwagi / poza zakresem

- Enumeracja podziałów silnika (`dividedDamageDivisions`) bez zmian
  (L48: oferta ⊆ walidacja). Bot wybiera spośród istniejących ziaren;
  optymalizacja pełnej przestrzeni podziałów (np. 4+1 przy 1/1+3/3) to
  osobny temat, nie zgłoszenie FJ.
- `resolve_copy_targets` / `resolve_redirect_choice` nadal szukają tylko
  nogi `damage` (nie `damage_divided_among_targets`) — istniejące
  ograniczenie rodzin przekierowania/kopii, poza tym zgłoszeniem.
- Wielokrotne nogi `damage` w jednym czarze: brak nośnika w katalogu;
  helper offsetuje życie per cel, agregacja porcji podziału jest
  zaimplementowana. Konserwatywne potraktowanie wielu nóg jako
  osobnych netto nie tworzy nowego marnotrawstwa (co najwyżej trzyma).
- Bez nowego wpisu LESSONS (klasa L41/L181/L3).
