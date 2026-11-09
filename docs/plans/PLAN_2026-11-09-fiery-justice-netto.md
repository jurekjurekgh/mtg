# Plan 2026-11-09 — Fiery Justice: bot nie marnuje czaru o zerowym efekcie netto

## Problem i zakres

Właściciel (zgłoszenie T, 2026-11-09): bot rzuca **Fiery Justice** z celem
w przeciwnika; przeciwnik traci 5 życia, po czym odzyskuje 5 życia.
„Kompletnie bezsensowne zmarnowanie tej karty.”

Oczekiwane: bot nie wybiera wariantu, w którym obrażenia i zysk życia tego
samego gracza znoszą się do zera (lub wypadają ujemnie). Ma albo dobrać
podział, który realnie coś daje (dobicie stworów wroga / dodatnie netto
w twarz), albo wstrzymać rzut.

Prefiks pinów: **FJ/**. Litera `T` jest zajęta przez
`test/zgloszenie-t-atak-zero-mocy.test.js` (zgłoszenie 2026-10-26 o ataku
0/1); kolizja sprawdzona grepem przed nazwaniem planu.

Zakres: wyłącznie wycena bota (`src/controllers/heuristic-bot.js`).
Silnik, protokół, katalog kart i stół **bez zmian** — engine rozstrzyga
kartę poprawnie (ruling WotC 2017-03-14 jest już pinowany w
`test/real-cards-batch62.test.js`, B62/210). Bez nowych kart (ADR 0029),
bez pełnego B0 (ADR 0018), bez scalania. PR sesji **#184** już otwarty;
plan wypchnięty osobnym commitem **przed** edycją źródeł.

## Rozpoznanie przed kodem (read-only)

### Karta i Oracle

`src/cards/card-data.js:13582` (`fiery-justice`, Sorcery {R}{G}{W}):

```
spell.targets: [{ type: 'opponent' }]
spell.divided: { total: 5, targetType: 'any_target' }
spell.effects: [
  { type: 'damage_divided_among_targets' },
  { type: 'gain_life_target', amount: 5 }
]
```

Oracle (`docs/cards/scryfall-fiery-justice.json`, pobrano 2026-10-02):
„Fiery Justice deals 5 damage divided as you choose among any number of
targets. Target opponent gains 5 life.”

Ruling WotC 2017-03-14 (dosłownie, ze snapshotu):
„The target opponent for the life-gaining effect may also be a target for
the damage-dealing effect. If this happens and the damage brings that
player's life total to 0 or less, the life-gaining effect will raise their
life total above 0 again before the player would lose the game.”

### Sonda `.arena/probe-fiery.mjs` (przed fixem)

Bot p1, Fiery Justice w ręce, {R}{G}{W} z lądów, biblioteki 12/12:

| Scena | Wybór bota | Najlepszy cast | Pass | Życie p2 po rozstrzygnięciu |
|---|---|---:|---:|---|
| A pusty stół, 20 życia | **cast 5→p2** | **31** | 0 | 20→20 (zero netto) |
| B dwa 2/2 wroga | cast 2+2+1 | 95 | 0 | oba stwory martwe, 20→24 |
| C jeden 3/3 wroga | cast 3+2 | 65 | 0 | stwór martwy, 20→23 |
| D wróg 5 życia | **cast 5→p2** | **1015** | 0 | 5→5, gra trwa (fałszywy „letal”) |
| E wróg 4 życia | **cast 5→p2** | **1015** | 0 | 4→4, gra trwa |
| F 5/5 wroga | cast 5→stwór | 63 | 0 | stwór martwy, 20→25 |
| G 1/1 + 3/3 | cast 5→3/3 | 55 | 0 | 3/3 martwy, 20→25 |
| Darmowy rzut z ręki (Baral), 20 życia | **cast 5→p2** | **10** | 4 (skip) | zero netto |
| Grób/Halo, 20 życia | decline | −4 | 4 | bez zmian (już poprawnie) |

Skan katalogu (`createCardRegistry().all()`): tylko **3** karty łączą
obrażenia i zysk życia w jednej liście efektów: `consume-spirit`
(`damage:X` + `gain_life:X` — życie dla **kontrolera**, nie celu),
`douse-in-gloom` (`damage:2` + `gain_life:2` — jw.), `fiery-justice`
(`damage_divided_among_targets` + `gain_life_target:5` — życie dla
**tego samego gracza**, który może dostać obrażenia). Żadna karta nie ma
więcej niż jednej nogi `damage`/`damage_divided_among_targets` w
`spell.effects`.

### Przyczyna źródłowa

Gałąź `cast_spell` wycenia nogi **niezależnie**:

1. `damage_divided_among_targets` (linia ~13855) sumuje
   `damageTargetValue(view, entry.id, entry.amount)` po `cmd.damageDivision`.
   Dla twarzy wroga `damageTargetValue` zwraca `6+40*pct`, a przy
   `amount >= foeLife` — **1000** („dobicie gracza”). Nie wie, że ten sam
   czar za chwilę odda temu graczowi 5 życia.
2. `gain_life_target` we wroga jest karany tylko przez
   `friendlyMisaimPenalty` (~8857): `30+amount` = **35**.
3. `isDamageOnly` (~13233) nie łapie Fiery Justice, bo effects zawiera też
   `gain_life_target` → baza `P.spellBase` (~50) zostaje.

Suma dla pustego stołu: `50 + 16 − 35 = 31 > 0` → rzut. Przy 5 życia
wroga: `50 + 1000 − 35 = 1015` → bot „dobicie”, a silnik poprawnie
rozstrzyga 5−5+5=5 i gra trwa (CR 704.3/704.5a: SBA dopiero po
rozstrzygnięciu, nie w środku).

Dodatkowo okno darmowego rzutu z ręki (`resolve_hand_free_cast`,
`freeCastVariantScore`) nie wycenia `damage_divided_among_targets` wcale:
baza 45 − kara 35 = **10 > skip 4**, więc ten sam bezsensowny wariant
wygrywa również tam. Okna suspend/epic/rebound (`freeCastEffectsScore`)
mają tę samą lukę dla podziału.

## Podstawa w CR (wydanie 2026-11-06, dosłownie)

Mirror `nwgarne/mtg-data` (`rules/cr-raw.txt`), SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`
(pobrany do `.arena/cr-current.txt` w tej sesji).

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

Wniosek: wycena musi czytać **całe rozstrzygnięcie** (608.2c), a nie
sumować niezależnych nóg. Netto życia tego samego gracza = obrażenia −
zysk życia; „letal” wolno ogłosić dopiero, gdy netto ≤ 0 **po** pełnym
rozstrzygnięciu (704.3/704.5a). Podział announced at cast (601.2d) nie
zmienia tej arytmetyki.

## Naprawa (generyczna po deskryptorze, ADR 0002)

1. Wspólny helper `sameResolutionLifeGain(view, effects, cmd, targetId)`
   sumuje zysk życia tego samego gracza w tej samej liście efektów:
   `gain_life_target` po `targetIndex` (domyślnie 0) oraz `gain_life`,
   gdy odbiorcą jest kontroler źródła. Czyta `amount` (X → `cmd.xValue`).
   Zero nazw/ID kart.
2. `damageTargetValue` dostaje opcjonalny piąty argument `lifeRecovered`
   (domyślnie 0 — wszystkie dotychczasowe wołania bez zmian). W gałęzi
   twarzy wroga liczy `net = amount − lifeRecovered`; `net <= 0` → kara
   jak za zerowe obrażenia; próg „dobicia” i procent życia liczone od
   `net`, nie od surowego `amount`.
3. Gałąź `damage_divided_among_targets` w `cast_spell` agreguje porcje
   per cel (Map) i przekazuje `sameResolutionLifeGain` dla każdego celu.
   Gałąź `damage` w `cast_spell` przekazuje ten sam helper dla slotu.
4. Rodzina darmowych rzutów: wspólny `dividedDamageValue` (agregacja +
   netto) wołany z `freeCastVariantScore` (ręka/grób/madness/exile/
   discover) i z `freeCastEffectsScore` (suspend/epic/rebound). Jedno
   źródło miary (L41).
5. Bez zmian w `friendlyMisaimPenalty` (dar życia dla wroga nadal jest
   karany — Fiery Justice oddaje 5 życia nawet gdy zabija stwory), bez
   zmian w `isDamageOnly`, bez zmian w silniku/stole/katalogu.

## Etapy i kryteria ukończenia

- [ ] **E1 Plan** (ten plik) + strażnicy dokumentacji → commit + push
      **przed** jakąkolwiek zmianą `src/`.
- [ ] **E2 Piny FJ/** (`test/zgloszenie-fj-fiery-justice-netto.test.js`):
      RED przed fixem na scenach A/D/E i darmowym rzucie z ręki;
      kontrole anty-over-fix (B/C/F/G, consume-spirit, czysty burn)
      GREEN przed i po. Kryterium: fail dokładnie na pinach zgłoszenia.
- [ ] **E3 Fix** w `heuristic-bot.js` (helper + 4 wołania) → piny FJ
      GREEN, sąsiednie pliki Fiery/bot GREEN, `node --check`.
- [ ] **E4 Mutacje** mFJ1–mFJ6: helper→0, brak agregacji podziału,
      pominięcie `targetIndex`, `gain_life` kontrolera jako offset celu,
      brak wołania w free-cast, próg letal od surowego amount. Każda
      mutacja RED na konkretnym pinie; źródło przywrócone bitowo
      (`sha256sum -c`).
- [ ] **E5 Bramy**: `npm test` (szybki rdzeń) + `npm run build` → commit
      + push; finalnie `npm run test:all` (fail 0, skipped 0).
      Golden-master bez `--write` (L176); przy dryfie wyłącznie `--dump`.
- [ ] **E6 Dokumentacja**: raport `docs/audits/ZGLOSZENIE_FJ_FIERY_JUSTICE_NETTO_2026-11-09.md`,
      plan `[x]` + „Wykonanie”, `PROJECT_HISTORY.md`, HANDOFF §11,
      strażnicy dokumentacji/CR/card-agnostic, `cr-numery --cr` OK.
      PR #184 PATCH (tytuł/body). Bez scalania.

## Ryzyka i pułapki

- **L181**: istniejący pin B62/210 „bot dzieli, by zabić oba stwory”
   broni poprawnego zachowania — fix nie może go zepsuć (sonda B/C/F/G
   już pokazuje removal). Nie aktualizować tego pinu.
- **L3/L183**: kara za zero netto musi przebić bazę `spellBase` (~50)
   i karę misaim (35); `damageTargetValue` zwraca −60 dla zerowych
   obrażeń, więc `50 − 60 − 35 = −45 < 0`. Bez zmiany parametrów.
- **L41**: jedna miara podziału w cast i we wszystkich oknach darmowych;
   nie duplikować formuły.
- **L48**: oferta silnika bez zmian (L48: oferta ⊆ walidacja); bot
   wybiera spośród istniejących ziaren podziału. Nie rozszerzać
   enumeracji w tym zgłoszeniu.
- **L176**: golden-master fixture nietknięty; Fiery Justice jest w
   `decks/kaldheim.txt`, więc snapshot może odnotować zmianę decyzji —
   lokalizować `--dump`, nie regenerować.
- **CR 117.1** brak w tabeli 576 — nie cytować bez `--zapisz`.
   Numery 119.3/608.2c/704.3/704.5a/601.2d już są w tabeli.
- **Konsumpcja X**: `consume-spirit`/`douse-in-gloom` mają `gain_life`
   dla kontrolera, nie celu — helper nie może offsetować obrażeń wroga
   życiem bota (anty-over-fix pin).
- **Ciche testy**: wszystkie przebiegi `> .arena/*.log 2>&1`, exit code,
   `grep '^not ok'`; zakaz `tee`/pełnego `cat`.
