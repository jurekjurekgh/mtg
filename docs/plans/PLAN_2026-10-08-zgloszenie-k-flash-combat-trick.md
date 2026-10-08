# Zgłoszenie K — Village Bell-Ringer i inne karty z flash jako COMBAT TRICK

Plan sesji `arena/6b9bb8b8-mtg` (PR #158, tryb ADR 0020 A/C: plan PRZED kodem,
każdy zielony krok = osobny commit + push).

## Rozpoznanie (wykonane)

**Zgłoszenie właściciela (dosłownie):**

> K. Karty z flash mają być promowane przez scoring jako COMBAT TRICK:
> 1. W własnej turze bota, gdy jest mana na kreaturę z flash — bot ŚWIADOMIE jej
>    nie rzuca; lądy zostają NIEZATAPIANE (mana trzymana).
> 2. W turze przeciwnika, PO deklaracji atakujących — taka kreatura wchodzi
>    (bot nic nie traci, mana się nie marnuje) i ma szansę ZASKOCZYĆ przeciwnika
>    blokiem, mimo że przeciwnik myślał, że przejdzie.
> 3. ETB Bell-Ringera (odtapowanie własnych stworów) ma być częścią wartości tej
>    gry.
> 4. Jeśli przeciwnik NIE zaatakował — kreatura wchodzi w GŁÓWNEJ 2 przeciwnika,
>    żeby nie zmarnować zostawionej na nią many.

**Oracle karty** (`src/cards/card-data.js`, ISD, status `supported` — ADR 0022):

> Flash (You may cast this spell any time you could cast an instant.)
> When this creature enters, untap all creatures you control.

Deskryptory: `keywords: ['flash']`, `types: ['Creature']`, 1/4 za 3 many,
`abilities[0]` = triggered `enter_battlefield` z efektem
`{ type: 'untap_all_creatures_you_control' }`. Reguła ma dotyczyć WSZYSTKICH
kreatur z flash (ADR 0002 — po deskryptorze, zero nazw kart).

**Zasięg reguły** (rejestr `createCardRegistry()`, filtr `keywords ∋ flash`):
15 kart, z czego **7 kreatur** — `village-bell-ringer` 1/4 mv3,
`ethersworn-shieldmage` 2/2 mv3 (Artifact Creature), `breaching-hippocamp` 3/2
mv4, `downwind-ambusher` 4/2 mv4, `swooping-protector` 2/1 mv4 (flying),
`koilos-roc` 3/3 mv5 (flying), `annie-flash-the-veteran` 4/5 mv6 (Legendary).
Pozostałe 8 to artefakty/aury (mają własne reguły okna: M235 aura, M258/A
equipment). Żadna kreatura z flash nie ma haste ani `entersWithCountersIf`
(jedynie `somberwald-spider` — morbid i `locthwain-paladin` — adamant mają
warunkowe ETB i obie są bez flash), więc wyjątki reguły nie kolidują z nimi.

**Pomiar PRZED** (sonda `.arena/probe-k-bellringer.mjs`: bot = p1 z
Bell-Ringerem w ręce, 4 lądy + 3 many w puli; właściciel = p2):

| scena | wybór PRZED | nota cast |
|---|---|---|
| main1 bota, wróg 2/4 nietapnięty | **cast** | +67,5 |
| main1 bota, wróg bez stworów | **cast** | +67,5 |
| main1 bota, wróg 4/4 + 3/3 | **cast** | +67,5 |
| tura wroga, `beginning_of_combat` | **cast** | +71,1 |
| tura wroga, `declare_attackers` (atak 2/4) | cast | +71,1 |
| tura wroga, `declare_blockers` (atak 2/4) | **cast** | +71,1 |
| tura wroga, `main2` (wróg nie atakował) | cast | +71,1 |
| main1 bota + własny 3/3 do ataku | **cast** | +67,5 |

Bot nigdy nie trzymał many na zaskoczenie i rzucał natychmiast w KAŻDYM kroku —
w tym po deklaracji blokujących, gdzie wchodzący stwór nie jest już
zadeklarowanym blokerem. Rozkład noty: ciało 70 + P 2 + T 4 − mana 4 + ETB 3
= 75, × waga rodziny `permanent` 0,9 = 67,5, + parytet stworów 4 × 0,9 = 71,1.

**Przyczyna:** baza ciała (~70) jest na tyle duża, że znosi KAŻDY wariant rzutu —
brak jest pytania o OKNO. ETB „untap all creatures you control" było płaskie 3
(wartość bez wymiaru). Klasa awarii: **L50/L131** (efekt bez wyceny wymiaru
„czy efekt cokolwiek zmienia w DANYM OKNIE") + **L48** (wariant rozstrzygany
liczbą, nie oknem).

**Cytaty CR** (dosłowny tekst z mirroru `nwgarne/mtg-data`, CR effective
2026-09-25, SHA-256 `8d860e45…`, ADR 0030):

- **302.6**: „A creature's activated ability with the tap symbol or the untap
  symbol in its activation cost can't be activated unless the creature has been
  under its controller's control continuously since their most recent turn
  began. A creature can't attack unless it has been under its controller's
  control continuously since their most recent turn began.\" ⇒ kreatura bez
  haste wchodząca we własnej turze nie atakuje w TEJ turze — rzut teraz nie
  kupuje tempa, a odsłania sztuczkę przeciwnikowi.
- **509.1a**: „The defending player chooses which creatures they control, if
  any, will block. The chosen creatures must be untapped and they can't also be
  battles.\" ⇒ kreatura wchodząca PO deklaracji blokujących nie jest
  zadeklarowanym blokerem — okno zaskoczenia minęło.
- **502.3**: „Third, the active player determines which permanents they control
  will untap. Then they untap them all simultaneously. … Normally, all of a
  player's permanents untap, but effects can keep one or more of a player's
  permanents from untapping.\" ⇒ w turze przeciwnika stwory bota (tapnięte
  atakiem we własnej turze) zostają TAPNIĘTE, więc ETB odkręcające ma realną
  wartość blokerską; poza oknem stwór odkręciłby się i tak we własnym kroku
  odkręcenia.
- **500.5**: „As a step or phase ends, if there are effects that last until the
  end of that step or phase, those effects expire. Then any unspent mana left in
  a player's mana pool empties. This is a turn-based action that doesn't use the
  stack (see rule 703.4q).\" ⇒ w kroku `main2`/`end`/`cleanup` tury przeciwnika
  mana z puli wyparowuje — rzut ratuje kartę i manę.

## Etapy i kryteria ukończenia

- [x] E0. Lektura obowiązkowa + rozpoznanie (pomiar PRZED powyżej).
- [x] E1. Ten plan wypchnięty jako osobny commit PRZED kodem (ADR 0020 A/C).
- [ ] E2. **Reguła okna** (`src/controllers/heuristic-bot.js`, bez nazw kart —
  ADR 0002; wyłącznie z `PlayerView` — ADR 0017):
  - [ ] E2a. Helper `flashCreatureCastTooEarly(view, def, card)` — kreatura z
    flash bez haste jest „za wcześnie" w KAŻDYM kroku własnej tury (CR 302.6) i
    w turze przeciwnika przed `declare_attackers` (odsłonięcie karty marnuje
    zaskoczenie) oraz po `declare_blockers` (CR 509.1a). Jedyny krok obronny:
    `declare_attackers` i tylko gdy kreatura realnie może zablokować któregoś
    atakującego (`attackerCanBeBlocked` — flying/reach/menace tą samą regułą co
    wycena ataku, CR 509.1b + M202/H). Post-combat (`main2`/`end`/`cleanup`)
    dozwolony (CR 500.5).
  - [ ] E2b. Wyjątki: `haste` (kreatura realnie atakuje w tej turze),
    `entersWithCountersIf` (warunek wejścia zależy od STANU tury — własna Główna 2
    bywa jedynym oknem spełnienia) oraz brak możliwości opłacenia kosztu z
    nietapniętych lądów później (mana jednorazowa: skarb/tap ciała nie przeżyje
    odroczenia).
  - [ ] E2c. Kara okna w bloku `cast_permanent` (przed epsilionem):
    `score = Math.min(score, 0) - P.flashCreatureEarlyWindowPenalty` — wycena
    karty (ciało + ETB + parytet) WYZEROWANA, więc nawet bardzo silne ETB nie
    wróci ponad pass (L3), a epsilon nadal różnicuje karty z flash (L41/L48).
    Kara NIE jest stałą liczbą przebijającą bazę (jak w M235).
  - [ ] E2d. Nowy parametr `flashCreatureEarlyWindowPenalty` (10) w
    `src/controllers/heuristic-params.js` (lista kluczy + domyślna + pin w
    `test/bot-params.test.js`).
- [ ] E3. **ETB po kreaturze**: `untap_all_creatures_you_control` przestaje być
  płaskie 3 → `untapAllCreaturesValue(view)`: suma `untapTargetValue` po
  TAPNIĘTYCH własnych stworach, licząc tylko okna, gdzie odkręcenie daje akcję —
  obronne (cudza tura, `beginning_of_combat`/`declare_attackers`/
  `declare_blockers`, z bramką `cantBlock`) i ofensywne (własne
  `precombat_main`/`combat`, z bramką `canAttackNow`); poza nimi 0.
- [ ] E4. **Test** `test/zgloszenie-k-flash-combat-trick.test.js`: main1 bota
  (pass, lądy nietknięte, mana trzymana), `beginning_of_combat` wroga (pass),
  `declare_attackers` z naziemnym atakującym (cast), `declare_attackers` z
  LATAJĄCYM atakującym (pass — brak reakcji), `declare_blockers` (poniżej passu),
  `main2` wroga bez ataku (cast), ETB po kreaturze (+8+2×moc, 0 przy
  `cantBlock`, 0 poza oknem), E2E (hold → rzut → blok → 0 obrażeń), izolacja
  rodziny (vanilla bez flash = cast, aura M235 i artefakt bez celu nietknięte).
- [ ] E5. **Dowód mutacyjny**: mK1 (usunięta kara), mK2 (kara bez wyzerowania
  wyceny), mK3 (brak pytania o blokowalność atakujących), mK4 (okno obronne
  rozszerzone na `declare_blockers`), mK5 (okno obronne rozszerzone na własną
  turę), mK6 (ETB płaskie), mK7 (ETB ignoruje `cantBlock`), mK8 (ETB poza
  oknem), mK9 (reguła dotyka nie-kreatur), mK10 (reguła dotyka kreatur bez
  flash).
- [ ] E6. **Bramka** na zamrożonym drzewie: `npm test` (fast) EXIT 0,
  `npm run build` EXIT 0, `node tools/cr-numery.mjs` OK (nowy cytat **500.5**
  dopisany do tabeli procedurą `--zapisz`). Bez pełnego B0 (ADR 0018); regresja
  `test/bot-benchmark.test.js` + golden-master `test/bot-scoring-snapshot.test.js`
  muszą zostać zielone.
- [ ] E7. **Domknięcie**: wpis PROJECT_HISTORY, sekcja K w opisie PR
  (`docs/plans/PR_158_OPIS.md`), uzupełnienie handoffu sesji, lekcja w
  `docs/LESSONS.md` (zgodnie z kontraktem budżetu z AGENTS.md §0 — nowy wpis
  płaci się skróceniem innego).

## Ryzyka i pułapki

- **Nad-regulacja** (L121): kara nie może odcinać rzutu, który realnie coś
  kupuje. Gdy kreatura z flash realnie może zablokować atakującego (punkt 2
  zlecenia), rzut MUSI być opłacalny (test K/4).
- **Reguła nie może dotknąć innych rodzin**: aury (M235) i equipment (M258/A)
  mają własne reguły okna — stąd bramka `isCreature` (testy K/12, K/13).
- **Kreatura bez flash** nie jest sztuczką bojową — rzut w main1 dla niej jest
  poprawny (test K/11); inaczej bot przestałby grać ciała.
- **Mana jednorazowa**: gdy kosztu nie da się zapłacić z nietapniętych lądów
  później, odroczenie = UTRATA karty (bot polegałby na skarbie/tapie ciała) —
  wyjątek w E2b.
- **Epsilon**: wyzerowana wycena + epsilon = nota nieco powyżej kary
  (−8,998 zamiast −9,0). To zamierzone (L48: epsilon różnicuje karty, nie
  odwraca realnej różnicy — kroki wyceny ≥ 0,1); testy mają tolerancję 0,01.
- **`declare_blockers` po stronie wroga** nie jest oknem rzutu — kreatura
  wchodząca w tym kroku nie jest blokerem (CR 509.1a), test K/6.
