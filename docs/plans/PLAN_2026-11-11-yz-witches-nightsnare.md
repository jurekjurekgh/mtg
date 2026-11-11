# Plan — zgłoszenia Y (Cuombajj Witches) i Z (Nightsnare)

Data: 2026-11-11. Sesja `arena/76d4141f-mtg`, PR #184.

## Y(a) — bot marnuje zdolność na atakującą kreaturę, której 1 dmg nic nie robi

**Objaw właściciela:** „Bot używa zdolności tej karty na mojej atakującej
kreaturze 3/4. Bot nie ma blokerów więc 1 dmg nic jej nie robi. Zmarnowana
zdolność, a jeszcze sam dostał 1 dmg od Cuombajj Witches."

**Pomiar (sondy `.arena/probe-y-a*.mjs`):**

| scena | ocena wariantu na 3/4 | wynik |
|---|---|---|
| tura bota, main1/main2 (bez walki) | **−80** | pass — poprawnie |
| trwająca walka, 3/4 zadeklarowany atakujący, **brak moich blokerów** | **0** | **AKTYWUJE** — objaw |

**Przyczyna (zmierzona):** `damageTargetValue` w oknie walki (`combatTrickWindow`)
zwraca `damageChipEnablesKill(...) ? lethal : 0`, a `0` przy bazie zdolności
(2) daje remis z passem — wygrywa pierwszy z enumeracji. Luka: `combatTrickWindow`
mówi „jest walka", ale nie „**ja** mogę tę kreaturę dobić". Bez moich blokerów
(i bez trample/innych źródeł) 1 dmg na 3/4 nie zmienia NIC, a koszt
`opponentChosenDamageCost` (przeciwnik wskaże najgorszy cel dla mnie) jest
w tym wariancie doliczany tylko do wariantu z 2. slotem — nie do decyzji
„czy w ogóle aktywować".

**Kryteria akceptacji:**
- Y/1: trwająca walka, 3/4 atakujący, brak blokerów → bot **nie aktywuje**.
- Y/2: trwająca walka, 2/2 atakujący, mam blokera 1/1 (dobicie po bloku) →
  bot **aktywuje** (chip realnie zmienia wynik).
- Y/3: poza walką, 3/4 → nie aktywuje (działa dziś, pin regresyjny).

## Y(b) — nie wiadomo, w kogo bot celuje, zanim przeciwnik wybierze swój cel

**Objaw właściciela:** „Gdy bot używa tej zdolności to nie wiadomo do kogo
strzela — nie ma tej informacji w Rozgrywce do czasu aż wybiorę swój cel."

**Ustalenie z kodu (`game-state.js`, `abilities.js:1563`):** kolejność jest
POPRAWNA — aktywacja czeka (`pendingOpponentTarget`), więc gracz wskazuje swój
cel, **zanim** zobaczy jakikolwiek skutek. Cytat Gemini („oba cele wybierane
przy aktywacji, kontroler deklaruje pierwszy") dotyczy momentu wyboru, nie
tego, co jest JAWNE — a w tym silniku oba cele są wybierane przed zapłatą
kosztów i przed rozstrzygnięciem (CR 601.2c/h). Kolejność UI jest więc zgodna
z CR.

**Realny defekt:** bot wybiera swój cel „w ciemno" — nie widać go w logu do
momentu, gdy gracz wskaże swój. To **nie** jest niezgodność z regułami
(wybory są sekretne do rozstrzygnięcia), ale utrudnia zrozumienie logu.

**Do decyzji właściciela** (nie implementuję bez zgody): czy w logu ma się
pojawić jawna linia „Nieprzyjaciel wskazał cel zdolności: X" w momencie
decyzji, czy zostawiamy sekretność wyborów do rozstrzygnięcia.

## Z — Nightsnare: log wygląda, jakby to gracz rzucał

**Objaw właściciela:** „Bot ją rzuca. W Rozgrywka widzę komunikat, jakbym to ja
ją rzucał: «Nieprzyjaciel rzuca Nightsnare → cel: Ty / Nieprzyjaciel nie
wskazuje karty (Nightsnare) — odrzucasz 2 karty wedle własnego wyboru /
Wybierasz, którą kartę odrzucić efektem»".

**Ustalenie: to NIE jest błąd.** Wszystkie trzy zdania są prawdziwe i mają
poprawne podmioty:
1. bot rzuca Nightsnare, cel = gracz (`whoN` gracza) — poprawnie;
2. bot **rezygnuje** z wyboru karty z odsłoniętej ręki (Oracle „If you
   don't"), więc **gracz** odrzuca 2 karty wedle własnego wyboru — poprawnie;
3. „Wybierasz..." — to decyzja gracza — poprawnie.

Mylące jest tylko zestawienie: akapit 2 jest SKUTKIEM rezygnacji bota, a nie
jego kolejnym ruchem.

**Propozycja (kosmetyczna, do zgody właściciela):** dopisać w logu słowo
„w efekcie" / „skutkiem czego", żeby związek przyczynowy był jawny. Zero zmian
w silniku i logice.

## Kolejność

1. [x] Pomiar Y(a) + analiza kodu Y(b) i Z (ten plik) + push.
2. Piny Y/1–Y/3 (RED na Y/1).
3. Poprawka Y(a) w `heuristic-bot.js` (jedna reguła: chip ma wartość tylko, gdy
   REALNIE dobija — istniejący `damageChipEnablesKill`, ale pytany także o to,
   czy mam czym dobić po bloku).
4. Mutacje, sąsiedzi (Keep Out, Cuombajj D-pin, Blazing Torch), bramy.
5. Decyzje właściciela: Y(b) jawność celu w logu, Z kosmetyka sformułowania.


---

## WYNIK (wdrożone)

### Y(a) — NAPRAWIONE

Fix generyczny (ADR 0002, bez nazwy karty): `damageTargetValue` dostał szósty
parametr `chipPenalty`. W oknie walki chip, który NIE dobija
(`damageChipEnablesKill`), zwraca `-chipPenalty` dla zdolności i `0` dla czarów.
`activate_ability` przekazuje `80` (kara jak poza walką). To jest różnica, która
naprawia zgłoszenie: baza wyceny zdolności to 2, więc `0` **remisuje z passem**
i wygrywa pierwszy z enumeracji — dlatego bot tapował Witches na 3/4.

| scena | przed | po |
|---|---|---|
| walka, 3/4 atakujący, brak blokerów | **0 → aktywuje ✘** | **−60 → pass ✔** |
| walka, 2/2 atakujący + bloker 1/1 | — | **+18 → aktywuje ✔** |
| walka, wróg 1/1 (dobija) | +38 → aktywuje | **+38 → aktywuje ✔** |
| poza walką, 3/4 | −80 → pass | **−80 → pass ✔** |

**Dlaczego pierwotnie nie działało tylko w walce:** poza walką ta sama scena
szła do `return -80` (gałąź końcowa), która jest wystarczająco niska. W oknie
walki gałąź `combatTrickWindow` zwracała `0` — zaprojektowane dla CZARÓW, gdzie
start (`isDamageOnly`) jest już ujemny (Keep Out: −1). Zdolność takiej podłogi
nie miała, więc 0 wygrywało. Stąd fix MUSI być zawężony do zdolności: nadanie
−80 czarom czerwieniło `uwaga-m-keepout-chip` (−81 ≠ −1).

### Y(b) — NAPRAWIONE (decyzja właściciela: tak)

Właściciel potwierdził cytatem z zasad: *„oba cele są wybierane w momencie
aktywacji zdolności, ale kontroler zdolności zawsze deklaruje swój cel jako
pierwszy... Oba cele są jawne jeszcze przed tym, jak ktokolwiek dostanie
priorytet"*. Czyli oczekiwanie z audytu („nie ma tej informacji w Rozgrywce")
było uzasadnione: kolejność w silniku była poprawna, ale log milczał.

Fix generyczny (ADR 0002, zero nazw kart w warstwie opisu):

1. `src/engine/abilities.js` — zdarzenie `opponent_target_required` niesie
   `activatingTargetId` = cel już wskazany przez aktywującego (publiczny od
   razu, więc nie ujawnia nic ukrytego).
2. `src/table/session.js` — opis nazywa OBA fakty w jednym zdaniu:
   **„Cuombajj Witches: Nieprzyjaciel wskazuje Segmented Krotiq, wskazujesz
   drugi cel obrażeń"**. Gdy zdarzenie nie ma celu (starsze zapisy), zostaje
   dotychczasowe zdanie — brak regresji.

Pin: **Y/5** (`activatingTargetId === 'atk'`, decyzja o drugim celu u gracza).
Mutant **mY5** (usunięcie pola ze zdarzenia) → RED na Y/5.

### Z — NIE BŁĄD, pin regresyjny

`Z/1` pilnuje, że log Nightsnare ma właściwe podmioty: rzuca BOT, rękę odsłania
GRACZ, przy rezygnacji bota GRACZ odrzuca 2 karty. Kosmetyka („w efekcie") —
czeka na zgodę właściciela.

### Bramy i mutacje (stan po fixie)

- `npm test` **10257/10257** (0 fail, 0 skipped)
- `npm run test:all` **10526/10526** (0 fail, 0 skipped, 0 todo)
- `npm run build` **79 modułów / 5834,2 kB**
- Sąsiedzi: Keep Out 6/6, Cuombajj (audyt-pr177 a44/d, cel-nazwany) 14/14,
  M202/I 2/2, W/X 8/8, PMSSB 18/18
- Mutanty: **mY1 → RED na Y/1**, **mY2 → RED na Y/2** (+ anti-over-fix Keep
  Out), **mY5 → RED na Y/5**; GREEN po przywróceniu.
- Skrypt mutatora: `.arena/mutate-yz.py` (mY1, mY2) — `mY5` wykonany ręcznie
  w turze, bo `.arena/` nie jest utrwalane między turami.

Piny: `test/zgloszenie-yz-witches-nightsnare.test.js` (Y/1–Y/5, Z/1).
