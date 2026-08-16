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
