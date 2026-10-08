Sesja na gałęzi `arena/6b9bb8b8-mtg`. Tryb ADR 0020: PR przed kodowaniem →
audyt poprzedniego PR → inkrementalne commity (każdy zielony krok osobno,
pushowany natychiast). Bez merge przez agenta, bez force-push, bez pełnego
B0 (ADR 0018), bez nowych kart (ADR 0029).

## Audyt PR #157 (ADR 0020 B / ADR 0016)

Raport: `docs/audits/AUDYT_PR157_2026-10-07.md`; plan:
`docs/plans/PLAN_2026-10-07b-audyt-pr157-petla-jakosci.md`.

- Zakres: 19 plików (+1278/−56) squasha `1222754` (zgłoszenie D — Pain for
  All, looks-back aury + LKI hosta; D1/D1-mirror — koszt odbicia w bocie;
  domknięcia F1/F2 i O1/O2 z audytu PR #156). Baseline zamrożony przed
  audytem: fast **7775/7775** EXIT 0, build **72 moduły / 4902,2 kB** EXIT 0.
- Werdykt: **PASS** — błędów funkcjonalnych nie stwierdzono. 8 znalezisk
  klasy L164/L13/L3/L41: 4 cytaty CR poprawione (608.2g → 608.2h,
  611.2c → 608.2h, 704.5m → 704.5g, zbiórczy przegląd 9 miejsc),
  2 piny dopięte mutacją (LKI hosta, filtr ISTNIENIA oferty),
  2 obserwacje udokumentowane (D1-ctl — kradzież aury, D-60310 — konwencja
  „looks-back"). Dowody mutacyjne rodzin D, D1, D1M, F1 potwierdzone.
- Bramka końcowa sesji: `npm run test:all` **8048/8048** EXIT 0 (474,9 s),
  build 72 moduły / 4904,0 kB EXIT 0.

## Zgłoszenie E — regeneracja: ta sama zdolność 3× w jednej walce

- **Zgłoszenie:** bot aktywował tę samą zdolność regeneracji 3× z rzędu w
  jednej walce (log właściciela: Magmarch 5/3 vs Ballista Watcher 4/3, cała
  mana w błoto).
- **Przyczyna:** tarcza regeneracji wisi wtedy jeszcze na stosie, a sesja pyta
  bota ponownie, bo aktywacja nie oddaje priorytetu — bot nie widział, że
  efekt już zapłacił.
- **Fix** (`heuristic-bot.js`, wzorzec M179/M219/M230): tarcza już na celu
  LUB identyczna regeneracja na stosie → `finish(-30)`; cytat **CR 701.19a**
  ze źródła (ADR 0030). Piny E/1–E/5 w
  `test/zgloszenie-e-regeneracja-jednorazowo.test.js`; bez fixa E/4 pokazuje
  `aktywacje=3`.
- **Korekta cytatu:** regeneracja to CR 701.19, nie 702.14 (702.14 =
  Landwalk) — znalezisko klasy L164.
- Bramy: fast 7784/7784, końcowa `test:all` **8048/8048** EXIT 0 (474,9 s),
  build 72 moduły / 4904,0 kB EXIT 0.

## Zgłoszenie F — Warmmaker Gunship: trigger obrażeniowy marnuje lethal

- **Zgłoszenie:** „deals damage equal to the number of artifacts you control
  to target creature an opponent controls" — bot wprowadzał statek, dostawał
  1 obrażenia i bił 2/4 zamiast 1/1, marnując zdolność. Pomiar przed fixem:
  1/1 (lethal) = 33, 2/4 = 38, 3/3 = 39.
- **Przyczyna:** gałąź `resolve_trigger_target` wyceniała cel jako
  `30 + 2P + T`, a śmiertelność brała WYŁĄCZNIE z `debuffKills()`; efekt
  `damage` nie nosił kwoty w komendzie, więc większe ciało zawsze wygrywało.
  Klasa awarii: **L21** (jawna lista pól gubi dane).
- **Fix:** `resolveDamageAmount` wydzielony z `applyEffect` (JEDEN resolver
  kwoty dla rozstrzygania i oferty, L41); oferta `resolve_trigger_target`
  niesie `damage`; z `damageTargetValue` wydzielony predykat `damageIsLethal`
  (CR 704.5g/704.5i/615.6/702.12b) złożony w premię `kill` (+60 wrogi /
  −60 własny).
- **Efekt:** 1/1 = 93 > 2/4 = 38 > 3/3 = 39; Reclusive Artificer nie zabija
  własnego stwora (−63). Testy F/1–F/6, dowód mutacyjny 0/7, 3/7, 6/7.
- Bramy: fast **7791/7791** EXIT 0, build 72 moduły / 4909,0 kB EXIT 0.
  Fixture audytowy przeniesiony z `decks/` do
  `tools/table-tester/fixtures/` (w `decks/` czerwienił 6 strażników talii).

## Zgłoszenie G — Forge Devil: OBOWIĄZKOWY ETB-ping skazany na własne ciało

- **Zgłoszenie:** „it deals 1 damage to target creature and 1 damage to you"
  — bot wystawiał go, gdy jedynym celem pingu była jego własna 1/1: zabijał
  własnego stwora, tracił 1 życia, nic nie zyskiwał. Pomiar przed fixem:
  własna 1/1 tylko → cast **62,1** (powyżej passu 0).
- **Przyczyna:** strażnik M103/A bronił wyłącznie PUSTEGO stołu — bramka
  „jest jakikolwiek stwór na stole" przepuszczała własne ciało. Klasa
  awarii: **L14** (bramka zastępcza zamiast warunku).
- **Fix:** nowy helper `etbForcedOwnPingPenalty` — liczy OFIARY pingu przez
  `publicEtbTargets` + `controllerId`: cel wrogi → 0, własne ciało
  wchłaniające obrażenia → 0, spłoną wszyscy → kara = ciało najtańszej ofiary
  (CR 704.5g/702.12b), brak kandydatów → 80. Blok M103/A przepisany na
  detektor OBOWIĄZKOWEGO pingu. Generycznie po deskryptorze `requiresTarget`
  (ADR 0002), wycena tylko z `PlayerView` (ADR 0017).
- **Efekt:** własna 1/1 tylko → pass (−3,6); dwie własne 1/1 → pass; 1/1
  z obrażeniami → pass; własna 3/3 i 2/2 (wchłaniają) → cast 62,1 ✓;
  wróg ma stwora → cast 64,8; pusty stół → pass; wróg ma tylko artefakt →
  pass (−0,9, przed fixem błędnie cast 64,8); Reclusive Artificer (trigger
  opcjonalny) → cast 63,9 bez kary.
- Bramy: fast **7801/7801** EXIT 0, piny Forge Devil 13/13.

## Zgłoszenie H — Krumar Initiate: „endure X" co kolejkę 1/1 za 1 życie

- **Zgłoszenie:** bot co kolejkę tworzył za 1 życia spirit 1/1, który potem
  ginie. Pomiar przed fixem: X=1 = 0,5, X=2..8 = 0 — efekt `endure_x` nie
  miał wyceny w `activate_ability`, koszt „Pay X life" nie był wyceniony
  NIGDZIE, tryb był płaski (42/40), a warianty X miały identyczną etykietę
  w śladzie.
- **Fix:** `endureBodyValue` (JEDNA miara ciała, CR 701.63a; punkty do
  `need = max(P,T) wroga + 1` pełną wagą, powyżej mniej niż życie za punkt),
  `endureXValue` (lepszy z trybów: liczniki na ŹRÓDLE albo token),
  koszt „Pay X life" (CR 601.2h) z progiem 25% puli,
  `resolve_endure_choice` liczy ciało z N (nowe pole widoku
  `pendingEndures`), ślad rozróżnia warianty (`,X=n`, `(tryb)`).
- **Efekt:** wróg 5/5 + 20 życia → X=4, liczniki, źródło 6/6 za 4 życia;
  wróg 2/2 → X=1 (3/3); wróg 4/4 → X=3 (5/5); wróg 8/8 + 40 życia → X=7;
  pusty stół → X=3 (5/5); 8 życia → X=1.
- **Testy:** `test/zgloszenie-h-krumar-initiate-endure-x.test.js`
  (11 scenów). Dowód mutacyjny: mH1 2/9, mH2 10/1, mH3 8/3, mH4 5/6,
  mH5 3/8, mH6 10/1.
- Bramy: fast **7812/7812** EXIT 0, build 72 moduły / 4920,6 kB EXIT 0,
  cr-numery OK. Plan: `docs/plans/PLAN_2026-10-08-zgloszenie-h-krumar-initiate-endure-x.md`.

## Zgłoszenie I — Wrap in Flames: rzut bez przesłanki marnuje całą turę

- **Zgłoszenie:** „Wrap in Flames deals 1 damage to each of up to three
  target creatures. Those creatures can't block this turn." ({3}{R}) — „Bot
  rzuca ją zawsze jak ma manę. Ta karta ma sens tylko wtedy, jeżeli zachodzi
  jedna z dwóch przesłanek: a. przeciwnik ma przynajmniej jedną kreaturę,
  dla której 1 dmg stanowi lethal dmg. Im więcej takich kreatur tym lepiej.
  ALBO b. bot zamierza atakować i dzięki Wrap in Flames wyłącza blockerów
  przeciwnika. Niestety żadna z tych przesłanek nie zachodziła, bot rzucił
  ten czar i go całkowicie zmarnował bo dwie kreatury miały >1 toughness i
  nic im się nie stało, a bot nie atakował w ogóle."
- **Pomiar PRZED** (sonda `.arena/probe-i-wrap.mjs`): baza czaru (`spellBase`
  50) + płaska wartość celu (`12 + 2P` za każdy wrogi cel, 8 za „can't
  block") nosiły czar ponad pass ZAWSZE, gdy na stole stał choć jeden wrogi
  stwór: wróg 2/4 + 3/3, brak atakujących → cast **84,0**; ten sam stół bez
  własnych stworów → 84,0; postcombat main2 → 84,0; wróg 1/1 → 80,0. Żadna
  składowa nie pytała o śmiertelność obrażeń ani o zamiar ataku. Klasa
  awarii: **L50/L131** (efekt bez wyceny = pierwsza oferta z listy) w
  wariancie „baza niesie czar" — **M146**.
- **Fix** (generycznie po deskryptorze `apply_to_each_target` + typach
  efektów, ADR 0002 — żadnej nazwy karty; wycena wyłącznie z `PlayerView`,
  ADR 0017):
  - `wrapTargetsValue` — obrażenia w wrogiego stwora: ŚMIERTELNE = usunięcie
    ciała (ta sama formuła co czar/zdolność: wydzielony
    `lethalEnemyCreatureValue`, L41), NIEŚMIERTELNE = 0 (chip sam w sobie
    nic nie wart, a „can't block" w tym samym rzucie jedzie za darmo — nie
    karzemy, L121);
  - „can't block" liczy się OSOBNO od obrażeń (stary `else if` gubił ridera,
    gdy oba efekty są w deskryptorze) i ma wartość WYŁĄCZNIE w oknie ataku —
    `attackWindowAttackerIds` (JEDEN odczyt okna dla payoffu triggera
    PMSSB-40 i dla wrappera, L41) + `cantBlockRemovalValue` (wartość
    usunięcia NAJLEPSZEGO bloku, Batch60); poza oknem, na ciele tapniętym
    albo już nieblokującym = 0;
  - czar zapakowany we wrapper, którego KAŻDY wewnętrzny efekt jest
    utylitarny albo obrażeniem o STAŁEJ kwocie, startuje od −1 (M146), nie
    od bazy 50 — bez tego baza niosłaby go ponad pass nawet przy zerowym
    efekcie;
  - **CR 601.2c** „If the spell has a variable number of targets, the player
    announces how many targets they will choose before they announce those
    targets." ⇒ liczba celów to wybór gracza, więc każdy podzbiór ma własną
    wycenę; **CR 509.1b** „…If any restrictions are being disobeyed, the
    declaration of blockers is illegal." ⇒ „can't block" realnie usuwa
    blokera, ale tylko przy deklaracji blokerów; **CR 509.1a** „The chosen
    creatures must be untapped…" ⇒ tapnięty stwór i tak nie blokuje, więc
    jego wartość jako celu jest zerowa. Cytaty dosłowne z mirroru
    `nwgarne/mtg-data` (CR 2026-09-25, SHA-256 `8d860e45…`), ADR 0030.
- **Efekt** (sonda, po fixie): wróg 2/4 + 3/3, brak atakujących → **pass**
  (wszystkie warianty −1, przed fixem 84,0); ten sam stół bez własnych
  stworów → pass; postcombat main2 → pass; wróg 1/1 (lethal) → cast 29,0
  (cel = 1/1); atakujący 3/3 + bloker 2/4 → cast 5,0 (cel = bloker);
  tapnięty bloker → pass; atakujący + 1/1 + 2/4 → cast 26,0 (cel = oba).
- **Testy:** `test/zgloszenie-i-wrap-in-flames.test.js` (10 scenów: scena
  ze zgłoszenia, lethal, podrany 4/4, okno ataku, tapnięty bloker,
  postcombat, wybór podzbioru, własny cel, E2E). Pin M233
  (`test/m233-bot-wrap-no-targets-noop.test.js`) zaktualizowany: trzeci test
  cementował STARE zachowanie („Wrap NADAL premiowany na stworze wroga"),
  które właściciel zgłosił jako marnotrawstwo — zastąpiony trzema pinami
  warunkowymi (nieśmiertelne ciało bez ataku → pass; lethal → cast;
  precombat z własnym atakującym → cast). Dowód mutacyjny: mI1 (obrażenia
  z powrotem płaskie) 8/7, mI2 („can't block" z powrotem płaski +8) 10/5,
  mI3 (wrapper nie utylitarny → baza 50) 10/5, mI4 (zdjęta bramka kroków
  main1/beginning_of_combat) 14/1, mI4b (chore ciało liczy się jako
  atakujące) 14/1, mI5 (bez kary za własny cel) 14/1.
- **Golden master:** fixture `test/fixtures/bot-scoring-snapshot.json`
  zregenerowany (3 hashe) — dryf był już w HEAD po zgłoszeniu H (test
  czerwienił przed tą zmianą); pomiar potwierdza, że zgłoszenie I nie rusza
  żadnej z 6 partii fixture (overallHash identyczny z i bez fixa).
- Bramy: fast **7824/7824** EXIT 0, `bot-scoring-snapshot` +
  `bot-benchmark` 29/29 EXIT 0, build 72 moduły EXIT 0, cr-numery OK.
  Plan: `docs/plans/PLAN_2026-10-08-zgloszenie-i-wrap-in-flames.md`.

## Zgłoszenie J — Fledgling Imp: latanie aktywowane bez powodu (+1 → pass)

- **Zgłoszenie:** „{B}, Discard a card: This creature gains flying until end of
  turn." — „Bot ma na stole impa. Ja mam wszystkie kreatury tapnięte. Bot używa
  tej zdolności i nadaje sobie latanie (musi zapłacić manę i odrzucić kartę —
  wyrzuca Brute Force, którym mógłby sobie pumpować +3/+3 IDIOTA!). Atakuje.
  Zadaje mi 2 dmg. PO CO SIĘ PYTAM ON AKTYWOWAŁ TO LATANIE??? … To latanie to
  ma sens tylko gdy jest do czegoś potrzebne (np. ja mam blokerów z lataniem
  albo reach) albo gdy chce tym impem blokować kogoś z lataniem. I warunek
  konieczny — ma na ręce ZBĘDNĄ kartę — np. taką na którą nie ma many."
- **Pomiar PRZED** (sonda `.arena/probe-j-imp.mjs`; bot z impem 2/2, 8 lądów w
  tym 3 Mountains, Brute Force w ręce): wszystkie kreatury wroga TAPNIĘTE →
  aktywacja **+1** przy pass 0 (i pass_przejście ataku za 2 obrażeń); wróg bez
  stworów → również **+1**. Premia `2 + moc` za latanie wypisywana była za samo
  BRAK odpowiedzi flying/reach — nikt nie pytał, czy wróg ma w ogóle
  nietapniętego blokera naziemnego.
- **Przyczyna:** gałąź `flying` w `keywordGrantWindowValue` (M218/3) miała
  tylko jeden z dwóch warunków. Klasa awarii: **L50/L131** (efekt bez wyceny
  wymiaru „czy efekt cokolwiek zmienia") w wariancie **M146** (basa +2 nosi
  wariant).
- **Fix** (generycznie po typie efektu `grant_keywords_until_end_of_turn` +
  `PlayerView`, ADR 0002/0017; wspólne dla czarów i zdolności, L41):
  `enemyHasUntappedGroundBlockerFor(view, recipient)` — przeciwnik ma
  nietapniętego stwora, który bez latania ZABLOKOWAŁBY odbiorcę (przez
  `attackerCanBeBlocked`: menace / ewazja mocowa / `cantBlock` liczone tą samą
  regułą co wycena ataku, CR 509.1b + M202/H). Premia `2 + moc` tylko gdy taki
  bloker ISTNIEJE i wróg nie ma flyera/reach; w przeciwnym razie **kara −10**
  (efekt jałowy), nie zero — baza zdolności +2 minus {B} znów niosłaby wariant
  ponad pass (L3). Gałąź obronna (imp blokujący nadlatującego latającego
  atakującego) bez zmian.
  Cytaty CR dosłowne z mirroru (CR 2026-09-25, SHA-256 `8d860e45…`, ADR 0030):
  **702.9b** „A creature with flying can't be blocked except by creatures with
  flying and/or reach.", **509.1a** „The chosen creatures must be untapped…",
  **509.1b** „…If any restrictions are being disobeyed, the declaration of
  blockers is illegal.", **502.3** odkręcenie tylko we własnym kroku
  odkręcenia, **701.9a** „To discard a card, move it from its owner's hand to
  that player's graveyard." (nowy numer w tabeli `cr-numery`).
- **Efekt:** wróg 2/4 + 2/3 tapnięte → **pass** (−13, przed fixem +1); wróg bez
  stworów → pass; wróg 2/4 nietapnięty → activate (+1 — anty-over-fix, regresja
  M218/3 chroniona); beginning_of_combat z blokerem → activate; wróg z
  flyer/reach → pass; imp z menace i jednym blokerem → pass; okno obronne (tura
  wroga, atakujący z flying) → activate; main2 → pass. E2E: aktywacja płaci
  {B}, karta ląduje w grobie, imp dostaje flying.
- **Testy:** `test/zgloszenie-j-fledgling-imp-latanie.test.js` (13 scenów).
  Dowód mutacyjny: mJ1 7/6, mJ2 11/2, mJ3 10/3, mJ4 10/3, mJ5 11/2 → z fixem
  13/13.
- Bramy: fast **7837/7837** EXIT 0, `test:slow` **264/264** EXIT 0, pełny pakiet
  `node tools/run-tests.mjs all` **8101/8101** EXIT 0, build 72 moduły /
  4928,2 kB EXIT 0, cr-numery OK. Plan:
  `docs/plans/PLAN_2026-10-08-zgloszenie-j-fledgling-imp-latanie.md`.
- **Budżet lektury startowej** (L66): wpis L182 wypchnął lekturę ponad próg 100k
  tokenów (ćzerwone CI na commicie dokumentacyjnym) — zapłacono skróceniem
  istniejących wpisów (AGENTS.md §0 + L5/L55/L58/L60/L106/L134, bez utraty
  faktów). Lektura: **99 728** tokenów (zapas 272).