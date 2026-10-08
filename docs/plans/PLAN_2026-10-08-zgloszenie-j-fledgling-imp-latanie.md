# Zgłoszenie J — Fledgling Imp: latanie aktywowane bez powodu (i z utratą dobrej karty)

Plan sesji `arena/6b9bb8b8-mtg` (PR #158, tryb ADR 0020 A/C: plan PRZED kodem,
każdy zielony krok = osobny commit + push).

## Rozpoznanie (wykonane)

**Zgłoszenie właściciela (dosłownie):**

> J. Karta Fledgling Imp. "{B}, Discard a card: This creature gains flying
> until end of turn."
> Bot ma na stole impa. Ja mam wszystkie kreatury tapnięte. Bot używa tej
> zdolności i nadaje sobie latanie (musi zapłacić manę i odrzucić kartę -
> wyrzuca Brute Force, którym mógłby sobie pumpować +3/+3 IDIOTA!). Atakuje.
> Zadaje mi 2 dmg. PO CO SIĘ PYTAM ON AKTYWOWAŁ TO LATANIE??? Czemu wyrzucił
> super kartę, którą mógł mi zadać dodatkowe 3 dmg. Kompletnie bez sensu
> zagranie! To latanie to ma sens tylko gdy jest do czegoś potrzebne (np. ja
> mam blokerów z lataniem albo reach) albo gdy chce tym impem blokować kogoś
> z lataniem. I warunek konieczny - ma na ręce ZBĘDNĄ kartę - np. taką na
> którą nie ma many. Tutaj ma 8 lądów, w tym 3 mountains które mógłby zużyć na
> rzucenie Brute Force, ale wolał wyrzucić kartę do kosza i zadać mi mniej
> obrażeń. BEZ SENSU!

**Oracle karty** (`src/cards/card-data.js:6516`, ODY):

> {B}, Discard a card: This creature gains flying until end of turn.

Deskryptor: `abilities[0]` = activated, `cost: { mana: 1, colors: ['B'],
discardCard: true }`, `effect: { type: 'grant_keywords_until_end_of_turn',
keywords: ['flying'] }`. Zasięg deskryptora `grant_keywords_until_end_of_turn`
w `activate_ability` — każda zdolność/karta nadająca keyword do końca tury
(wspólna gałąź `keywordGrantWindowValue`, M179/A1).

**Pomiar PRZED** (sonda `.arena/probe-j-imp.mjs`: bot = p1 z impem 2/2, 8 lądów
w tym 3 Mountains, `Brute Force` w ręce; właściciel = p2):

| scena | nota aktywacji | wybór bota | wada |
|---|---|---|---|
| **J (zgłoszenie): wróg 2/4 + 2/3 TAPNIĘTE** | **+1** | **activate_ability** | latanie jałowe (wszyscy tapnięci), Brute Force w koszu |
| J2: wróg 2/4 nietapnięty | +1 | activate | okno REALNE — poprawne |
| J3: wróg 2/4 z flying | −5 | pass | poprawne (istniejąca kara) |
| J3b: wróg 2/4 + 2/2 z flying | −5 | pass | poprawne |
| J4: wróg 2/4 nietapnięty, w ręce land | −25 | play_land | discard landu drogi |
| J4b: wróg 2/4 TAPNIĘTY, w ręce land | −25 | play_land | discard landu drogi |
| J4c: wróg 2/4 TAPNIĘTY, w ręce niezagrywalny Marut | −19 | cast_permanent | duże ciało w ręku = drogi discard |
| J5: tura wroga, atak 2/2 z flying | −5 | pass | patrz uwaga niżej |
| J6: beginning_of_combat, wróg 2/4 nietapnięty | +1 | activate | okno realne |
| J7: main2 (postcombat) | −13 | pass | poprawne (poza oknem) |
| **J8: wróg BEZ stworów** | **+1** | **activate_ability** | ten sam błąd — nikt nie może zablokować |

**Przyczyna:** gałąź `flying` w `keywordGrantWindowValue` pyta WYŁĄCZNIE, czy
wróg ma nietapniętego latającego/reach (`hasUntappedFlyingBlocker`) — czyli o
ODPOWIEDŹ w powietrzu — i nigdy nie pyta, czy wróg ma w ogóle jakiegokolwiek
NIETAPNIĘTEGO blokera NAZIEMNEGO, który mógłby zablokować tego stwora. Gdy
wszystkie kreatury wroga są tapnięte (albo wroga nie ma), atak i tak przejdzie
(CR 509.1a: „The chosen creatures must be untapped…"), więc latanie nie zmienia
NIC — a baza zdolności (+2) minus mana (−1) plus premia okna (+2 + moc) daje
+1, czyli ponad pass. Klasa awarii: **L50/L131** (efekt bez wyceny wymiaru
„czy efekt cokolwiek zmienia") w wariancie **M146** (baza nosi wariant).

**Cytaty CR** (dosłowny tekst z mirroru `nwgarne/mtg-data`, CR effective
2026-09-25, SHA-256 `8d860e45…`, ADR 0030):

- **702.9b**: „A creature with flying can't be blocked except by creatures with
  flying and/or reach. A creature with flying can block a creature with or
  without flying." ⇒ latanie zmienia zdolność blokowania TYLKO wtedy, gdy
  obrońca ma stworów, którzy bez latania ZABLOKOWALIBY atakującego.
- **509.1a**: „The defending player chooses which creatures they control, if
  any, will block. The chosen creatures must be untapped and they can't also be
  battles." ⇒ tapnięty stwór nie może być blokerem.
- **509.1b**: „The defending player checks each creature they control to see
  whether it's affected by any restrictions (effects that say a creature can't
  block, or that it can't block unless some condition is met). If any
  restrictions are being disobeyed, the declaration of blockers is illegal." ⇒
  kazus „can't block" i ograniczenia blokowe liczą się przy deklaracji.
- **502.3**: „Third, the active player determines which permanents they control
  will untap. Then they untap them all simultaneously. … Normally, all of a
  player's permanents untap, but effects can keep one or more of a player's
  permanents from untapping." ⇒ przeciwnik NIE odkręca swoich stworów w mojej
  turze, więc stan „wszyscy tapnięci" z main1 jest stanem z momentu deklaracji
  blokerów — decyzja w main1 jest ta sama co w beginning_of_combat.
- **701.9a**: „To discard a card, move it from its owner's hand to that player's
  graveyard." ⇒ karta z kosztu-discard jest STRACONA (nie wraca do ręki).

## Etapy i kryteria ukończenia

- [ ] E0. Lektura obowiązkowa + rozpoznanie (pomiar PRZED powyżej).
- [ ] E1. Ten plan wypchnięty jako osobny commit PRZED kodem (ADR 0020 A/C).
- [ ] E2. **Fix wyceny** (`src/controllers/heuristic-bot.js`, bez nazw kart —
  ADR 0002; wyłącznie z `PlayerView` — ADR 0017):
  - [ ] E2a. Nowy helper `enemyHasUntappedGroundBlockerFor(view, recipient)` —
    przeciwnik ma NIETAPNIĘTEGO stwora, który mógłby zablokować `recipient`
    BEZ latania (po `attackerCanBeBlocked`, czyli z uwzględnieniem
    `cantBlock`/menace/ewazji mocowej). Wróg bez takiego blokera = latanie nie
    zmienia NIC (CR 702.9b + 509.1a).
  - [ ] E2b. Gałąź `flying` w `keywordGrantWindowValue`: premia `2 + moc`
    tylko gdy `hasUntappedGroundBlocker` (a wróg nie ma odpowiedzi
    flying/reach — jak dotąd). Brak blokera naziemnego ⇒ efekt jałowy jak
    duplikat keywordu: kara, nie zero (baza +2 − mana muszą zejść poniżej
    passu, L3). Dotyczy OBU gałęzi okna: `attacking` (już zadeklarowany
    atakujący) i precombat (main1/beginning_of_combat). Gałąź obronna
    (blok latającego atakującego) bez zmian — to realne okno.
  - [ ] E2c. Koszt-discard zostaje po `abilityDiscardLoss` (PMSSB-58/F2 —
    JEDNA miara z pickerem, L41); nie dodajemy drugiej kary za kartę, żeby nie
    dublować wymiaru. Sprawdzić pomiarem, że strata karty realnie opada z
    noty aktywacji (J: −4 za Brute Force).
- [ ] E3. **Test** `test/zgloszenie-j-fledgling-imp-latanie.test.js` (J/1–J/6):
  scena ze zgłoszenia (wszyscy tapnięci ⇒ pass), wróg bez stworów ⇒ pass,
  wróg z nietapniętym blokerem naziemnym ⇒ activate (anty-over-fix, regresja
  M218/3), wróg z flying/reach ⇒ pass, okno obronne (tura wroga, atakujący z
  flying) ⇒ activate, main2/postcombat ⇒ pass.
- [ ] E4. **Dowód mutacyjny** (L13/L34/L159 — mutacja per gałąź, wersja bazowa
  z `git show HEAD:<plik>`): mJ1 (usunięty warunek `hasUntappedGroundBlocker`),
  mJ2 (brak kary za jałowe latanie — zero zamiast kary), mJ3 (helper ignoruje
  `tapped`), mJ4 (helper ignoruje flying/reach blokera).
- [ ] E5. **Bramka** na zamrożonym drzewie (L174): `npm test` (fast) EXIT 0,
  `npm run build` EXIT 0, `node tools/cr-numery.mjs` OK. Bez pełnego B0
  (ADR 0018); zmiana dotyczy wyłącznie wyceny bota — próbka regresji
  `test/bot-benchmark.test.js` + golden-master `test/bot-scoring-snapshot.test.js`
  muszą zostać zielone (inaczej L124/L176: lokalizować `--dump`).
- [ ] E6. **Domknięcie**: wpis PROJECT_HISTORY, sekcja J w opisie PR
  (`docs/plans/PR_158_OPIS.md`), uzupełnienie handoffu sesji.

## Ryzyka i pułapki

- **Nad-regulacja** (L121): kara nie może odcinać rzutu, który realnie coś
  kupuje. Gdy wróg ma nietapniętego blokera naziemnego, latanie MUSI zostać
  opłacalne (test J/3 anty-over-fix).
- **Pęć „latania dla samego latania”** w innych gałęziach: `keywordGrantWindowValue`
  jest wspólne dla czarów i zdolności (L41) — zmiana musi poprawić obie ścieżki
  naraz, a nie dodać osobnej reguły dla `activate_ability`.
- **Menace / ewazja mocowa**: helper musi iść przez `attackerCanBeBlocked`
  (CR 509.1b), nie po własnym liczeniu keywordów — inaczej latanie na stwora z
  menace i jednym blokerem byłoby fałszywie opłacalne.
- **Okno obronne** (blok latającego atakującego) jest realne i nie zależy od
  blokera naziemnego — nie ruszać.
