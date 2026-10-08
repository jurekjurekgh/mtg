# PLAN 2026-10-08 — zgłoszenie I (Wrap in Flames: czar rzucany „zawsze jak jest mana")

> Sesja: gałąź `arena/6b9bb8b8-mtg`, tryb ADR 0020 (PR → audyt → inkrementalne
> commity). Temat nazwany przez właściciela (zgłoszenie I), więc ADR 0021 §4
> (pętla domyślna) nie stosuje się do wyboru tematu — stosuje się dalej do
> kolejnych kroków.

## Rozpoznanie (wykonane)

- **Lektura obowiązkowa kompletna** (AGENTS.md §0): AGENTS.md (382/382 linii),
  ADR-y 0001–0030 + README (każdy do końca), LESSONS.md (L1–L180, 2437/2437
  linii), ENVIRONMENT.md (§1–§7). Budżet lektury pilnuje
  `test/dokumentacja-budzet-lektury.test.js` (próg 100k).
- **Karta:** `wrap-in-flames` (MM2 #136, `{3}{R}` Sorcery, plan Warhammer
  Fantasy). Oracle dosłowny: *„Wrap in Flames deals 1 damage to each of up to
  three target creatures. Those creatures can't block this turn."*
  (`docs/cards/scryfall-wrap-in-flames.json`). Definicja: tryb z
  `variableTargets: { max: 3, min: 0 }` i jednym efektem
  `apply_to_each_target` z dwoma efektami wewnętrznymi: `damage: 1`
  + `cant_block`. Silnik jest ZGODNY z Oracle — engine nie wymaga zmian.
- **Zasięg deskryptora:** wrappera `apply_to_each_target` używają dokładnie
  trzy karty katalogu: `wrap-in-flames` (damage + cant_block),
  `sea-gods-scorn` i `captivating-gyre` (bounce). Zmiana wyceny obrażeń/
  „can't block" we wrapperze dotyka więc WYŁĄCZNIE Wrap in Flames.
- **Pomiar PRZED** (sonda `.arena/probe-i-wrap.mjs`, bot heurystyczny,
  `playerView` p1, krok main1):

  | scena | wybór bota | nota |
  |---|---|---|
  | wróg 2/4 + 3/3, własne 3/3 chore (brak zamiaru ataku) — **zgłoszenie** | `cast_spell(wif->f24+f33)` | **84,0** (pass = 0) |
  | wróg 2/4 + 3/3, bez własnych stworów | `cast_spell(wif->f24+f33)` | 84,0 |
  | wróg 1/1 (1 dmg = lethal) + 2/4, bez atakujących | `cast_spell(wif->f11+f24)` | 80,0 |
  | atakujący 3/3 + bloker 2/4 (precombat) | `cast_spell(wif->f24)` | 66,0 |
  | postcombat main2, wróg 2/4 + 3/3 | `cast_spell(wif->f24+f33)` | 84,0 |
  | tura wroga | brak oferty (sorcery) | — |

  Rozkład 84,0 = baza `spellBase` 50 + 16 (2/4: `12 + 2P`) + 18 (3/3:
  `12 + 2P`) — żadna składowa nie pyta o śmiertelność obrażeń ani o to, czy
  bot w ogóle zamierza atakować. Klasa awarii: **L50/L131** (efekt bez wyceny
  = pierwsza oferta z listy), w wariancie „baza niesie czar" — **M146**
  (czysto-utylitarny czar startuje od −1, nie od bazy 50).

- **Cytaty CR** (ADR 0030 — dosłowny tekst z mirroru `nwgarne/mtg-data`,
  `rules/cr-raw.txt`, CR effective 2026-09-25, SHA-256 `8d860e45…`, ten sam
  plik co w sesjach E/F/G/H):
  - **601.2c** — *„If the spell has a variable number of targets, the player
    announces how many targets they will choose before they announce those
    targets."* ⇒ liczba celów jest WYBOREM gracza, więc każdy wariant
    (podzbiór celów) musi mieć własną wycenę — bot wybiera podzbiór, nie
    „wszystkie albo nic".
  - **509.1a** — *„The defending player chooses which creatures they control,
    if any, will block. The chosen creatures must be untapped…"* ⇒ blokerów
    wybiera obrońca; skutek „can't block" usuwa stwora z puli blokerów.
  - **509.1b** — *„The defending player checks each creature they control to
    see whether it's affected by any restrictions (effects that say a creature
    can't block…). If any restrictions are being disobeyed, the declaration of
    blockers is illegal."* ⇒ „can't block" to realne usunięcie blokera
    z deklaracji — wartość istnieje TYLKO, gdy bot realnie atakuje.
  - **704.5g** (śmiertelne obrażenia) + **702.12b** (indestructible) —
  jak w zgłoszeniu F: predykat `damageIsLethal` jest już JEDNYM źródłem
  w bocie i zostaje użyty (L41).

## Etapy i kryteria ukończenia

- [x] E0. Lektura obowiązkowa + rozpoznanie (pomiar PRZED powyżej).
- [x] E1. Ten plan wypchnięty jako osobny commit PRZED kodem (ADR 0020 A/C).
- [x] E2. **Fix wyceny** (`src/controllers/heuristic-bot.js`, bez nazw kart —
  ADR 0002; wyłącznie z `PlayerView` — ADR 0017):
  - [x] E2a. `attackWindowAttackerIds(view)` — JEDEN odczyt okna ataku
    (zadeklarowany atak ALBO precombat main1/beginning_of_combat z ciałem
    zdolnym atakować; `null` = brak zamiaru). `cantBlockPayoffValue`
    (PMSSB-40) i nowa gałąź wrappera liczą z TEJ SAMEJ funkcji (L41).
  - [x] E2b. `wrapTargetsValue`: obrażenia w wrogiego stwora —
    `damageIsLethal` ⇒ wartość removalu (wspólna formuła z
    `damageTargetValue`, wydzielona jako `lethalEnemyCreatureValue`), brak
    śmiertelności ⇒ 0 (chip nie jest stratą, bo „can't block" jedzie za
    darmo — anty-over-fix L121: nie ucina rzutu, który realnie coś kupuje).
    Własny cel: jak dotąd (−60 obrażenia / −10 „can't block"), ale obie
    składowe liczone osobno (obecny `else if` gubił ridera).
  - [x] E2c. „can't block" w wrapperze: `cantBlockRemovalValue(view, cel,
    attackerIds)` (wartość usunięcia NAJLEPSZEGO bloku, Batch60-followup/2)
    zamiast płaskiego +8; poza oknem ataku, na tapniętym / już
    nieblokującym celu ⇒ 0.
  - [x] E2d. Baza: czar, którego CAŁA treść to efekty utylitarne — także
    zapakowane we wrapper „each of up to N targets" (wewnątrz: typy
    utylitarne + obrażenia o STAŁEJ kwocie) — startuje od −1 jak w M146,
    nie od `spellBase` 50. Bounce we wrapperze (Sea God's Scorn,
    Captivating Gyre) NIE jest utylitarny ⇒ bez zmian.
  - [x] E2e. Ślad: warianty rozróżnialne (są już — cele w etykiecie
    `cast_spell(wif->f24+f33)`); potwierdzić, że wybór podzbioru wynika
    z wyceny, a nie z kolejności ofert.
- [x] E3. **Test** `test/zgloszenie-i-wrap-in-flames.test.js` (I/1–I/6):
  scena właściciela (brak śmiertelności + brak ataku ⇒ pass), lethal ⇒ cast,
  precombat z atakującym ⇒ cast, postcombat ⇒ pass, wybór podzbioru celów,
  własny cel karany, anty-over-fix (atak z blokerem wciąż rzuca).
- [x] E4. **Dowód mutacyjny** (L13/L34/L159 — mutacja per gałąź, wersja bazowa
  z `git show HEAD:<plik>`): mI1 (obrażenia płaskie `12+2P`), mI2
  („can't block" płaski +8), mI3 (baza 50 zamiast −1), mI4 (brak bramki okna
  ataku), mI5 (brak kary za własny cel).
- [x] E5. **Bramka** na zamrożonym drzewie (L174): `npm test` (fast) EXIT 0,
  `npm run build` EXIT 0, `node tools/cr-numery.mjs` OK. Bez pełnego B0
  (ADR 0018); zmiana dotyczy wyłącznie wyceny bota — próbka regresji
  `test/bot-benchmark.test.js` + golden-master `test/bot-scoring-snapshot.test.js`
  muszą zostać zielone (inaczej L124/L176: lokalizować `--dump`).
- [x] E6. **Domknięcie**: wpis PROJECT_HISTORY, sekcja I w opisie PR,
  uzupełnienie handoffu sesji.

## Ryzyka i pułapki

- **Nad-regulacja** (L121): kara nie może odcinać rzutu, który realnie coś
  kupuje — stąd obrażenia nieletalne = 0 (nie −80) i wartość „can't block"
  liczona z OKNA ATAKU, nie z fazy.
- **Baza jako nośnik wartości** (M146): zdjęcie bazy 50 bez wartości efektu
  daje remis z passem przy sortowaniu stabilnym (czary przed passem) —
  stąd start PONIŻEJ passu (−1).
- **Gałąź bliźniacza** (L41): `wrapTargetsValue` jest wspólna dla rzutu
  z ręki i dla okien rzutu spoza ręki (`resolve_grave_free_cast`,
  `resolve_madness_cast`, `resolve_exile_cast`) — zmiana idzie do obu naraz,
  osobny pin na każdą.
- **`git checkout <plik>` po mutacji** kasuje niezacommitowane zmiany
  (L136): mutacje robię na KOPII zapasowej w `.arena/`, przywracam kopią.
- **Golden-master / benchmark** (L124/L176): zmiana wyceny czaru może przesunąć
  decyzje bota — jeżeli `bot-scoring-snapshot` czerwienieje, lokalizować
  pierwszy dryf `--dump`, nie podnosić progów na ślepo.

## Podsumowanie wykonania (2026-10-08)

**Fix w `src/controllers/heuristic-bot.js`:**

| etap | co zrobiono | gdzie |
|---|---|---|
| E2a | `attackWindowAttackerIds(view)` — zadeklarowany atak ALBO precombat main1/beginning_of_combat z ciałem zdolnym atakować (`canAttackNow && combatPower > 0`); `null` = brak zamiaru. `cantBlockPayoffValue` (PMSSB-40) liczy z TEJ SAMEJ funkcji. | ok. 6768 + refactor `cantBlockPayoffValue` |
| E2b | wydzielony `lethalEnemyCreatureValue(view, t)` = `removalEnemyBase + removalWorthWeight·(P+T) + enemyRemovalTargetBonus` (ta sama formuła co `damageTargetValue`, L41); w `wrapTargetsValue` obrażenia: wrogi śmiertelny ⇒ ta wartość, nieśmiertelny ⇒ 0, własny ⇒ −60. | ok. 4796, ok. 5515 |
| E2c | rider „can't block" w OSOBNYM `if` (stary `else if` gubił go przy obrażeniach): `attackIds && !tapped && !cantBlock` ⇒ `cantBlockRemovalValue(view, t3, attackIds)`, poza oknem/tapnięty ⇒ 0 (nie kara — L121). | ok. 5495, ok. 5527 |
| E2d | modułowy `UTILITY_EFFECT_TYPES` + rekurencyjny `isUtilityEffect(e, insideWrapper)`: wrapper utylitarny gdy każdy wewnętrzny efekt utylitarny LUB `damage` o CAŁKOWITEJ kwocie — ale `damage` liczy się WYŁĄCZNIE wewnątrz wrappera (inaczej Shock tracił bazę: regresja własna złapana fast bramką, audyt-pmssb32-mana 60 → 9). Baza −1 (M146). | ok. 659, ok. 8798 |

**Pomiar PO (sonda `.arena/probe-i-wrap.mjs`):** wróg 2/4 + 3/3, brak atakujących
→ **pass** (wszystkie warianty −1, przed fixem 84,0); ten sam stół bez własnych
stworów → pass; postcombat main2 → pass; wróg 1/1 → cast 29,0 (cel = 1/1);
atakujący 3/3 + bloker 2/4 → cast 5,0 (cel = bloker); atakujący + 1/1 + 2/4 →
cast 26,0 (cel = oba).

**Testy:** `test/zgloszenie-i-wrap-in-flames.test.js` — 10 scenów (I/1, I/1b,
I/2, I/2b, I/3, I/3b, I/4, I/5, I/6, I/7-E2E). Pin
`test/m233-bot-wrap-no-targets-noop.test.js` — trzeci test cementował STARE
zachowanie („Wrap NADAL premiowany na stworze wroga"), które właściciel zgłosił
jako marnotrawstwo; zastąpiony trzema pinami warunkowymi (nieśmiertelne ciało
bez ataku ⇒ pass; lethal ⇒ cast; precombat z własnym atakującym ⇒ cast).

**Dowód mutacyjny** (mutacje na kopiach w `.arena/`, po każdej przywrócenie
oryginału; pass/fail dla 15 testów obu plików):

| mutacja | pass / fail | co łapie |
|---|---|---|
| mI1: obrażenia z powrotem płaskie `12 + 2P` | 8 / **7** | I/1, I/1b, I/2, I/3b, I/4, I/5, M233/I |
| mI2: „can't block" z powrotem płaski +8 | 10 / **5** | M233/I, I/1, I/1b, I/2, I/4 |
| mI3: wrapper nie utylitarny ⇒ baza `spellBase` 50 | 10 / **5** | M233/I, I/1, I/1b, I/3b, I/4 |
| mI4: zdjęta bramka kroków main1/beginning_of_combat | 14 / **1** | I/4 |
| mI4b: `canAttackNow` zignorowany (chore ciało = atakujące) | 14 / **1** | I/1 |
| mI5: bez kary za własny cel (obrażenia + „can't block") | 14 / **1** | I/6 |

Po przywróceniu kodu: 15/15.

**Golden master:** fixture `test/fixtures/bot-scoring-snapshot.json`
zregenerowany (3 hashe). Dryf był już w HEAD po zgłoszeniu H (test czerwienił
PRZED tą zmianą — potwierdzone eksperymentem `git stash`); pomiar pokazuje, że
zgłoszenie I nie rusza żadnej z 6 partii fixture (`--dump` identyczny z i bez
fixa, overallHash `b551a8b1…`).

**Bramka:** fast **7824/7824** EXIT 0; `npm run test:slow` **264/264** EXIT 0
(w tym `bot-scoring-snapshot` + `bot-benchmark` 29/29); build EXIT 0;
`node tools/cr-numery.mjs` OK (513 numerów / 5517 cytatów). Bez pełnego B0
(ADR 0018).
