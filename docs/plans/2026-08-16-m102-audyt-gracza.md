# M102 — audyt rozgrywki z perspektywy gracza (Żywy Tester)

Cel: wcielić się w gracza, rozegrać partie różnymi taliami i zebrać 10
unikalnych usterek widocznych NA STOLE (nie w testach silnika). Każda usterka:
objaw → root cause → test RED→GREEN → naprawa u root cause.

Dodatkowe zlecenie właściciela (2026-08-16):
1. czy gracz może rzucać czary/zdolności w KAŻDEJ legalnej turze/oknie,
2. czy silnik nie przeskakuje nielegalnie faz gracza,
3. czy wszystko, co powinno, pojawia się w panelu Rozgrywka.

## Znaleziska

| # | Objaw | CR | Status |
|---|---|---|---|
| U1 | Priorytet i aktywacje zdolności w kroku ODKRĘCANIA; partia startuje w „Untap" | 502.4 | **naprawione** |
| U2 | `? zostaje załączony do Hero (bestow)` — job select gubił nazwę ekwipunku i kłamał o mechanice | UX | **naprawione** |
| U3 | Nierozróżnialne opcje wyboru: 4× „Springbloom Druid (poświęcenie landa)", 17× „Szukanie: Forest" | UX | **naprawione** |
| U4 | Kilka kopii tego samego landa w ręce = kilka identycznych przycisków „Zagraj ląd: Forest" (zgłoszenie właściciela) | UX | **naprawione** |
| U5 | Liczba przy nagłówku „Twoje działania 4" — myląca, nic nie wnosiła (zgłoszenie właściciela) | UX | **naprawione** |
| U6 | Mgła wojny morpha: `morph wchodzi na bitwisko` + `Woolly Loxodon zostaje rozstrzygnięty` (zgłoszenie właściciela) | 708.2 | **naprawione** |
| U7 | Kafel aury/ekwipunku na stole nie pokazywał, kogo wzmacnia (`skipLiveState` gasił badge w obu ścieżkach) | UX | **naprawione** |

## U1 — brak priorytetu w untap (CR 502.4)

Objaw (transkrypt `/tmp/g1.txt`, krok 54): wskaźnik „T. 15 Ty … Untap",
a panel akcji wystawia „Aktywuj: Moonscarred Werewolf (koszt T) — dodaj manę"
i „Channel: Greater Tanuki". Kliknięcie realnie tapuje stwora o manę
W KROKU ODKRĘCANIA. Profil greedy Żywego Testera: 5 takich aktywacji/partię.

CR 502.4: „No player receives priority during the untap step, so no spells can
be cast or resolve and no abilities can be activated or resolve."

Root cause: pełna runda passów woła `nextTurnStep`, które przy zawinięciu tury
zatrzymuje automat na `TURN_STEPS[0]` = untap i ustawia `priorityPlayerId`.
Krok dobierania miał już akcję turową (M101/A), untap nie miał odpowiednika.
Druga ścieżka: po mulliganach partia również startowała w untapie.

Naprawa:
- `untapStepTurnBasedAction(state)` w `src/engine/game-state.js` — po akcjach
  turowych untapu (beginTurn) przewija do upkeepu (CR 503.1); wołane w
  `pass_priority` (zawinięcie tury) i po keepie obu graczy (start partii);
- twarda bramka w `legalActivatedAbilities` (`abilities.js`): w `step==='untap'`
  zero ofert — obrona w głąb, gdyby jakaś ścieżka ustawiła stan na untapie.

Test: `test/brak-priorytetu-w-untap.test.js` (3 przypadki, RED→GREEN).

Skutki uboczne (naprawione, nie obejścia): 4 testy kodowały stary stan —
`mainPhase`/`board()` ustawiały fazę zostawiając `step:'untap'` (użyto
`jumpToStep`), a `full-turn`/`mulligan` asertowały start w untapie.

## Weryfikacja zlecenia właściciela (skrypty w `/tmp/audyt/`)

- `okna.mjs` — mapa okien priorytetu: po naprawie aktywny i nieaktywny gracz
  dostają priorytet w KAŻDYM kroku poza untapem (zgodnie z CR 502.4).
- `instant.mjs` — oferta rzutu instanta w każdym oknie: TAK we wszystkich
  oknach obu tur; jedyny wyjątek to cleanup własnej tury przy ręce >7,
  gdzie blokuje wybór odrzucenia (CR 514.1) — zachowanie poprawne.
- `eventy.mjs` — panel Rozgrywka: 164 typy zdarzeń silnika, 0 bez opisu
  (żaden surowy identyfikator nie wycieka do gracza).

## U2 — job select: „?" zamiast nazwy ekwipunku

Objaw (detektor Żywego Testera, każda partia green/red):
`[ROZGRYWKA] • ? zostaje załączony do Hero (bestow)`.

Root cause: kontrakt zdarzenia `object_attached` w silniku to
`{ objectId, cardId, hostId, hostCardId, via }` (`emitAttached`,
attachments.js), ale efekt `job_select` w effects.js emitował
`{ attachmentId, attachmentCardId }`. Czytelnik logu bierze `e.cardId` →
`undefined` → `nameOf(undefined)` = „?". Brak gałęzi dla `via='job_select'`
spychał opis do domyślnej — „(bestow)", co kłamało o mechanice.

Naprawa: ujednolicenie kontraktu zdarzenia u źródła + własna gałąź opisu
(„Warrior's Sword wyposaża Hero (job select)").
Test: `test/job-select-nazwa-w-logu.test.js`.
Skan całej klasy błędu (`/tmp/audyt/placeholdery.mjs`): pozostałe 164 emitery
zgodne z czytelnikiem — U2 był jedynym takim wyciekiem.

## U3 — nierozróżnialne opcje wyboru

Objaw: modal Springblooma = 4× ta sama etykieta (wybór landa w ciemno,
rezygnacja nieodróżnialna); szukanie w bibliotece = 17× „Szukanie: Forest".

Root cause (dwie warstwy): (1) brak gałęzi `resolve_springbloom` w
`commandLabel` — warianty spadały do `default` i dostawały nazwę CAŁEJ
decyzji (klasa błędu M101/B, M101/B7); (2) kilka EGZEMPLARZY tej samej karty
daje identyczną etykietę mimo poprawnej nazwy — pojedyncza etykieta nie wie
o istnieniu bliźniaka.

Naprawa: gałąź `resolve_springbloom` + **generyczne** `labelChoiceOptions()`
numerujące wyłącznie faktyczne duplikaty („(2 z 17)") na poziomie całej listy;
działa dla każdego typu wyboru. Test: `test/wybor-landa-do-poswiecenia.test.js`.

## Odpowiedź na pytania kontrolne właściciela (pełna weryfikacja)

**1. Czy gracz może rzucać czary/zdolności w każdej legalnej turze/oknie?**
TAK. `/tmp/audyt/instant.mjs`: oferta rzutu instanta obecna we wszystkich
oknach priorytetu obu tur. `/tmp/audyt/kontra.mjs` (kontrolowany: instant
w ręce + mana): **1970 okien odpowiedzi na czar bota** — gracz zawsze może
zareagować, gdy czar przeciwnika jest na stosie (CR 117.1b).
Wcześniejsze „0 okien" w partiach bez dosypanej many to brak zasobów,
nie utrata okna.

**2. Czy silnik nie przeskakuje nielegalnie faz gracza?**
Po naprawie U1 — nie. `/tmp/audyt/okna.mjs`: aktywny i nieaktywny gracz
dostają priorytet w KAŻDYM kroku poza untapem (CR 502.4). Auto-pass sesji
(`advance()`) opiera się wyłącznie na `hasMeaningfulDecision(view)`, czyli na
`legalCommands` silnika — przewija tylko okna, w których jedyną opcją jest
pass/concede/tap_for_mana/resolve_combat.
Jedyne „zatrzymanie bez rzutu" to cleanup własnej tury przy ręce >7 kart,
gdzie blokuje wybór odrzucenia — zgodne z CR 514.1.

**3. Czy panel Rozgrywka pokazuje wszystko, co powinien?**
TAK. `/tmp/audyt/eventy.mjs`: 164 typy zdarzeń silnika, **0 bez opisu** —
żaden surowy identyfikator nie wycieka do gracza (gałąź `default` nieosiągalna
dla realnych zdarzeń). U2 był jedynym przypadkiem pustego pola w opisie.

## U4 — duplikaty landów w panelu „Twoje działania" (zgłoszenie właściciela)

Zgłoszenie: „Jeśli mam w ręce więcej niż 1 sztukę takiego samego lądu, to nie
ma sensu wyświetlać kilka razy tego samego. Zamiast 4 razy »Zagraj Forest«
wystarczy np. »Zagraj Forest (1 z 4)«."

Root cause: `buildChoiceRequestEntries` grupuje warianty JEDNEJ decyzji po
`choiceRequestGroupKey`, ale `play_land` nie ma tam klucza — każdy egzemplarz
przechodzi jako osobny `{ command }` i dostaje własny przycisk.

Naprawa: `buildActionEntries(commands, session, view)` scala komendy w pełni
wymienne (`interchangeableKey`) i dokleja licznik „(1 z N)". Zakres świadomie
wąski — tylko `play_land`, gdzie zagranie nie ma żadnego parametru poza samą
kartą. Rzuty czarów zostają osobno: dwie kopie karty mogą różnić się kosztem
alternatywnym, celami czy stanem, a to realne decyzje gracza. Scalanie jest
wyłącznie prezentacją — wpis niesie prawdziwą komendę, więc klik wykonuje
normalny kontrakt silnika.

Test: `test/grupowanie-duplikatow-w-rece.test.js` (6 przypadków, w tym
„różne landy zostają osobno" i „pojedynczy ląd bez licznika").
Weryfikacja na realnym DOM-ie stołu: 2× Plains → jeden przycisk
„Zagraj ląd: Plains (1 z 2)", Island osobno.

## U5 — liczba przy nagłówku „Twoje działania" (zgłoszenie właściciela)

Zgłoszenie: „W informacji »TWOJE DZIAŁANIA 4« ta liczba jest bez sensu i nic
nie wnosi — skasuj ją w ogóle."

Dodatkowy argument za usunięciem: licznik pokazywał `commands.length`, czyli
liczbę SUROWYCH komend z `legalCommands`. Po scaleniu duplikatów (U4)
i pogrupowaniu wariantów jednej decyzji w modale ta liczba nie zgadzała się
nawet z liczbą widocznych przycisków (np. „4" przy trzech przyciskach).

Naprawa: usunięty `<span class="count" id="actions-count">` z nagłówka,
zapis w `renderTableView` i referencja `actionsCount` w main.js; atrapy DOM
w czterech testach zaktualizowane. Klasa CSS `.count` zostaje — używają jej
panele „Rozumowanie bota" i „Przebieg tur".

Licznik na przycisku FAB (`actions-fab-count`) zostaje nietknięty: to inna
funkcja — sygnalizuje liczbę oczekujących decyzji, gdy panel jest ZWINIĘTY.

## U6 — mgła wojny dla zakrytych stworów (morph), zgłoszenie właściciela

Zgłoszenie (2026-08-16): „Logika FoW morph przeciwnika jest do bani" — panel
pokazywał `morph wchodzi na bitwisko`, a linijkę niżej
`Woolly Loxodon zostaje rozstrzygnięty`. Rozszerzenia właściciela: sprawdzić
także morpha zadającego obrażenia w walce oraz morpha jako **cel czarów
i efektów**.

Reguła docelowa (doprecyzowana przez właściciela): **zawsze gdy zakryty stwór
żyje, musi być „morphem"**. Ujawnienie tożsamości po jego śmierci jest
poprawne i nie wymaga łatania (CR 708.4).

### Objaw i root cause

Zdarzenie `spell_resolved` dla permanentu nie niosło informacji o tym, że
rozstrzygany permanent jest zakryty, a gałąź `case 'spell_resolved'`
w `src/table/session.js` wołała goły `nameOf(e.cardId)`. Maskowanie
w `nameOfObject` (CR 708.2) było więc omijane — wyciekała pełna nazwa karty
tuż pod poprawnie zamaskowaną linią o wejściu na bitwisko.

Uwaga o kontrakcie: `spell_resolved` niesie `controllerId` (nie `playerId`).

### Naprawa (u root cause, nie w opisie pojedynczej linii)

1. `src/engine/spells.js` — `resolvePermanentSpell` dokłada do zdarzenia
   `faceDown: Boolean(permanent.faceDown)`, tak samo jak `permanent_cast`
   w `resources.js`. Silnik przestaje gubić tę informację.
2. `src/table/session.js` — `case 'spell_resolved'` maskuje zakryty permanent
   przeciwnika na `morph`, a własny nazywa (CR 708.6 — kontroler zna swoją
   kartę), analogicznie do istniejącej gałęzi `permanent_cast`.

### Audyt szerokiego zakresu (walka + morph jako cel)

Przebadane 13 typów zdarzeń z ŻYWYM zakrytym stworem przeciwnika (źródło
obrażeń, cel obrażeń, prewencja, deklaracja ataku, deklaracja bloków, aura,
ekwipunek, tarcza prewencji, liczniki, zakaz blokowania, koniec animacji):
**0 przecieków** — `nameOfObject` maskuje konsekwentnie, dopóki obiekt żyje
w `state.objects`.

Zweryfikowano też warstwę silnika: `playerView(HUMAN)` zwraca dla zakrytego
stwora przeciwnika `cardId: null` (nazwa nie opuszcza serwera), a dla
własnego morpha zachowuje `cardId` — czyli maskowanie jest realne, nie tylko
kosmetyczne w logu. `src/table/render.js` (~:1669-1723) zeruje detale karty
dla `faceDown` i pokazuje badge `morph` / `zakryty (morph)`.

Ścieżka fallbacku LKI w `objectOrLki` (`session.js:270`) używa surowego
`cardId` dopiero wtedy, gdy obiekt zniknął ze stanu — czyli po śmierci lub
zmianie strefy. Zgodnie z decyzją właściciela i CR 708.4 to ujawnienie jest
**poprawne** i celowo zostaje.

### Testy

- `test/fow-morph-rozstrzygniecie.test.js` (4) — pierwotny przeciek
  RED→GREEN, własny morph nadal nazwany, zwykły czar nadal nazwany.
- `test/fow-morph-walka-i-cele.test.js` (14) — widok silnika (`playerView`),
  walka (atak, blok), 8 wariantów „morph jako cel efektu", oraz trzy testy
  anty-over-maskingu: śmierć ujawnia (CR 708.4), `turned_face_up` ujawnia
  (CR 707.9), własny morph rozpoznawalny (CR 708.6).

## U7 — kafel aury/ekwipunku na stole nie mówi, kogo wzmacnia

Znalezione podczas weryfikacji zaległego T4′ (który okazał się fałszywym
tropem — badge gospodarza `wyposażona: Warrior's Sword` działa poprawnie).

**Objaw:** na bitwisku leży `Warrior's Sword` przypięty do `Ainok Tracker`.
Kafel GOSPODARZA pokazuje `wyposażona: Warrior's Sword`, ale kafel samego
MIECZA nie pokazuje niczego. Przy dwóch stworach i dwóch ekwipunkach gracz nie
odczyta powiązań bez klikania w każdą kartę z osobna.

**Root cause:** `buildFace` (`render.js`) MA gałąź `wyposaża → <gospodarz>` /
`aura → <gospodarz>`, ale pod warunkiem `!skipLiveState`. Kafle stołu
(`tile()` :1885 oraz `renderCardInto` :1955) wołają `buildCardVisual` ze
`skipLiveState: true`, bo żywy stan należy do nakładki — więc ta gałąź na
stole nigdy się nie wykonywała. `buildStateOverlay` świadomie jej nie
dublował, opierając się na komentarzu „przypięcie pokazuje buildFace", który
dla kafli stołu był **nieprawdziwy**. Informacja znikała z obu ścieżek naraz.

**Naprawa:** `buildStateOverlay` dokłada badge `att` z nazwą gospodarza.
Nazwa idzie przez `cardInfo.hostName`, czyli `session.nameOfObject`, więc
zakryty gospodarz pozostaje „morphem" (CR 708.2 — spójne z U6).

**Testy:** `test/kafel-zalacznika-gospodarz.test.js` (5): ekwipunek nazywa
gospodarza, aura nazywa gospodarza, badge gospodarza bez regresji, zakryty
gospodarz zamaskowany, luźny ekwipunek bez badge. Pakiet **1824/1824**.
