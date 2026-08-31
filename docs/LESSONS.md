# Lekcje projektowe (trwały rejestr)

Powtarzalne wnioski z pracy nad projektem — to, co kolejna sesja ma wiedzieć,
zanim popełni ten sam błąd.

| Dokument | Zakres | Trwałość |
|---|---|---|
| `docs/setup/HANDOFF_*.md` | stan JEDNEJ sesji | jednorazowy |
| `docs/plans/PLAN_*.md` | roadmapa JEDNEGO zadania | jednorazowy |
| `docs/PROJECT_HISTORY.md` | dziennik sesji | żywy, **NIE** jest lekturą startową |
| `docs/decisions/*.md` (ADR) | wiążąca decyzja architektoniczna | trwała, formalna |
| **`docs/LESSONS.md`** | **wniosek / heurystyka diagnostyczna** | **trwała, nieformalna** |

Lekcja idzie tu, gdy jest powtarzalna, ale NIE jest decyzją architektoniczną
(te → ADR). Wymusza zmianę sposobu pracy? Dopisz ją też do `AGENTS.md`.
Ustala granicę komponentów? ADR + tu odsyłacz. Lekcji nie kasujemy:
nieaktualną oznaczamy z odsyłaczem do nowszej.

**Wzorzec wpisu (obowiązkowy, bez ozdobników):**

```
## LN (YYYY-MM-DD) — reguła w jednym zdaniu

**Objaw:** co było widać — z konkretem (karta, test, komunikat).
**Przyczyna:** gdzie w kodzie lub umowie leży wina.
**Reguła:** 1–4 punkty, imperatyw.
**Strażnik:** `plik/funkcja` — co czerwienieje po cofnięciu naprawy.
```

Wpis niesie FAKTY (nazwy plików, testów, kart, numery CR) i regułę — nie
narrację. L15–L19 są datowane po numerze kamienia milowego (M102/M103 =
2026-08-16 wg `PROJECT_HISTORY.md`): oryginalne daty zaginęły przy migracji
M208.

---

## L103 (2026-08-31) — Skrót „na 1v1" w modelu karty zmienia REGUŁY: brak słowa „target" w Oracle ⇒ brak `targets`, zakres należy do efektu

**Objaw (zgłoszenie właściciela M266/B):** log pisał „Nieprzyjaciel rzuca
Liliana's Triumph → cel: Ty", a Oracle brzmi „Each opponent sacrifices
a creature of their choice" — bez słowa „target".

**Przyczyna:** M203/2 zamodelował „każdy przeciwnik" jako
`targets: [{ type: 'player', opponent: true }]`. W 1v1 wskazuje to zawsze
tę samą osobę, więc wyglądało na równoważne — ale równoważne NIE JEST.
Czar bez celów (CR 115.1) i czar z celem różnią się obserwowalnie:
z celem daje się zepsuć usunięciem celu, fizzluje przy hexproof/shroud
gracza (CR 115.6) i pokazuje w UI wybór, którego karta nie oferuje.
Skrót przeszedł, bo w 1v1 różnica ujawnia się dopiero przy hexproof.

**Reguła:**
1. `targets` w definicji karty deklaruje wyłącznie to, co Oracle nazywa
   słowem „target". „Each opponent", „each player", „defending player"
   to ZAKRES efektu — modeluj polem efektu (`scope: 'each_opponent'`),
   wzorzec: `discard_each_opponent`.
2. Gałąź efektu ma obsłużyć oba warianty, gdy istnieje karta-bliźniak
   z celem (tu Grave Exchange: „TARGET player sacrifices…") — jedna gałąź,
   dwie ścieżki, zero specjalnych przypadków po nazwie karty (ADR 0002).
3. „W 1v1 wychodzi na to samo" nie jest argumentem: różnicę widać przez
   hexproof, kontrę usuwającą cel i przez UI. Model ma być zgodny
   z Oracle, nie z liczbą graczy przy stole.
4. Strażnik jest KLASOWY: enumeruje katalog i sprawdza implikację
   „brak słowa target w Oracle ⇒ brak `targets`" (spell + activated +
   triggered). Pin na jedną kartę uśpiłby klasę — bliźniaki (np. Dreams
   of Steel and Oil, poprawne, bo ma „Target opponent") wyglądają
   identycznie w kodzie i różnią się TYLKO Oracle.

**Strażnik:** `test/m266-zgloszenia-wlasciciela.test.js`, test „M266/B
(klasa): żadna karta nie ma `targets` bez słowa target w Oracle" (skan
katalogu, dziś 0 naruszeń). Mutacja: przywrócenie `targets` Liliana's
Triumph → 4 testy RED (w tym klasowy).

## L102 (2026-08-31) — Rodzina ofert dzieli WYCENĘ i WIDOK: nowy członek bez pinu odziedziczy stary błąd; skutek niewidoczny w odcisku to fałszywy no-op

**Objaw (Żywy Tester M265, dwa detektory, dwie partie):**
1. `theros` vs `worek-basni` seed 332 — bot rzucił Sleep of the Dead (tap
   + „doesn't untap") we WŁASNEGO Blade-Blizzard Kitsune, który miał
   atakować, płacąc za to {1}.
2. `worek-mroczny` vs `alara` seed 331 — sonda zgłosiła „oferta bez skutku"
   dla drugiej aktywacji Soulbright Flamekin, choć ta realnie przybliżała
   trzecią rezolucję („add {R}×8").

**Przyczyna (jedna klasa, dwie manifestacje):**
1. Rodzina „darmowych rzutów" (suspend / rebound / madness / grave-free-cast)
   enumeruje ofertę PER ZESTAW CELÓW. M212/Z7 dołożył `freeCastTargetPenalty`
   trzem członkom; czwarty (`resolve_grave_free_cast`, Halo Forager) został
   bez kary i bez pinu — wszystkie cele remisowały, bot brał pierwszy
   z brzegu. Do tego wpis GROBU w `playerView` nie niósł `spell` (M212/Z7
   naprawił to tylko dla WYGNANIA), więc nawet z karą wycena czytałaby pustkę.
2. `abilityResolvedThisTurn` (postęp `onNthResolve`) nie był w
   `stateFingerprint`, więc sonda nie widziała skutku, a dwa różne stany
   miały identyczny odcisk (ADR 0005).

**Reguła:**
1. Naprawiając wycenę/widok dla JEDNEJ komendy, wypisz całą jej rodzinę
   (komendy o tej samej strukturze oferty) i zamknij wszystkie naraz —
   albo dopisz strażnika, który wymienia rodzinę z nazwy. Grep po nazwie
   funkcji-kary (`freeCastTargetPenalty`) daje listę w sekundę.
2. Deskryptor potrzebny wycenie musi być w widoku KAŻDEJ strefy jawnej,
   z której da się zagrać (grób CR 400.2, wygnanie CR 406.3, nie tylko ta,
   którą akurat zgłoszono).
3. Każde pole stanu, które zmienia PRZYSZŁE możliwości (liczniki postępu,
   „n-ty raz w tej turze", gotowości rzutu), należy do odcisku. Test:
   czy da się zbudować dwa stany różniące się tylko tym polem i mające
   ten sam fingerprint? Jeśli tak — sonda no-op jest na nie ślepa.
4. Zgłoszenie sondy „bez skutku" weryfikuj najpierw wobec ODCISKU, dopiero
   potem wobec reguł: fałszywy alarm zwykle oznacza brak pola w odcisku,
   czyli prawdziwy błąd o warstwę niżej.

**Strażnicy:** `test/m265-grave-free-cast-target.test.js` (4 testy),
`test/m265-nth-resolve-fingerprint.test.js` (3 testy). Mutacje: usunięcie
`freeCastTargetPenalty` z `resolve_grave_free_cast` → testy celu; usunięcie
`spell` z wpisu grobu (`game-state.js`) → te same testy; usunięcie
`abilityResolvedThisTurn` z `fingerprint.js` → testy odcisku i sondy.

## L101 (2026-08-31) — Jawna lista pól WIDOKU to trzecia kopia tej samej listy; pin na jedną kartę nie chroni klasy, strażnik enumeruje katalog

**Objaw (Żywy Tester M265, worek-legend vs tarkir-wur seed 323):** panel
akcji pokazał „Rzuć za warp: Weftblade Enhancer (koszt ?)". Enumeracja
katalogu wykazała cztery gubione deskryptory kosztu: `warp`
(Weftblade Enhancer), `surge` (Jwar Isle Avenger), `kicker`
(Kor Sanctifiers, „koszt {2}{W} + kicker " — pusta dopłata),
`treasureAltCost` (Security Rhox — etykieta identyczna ze zwykłym rzutem,
dwa nierozróżnialne przyciski o różnym skutku).

**Przyczyna:** ta sama klasa co L93/L21/M151, ale w TRZECIEJ kopii listy pól
— po `gameObjectDataOf` (generator) i `installDeck` (transport) jest jeszcze
wpis strefy w `playerView` (`zone === 'hand'`, `zone === 'exile'`). M151
dopisał tam `suspend` i zamknął temat jednym testem na jedną kartę; cztery
pozostałe pola dojechały do katalogu później i nikt ich nie zauważył, bo
silnik liczył ofertę poprawnie — kłamała tylko etykieta.

**Reguła:**
1. Koszt alternatywny (warp, surge, kicker, bestow, plot, suspend, morph,
   adventure, alt-cost) to publiczny Oracle (CR 601.2b) — MUSI dotrzeć do
   widoku w KAŻDEJ strefie, z której da się go zapłacić (ręka ORAZ exile:
   `warpReady`, `suspendReady`, `madnessReady`, `reboundReady`).
2. Strażnik takiej listy jest KLASOWY: enumeruje `REGISTRY.all()`, buduje
   obiekt przez realną ścieżkę i porównuje pola wejścia z polami wpisu
   widoku. Pin na konkretną kartę zamyka jeden przypadek i usypia klasę.
3. Dwa różne koszty tej samej karty = dwie różne etykiety. Identyczny tekst
   przy różnym skutku to błąd panelu (klasa M101/B), nawet gdy silnik działa.
4. „Silnik liczy dobrze" nie zamyka zgłoszenia: `legalCommands` czyta
   z OBIEKTU, `commandLabel` z WIDOKU — to dwa różne źródła.

**Strażnik:** `test/m265-hand-view-alt-cost-descriptors.test.js` (6 testów,
pierwszy enumeruje katalog). Mutacje: usunięcie `warp`/`surge`/`kicker`/
`treasureAltCost` z wpisu ręki (`game-state.js`) → test 1 + testy etykiet;
usunięcie `warp` z wpisu exile → test rzutu z wygnania; usunięcie gałęzi
`cmd.treasureAlt` (`render.js`) → test Security Rhox.

## L100 (2026-08-31) — Ten sam koszt renderowany w dwóch warstwach: zdarzenie musi nieść WSZYSTKIE składniki ceny, inaczej log kłamie obok poprawnego przycisku

**Objaw (Żywy Tester M265, worek-basni vs final-fantasy seed 303):** modal
„Rozgrywka" pisał „Zoraline, Cosmos Caller — zapłacić {2} i 2 życia?",
a przycisk decyzji tuż pod nim „Zapłać {W}{B} + 2 życia — efekt odpali".
Koszt Oracle to {W}{B}; „{2}" to cena, której w grze nie ma (za dwie many
bezbarwne nie da się zapłacić dwóch pipów kolorowych).

**Przyczyna:** dwie warstwy prezentacji czytają z DWÓCH różnych źródeł.
Przycisk bierze koszt z `playerView` (`costColors` z `trigger.payColors` —
`game-state.js:5726`), a opis zdarzenia z samego zdarzenia
`optional_pay_required`, które niosło tylko `payMana`/`payLife`. Nikt nie
zauważył, bo obie warstwy „działały", tylko mówiły co innego.

**Reguła:**
1. Zdarzenie opisujące DECYZJĘ o koszcie musi nieść komplet składników ceny
   (kwota + pipy kolorów + życie + poświęcenia) — tyle, ile potrzeba, żeby
   opis dało się złożyć bez sięgania do stanu. Bramka: czy `describeGameEvent`
   umie odtworzyć dokładnie tę samą cenę co komenda w `legalCommands`?
2. Naprawa idzie do EMITERA zdarzenia (`triggers.js`), nie do renderera —
   renderer bez danych i tak nie ma czego pokazać.
3. Do każdej takiej pary warstw pisz test SPÓJNOŚCI (`payColors` zdarzenia
   `deepEqual` `costColors` komendy), nie tylko test tekstu — sam tekst
   zielenieje po zahardkodowaniu jednej karty.
4. Grep rodzeństwa: `pay_or_sacrifice_required`, `counter_pay_required`,
   `ward_choice_required` renderują koszt jako gołe `{N}` — dziś to prawda
   (koszty generyczne), ale pierwsza karta z kolorowym pipem w tych
   mechanikach powtórzy błąd.

**Strażnik:** `test/m265-optional-pay-colored-cost.test.js` (5 testów).
Mutacje: usunięcie `payColors` ze zdarzenia (`triggers.js`) → testy 1, 2, 5;
uproszczenie opisu do `{${e.payMana}}` (`session.js`) → testy 2, 3.

## L99 (2026-08-31) — Fix wdrożony w dwóch warstwach potrzebuje pinu w OBU; test warstwy tekstu nie chroni warstwy obrazu

**Objaw (audyt PR #90, mutacja M8):** M264 zamknął wyciek nazwy zakrytej
karty przy `trigger_resolved` w DWÓCH miejscach `src/table/session.js` —
w opisie tekstowym (`objectOrLki`) i w bramce SKANU karty (`hiddenLive`
w `noteBotMove`). Test powstał tylko dla tekstu. Usunięcie `e.sourceId`
z bramki skanu przechodziło cały `test/fow-facedown-names.test.js`
(17/17 zielone), a w modalu obok poprawnego „Morph — trigger się
rozstrzyga" pojawiała się MINIATURA realnej karty przeciwnika (CR 708.2).

**Przyczyna:** ta sama informacja ukryta wycieka dwiema powierzchniami
(nazwa i obraz), a plik testowy nazwany po zgłoszeniu („nazwy face-down")
sugerował pełne pokrycie tematu. Recydywa klasy L41/L70.

**Reguła:**
1. Kiedy jedna naprawa dotyka N miejsc w kodzie, policz je jawnie w opisie
   commita i dopisz N pinów — „ten sam plik" nie znaczy „ta sama warstwa".
2. Dla FoW pytaj osobno o KAŻDĄ powierzchnię: tekst, skan/miniatura,
   `playerView`, etykieta komendy, tytuł modala.
3. Weryfikacja mutacyjna audytu ma celować w każdy człon warunku z osobna
   (`[e.objectId, e.object?.id, e.sourceId]` → trzy mutacje, nie jedna).

**Strażnik:** `test/fow-facedown-names.test.js`, test
„M265: trigger_resolved od zakrytego źródła bota — modal bez SKANU karty".
Mutacja: `hiddenLive` bez `e.sourceId` → RED.

## L98 (2026-08-31) — Buforowane „dopisywanie" zamyka paczkę na granicy domenowej; promocję zatrzymanej połowy robią punkty WZNOWIENIA, nie wspólna pętla gry

**Objaw (M261, zgłoszenie właściciela):** modal „Rozgrywka" doklejał
„Tura N — Ty" + „Dobierasz…" do ogona tury bota (rozstrzygnięty Divest,
discardy z cleanup, obrażenia z walki) w jednym oknie — bufor ruchów
narastał między pauzami bez świadomości, że przekroczył granicę tury.

**Przyczyna:** bufor czyszczony był tylko przy POKAZANIU; wszystko, co
nastąpiło między pauzami, lądowało w jednej paczce bez względu na to,
czy zaczęła się nowa tura. Render rysuje JEDNĄ paczkę na raz, więc
„naprawa w renderze" nie istnieje — granica musi być widoczna w buforze.

**Reguła:**
1. „Dopisywanie" w buforze UI zatrzymuje się na granicy, którą użytkownik
   ma prawo zobaczyć jako OSOBNĄ paczkę (tu: tura). Sygnał podziału
   niesie samo zdarzenie graniczne (`turn_started` przy niepustym
   buforze → routing do `held`), nie heurystyka po treści.
2. Promocję held → bufor wykonują TYLKO punkty wznowienia (klik
   „Rozumiem", `continueBotPlay`/`continueArtPlay`/`recheckAutoPass`).
   Wspólna pętla gry wołana także z `apply` NIE promuje — bufor zdążył
   zebrać ogon, który ma być pokazany osobno, więc promocja w środku
   skleiłaby paczki z powrotem (konkretny błąd z pierwszej wersji).
3. Granica wymusza pauzę w KAŻDYM miejscu powstania bufora
   (`streamAutoEvents` i `apply` — inaczej ogon wisi niepokazany do
   najbliższej „naturalnej" pauzy) i sygnał konsumuje się raz, żeby nie
   wyciekał do kolejnej komendy.
4. Cały mechanizm gate'uje się na fladze trybu pauz — konsumenci
   synchroniczni (testy silnika, benchmark) mają dostać STARE
   zachowanie, held nie może się urodzić bez pauz.
5. Test wariantów patrzy na BLOKI, nie na przebieg: co najwyżej jeden
   nagłówek tury na blok i nagłówek zawsze pierwszą linią, na wielu
   seedach — RED złapał „Divest zostaje rozstrzygnięty | Tura 3 — Ty".

**Strażnik:** `test/m261-granica-tury-w-modalu.test.js` (3 testy, 8
seedów) + `test/session-bot-pausa.test.js` (legalny powód pauzy:
`botPauseAtTurnBoundary`, ogon tury bez zdarzeń „istotnych").

## L97 (2026-08-31) — Warstwa prezentacji potrafi skłamać przy w 100% poprawnym silniku; decyzja „you may look” nie może wyciekać treści przed wyborem

**Objaw (M260, uwagi właściciela z PR #89):** trzy zgłoszenia do Fertile
Thicket, przy których SILNIK był bezbłędny (skip/`chosenCardId:null`/
`bottomOrder` — pełny Oracle, walidacja permutacji działała). Cała wina
leżała w UI: (1) etykieta opcji „bez landa” miała fallback
`'basic land na wierzch biblioteki'` („co to za opcja???”), (2) etykieta
skip opisywaliśmy „Odłóż wszystko na spód” — czyli opcję INNĄ, (3) brak
kroku „zaglądnij?” — opcje z nazwami Mountain/Island zdradzały karty,
zanim gracz zdecydował, CZY patrzy, więc „you may look” było pozorne,
a sortera kolejności spodu nie było w ogóle.

**Przyczyna:** `commandLabel` liczy etykietę z SAMEJ komendy i nie wie,
czym komenda jest w kontekście decyzji; etykiety powstawały „na oko”
bez testu. Dodatkowo licznik `basicLandCount` w wydarzeniu startowym
trafiał do WSPÓLNEGO logu — prywatna wiedza z „look” (ile basic landów
na wierzchu) wyciekała przeciwnikowi.

**Reguła:**
1. Etykieta opcji opisuje skutek WŁASNEJ komendy — fallback tekstowy
   („basic land…” zamiast nazwy z `nameOfObject`) to bug, nie ozdoba.
2. Decyzja z wiedzą prywatną (look/scry-like) wymaga testu UI, że PRZED
   decyzją nie pojawia się ŻADNA nazwa karty — w etykietach opcji,
   podglądach i logu. Rezygnacja z „you may look” musi być możliwa
   „na ślepo”.
3. Log to też warstwa prezentacji: prywatne dane zdarzenia
   (`basicLandCount`) nie idą do wspólnego opisu; jawne jest tylko to,
   co Oracle nazywa reveal (tu: wybrany basic land).
4. Poprawny silnik + brak asercji na etykiety = nierozpoznawalna
   regresja UX. `commandLabel` i wizardy mają własne testy jak każdy
   inny kontrakt.

**Strażnik:** `test/m260-uwagi-wlasciciela.test.js` (13 testów: silnik,
widok FoW, wizard 3-krokowy, etykiety, log, Pyxis CR 406.3, scenariusz
pustej biblioteki). Czerwienieją po cofnięciu każdej z czterech napraw.

---

## L96 (2026-08-30) — Snapshotty Scryfall w repo = darmowy masowy audyt danych kart; audytuj po registry.all(), nie po nazwie eksportu

**Objaw (M259, brązowa odznaka):** 7 błędów vs zasady w katalogu kart
(Instant zamiast Sorcery ×2, MV bez symboli phyrexian, złe subtypy ×2,
koszt craft/echo bez pipów kolorowych) — po ~15 audytach PR i wielu
bug-huntach. Wszystkie wykryte w ~30 minut MASOWYM porównaniem kart ze
snapshotami `docs/cards/scryfall-*.json` (pola mechaniczne: CMC, P/T,
typy, podtypy, kolory) + czytaniem zrzutu Oracle-vs-deskryptory — a nie
czytaniem definicji jedna po drugiej.

**Pułapki wykryte po drodze:**
1. **~275 realnych kart żyje poza `REAL_CARDS`** (historycznie
   dołożone do `VIRTUAL_BASIC_LANDS`) — audyt po eksporcie tablicy
   omijał je w całości (wśród nich druga karta phyrexian!). Prawda
   jest `createCardRegistry().all()`.
2. Rozbieżności typów przy `//` (MDFC/DFC) to fałszywe alarmy — model
   dwutwarzowy jest jawny; filtruj przed raportowaniem.
3. Fałszywe poczucie bezpieczeństwa dają testy asercji danych: tablice
   „oczekiwanych wartości" (batch11: `['porcelain-legionnaire', 3, 1, 2]`)
   zamrażają BŁĘDNE dane razem z poprawnymi — strażnik musi liczyć
   oczekiwaną wartość ze ŹRÓDŁA prawdy (MANA_COSTS), nie z ręki.

**Reguła:** przy jakimkolwiek przeglądzie kart — najpierw automatyczne
diffowanie pól ze snapshotami (one już są w repo dla 155+ kart), potem
czytanie semantyczne tylko miejsc z rozbiejnością lub z mechaniką;
zawsze po całym rejestru. A gdy konwencja deskryptora się zmienia
(tu: manaCost = pełne MV), strażnik zgodności z MANA_COSTS musi znać
NOWĄ konwencję i zapaść razem z nią (aktualizacja testu-strażnika to
część fixu, nie opcja).

## L95 (2026-08-30) — Nowa decyzja blokująca to NIE handler: checklista ~10 punktów integracji; pierwsze redy testów to brakujące REJESTRY

**Objaw (M258/F3 — ward):** mechanika resolve_ward_pay_choice działała
regułowo po napisaniu handlera w game-state.js — a testy W2 padały na
`invalid_command` (COMMAND_TYPES), potem na wyjątek w event() (EVENT_TYPES).
Kolejne pominięcia czekały dalej: 6 list-strażników priorytetu (4274/5227/
6118/6303/6420/6429 — pominięcie = nadpisanie priorytetu i zakleszczenie),
klasyfikator poleceń OBU botów (heuristic + aggro), PAYMENT_DECISION_TYPES
kreatora many, describeGameEvent, 3 mapy etykiet render.js + opis komendy.

**Reguła:** „dodaję decyzję blokującą" = checklista: (1) stan pendingX
w createGameState, (2) detektor decyzji blokujących, (3) bramka
execute (z manaGeneratingCommandFor), (4) WSZYSTKIE strażniki priorytetu
— grep po istniejącej decyzji-rodzeństwie (np. pendingCounterPay) i
dopisz wszędzie tam, gdzie jest ono, (5) EVENT_TYPES + COMMAND_TYPES
w protocol/types.js (walidacja rzuca zanim kontroler dojdzie do
handlera!), (6) oferta legalCommands, (7) klasyfikator + wycena obu
botów, (8) PAYMENT_DECISION_TYPES w mana-wizard, (9) describeGameEvent,
(10) etykiety render. Test E2E przez execute() (nie przez helpery)
łapie 1–2 natychmiast; greppowalne rodzeństwo łapie resztę.

## L94 (2026-08-30) — Fabryka z destrukturyzacją configu gubi nieznane pola PO CICHU; kontrakt pinuje się testem przez REALNĄ fabrykę

**Objaw (CR hunting M258, Etap 2.3):** `create_copy_token` (effects.js)
od lat przekazywał `manaCost: src.manaCost ?? 0` do `createBattlefieldToken`
— a destrukturyzacja w tokens.js tego pola nie znała, więc KAŻDY
token-kopia wchodził z MV 0. Nie było błędu, ostrzeżenia ani testu: piny
kopiowania (M90/CR 707.8a, M141/B) sprawdzały transformTo/station/saga,
a manaCost nigdy. Do tego `enterAsCopy` kosztu nie kopiował wcale (CR 707.2
— koszt many jest wartością kopiowalną). Ujawnione dopiero pytaniem o CR
202.3b (MV kopii tylnej twarzy DFC) zadawanym do WSZYSTKICH ścieżek rodziny.

**Reguła:** jawna destrukturyzacja `{ pole = domyślne }` w fabryce to
jawna LISTA DOZWOLONYCH PÓL — każde nowe pole od nadawcy ginie bez śladu
(recydywa klasy L93/L21/M146, tym razem w fabryce tokenów zamiast
materializacji talii). Przy dodawaniu pola do configu fabryki: (1) grep
WSZYSTKICH nadawców, (2) pin w teście, który przechodzi przez REALNĄ
fabrykę, nie przez własny helper zbudowany na createGameObject. Test
anty-over-fix (kopia PRZODU zachowuje koszt) jest tu obowiązkowy — sam fix
„tył → 0" przeszedłby zielono także z fabryką ignorującą pole.

## L93 (2026-08-30) — Jawna lista pól w warstwie transportowej musi pokrywać generator; test helperem OMUIJA tę warstwę

**Objaw (Żywy Tester M258, srodziemie vs mirrodin-wu seed 3004):** Crawling
Chorus (toxic 1) bił gracz trzy razy bez ani jednego znaku trucizny, a
kafel pokazywał „Toksyczny”. Obiekt z materializacji talii miał
`toxic=null` — karta definiuje `toxic: 1`, `gameObjectDataOf` je przenosi,
ale `installDeck` (src/engine/deck.js) kładzie na obiekcie JAWNĄ listę pól
i toxic (plus echo, madness, surge, warp) na niej nie było. Recydywa klasy
M146/L21 w tej samej funkcji — renown wcześniej dodano, pięć innych pól nie.

**Przyczyna podwójna:**
1. Transport danych przez JAWNĄ listę pól (dwie listy do utrzymania:
   generator `gameObjectDataOf` i kopia `installDeck`) — każde nowe pole
   mechaniki trzeba dopisać w DWÓCH miejscach, a w drugim ginie po cichu.
2. Testy jednostkowe (helper `putCard` + `...gameObjectDataOf(def)`)
   OMUIJAŁY `installDeck` — wszystkie piny mechanik były zielone, mechaniki
   martwe w każdej partii z talią.

**Reguła:**
1. Nowe pole mechaniki na `defineCard` → dopisz w `gameObjectDataOf`
   ORAZ na liście `installDeck` (grep „M146" w deck.js). Lepszy kierunek
   długoterminowy: transportować deskryptory zbiorczo (spread listy pól
   mechanik), żeby lista była JEDNA.
2. Piny mechanik krytycznych dla partii z talią idą przez
   `setupCardMatch` (prawdziwa ścieżka: registry → createCardDeck →
   installDeck → obiekt), nie przez `putCard` — wzorzec
   `test/m258-zywy-tester-deskryptory.test.js` (D1–D3).
3. Pełne partie botów (np. `real-cards-batch3`) łapią zakleszczenia
   decyzji, których unit nie widzi — po każdej zmianie warstwy decyzji
   odpal choć jeden test pełnej partii.

---

## L92 (2026-08-30) — Liczby „bieżącego stanu" aktualizuje się na KONIEC sesji; odświeżenie w środku PR gwarantuje dryf

**Objaw (audyt PR #88, M258/A3):** README mówił „3735/3735 testów, 2894.7 kB"
— to stan sprzed 8 etapów TEGO SAMEGO PR-a (naprawa D1 z audytu PR #87 weszła
w etapie 1, potem etapy 3–10 dołożyły 76 testów i 39 kB). Recydywa D1 w
kwartał, tym razem w obrębie jednej sesji.
**Przyczyna:** „Bieżący stan" zaktualizowano w środku sesji (przy okazji
innego zadania), a każdy kolejny zielony commit z definicji go dezaktualizuje.
Kolejne etapy miały własne bramki (testy/build), ale żadna bramka nie patrzy
na README — dokumentacja nie czerwienieje.
**Reguła:**
1. Sekcje „Bieżący stan" (liczby testów, rozmiar artefaktu, liczba kart)
   odświeżasz w DOMYKANIU sesji — po ostatnim commicie funkcjonalnym, razem
   z handoffem i opisem PR (checklista końca: ENVIRONMENT §7).
2. Przy odświeżaniu liczby ZMIERZAJ (npm run test:all, npm run build) — nie
   przepisuj z ostatniego logu etapu, bo on też może być wczorajszy (L56:
   twierdzenie o danych sprawdzone poleceniem).
3. Sygnał: PR, którego opis/README podaje liczbę testów, a diff ma >1 etap
   funkcjonalny po wpisie „stan" — liczba jest podejrzana z definicji.
**Strażnik:** `test/dokumentacja-budzet-lektury.test.js` pilnuje budżetu
lektury, NIE zgodności liczb — egzekwowanie reguły 1 pozostaje procesowe
(domknięcie sesji wg ENVIRONMENT §7).

## L83 (2026-08-28) — Strażnik skanujący ŹRÓDŁO czyta KONSTRUKTY, nie tekst: komentarz to nie pokrycie

**Objaw:** `test/fingerprint-pending-decisions.test.js` (strażnik klasy L16,
domykający pięć decyzji blokujących poza odciskiem stanu — N1 z PR #86) liczył
pokrycie jako każde wystąpienie `pending*` w surowym pliku
`src/engine/fingerprint.js`. Mutacja: `state.pendingZzz` w kodzie + wzmianka
`pendingZzz` wyłącznie w komentarzu → strażnik zielony (2/2). Nowa decyzja
znów wyciekłaby z fingerprintu.
**Przyczyna:** regex po pliku nie odróżnia kodu od komentarza, a komentarz obok
listy to pierwsze miejsce, gdzie autor opisuje nową decyzję. To L31 (strażnik
pilnował danych, błąd był w kodzie) i L56 (zwolnienie po słowie kluczowym
jest dziurą) przeniesione na skan źródła: kontrola mierzyła TEKST, nie regułę.
**Reguła:**
1. Strażnik wydobywa fakty z KONSTRUKTÓW (literał tablicy, odczyt
   `state.pole`), a komentarze usuwa PRZED skanem (`stripComments`). Wzmianka
   pola nie jest pokryciem z definicji.
2. Pin na strażniku ma DWIE nogi (L67): (a) kompozycja nie liczy
   zakomentowanego odczytu; (b) ścieżka produkcyjna idzie przez tę kompozycję.
   Bez (b) obejście funkcji zostawia pin zielony — złapała to dopiero trzecia
   mutacja.
3. Sygnał: strażnik „udowadniający" własność regexem po całym pliku. Pytanie
   kontrolne: czy da się przejść tę kontrolę bez zmiany kodu? Jeśli tak —
   mierzy tekst.
**Strażnik:** `test/fingerprint-pending-decisions.test.js` (`stripComments` +
`coveredFieldsFromFingerprintFile` + pin A1 o dwóch nogach); raport
`docs/audits/AUDYT_PR86_2026-08-28.md`.
**Powtórka w tej samej sesji:** własny `test/repo-artefakty-audytu.test.js`
sprawdzał `.gitignore` przez `ignore.includes('tmp-audyt-*/')`, a komentarz nad
regułą cytuje ją dosłownie — usunięcie reguły zostawiało strażnik zielony
(wykryła mutacja M2, nie code review). Reguła 1 obowiązuje też wobec
strażników, które sam piszesz, i to w dniu ich powstania.

## L88 (2026-08-29) — Błąd bez adresu: narzędzie długiego biegu musi powiedzieć GDZIE (i jedna reguła = jedna funkcja dla oferty i walidacji)

**Objaw:** `node tools/benchmark.mjs --full` kończył się „Kontroler nie znalazł ruchu mimo legalnych komend" — bez meczu,
bez stanu. Drugi bieg po to samo. Po dopisaniu kontekstu do narzędzia
diagnoza zajęła 60 s: tura 15, `combat_damage`, priorytet p2, oferta
`activate_ability, concede`.
**Przyczyna:** reguła M172/C „pass nie domknie kroku obrażeń" żyła w DWÓCH
kopiach — `execute` (odrzucenie `combat_unresolved`) i budowa oferty
(`blockedByCombat`) — i obie blokowały pass KAŻDEMU graczowi, choć jedyna
alternatywa (`resolve_combat`) jest oferowana wyłącznie graczowi AKTYWNEMU.
Obrońca zostawał z samym `concede`.
**Reguła:**
1. Narzędzie liczące godzinę musi nieść ADRES błędu (mecz/seed/stan) —
   komunikat bez adresu kosztuje drugie tyle, co sam bieg.
2. Reguła oferty i walidacji to JEDNA funkcja (L41/L48: kopie się rozjeżdżają).
   Zakaz dotyczy wyłącznie gracza, który MA alternatywę.
3. Pełna runda passów w kroku obrażeń NIE domyka kroku: priorytet wraca do
   aktywnego, licznik passów zostaje domknięty — obrażenia nie zostaną
   pominięte (M172/C nienaruszone).
4. Bot bez ruchu to sygnał o OFERCIE silnika, nie o polityce bota. Świadomie
   bez ślepego fallbacku („bierz pierwszą legalną"): ukryłby lukę polityki.
**Strażnik:** `test/m255-petla-jakosci.test.js` F1–F5 (F4 = mecz
`random/final-fantasy vs aggro/alara`, seed 1001).

## L87 (2026-08-29) — Skutek, którego nie widać, zamienia się w komunikat, że go NIE BYŁO (dwie bramki: zdarzenie i bramka szumu)

**Objaw:** transkrypt `worek-mroczny vs theros` (seed 47): „Kulrath Mystic —
trigger (rzucenie czaru)" + „trigger bez efektu (nie było czego wykonać)", a
na stole w tej samej turze: „Kulrath Mystic · Czujność · +2/+0 · 4/4". Efekt
DZIAŁAŁ, tylko nikomu o tym nie powiedział. Ten sam komunikat właściciel
zgłaszał dla Altara of the Goyf (M254/E) — tam był prawdą (pompowany był
artefakt), po naprawie celu stałby się kłamstwem.
**Przyczyna:** `buff_creature_until_end_of_turn` zapisuje buff w
`state.untilEndOfTurnBuffs` i nie emituje ŻADNEGO zdarzenia, a `resolveTrigger`
czyta „0 nowych zdarzeń" jako „trigger bez efektu". Bufy MASOWE z tej rodziny
(`buff_creatures_you_control`, `buff_attacking_creatures`,
`buff_opponents_creatures`) wołają `emitMassBuff` i są widoczne — jeden członek
milczał (klasa M138/Z4 dla `set_base_pt_until_end_of_turn`).
**Reguła:**
1. Skutek bez zdarzenia = skutek niewidoczny: każdy efekt zapisujący stan
   emituje zdarzenie, po którym widać zmianę.
2. DRUGA bramka: zdarzenie musi przejść przez filtr szumu
   (`isBotMoveNoise` — reguła wyciągnięta z session.js, ADR 0011). Buffy
   `untilEndOfTurn` przepuszczamy do modala „Rozgrywka" (M99), zwykłe
   przeliczenia P/T dalej są szumem.
**Sygnał:** log mówi „brak efektu", a stan się zmienił — sprawdź emisję, nie
treść efektu.
**Strażnik:** `test/m255-petla-jakosci.test.js` A1–A4 (A3 = wyjątek
`untilEndOfTurn` w `isBotMoveNoise`, A4 = anty-over-fix).

## L86 (2026-08-28) — Warstwa prezentacyjna potrzebuje WŁASNEJ pauzy: obserwator zdarzenia nie zakłada, że gra na niego czeka

**Objaw (zgłoszenie właściciela, tryb wysoko-graficzny):** „Rzuciłem czar, a
akcja poszła dalej i zaczęła się następna tura i nieprzyjaciel rzucił czar i
pokazał się ekran z grafikami tego ostatniego czaru nieprzyjaciela, a mojego
w ogóle nie było pokazanego." Warstwa otwierała się z obserwatora `onCast`,
ale pętla `advance()` leciała dalej — w jednej komendzie potrafią przejść trzy
rzuty i następna tura.
**Przyczyna:** obserwator był „donosicielem" (wypadek przy grze), nie
„uczestnikiem" (ktoś, kogo gra pyta o zgodę). Brakowało pauzy (sesja przerywa
`advance()` po bieżącej komendzie) i kolejki (każdy rzut osobno, nie tylko
ostatni). Bez kolejki pauza zamienia „widzę ostatni" na „widzę pierwszy" —
drugi błąd tej samej klasy.
**Reguła:** UI pokazujące coś, co gracz ma ZOBACZYĆ (ilustracja, animacja,
„Ruch bota"), potrzebuje:
1. **sygnału zwrotnego** — obserwator mówi, czy warstwa naprawdę się pokazała
   (`true` = wstrzymaj), żeby karty bez ilustracji nie zatrzymywały gry;
2. **własnego stanu pauzy** — nie pożyczonego (wspólna flaga otwierałaby
   naraz modal „Ruch bota" i warstwę grafik);
3. **kolejki** — zamknięcie warstwy otwiera następny element, gra rusza przy
   pustej kolejce. Kolejkę wynieś do CZYSTEGO modułu
   (`src/table/art-showcase.js`): testowalna headless, bez DOM i sesji.
**Strażnik:** `session.artPausePending` / `continueArtPlay()`
(`src/table/session.js`), `createArtShowcaseQueue` (`src/table/art-showcase.js`),
testy C1–C3 w `test/m254-uwagi-wlasciciela.test.js`.

## L85 (2026-08-28) — `eventData.manaCost` to mana WYDATKOWANA, nie mana value karty

**Objaw (Batch 51, Kulrath Mystic — „Whenever you cast a spell with mana value
4 or greater"):** warunek `spellManaValueAtLeast: 4` czytał
`eventData.manaCost` zdarzenia `permanent_cast`: przepuszczał czar z obniżką
(MV 5 zapłacone {3}) i odrzucał czar bez obniżki przy koszcie alternatywnym.
Testy karty były zielone, bo w nich koszt = mana value.
**Przyczyna:** jedno pole niosło dwa fakty: `eventData.manaCost` w zdarzeniu
rzutu to koszt ZAPŁACONY (po obniżkach, po koszcie alternatywnym), a mana
value (CR 202.3) wynika z kosztu WYDRUKOWANEGO, czyli
`eventData.object?.manaCost`.
**Reguła:** warunek na mana value czyta OBIEKT. Przy dopisywaniu warunku do
triggera sprawdź, czy dane wejściowe to „wartość z karty" czy „wynik
rozliczenia" — w zdarzeniach silnika prawie zawsze to drugie.
**Strażnik:** `conditionHolds` (`src/engine/triggers.js`, wpis
`spellManaValueAtLeast`), testy „MV 4 odpala / MV 1 nie" w
`test/batch51-kart.test.js`.

## L84 (2026-08-28) — Nowy deskryptor mechaniki ma cztery dowiązania poza silnikiem: strażniki zgłaszają je osobno, więc dopisz je od razu

**Objaw (Batch 51):** po dodaniu trzech elementów (`buff_attacking_creatures`,
`buff_creature_until_end_of_turn`, zdarzenie `creature_became_renowned`) pełny
`npm test` pokazał PIĘĆ czerwonych testów, z czego cztery nie dotyczyły
mechaniki, tylko jej OTOCZENIA: brak etykiety PL (strażnik M122), brak wyceny
bota (M157), brak wpisu w `EVENT_TYPES`, brak opisu w `describeGameEventRaw`
(M134). Piąty to złoty fixture bota (osobna lekcja: L25).
**Przyczyna:** mechanika w silniku to JEDNO z kilku miejsc, gdzie deskryptor
musi istnieć. Strażniki są osobne i każdy zgłasza swój brak własnym
komunikatem, więc kolejka redów jest kosztem PROCESOWYM (~2 min za pełny
test), nie dowodem błędu w mechanice.
**Reguła:** przy nowym deskryptorze (efekt, zdarzenie, filtr celu) odhacz
listę PRZED pierwszym uruchomieniem pełnego testu:
1. `EVENT_TYPES` + `describeGameEventRaw` (`src/table/session.js`) — zdarzenie
   bez opisu jest dla gracza niewidoczne (L24);
2. etykieta w mapie opisów (`src/table/render.js`) — strażnik M122;
3. wycena bota (`src/controllers/heuristic-bot.js`) albo świadomy wpis do
   `REVIEWED_UNVALUED` — strażnik M157;
4. `gameObjectDataOf` (`src/cards/materialize.js`) — deskryptor z definicji
   karty musi dojść na obiekt gry (L21: `renown` ginęło w materializacji).
**Dopisek (M255):** czwarte dowiązanie (etykieta LOGU) nie miało ŻADNEGO
strażnika, więc `ABILITY_EFFECT_LABELS` w session.js dziurawiała się latami:
29 z 52 typów efektów zdolności aktywowanych bez opisu (log: goła nazwa karty
— „Nieprzyjaciel aktywuje zdolność: Thunderstaff"). Strażnik `M255/C1`
(`test/m255-petla-jakosci.test.js`) żąda opisu dla każdego typu efektu —
wzorzec z A2a/A2b (M179), tylko dla efektów zamiast keywordów. Wniosek:
dowiązanie BEZ strażnika dziurawieje nawet wtedy, gdy autor karty o nim pamięta
(Batch 51 dodał wpisy do etykiet PANELU w render.js — druga tabela, ten sam
kształt, zero powiązania).
**Dokumentacja:** sekcja „Obowiązki przy nowym deskryptorze" w
`docs/cards/HOW_TO_ADD_CARD.md`.

## L82 (2026-08-28) — Test UI wiąże SKUTEK z hakiem semantycznym (klasa/`data-*`), copy pina się OSOBNYM testem

**Objaw (M251):** poprawna etykieta „Użyj domyślnego przydziału (zabójcze
obrażenia…)" złamała test `choice-request-ui` — test lokalizował przycisk po
TEKŚCIE (`findAll(host, 'button', 'Domyślnie')`), nie po klasie
`damage-wizard-default`. Copy poprawne + logika poprawna = test czerwony.
**Przyczyna:** jeden test wiązał DWIE rzeczy — lokalizację widgetu i regułę
gry — przez najbardziej lotną warstwę (copy). Etykiety tekstowe to warstwa,
którą najczęściej ruszają uwagi UX (M162/C, M202/D, M211); kontraktem DOM jest
klasa semantyczna / `data-*`. Test pisał się wtedy, gdy copy było stabilne.
**Reguła:**
1. Test zachowania („klik → komenda X") lokalizuje element po haku
   semantycznym, NIGDY po tekście: tekst to dekoracja, klasa to rura.
2. Treść dla gracza pilnuje OSOBNY pin (tu: `doesNotMatch(/lethal-first/)`).
   Wtedy regresja copy mówi „zmieniłeś tekst gracza", nie symuluje złamania
   logiki.
3. Przy zmianie stringów UI punktowy grep ma ślepe półki (grep po klasie +
   pełny rdzeń przed commitem — ADR 0020 C).
**Strażnik:** `test/choice-request-ui.test.js` (lokalizacja po klasie + pin
copy); naprawa żargonu „lethal-first" w wizardzie i `commandLabel`.

## L81 (2026-08-28) — Zastępując ręczną kopię „wspólną funkcją prawdy", porównaj FILTRY obu stron, nie tylko listę przedmiotów

**Objaw (audyt PR #85, N2):** bramka oferty `pass_priority` dostała
`firstDecisionOwner == null` (dokończenie unifikacji z Batch 47). Zielony
rdzeń odpowiedział JEDNYM czerwonym testem: M33 („ślepa decyzja pokoju gaśnie,
gra toczy się dalej"). Wspólna `firstPendingDecisionPlayerId` liczyła
`pendingRoomTargets` po SUROWEJ długości tablicy, a zastępowana kopia miała
filtr „na żywo" (`legalRoomTargetCandidates(…) > 0`).
**Przyczyna:** unifikując N kopii (L41) porównałem PRZEDMIOTY list (61 pól
ręcznego łańcucha ⊆ 62 funkcji), ale nie SEMANTYKĘ pozycji. Kopie narosły o
lokalne filtry jakości (`triggerTargetsBlock`, `roomTargetBlocks`); funkcja
„prawdy" miała filtr tylko dla jednej z nich (`triggerTargetDecisionPending`).
Rozjazd wyszedł w pętli uruchomieniowej (jak L37).
**Reguła:**
1. Przy zamianie kopii na wspólną funkcję zrób tabelę „co kopia sprawdza" ×
   „co funkcja sprawdza" — różnica w FILTRZE to kontrakt do przeniesienia.
   Surowe `length > 0` kontra `some(legal(…))` to RÓŻNE reguły (pokrewne L80).
2. Zanim zaakceptujesz regresję po takiej zamianie, rozstrzygnij, która strona
   mówi prawdę o REGULE (tu: M33 — ślepa decyzja musi przestać blokować;
   naprawiana jest funkcja wspólna, nie test).
3. Ślepe decyzje to stała klasa stanu (`pendingRoomTargets`,
   `pendingTriggerTargets`): każda kolejka wieloelementowa dostaje pytanie
   „co, gdy wpis zdążył umrzeć?" (przycinanie w `pruneDeadPendingDecisions`
   + filtr w `firstPendingDecisionPlayerId`).
**Strażnik:** filtr pokoju w `firstPendingDecisionPlayerId`,
`test/room-targets-staleness.test.js` (M33),
`test/manifest-dread-pass-offer.test.js` (N2).

## L80 (2026-08-26) — „Dubel na stosie" to nie to samo co „efekt już zastosowany": strażnik idempotencji patrzy na STAN, nie tylko na stos

**Objaw (M220, pętla jakości, h9):** bot aktywował Saddle na Trained Arynx
(`set_saddled`, idempotentny do EOT) 3× w jednej turze, tapując kolejne stwory
za nic — mimo że `set_saddled` był w `IDEMPOTENT_EOT_EFFECTS`.
**Przyczyna:** strażnik (`pendingTwin`, M179/B) sprawdzał tylko, czy
IDENTYCZNA aktywacja WISI NA STOSIE. Gdy pierwsza się rozstrzygnęła i nadała
stan, na stosie nic nie wisiało, a flaga `saddled` siedziała na permanencie.
Strażnik pilnował KOLEJKI, nie SKUTKU.
**Reguła:** efekt idempotentny do EOT z ODCZYTYWALNĄ flagą stanu (`saddled`,
`cantBlock`, `monstrous`…) ma strażnik o DWÓCH nogach: (1) brak bliźniaka na
stosie (`pendingTwin`) ORAZ (2) cel/źródło nie ma jeszcze tej flagi w widoku
(ADR 0017). Noga (1) chroni tylko przed rozstrzygnięciem, po nim chroni (2).
Flaga po TYPIE efektu i deskryptorze stanu, nie po nazwie karty (ADR 0002).
Anty-over-fix: pierwsza aktywacja musi zostać legalna.
**Strażnik:** `src/controllers/heuristic-bot.js` (`set_saddled` +
`source.saddled` → −10), `test/m219-bot-resaddle-noop.test.js`.

## L79 (2026-08-26) — Decyzja `resolve_*` emitująca dwa zdarzenia o tej samej treści dubluje wpis w logu

**Objaw (M219, pętla jakości, g9):** aktywacja Unstable Frontier dała DWA
identyczne wiersze: „Swamp staje się typem Plains do końca tury" ×2.
**Przyczyna:** rozstrzygnięcie `resolve_land_type_choice` emituje parę —
`land_type_changed` (mutacja) i `land_type_choice_resolved` (narracja) — a
`describeGameEvent` renderował OBA (wariant L24/L6; pokrewne L41, ale po
stronie zdarzeń).
**Reguła:** przy parze „zdarzenie mechaniczne + narracyjne" TYLKO JEDNO
renderuje zdanie dla gracza — zwykle `*_resolved` (niesie komplet kontekstu).
Drugie wycisz w opisie (`return null`), ale ZOSTAW w strumieniu: potrzebne do
determinizmu/fingerprintu i innym konsumentom (tu `real-cards-batch7`
sprawdza OBECNOŚĆ `land_type_changed`). Pytanie kontrolne: czy niższa warstwa
już emituje zdarzenie z tą samą treścią?
**Strażnik:** `src/table/session.js` (`land_type_changed` → null),
`test/m219-log-land-type-duplikat.test.js`.

## L78 (2026-08-26) — Lektura obowiązkowa czytana fragmentami to lektura NIEwykonana

**Objaw:** `docs/LESSONS.md` (1930 linii) i część ADR-ów zostały obejrzane we
fragmentach (kilka najnowszych lekcji + nagłówki), bo narzędzie czytające
zwracało pliki z ucięciem (`truncated`/`hasMore`). Właściciel: „jeśli jakiś
plik z obowiązkowej lektury nie został przeczytany w całości, to należy go
pobrać tak, żeby przeczytać go w całości".
**Przyczyna:** „zielony" odczyt jednego chunka wygląda identycznie jak
przeczytanie całości (jak L68: brak skutku nieodróżnialny od poprawnego), a
AGENTS.md §0 nie nazywało wprost, że pojedynczy plik też czytasz do końca.
**Reguła:**
1. Plik uznajesz za przeczytany dopiero po OSTATNIEJ linii — sprawdź `wc -l`
   i potwierdź zakres; dla `LESSONS.md` to WSZYSTKIE lekcje, nie tylko z góry.
2. Każdy sygnał fragmentacji (`truncated`, `hasMore`, `stdout_truncated`) to
   polecenie „dobierz następny fragment" — czytaj po zakresach (`sed -n`).
3. „Przejrzałem / streściłem" NIE jest przeczytaniem.
**Strażnik:** `AGENTS.md` §0 (blok „Każdy plik lektury obowiązkowej czytasz
W CAŁOŚCI…").

## L77 (2026-08-26) — Wejście na pole bitwy to ZDARZENIE o wielu następstwach: decyzja blokująca ani `return` nie mogą wycinać reszty

**Objaw (M216/M217), dwa błędy jednej klasy:**
- **Devour** (Gorger Wurm, CR 702.82a): trigger ETB (Impact Tremors) odpalał w
  tym samym przebiegu skanu, w którym do kolejki trafiała decyzja devour —
  widział stwora PRZED licznikami. Devour to efekt ZASTĘPCZY wejścia.
- **Exploit** (Gurmag Drowner, CR 702.110a): `return` przy braku kandydatów
  ucinał CAŁE zdarzenie wejścia — pomijały się też triggery niezwiązane
  („creature_you_control_enters", landfall…).
**Przyczyna:** blok wejścia traktował „kolejkuj decyzję" i „odpal triggery"
jako jedną niepodzielną jednostkę. Tymczasem to NIEZALEŻNE następstwa:
permanent wszedł na pole niezależnie od tego, czy gracz ma co poświęcić.
**Reguła:** w zdarzeniu wejścia blokująca decyzja (devour/exploit/endure…)
pomija TYLKO własne następstwo; reszta biegnie dalej. Pytanie kontrolne: czy
ta gałąź (`return` / `push` decyzji) wycina coś, co zdarzyło się niezależnie?
Jeśli tak — `if` wokół decyzji, nie `return` z funkcji. Kolejność też jest
regułą: replacement przed triggerem (devour), trigger przed decyzją (exploit).

## L75 (2026-08-25) — Fałszywy alarm detektora kosztuje więcej niż cisza; ale zanim go uciszysz, sprawdź POMIAR

**Objaw (M213):** Żywy Tester zgłosił 4 no-opy na „{2}, {T}: Tap target
creature" wycelowanej we własnego stwora. Zdolność działa poprawnie — sonda
dowiodła, że silnik nie oferuje tapowania już-tapniętego celu.
**Przyczyna:** zdolność tapuje DWA permanenty naraz — źródło (koszt) i cel
(skutek) — a sonda liczyła oba do jednego licznika, więc warunek „jedyna
zmiana to zapłacony koszt" wychodził prawdą. Rozróżnienie jest strukturalne:
płacących wskazuje KOMENDA (`objectId` + `tapCreatureId`/`crewCreatureIds`).
**Reguła:** gdy detektor oskarża kod, który po sprawdzeniu jest poprawny,
błąd leży w POMIARZE — napraw go tam, nie dopisując wyjątku na etykietę czy
nazwę karty. Jeden licznik na dwa zjawiska zawsze skłamie, gdy wystąpią razem.
Po uciszeniu alarmu udowodnij, że detektor NADAL krzyczy na prawdziwym
przypadku (L67).

## L76 (2026-08-25) — Żywy Tester mierzy `dist/`, nie `src/`

**Objaw (M213):** po naprawie sondy partia kontrolna zwróciła NIEZMIENIONĄ
liczbę zgłoszeń — wyglądało to na „patch nie działa" i o mało nie wywołało
szukania drugiej przyczyny w kodzie, który był już poprawny.
**Przyczyna:** `tools/table-tester/run-game.mjs` ładuje zbudowany artefakt
`dist/mtg-table.html` (ADR 0011), nie moduły z `src/`. Bez `npm run build`
Tester mierzy poprzednią wersję.
**Reguła:** `npm run build` jest częścią pętli „popraw → zmierz" dla każdej
zmiany w `src/`. Gdy wynik nie drgnął po realnej zmianie, najpierw podejrzewaj
nieaktualny artefakt (L33 — najpierw podejrzewaj narzędzie).

## L71 (2026-08-25) — Zmiana strefy tworzy NOWY obiekt (CR 400.7); „ten sam" id to złudzenie

**Objaw (M212):** naprawa wyceny darmowego rzutu wyglądała na działającą
(testy zielone), a była martwa: helper szukał opisu czaru po `cmd.cardId` w
`view.zones.exile` i zawsze dostawał `undefined`, więc kara za zły cel
wynosiła 0 — tyle samo co przed naprawą.
**Przyczyna:** oferta niesie DWA identyfikatory — `cardId` (która karta) i
`objectId` (który obiekt w strefie). Deskryptor `spell` wisi na OBIEKCIE
(CR 400.7: karta zmieniająca strefę to nowy obiekt). Lookup po `cardId` w
strefie obiektów jest składniowo poprawny i semantycznie pusty.
**Reguła:** rozróżniaj tożsamość karty od tożsamości obiektu i sprawdzaj, po
czym indeksowana jest strefa. Gdy lookup zwraca `undefined`, kod nie jest
neutralny — jest WYŁĄCZONY: asertuj w sondzie, że lookup COŚ znalazł (L68).

## L72 (2026-08-25) — Jeden objaw, kilka bliźniąt: naprawę kończy przegląd RODZEŃSTWA

**Objaw (M212):** zgłoszenie „bot tapuje własnego blokera" dotyczyło
rebounda; ta sama ślepota siedziała w `resolve_suspend_cast`, a po przeglądzie
także w `resolve_madness_cast`. Trzy gniazda, jedna przyczyna: silnik
enumeruje ofertę per zestaw celów, a bot wyceniał wyłącznie TYP efektu, więc
wszystkie warianty miały identyczny wynik i wygrywał pierwszy z brzegu.
**Reguła:** gdy przyczyną jest KSZTAŁT interfejsu („oferta niesie cele,
konsument ich nie czyta"), znajdź WSZYSTKICH konsumentów tego kształtu przed
zamknięciem tematu (`grep` po rodzinie `case`). Naprawę wynieś do wspólnego
helpera. Każda gałąź ma WŁASNĄ mutację i test: mutacja bliźniaczej gałęzi
(suspend) przeszła niewykryta przez test rebounda.

## L73 (2026-08-25) — Detektor sprzężony z TRYBEM logowania milczy tam, gdzie audyt patrzy

**Objaw (M212):** trzy partie Żywego Testera po naprawie dały 0 zgłoszeń —
fałszywie: archiwalny transkrypt SPRZED naprawy zawierał wzorcowy przypadek
(`Nieprzyjaciel rzuca Ojutai's Breath → cel: <własny stwór>`), którego
detektor `detectBotSelfHarmOnOwnPermanents` też nie widział.
**Przyczyna:** detektor ustalał właściciela celu, parsując snapshoty „MOJE
POLA:” / „POLA WROGA:” z transkryptu. Audyt biega z `--quiet`, gdzie
snapshotów prawie nie ma (w całym pliku JEDEN, na końcu). Warunek „cel stoi po
stronie bota" nigdy nie był spełniony — detektor był martwy w jedynym trybie,
w którym go używano.
**Reguła:** detektor opiera się na danych STRUKTURALNYCH ze sterownika (L40/
M99), nigdy na tym, ile narzędzie akurat wypisało. Gdy raportuje zero,
udowodnij, że żyje: puść go na materiale z potwierdzonym błędem albo rozluźnij
warunek. **Zero z martwego detektora wygląda identycznie jak zero z poprawnej
gry.**

## L74 (2026-08-25) — Ustalenie o UI weryfikuj w DOM, nie w spłaszczonym transkrypcie

**Objaw (M212):** znaleziska brały się z czytania transkryptu, gdzie osobne
elementy UI są sklejane separatorem w jedną linię: dwie opcje wyglądają jak
jedna zlepiona etykieta i odwrotnie. Z 13 partii 11 tropów okazało się
poprawnym zachowaniem.
**Reguła:** zanim zgłosisz błąd UI, sprawdź STRUKTURĘ DOM (ile jest
`button.action`, jakie mają teksty). Transkrypt namierza miejsce, DOM
rozstrzyga.
**Reguła druga (nazewnictwo):** nazwa karty w kodzie mechaniki (mechanika
ochrzczona po karcie, która ją wprowadziła) NIE jest zgodą na tę nazwę w
etykiecie UI — gracz widzi wtedy nazwę cudzej karty spoza talii. Deskryptor
opisuje CZYNNOść (rzeczownik odczasownikowy), nigdy źródło implementacji
(ADR 0002).

## L68 (2026-08-25) — Sonda, która „nie znalazła błędu", bo komenda została cicho odrzucona

**Objaw (M210):** sonda sprawdzająca, czy obrażenia z delirium respektują
`protection from red`, wypisała „OK — brak obrażeń". Komenda w ogóle się nie
wykonała (`ok:false`, `unsupported_command`) — `pending` nie miał pola
`opponentId`, filtr kandydatów zwracał pustą listę. Brak skutku wziąłem za
poprawny skutek.
**Przyczyna:** sonda mierzyła STAN KOŃCOWY (`damage === 0`), nie sprawdzając,
czy badana ścieżka w ogóle pobiegła. Każdy powód odrzucenia komendy
(literówka w polu, brak klucza, niespełniony warunek) daje ten sam „zielony"
obraz co poprawna implementacja.
**Reguła:** sonda silnika NAJPIERW asertuje, że komenda przeszła
(`assert.equal(result.ok, true)`), potem bada skutek; gdy ma udowodnić BŁĄD,
pokazuje stan pośredni (zdarzenie, licznik, zmiana pola). To samo w testach:
`ok` komendy jest częścią asercji, nie tłem (L13/L61).

## L69 (2026-08-25) — Dane karty i mechanika to dwa źródła prawdy o tym samym: kolor vs. produkowana mana

**Objaw (M210):** podstawowe landy miały `colors: ['R']` — pole „kolor"
zapisano jako „jaką manę produkuje". Kolor obiektu wyznacza koszt many
(CR 202.2), a land kosztu nie ma, więc każdy land był kolorowy: po animacji
(Awaken) Swamp stawał się czarnym stworem, obchodził „protection from black"
i spełniał „can't be blocked except by black". Test regresyjny utrwalał
pomyłkę (`def.colors === ['B']` z komentarzem „produkuje {B}").
**Przyczyna:** dwa pojęcia w jednym polu, bo dla landu „czarny" brzmi tak samo
w obu znaczeniach. Ujawnione przy okazji: Immersturm Skullcairn NIE MIAŁ
deskryptora `{T}: Add {B}` — działał wyłącznie dzięki tej pomyłce.
**Reguła:** gdy pole da się czytać na dwa sposoby, sprawdź, która ścieżka
silnika je czyta i po co. Kolor obiektu = wyłącznie CR 202.2; produkowana mana
= deskryptor `add_mana`. Test cementujący pomieszanie jest częścią błędu:
poprawiamy go razem z kodem.

## L70 (2026-08-25) — Weryfikacja mutacyjna wykrywa też kod NADMIAROWY, nie tylko brakujące testy

**Objaw (M210):** gałąź „obiekt typu Land → kolor pusty" w `effectiveColors`
(CR 202.2) po mutacji NIE uczyniła żadnego testu czerwonym, choć testy
sprawdzały ten scenariusz.
**Przyczyna:** regułę egzekwowały już dane kart (landy mają `colors: []`), więc
gałąź była martwa — i BŁĘDNA: efekt animujący może kolor nadać (Genju of the
Spires, „becomes a 6/1 red Spirit creature land", CR 613 warstwa 5), a
zerowanie po typie by go zgubiło.
**Reguła:** mutację robimy per GAŁĄŹ, nie per funkcja. Gałąź, której mutacja
nie czerwieni testu, jest podejrzana z definicji: brakuje testu albo gałąź
jest zbędna. Sprawdź najpierw, czy gałąź powinna istnieć — usunięcie
nadmiarowej reguły jest lepsze niż utrwalenie jej testem.

## L67 (2026-08-25) — Helper, który istnieje, ale nie jest wołany w gałęzi, gdzie miał chronić

**Objaw (M209):** sweep Żywego Testera zaraportował `srodziemie vs ravnica s=7`
jako `[STOP] brak akcji w kroku 59`, choć w tej samej linii stało „Koniec
partii — wygrywa Bot". Podsumowanie policzyło partię jako niedokończoną
(`koniec=0`) i fałszowało obraz audytu.
**Przyczyna:** `run-game.mjs` miał helper `isGameOver()` z komentarzem
opisującym ten przypadek („panel akcji jest wtedy pusty prawidłowo"), wołany w
dwóch miejscach — ale NIE w gałęzi `res === 'none'`, czyli tam, gdzie pusty
panel jest objawem.
**Reguła:** gdy narzędzie zgłasza awarię, sprawdź, czy w kodzie nie leży już
gotowy warunek odróżniający awarię od stanu normalnego — i czy jest wołany na
KAŻDEJ ścieżce do tego stanu. Dopisanie warunku obok istniejącego to druga
definicja tej samej reguły (L41).
**Reguła druga:** po uciszeniu fałszywego alarmu udowodnij, że alarm NADAL
potrafi się odezwać (w archiwum zostały 4 realne `[STOP]` z niepustą listą
akcji — naprawa usunęła tylko ten jeden fałszywy). Naprawa wyłączająca
detektor jest gorsza od błędu, który naprawiała (L13/L61).

## L66 (2026-08-25) — Lektura obowiązkowa to BUDŻET: dokument bez limitu rośnie, aż zje kontekst

**Objaw (M208):** lektura startowa z `AGENTS.md` §0 ważyła ~605 kB (~194-258
tys. tokenów), z czego **384 kB to `PROJECT_STATE.md`** — „bieżący stan
projektu" urósł do 125 sekcji i 5904 linii (~80 sesji wstecz).
**Przyczyna:** plik miał w nazwie „STATE", a w treści był dziennikiem. Każda
sesja dopisywała sekcję (słusznie, ADR 0013), nikt nie pilnował SUMY, bo
żadna reguła nie mówiła, ile lektura MOŻE ważyć.
**Reguła:**
1. **Lista lektur ma budżet i strażnika** — bez progu nie ma sygnału. Tu:
   100 tys. tokenów na `AGENTS` + ADR-y + `LESSONS` + `ENVIRONMENT`
   (`test/dokumentacja-budzet-lektury.test.js`).
2. **Rozdziel „zasady" od „dziennika".** Agent potrzebuje REGUŁ i PUNKTU
   ZACZEPIENIA (ostatni PR, najnowszy handoff); historia jest do grepowania
   punktowego. Dziennik nazywa się dziennikiem (`PROJECT_HISTORY.md`) i mówi
   w nagłówku, że NIE jest lekturą startową.
3. **Sygnał:** dokument, którego nazwa mówi „bieżący", a treść rośnie
   monotonicznie. Sprawdź `grep -c '^## '` i datę najstarszej sekcji.
4. **Zanim skrócisz, ZMIERZ rozkład.** Plan „skondensujmy LESSONS.md" dotyczył
   16% problemu przy pełnym ryzyku utraty niuansu; pomiar przekierował pracę na
   pozycję ważącą 2/3, którą dało się zdjąć z listy bez skasowania linijki.
5. **Numery lekcji to API dokumentacji.** `L1`-`L65` są cytowane w kodzie
   ~1150 razy w 242 plikach (`// klasa L48`). Renumeracja unieważniłaby je bez
   jednego czerwonego testu — nagłówki `## L<nr>` są stabilnymi kotwicami.
**Strażnik:** M208 (`PROJECT_HISTORY.md`, `AGENTS.md` §0 z budżetem,
`test/dokumentacja-budzet-lektury.test.js`).

## L65 (2026-08-25) — Test, który przechodzi na przypadku odsianym przez WCZEŚNIEJSZY warunek, nie testuje tego warunku

**Objaw (M207, mutacja):** `targetSlotsOf` ma dwie bramki: (1) warianty równej
długości, (2) pozycje nie dzielą kandydatów. Test B2 (Fireball „up to three" i
„any number of targets" → płaska lista) był zielony; mutacja USUWAJĄCA bramkę
(2) przeżyła — 23 testy dalej zielone.
**Przyczyna:** oba przypadki mają warianty RÓŻNEJ długości (`sizes = [1, 2]`),
więc odpadały na bramce (1) i nigdy nie docierały do (2). Zieloność była
zasługą innej linijki.
**Reguła:** pisząc test na warunek, sprawdź, czy przypadek do niego DOCIERA —
najprościej mutacją (skasuj warunek; zielone = przypadek odsiewany wcześniej).
Dla łańcucha bramek dobierz dane przechodzące wszystkie poprzednie i różnicujące
wyłącznie badaną (tu: czar o STAŁEJ arności 2 z jednej puli). „Mutacja
przeżyła" znaczy „mam lukę w danych", nie „mutacja jest równoważna".

## L63 (2026-08-25) — Selektor sterownika, który nie pasuje do niczego, nie daje błędu — daje CICHĄ PĘTLĘ i fałszywe „brak zgłoszeń"

**Objaw (M206):** przebiegi Żywego Testera na części seedów nie kończyły się w
limicie kroków: 300 identycznych linii o tym samym oknie, zero ruchów — i
pogodne `== DETEKTORY: brak zgłoszeń ==`.
**Przyczyna:** sterownik szukał
`.choice-request-option input[type="checkbox"]`, a kreator wielocelowy
(M195/C) renderuje PRZYCISKI `.multi-target-toggle` ze stanem w tekście
(„[ ]” / „[x]”). `querySelectorAll` na nieistniejącym selektorze zwraca pustą
listę (bez wyjątku) → nic nie zaznaczono → „Zatwierdź" `disabled` → „Anuluj"
odtworzył to samo żądanie → pętla.
**Dlaczego gorsze niż crash:** narzędzie raportowało sukces. ŻADEN czar
wielocelowy (Fireball, Wrap in Flames, Grave Exchange) ani mulligan
z odłożeniem kart nie został przeklikany — czyli klasa modali, którą właściciel
kazał sprawdzić.
**Reguła:** gałąź sterownika obsługująca modal: (1) loguje, ILE elementów
znalazła („opcji 0" to alarm); (2) ma licznik nieudanych prób zamknięcia TEGO
SAMEGO okna i przerywa głośno po progu („Anuluj" odtwarzający żądanie nie jest
wyjściem z pętli); (3) traktuje `0 znalezionych` jako zerwany kontrakt DOM.
Kontrakt DOM, na którym opiera się sterownik, wart jest testu po stronie
aplikacji — inaczej refaktor renderera zrywa narzędzie bez czerwonego testu.
**Strażnik:** `tools/table-tester/run-game.mjs` (`MULTI_WIZARD_STUCK_LIMIT`,
log liczby wierszy), `test/m195-multi-target.test.js` (M206).

## L64 (2026-08-25) — Bramka na FAZĘ nie jest bramką na MOMENT: „phase === 'combat'" przepuszcza krok przed deklaracją

**Objaw (M206):** bot aktywował pump „+2/+2 do końca tury" w kroku *Początek
walki* i nie atakował (dwie many na efekt wygasający w cleanup); powtarzał to
co turę. Warunek: `view.turn.phase === 'combat'`, a komentarz nad nim mówił
„pump ma sens po deklaracji atakujących/blokujących".
**Przyczyna:** `beginning_of_combat`, `declare_attackers`, `declare_blockers`,
`combat_damage`, `end_of_combat` to TA SAMA faza (`TURN_STEPS`). Odbicie
M202/F, gdzie `step === 'main'` obejmował pre- i postcombat.
**Poprawka NIE polega na wykluczeniu kroku po nazwie:** pierwsze podejście
(`&& step !== 'beginning_of_combat'`) przesunęło marnotrawstwo w dwa inne okna.
Regułą jest STAN: efekt „do końca tury" kupuje coś tylko wtedy, gdy stwór
REALNIE walczy (`attacking || blocking`).
**Reguła:** wyceniając efekt ulotny, pytaj o STAN mający wpływ (czy stwór
walczy, czy cel zadeklarowany), nie o nazwę fazy/kroku; sprawdź w `TURN_STEPS`,
ile kroków ma faza i ile faz nosi nazwę kroku. Objaw widać w transkrypcie, nie
w teście jednostkowym.
**Uwaga poboczna:** `attacking` NIE jest polem obiektu — `playerView`
wyprowadza je z `state.combat.attackers`. Test ustawiający je wprost przechodzi
z niewłaściwego powodu.
**Strażnik:** `test/m206-audyt-rozgrywek.test.js` (A1/A1b/A1c — trzy jałowe
okna; A2 — pump w realnej wymianie zostaje).

## L61 (2026-08-25) — Test regresyjny bez WERYFIKACJI MUTACYJNEJ bywa ślepy: „zielony" nie znaczy „pilnuje"

**Objaw (M205, audyt PR #77):** dwa testy „przypinające" fix deduplikacji
przedruków modala były zielone. Po cofnięciu fiksu
(`if (text !== prevBlock) deduped.push(...)` → `deduped.push(...)`) plik nadal
dawał 91/91 pass.
**Przyczyna:** dane nie miały kształtu, w którym fix działa: przypadek sklejał
bloki bez separatora i powtarzał w każdym linię `• Tura 7 — Nieprzyjaciel`,
a ta linia sama woła `flush()` w detektorze, więc licznik zerował się przez
progiem. Test mierzył `flush()`, nie fix (L1 w wariancie najgroźniejszym: test
istnieje, ma nazwę i komentarz, więc temat uchodzi za zabezpieczony).
**Reguła:** test regresyjny liczy się dopiero, gdy pokazano, że czerwienieje po
cofnięciu naprawy. Procedura (~30 s): (1) mutacja odwracająca fix jedną linią;
(2) uruchom plik testu — MUSI paść właściwy test; (3) cofnij mutację,
potwierdź zielone; (4) oba pomiary wpisz do commitu/raportu. Jeśli mutacja nie
czerwieni, dane nie mają kształtu produkcyjnego — odtwórz je z REALNEGO
artefaktu (tu: nagłówek kroku `--- krok N | T. X ---` między renderami).
**Sygnał:** „przypięte testem" bez wyniku pomiaru przed/po = zdanie do
sprawdzenia, nie do przyjęcia na wiarę.

## L62 (2026-08-25) — Kolejność renderu to część kontraktu: log rysowany od najnowszego łamie liczenie „nowych" po indeksie

**Objaw (M205):** kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie
`#log` po indeksie" — wg handoffu) znajdował 0 wpisów, choć sesja je
generowała i `session.log` je miał.
**Przyczyna:** `render.js` rysuje log od NAJNOWSZEGO
(`[...session.log].reverse()`), więc nowe wpisy dokładają się na POCZĄTKU
listy DOM; pętla `for (i = widzianeDotąd; i < entries.length; i++)` czytała
najstarsze jako „nowe". Poprawnie: `entries.slice(0, nowe).reverse()`.
**Reguła:** zanim oprzesz narzędzie na „nowe elementy = ogon listy", sprawdź w
renderze kierunek rysowania (`reverse()`, `prepend`, `insertBefore`,
`column-reverse`). Kolejność renderu to kontrakt UI jak nazwy klas.
**Wariant z tej samej sesji:** `--out katalog/plik.txt` do nieistniejącego
katalogu wywracał zapis na ENOENT dopiero PO ~40-sekundowym przebiegu — cały
transkrypt przepadał. Narzędzie waliduje miejsce zapisu ZANIM zacznie mierzyć
(L33).

## L60 (2026-08-24) — Narzędzie audytu, które milcząco przyjmuje złą konfigurację, produkuje audyty o czymś innym

**Objaw (M203, audyt PR #74):** Żywy Tester miał domyślne talie `--human green
--bot red`; takich talii nie ma od M178 (ADR 0023). Sterownik wybierał talię
pętlą `for (const opt of select.options) if (opt.value === human) …` — BEZ
`else`, więc nieistniejąca nazwa nie była błędem: partia startowała na
domyślnym wyborze artefaktu, a pierwsza linia transkryptu i tak głosiła
`== NOWA PARTIA: gracz=green vs bot=red ==`. Audyt mierzył inną partię, niż
zapowiadał.
**Dlaczego groźne:** narzędzie audytowe jest ŹRÓDŁEM DOWODÓW (L33 + L24:
narzędzie „działa" i kłamie o stanie gry). Rozjazd przeżył ~25 sesji, bo nikt
nie kwestionował nazw talii w dokumentacji.
**Reguła:**
1. Każdy parametr wskazujący dane w repo walidujesz JAWNIE: nieistniejąca
   nazwa to błąd z listą dostępnych, nigdy cichy fallback (pętla wyboru
   wymaga `else`, które rzuca).
2. Domyślne bierz z tego samego źródła co narzędzie (`decks/*.txt` /
   `BENCH_DECKS`), a listę w dokumentacji zastępuje komendą (`--list-decks`).
3. Rozjazd nazw dostaje strażnika
   (`test/m203-talie-testera-i-dokumentacji.test.js`) — L56.
4. Sygnał: narzędzie zwracające sensowny wynik dla nieistniejącego parametru.
   Sprawdź to raz celowo (10 s).
**Dopisek (pułapka weryfikacji):** test uruchamiający CLI dziedziczy jego
zależności — strażnik M203 był zielony lokalnie i CZERWONY w CI, bo
`run-game.mjs` importował `jsdom` statycznie, a CI (`node
tools/run-tests.mjs all`) nie robi `npm i` w `tools/table-tester`. Fix: leniwy
`await import('jsdom')` w `boot()`
(walidacja argv, `--help`, `--list-decks` nie potrzebują DOM). „Zielone
lokalnie" ≠ „zielone w CI".
**Strażnik:** M203 (walidacja w `parseArgs`, drugi bezpiecznik przy wyborze w
DOM, `--list-decks`, leniwy import, strażnik dokumentacji).

## L59 (2026-08-24) — Ograniczenie zasobu i koszt dodatkowy żyją w WIELU ścieżkach: definiuj przez ZAKAZ i pilnuj strażnikiem każdej ścieżki

**Objaw (M202, audyt PR #73 — dwa znaleziska jednej klasy):**
1. **N1.** Powerstone: „{T}: Add {C}. This mana can't be spent **to cast a
   nonartifact spell**". Implementacja (`purpose.artifactSpell`) opisała regułę
   ODWROTNIE („mana działa TYLKO przy czarze-artefakcie"), więc
   `producibleMana` odejmował manę ograniczoną przy każdej płatności i
   zdolność `{1}: Add {U/R/W}` przy Powerstone jako jedynym źródle nie miała
   oferty: silnik odbierał graczowi legalną akcję (L44).
2. **N4.** „As an additional cost to cast this spell, exile a creature you
   control" jest zapisane NA OBIEKCIE, a `payFreeCastAdditionalCost` (M201/U2)
   czyta `obj.spell.additionalCost`. Gałąź impulsu w `playerView` nie wiedziała
   o koszcie: Fear of Abduction wygnany impulsem dostawał ofertę
   `cast_permanent` bez `exileTargetId`, a `execute` ją odrzucał. Trzy gałęzie
   tej samej oferty (ręka, flash, impuls) liczyły koszt osobno (L41).
**Przyczyna (wspólna):** regułę „czego NIE wolno" zakodowano jako „co wolno",
a katalog ścieżek decydujących o niej nie był znany w jednym miejscu
(ograniczenie many: ~25 miejsc liczących budżet w spells/resources/abilities/
game-state/effects). Brak naturalnego choke pointa = każda nowa ścieżka
dziedziczy błędne domyślne.
**Reguła:**
1. Ograniczenie definiuj przez to, czego druk ZAKAZUJE:
   `restrictionApplies = purpose.castingSpell === true && purpose.artifactSpell !== true`.
   Wtedy płatność domyślna (zdolność, plot, suspend, proliferate) jest legalna
   z definicji, a wyjątek jest jawny w sygnaturze.
2. Cel wydania jest częścią kontraktu płatności. Przy >10 ścieżkach przegląd
   nie wystarczy — potrzebny **strażnik źródła**
   (`test/m202-straznik-celu-wydania-many.test.js`: każda funkcja
   `cast*`/`*Casts` pyta o manę z celem; zweryfikowany mutacyjnie).
3. Oferta i walidacja czytają JEDEN odczyt (L48/L41): koszt dodatkowy na
   obiekcie ma jedną funkcję (`exileAdditionalCostCandidates`) dla wszystkich
   gałęzi. Test nie jest „testem karty", tylko „testem ścieżki".
4. Sygnał przy audycie diffa: nowe pole `purpose`/`spendOnly`/`additionalCost`
   bez wyliczenia ścieżek. Policz je grepem (5 s).
5. Piny „utwierdzające dobre zachowanie" z poprzedniej sesji to sonda: dwa
   z trzech pinów N3 wyszły RED. Pin, który nigdy nie był RED, nie dowodzi
   niczego (L13).

## L58 (2026-08-23) — Kod stołu jedzie do PRZEGLĄDARKI: globalna Node w rdzeniu to awaria produktu, której testy nie widzą

**Objaw (M201/N1, audyt PR #72):** w `scoreCommand` heuristic-bota została
instrumentacja `if (process.env.BOT_DEBUG_SCORES && cmd.objectId === 'slaad')
console.error(…)`. Testy 3023/3023, CI zielone, PR scalony — a w artefakcie
(`dist/mtg-table.html`, ADR 0011) ta linia wywala `ReferenceError: process is
not defined` przy PIERWSZEJ wycenie ruchu bota: stół właściciela przestaje
działać w pierwszej turze.
**Przyczyna:** testy i Żywy Tester chodzą w Node (jsdom też na Node), gdzie
`process` jest globalne; przeglądarka z `file://` nie ma `process`,
`require` ani `__dirname` (klasa L5: test sprawdza funkcję, nie wiring).
Instrumentacja niosła też warunek po ID karty w rdzeniu (ADR 0002) i debug w
kodzie produkcyjnym (`ENVIRONMENT.md` §3).
**Reguła:**
1. Każdy moduł osiągalny z `src/table/main.js` to KOD PRZEGLĄDARKOWY (także
   `src/engine/**` i `src/controllers/**` — wchodzą do artefaktu): zero globali
   Node.
2. Instrumentację usuwasz w TYM SAMYM commicie; jeśli zostaje, musi być
   bezpieczna w przeglądarce (`globalThis`) i generyczna (bez nazw/ID kart).
3. Zakaz egzekwuje **strażnik skanujący graf modułów artefaktu**
   (`test/m201-audyt-pr72.test.js`, `collectModules`), nie recenzja.
4. Sygnał: `process.`, `console.log/error`, nazwa karty w kodzie rdzenia —
   trzy niezależne powody do RED.

## L57 (2026-08-23) — Zgłoszenie właściciela weryfikujesz wobec Oracle/CR PRZED wdrożeniem; rozbieżność zgłaszasz, nie wdrażasz

**Objaw (M200/A):** właściciel: „bot wszedł do Forge i wzmacnia MÓJ stwór — to
bez sensu, powinien fizzle, gdy nie ma [własnej] kreatury". Wdrożyłem ślepko
(kandydaci pokoju = tylko własne stwory, 3 testy, commit, push). Właściciel po
analizie Oracle wycofał zgłoszenie: zdolność pokoju MUSI się rozstrzygnąć przy
istniejącym legalnym celu, a stwór przeciwnika jest legalnym celem. Fix
wycofany (revert + testy zamieniające).
**Przyczyna:** zgłoszenie z rozgrywki opisuje SYMPTOM z perspektywy gracza, nie
regułę. Zgoda właściciela na zgłoszenie ≠ weryfikacja regułowa (ADR 0022/0002:
silnik jest autorytetem reguł).
**Reguła:**
1. Przed wdrożeniem zmiany ze zgłoszenia przeczytaj Oracle/CR
   (`docs/cards/scryfall-*.json`) i napisz JAWNIE, jak reguła rozstrzyga
   zgłoszenie — także gdy je potwierdza.
2. Gdy sugerowana naprawa KONTRA DYKTUJE regułę (zmienia legalność celów/
   kosztów/efektów niezgodnie z Oracle): NIE wdrażaj — zgłoś rozbieżność
   z powołaniem na regułę. Symptom można poprawić legalnie (etykieta,
   kolejność ofert); legalności się nie negocjuje.
3. Wycofanie = nowy commit (nie force push) + testy pinujące stan ostateczny
   (także negatywny) + wpis lekcji. Ślad błędu w git jest w porządku.
**Strażnik:** AGENTS.md § Nienegocjowalne granice.

## L55 (2026-08-22) — Jedno pole na „cechę trwałą" i „efekt do końca tury" to bomba zegarowa; badge liczony z pola technicznego kłamie

**Objaw (trzy trafienia w jednej sesji):**
1. **M187/N1** — token Phyrexian Mite („This token can't block") zaczynał
   legalnie blokować po pierwszym cleanupie: `cantBlock` niosło EFEKT „can't
   block this turn" (Panic Spellbomb, ma wygasać — CR 514.2) i cechę
   WYDRUKOWANĄ tokenu. Cleanup kasował obie. Bug żył od M69.
2. **M188/A** — Evangel of Synthesis pokazywał „menace", ale nie „+1/+0": badge
   liczono z `powerModifier`, a statyka warunkowa (CR 604.3) jest read-time i
   tego pola nie ustawia. Dotyczyło każdej statyki warunkowej, aury,
   equipmentu i anthemu.
3. **M188/B** — log pisał `token_squirrel`, bo `nameOf` czyta mapę z rejestru
   KART, a token po śmierci (CR 111.7) nie ma obiektu.
**Wspólna przyczyna:** warianty L14 (dwie zasady w jednej instrukcji) i L21
(pole spoza kontraktu ginie po cichu) — prezentacja pytała o dane POCHODNE
(modyfikator, mapa rejestru) zamiast o fakt do pokazania.
**Reguła:**
1. Pole opisujące stan trwały i wygasający rozdziel (`cantBlockPrinted` vs
   `cantBlock`) i daj JEDEN centralny odczyt (`creatureCantBlock()`) dla
   wszystkich ścieżek: oferta, walidacja, widok, render, fingerprint (L41;
   pominięty fingerprint psuje determinizm replayów).
2. Badge liczony jako różnica po stronie renderu jest martwy, gdy widok wysyła
   wartości EFEKTYWNE (M175/A3). Różnicę liczy warstwa znająca SKŁADNIKI
   (silnik) i wysyła ją jawnym polem.
3. Nie wliczaj do „nadanego" bonusu tego, co ma już własny badge (liczniki,
   pumpy) — gracz zobaczy bonus dwa razy.
4. Nazwy potrzebne PO zniknięciu obiektu (token, LKI) odtwarzaj z danych
   trwałych: mapa GENERYCZNA ze skanu katalogu (ADR 0002) + strażnik „każdy
   token ma nazwę".
5. Sygnał: silnik liczy dobrze, a gracz nie widzi skutku → błąd w kontrakcie
   widoku (ADR 0017), nie w regułach.

## L54 (2026-08-22) — Kara wyceny bota musi być MIERZONA względem bazy; każda klasa zachowań dostaje whitelistę ze strażnikiem

**Objaw (M179):** „kara −20 za trik we własnej main" (M146) nie działała od
początku — bazowa wartość rzutu czaru (~50–65) zjadała ją w całości i bot
dalej rzucał triki w Głównej 1. Klasa L50/L51, ale głębiej: kara ISTNIAŁA,
tylko liczona w oderwaniu od sumy.
**Reguła:**
1. Kara/premia okna czasowego musi być zwymiarowana względem BAZY gałęzi
   (czary ~50–65), inaczej jest dekoracją. Test zachowania („bot NIE rzuca X
   w oknie Y") obowiązkowy — tylko on mierzy sumę.
2. Timing to CZĘŚĆ okna: sorcery nie poczeka na combat (jedyne sensowne okno
   to Główna 1 przed atakiem — M179/C); kara za instant w main wymusza
   czekanie na deklaracje (M179/A1).
3. Klasy zachowań to WHITELISTY z eksportem + strażnikiem katalogowym
   (wzorzec L51): `IDEMPOTENT_EOT_EFFECTS`/`STACKING_ACTIVATED_EFFECTS`
   (M179/B), `FRIENDLY_TARGET_EFFECTS` + `HOSTILE_*` (M179/E),
   `KEYWORD_LABELS`/`KEYWORD_EVENT_LABELS` (M179/A2). Nowy typ bez przydziału
   = czerwony strażnik.
4. Klamry celowania są SYMETRYCZNE i centralne: wrogi efekt we własny cel
   (`selfHarmPenalty`) oraz przyjazny we wroga (`friendlyMisaimPenalty`) — w
   call-site'ach gałęzi, nie w każdej gałązce osobno.

## L53 (2026-08-22) — Test scenariuszowy na zamrożonym seedzie pełnej partii to dług odsetkowy

Cztery testy etykiet w table-session miały po 10+ wpisów „przelosowane
hunterem po batchu X" — każda zmiana talii oznaczała polowanie na seedy;
rewolucja talii (M178, ADR 0023) dała 95 czerwonych testów naraz. Reguła: test
etykiet/przepływu budujesz DETERMINISTYCZNIE (putCard + execute +
describeGameEvent), a zamrożony seed pełnej partii jest uzasadniony tylko tam,
gdzie testowana jest cała partia (fingerprint, determinizm, panel end-to-end).
Fixtury talii bierz z talii JEDNOPLANOWYCH (worki są przejściowe — ADR 0023 §5).

## L51 (2026-08-20) — Efekt celowany bez klasyfikacji to remis wariantów; strażnik zamiast łatek

**Objaw:** klasa L50 po raz szósty (M96, M135, M138/Z1, M146, M156/F1,
M156/Q1+Q2): bot obdarowywał lifelink+indestructible stwora PRZECIWNIKA
(Lotusguard), rzucał prewencję „any target" we wroga (Withstand), przekazywał
liczniki +1/+1 najsłabszemu własnemu stworowi (Servant of the Scale). Efekt w
kontekście celowanym bez wyceny → wszystkie warianty remisują → pierwsza
oferta z listy.
**Przyczyna:** klasyfikacja żyje w rozproszonych miejscach (trzy tabele
heuristic-bota + `triggerTargetEffectFriendly` w game-state + gałęzie
per-effekt); nowy typ efektu nie wymusza żadnej z nich (wzorzec L28).
**Reguła:**
1. Typ efektu w triggerze z celem musi być sklasyfikowany: wrogi
   (`HOSTILE_TRIGGER_TARGET_EFFECTS`), przyjazny
   (`triggerTargetEffectFriendly`) albo przejrzany neutralny
   (`REVIEWED_NEUTRAL`). Pilnuje `test/bot-trigger-target-classification-guard.test.js`
   — czerwony PRZED merge, nie „głupi bot" po merge.
2. Przy nowym czarze/zdolności z celem uruchom sondę inwentaryzacji z
   `card-data.js`. Połowa tropów będzie fałszywa (L15). Od M157 to STAŁY
   strażnik obu ścieżek: `test/bot-trigger-target-classification-guard.test.js`
   (M156) i `test/bot-targeted-effect-valuation-guard.test.js`.
3. Klasyfikacja per ZDOLNOŚĆ, nie per efekt: [tap_permanent + add_counter
   stun] (Lodestone Needle) jest wroga przez dowolny efekt wrogi.
**Sygnał:** trzecia łatka w tej samej tabeli = inwentaryzacja wszystkich typów
i odwrócenie domyślności, nie czwarty wpis.

## L50 (2026-08-18) — Nowy typ efektu w karcie batcha wymaga WYCENY w heuristic-bocie

**Objaw:** dwie karty Batch 35 weszły z martwą wyceną: bot aktywował Basilisk
Gate ({2},{T}: +X/+X) na stwora PRZECIWNIKA i rzucał Twiddle na górę wroga w
swoim upkeepie (audyt Żywym Testerem M146) — testy engine zielone.
**Przyczyna:** nowe typy (`pump_by_gates`, `untap_permanent` w ścieżce czarów)
nie trafiły do wyceny; efekt spoza wyceny dostaje wartość domyślną, więc
wszystkie warianty remisują i bot bierze pierwszą ofertę z listy. Czwarte
powtórzenie klasy (M96, M135, M138/Z1).
**Reguła:** przy nowym typie efektu sprawdź wycenę w OBU ścieżkach
(`cast_spell`, `activate_ability`); sonda: grep typu w
`src/controllers/heuristic-bot.js` przed merge. Audyt Żywym Testerem po batchu
z nowymi mechanikami obejmuje partie, gdzie BOT ma te karty.
**Dopisek (M255/E, Thunderstaff):** klasa wraca przy efektach, których
odbiorcą jest ZBIÓR. `{2}, {T}: atakujące stwory dostają +1/+0 do końca tury`
nie miało wpisu w `TEMPORARY_PUMP_EFFECTS`, więc zdolność miała gołą bazę
(`score = 2`) i bot palił ją w Głównej 1 (transkrypt `tarkir-wur vs
warhammer-wu`, tura 16). Wspólny mianownik potrzebuje jeszcze
**reprezentanta zbioru**: `recipient` był źródłem (artefaktem), więc
`combatTrickWindow` nie zachodził i bot dostawał karę „poza oknem walki"
ZAWSZE. Reprezentant = własny atakujący z `view.combat` (ADR 0017). Test
anty-over-fix (M255/E2) pilnuje, że bot nadal UŻYWA zdolności w walce.

## L1 (2026-08-14) — „Bot robi coś głupiego" bywa ślepotą, nie głupotą

**Objaw (trzykrotny):** bot pompował liczniki Station bez końca (M84), celował
zdolnością w nielegalne obiekty (M82), rzucił Inspire Awe i atakował we własną
prewencję (M91). Za każdym razem zgłoszone jako „bot-idiota".
**Przyczyna:** `PlayerView` nie niosło danych potrzebnych do decyzji.
Kontroler dostaje WIDOK, nie stan (ADR 0003) — pole spoza widoku jest dla niego
fizycznie nieosiągalne.
**Reguła:** zanim uznasz zachowanie kontrolera za błąd heurystyki, sprawdź, czy
widok niesie potrzebne dane. Strojenie wag wokół brakującej informacji to
maskowanie objawu.
**Metoda audytu (do powtórzenia):** zestaw trzy zbiory — pola
`createGameState`, zawartość `playerView`, odczyty `view.X` w kontrolerach.
Pole obecne w stanie, nieobecne w widoku i wpływające na wybór komendy = luka
(audyt M92 znalazł pięć, w tym brak `types` permanentu).
**Strażnik:** [ADR 0017](decisions/0017-playerview-completeness-contract.md).

## L2 (2026-08-14) — Benchmark bota nie wykrywa błędów rzadkich mechanik

**Objaw:** po naprawie pięciu luk decyzyjnych (M92) pełna macierz (5616
meczów) dała wynik identyczny co do 0,1 pp.
**Przyczyna:** karty z daną mechaniką są w jednej–dwóch taliach na kilkanaście;
poprawka ginie w uśrednieniu.
**Reguła:**
- Benchmark to sieć bezpieczeństwa przed REGRESJĄ SIŁY GRY, nie detektor
  błędów decyzyjnych.
- Poprawkę mechaniki mierz pomiarem UKIERUNKOWANYM
  (`node tools/benchmark.mjs --seeds 20 --decks <talie z mechaniką>`): w M92
  pełna macierz 65,2% vs aggro, pomiar ukierunkowany 69,8%.
- Błędy decyzyjne wykrywa audyt kontraktu widoku, Żywy Tester i raport gracza.

## L3 (2026-08-14) — Kara w heurystyce musi przebić premię, inaczej jest martwa

**Objaw:** kara −70 za jałowe zagranie (destroy w cel z tarczą regeneracji) nie
zmieniła zachowania bota.
**Przyczyna:** scoring sumuje składniki: zaraz po karze ta sama gałąź dodawała
premię za „usunięcie permanentu przeciwnika", która ją przebijała.
**Reguła:** przy zagraniu JAŁOWYM (efekt z definicji nie zadziała) nie wystarczy
dodać karę — trzeba POMINĄĆ PREMIĘ (`continue`). Po zmianie wag sprawdź testem,
że decyzja się zmieniła; samo naliczenie kary niczego nie dowodzi.

## L4 (2026-08-14) — Odrzucona komenda nie może zmieniać stanu sesji

**Objaw:** gracz zostawał na ekranie z jedyną opcją „Poddaj partię"; w logu
`Ruch odrzucony: not_priority` (M90/B).
**Przyczyna:** `session.apply()` czyścił bufor modala i kasował pauzę bota
PRZED `execute()`, „defensywnie" zakładając powodzenie.
**Reguła:** stan UI/sesji mutujesz dopiero PO potwierdzeniu, że komenda została
przyjęta. Operacje „na wszelki wypadek przed" zostawiają niespójność na każdej
ścieżce błędu.

## L5 (2026-08-14) — Test na obecność kodu to nie test zachowania

**Objaw:** funkcja ptaszka wyciszenia miała pięć zielonych testów, a nie
działała dla czarów z wariantami (M91/B).
**Przyczyna:** testy regexami sprawdzały, czy w źródle są identyfikatory
(`ignoredOptionKeys`, `action-ignore`). Kod istniał, ale nie był wywoływany dla
tej ścieżki UI.
**Reguła:** testy UI renderują i sprawdzają WYNIK (drzewo elementów, reakcja na
zdarzenie), nie obecność napisów w pliku. Testy na źródło tylko jako
uzupełnienie (strażnik konfiguracji). Kontrola: wyłącz fix i sprawdź, czy test
czerwienieje (mutacja).

## L6 (2026-08-14) — Zdarzenie musi nieść dane, których opis nie odtworzy

**Objaw:** log i modal „Ruch przeciwnika" nie mówiły, który tryb czaru
modalnego wybrał bot: Ruinous Rampage wyglądał identycznie niezależnie od
wyboru (M91/D).
**Przyczyna:** `describeGameEvent` jest czystą funkcją bez dostępu do rejestru
kart (świadomie — testowalna headless). Zdarzenie niosło `modeIndex`, ale nie
nazwę trybu.
**Reguła:** projektując zdarzenie, sprawdź, czy warstwa opisu ma WSZYSTKO do
zbudowania komunikatu. Jeśli wymagałaby rejestru albo stanu — dołóż dane do
zdarzenia.

## L7 (2026-08-14) — Weryfikuj stan repozytorium, nie treść zlecenia

**Objaw:** handoff stwierdzał, że pięć fixów przepadło z working tree poprzedniej
sesji; audyt `main` wykazał, że cztery są w repo wraz z testami (M90).
**Przyczyna:** opis zadania powstał z pamięci o przebiegu sesji, nie z pomiaru
stanu repozytorium.
**Reguła:** repo, testy i dokumentacja są źródłem prawdy (AGENTS.md). Sesję
zaczynaj od pomiaru (`npm test`, `npm run build`, `git log`), nie od przyjęcia
zlecenia na wiarę. Rozbieżność zgłoś jawnie.

## L8 (2026-08-14) — `git checkout <plik>` cofa także własne, niezacommitowane zmiany

**Objaw:** przy usuwaniu tymczasowego `console.error` przez `git checkout`
zniknął też fix wprowadzony w tym samym pliku (M90).
**Reguła:** przed instrumentowaniem kodu ZACOMMITUJ fix albo przywracaj zmiany
punktowo (edycja odwrotna). Po każdym `git checkout` sprawdź `git diff`/testem,
że zamierzona zmiana istnieje.
**Więcej pułapek:** [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md).

## L9 (2026-08-14) — Praca istnieje dopiero po `git push`

**Objaw (dwukrotny):** (a) handoff twierdził, że pięć fixów przepadło z
workspace — bo nie zostały wypchnięte; (b) sandbox odtworzył workspace ze
świeżego klona w środku pracy i commit wylądował na `main`.
**Przyczyna:** nowa sesja Areny widzi wyłącznie `main` na GitHubie i treść
pierwszego promptu (ADR 0013). Środowisko może zresetować workspace w trakcie
sesji (reflog: `clone: from …`).
**Reguła:**
- Commituj i pushuj po każdym samodzielnie zielonym kroku, nie zbieraj
  commitów „na koniec".
- Po commicie sprawdź `git log --oneline -1` (czy HEAD tam, gdzie trzeba).
- Po resecie workspace: `git fetch origin <gałąź>` + `git reset --hard
  FETCH_HEAD`; commit omyłkowo na `main` przenieś `cherry-pickiem` (najpierw
  `git branch backup-… <sha>`).
- Co ma przetrwać sesję, musi być W REPOZYTORIUM: ustalenie z czatu bez pliku
  nie istnieje.
**Procedury:** [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md) §1–2.

## L10 (2026-08-14) — Zanim zaczniesz szukać winy w konfiguracji, sprawdź dane

**Objaw:** właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani
informacji o CI. Odruch: szukać błędu w workflow albo w ochronie gałęzi.
**Diagnoza (4 zapytania):** (1) `gh pr view --json state,mergeable,
mergeStateStatus,statusCheckRollup` → `MERGEABLE`, `CLEAN`, check `test` =
`SUCCESS`; (2) `git ls-remote origin <gałąź>` vs `head_sha` runu CI → ten sam
commit; (3) `gh api repos/…/rules/branches/main` → reguły, `reviewThreads.
totalCount = 0`; (4) `githubstatus.com/api/v2/summary.json` → brak incydentów.
**Wniosek:** stan po stronie GitHuba był poprawny — objaw dotyczył warstwy
prezentacji u zgłaszającego (cache przeglądarki).
**Reguła:** przy „coś nie działa w UI GitHuba" zbierz TWARDE DANE Z API przed
zmianą konfiguracji. Zmiana ustawień pod objaw widoczny w jednej przeglądarce
potrafi zepsuć działający setup.

## L11 (2026-08-14) — Jak skutecznie polować na błędy vs Comprehensive Rules

**Kontekst:** wyzwanie „znajdź 10 błędów" (M95) na engine z 1600 testami.
Punktowe sondy „sprawdźmy regułę X" dawały głównie potwierdzenia; realne błędy
wyszły z technik systemowych.
**Skuteczność (od najlepszej):**
1. **NIESPÓJNOŚĆ między podobnymi implementacjami** — jeśli dwa analogiczne
   efekty robią to samo inaczej, jeden jest błędem (`bounce_permanent` zwracał
   kartę właścicielowi, `destroy_permanent` nie → CR 400.3 złamane — M95 bug 2).
2. **Skan strukturalny zamiast scenariuszowego** — zestaw KOMPLET pól obiektu
   przed i po operacji (jeden skan dał trzy błędy: tapped, damagedThisTurn,
   attackedThisTurn).
3. **Ręczne obejścia jako sygnał** — `grep -c "tapped: false"` pokazał 12
   miejsc ustawiających to samo pole: brak naprawy u źródła.
4. **Skan katalogu kart** (Oracle vs pola) — dobry na braki, ale w dojrzałym
   katalogu daje głównie fałszywe alarmy (reminder text, inne nazwy pól).
5. **Punktowe sondy CR** — najsłabsze na dojrzałym kodzie, niezastąpione do
   POTWIERDZENIA poprawności obszaru.
**Reguła:** kandydat wymaga repro headless PRZED naprawą i odróżnienia błędu
reguł od artefaktu testu (`addObject` domyślnie `summoningSickness: false`,
`pendingScry` wymaga `objectIds` — oba dały fałszywe alarmy). Warto spisać
obszary sprawdzone i POPRAWNE.

## L12 (2026-08-14) — Narzędzie audytowe też jest produktem: braki naprawiaj w nim

**Objaw:** audyt Żywym Testerem (M96) stanął na `[STOP] brak akcji` w oknie z
przyciskiem „Epic Experiment: zakończ (reszta kart do grobu)". Człowiek by go
kliknął — to była luka w polityce gracza (`pickAction`), nie błąd UI.
**Ryzyko:** reakcja „ta talia się nie testuje" albo zmiana seeda cicho zawęża
zakres kolejnych audytów; po czasie nie widać, że całe mechaniki nigdy nie
były sprawdzone na żywym stole.
**Reguła (decyzja właściciela):** jeśli tester czegoś nie widzi albo nie
obsługuje — POPRAWIAMY TESTER, nie akceptujemy braku. Zmiany w narzędziu idą
tym samym rygorem co produkcja (test + opis w commicie).
**Druga strona:** odróżniaj ARTEFAKT NARZĘDZIA od BŁĘDU PRODUKTU (jsdom nie
liczy CSS ani nakładek, więc sklejony wskaźnik tury i brak P/T na kaflach w
transkrypcie NIE są błędami UI). Zanim zgłosisz bug, potwierdź źródło w kodzie.
**Checklisty:** `docs/setup/TESTER_STOLU.md` → „Czego szukać".

## L13 (2026-08-15) — Detektor, którego nie zweryfikowałeś mutacyjnie, nie działa

Dziewięć detektorów Żywego Testera miało komplet testów jednostkowych i było
„gotowe"; weryfikacja mutacyjna (świadome przywrócenie naprawionego buga)
pokazała co innego:
1. `detectNoResponseWindow` zgłaszał FAŁSZYWY alarm pod `--quiet` (czar
   „Index": jedynym dowodem „okno było" była linia snapshotu, której w tym
   trybie nie ma).
2. `detectDeadEndWindow` pod `--quiet` widział JEDNO okno na partię zamiast
   wszystkich.
3. Przypadku właściciela „ekran z samym *Poddaj partię*" żaden z czterech
   profili nie potrafił odtworzyć (wszystkie najpierw zamykały modal ruchu
   bota) — trzeba było dopisać profil `impatient` (double-tap z telefonu).

Test jednostkowy dowodzi, że detektor reaguje na SPREPAROWANE wejście, nie że
takie wejście powstanie w prawdziwym przebiegu.
**Reguła:** każdy detektor przechodzi cykl „przywróć bug → narzędzie zgłasza →
przywróć fix → 0 zgłoszeń", w OBU trybach logowania. Jeśli buga nie da się
odtworzyć żadnym profilem, brakuje PROFILU, a nie dowodu, że błędu nie ma.
**Efekt uboczny:** przy tej weryfikacji wyszły trzy realne błędy produkcyjne
(log „wskazuje **?** z ręki przeciwnika", brak rozstrzygnięcia czaru bota w
modalu i brak jego skutku `+3/+3`).

## L14 (2026-08-15) — Jedna instrukcja, dwie zasady: sklejone reguły to gotowy bug

M101/B5 (CR 302.6) i B6 (CR 702.19b) to ten sam błąd w dwóch miejscach silnika:
**dwie niezależne zasady wyrażone jedną instrukcją** — gdy jedna przestawała
obowiązywać, druga znikała razem z nią.
- **B5:** `untapControlled` kasowało chorobę przywołania w tej samej linii, w
  której odkręcało permanent (`{ tapped: false, summoningSickness: false }`).
  Każda blokada odkręcania (licznik stun, untap-lock) robiła `continue` PRZED
  tą linią i zabierała zdjęcie choroby: stwór pod blokadą zostawał chory na
  zawsze, bo CR 302.6 mówi o CIĄGŁOŚCI KONTROLI, a kod pytał o FAKT
  ODKRĘCENIA.
- **B6:** `validateDamageAssignment` pilnowało sumy i kolejności lethal
  (CR 510.1d) — wystarcza przy braku trample. Reguła trample (CR 702.19b:
  nadmiar na gracza dopiero po lethal dla WSZYSTKICH blokerów) była osobnym
  warunkiem, a nadmiar nie jest jawną pozycją przydziału (silnik liczy go jako
  `remaining`), więc nikt go nie sprawdzał.

**Wzorzec:** reguła B obowiązywała „przy okazji" reguły A. Kod nie był zły, był
NIEDOSPECYFIKOWANY — w miejscu, gdzie testy przechodziły, bo szczęśliwa
ścieżka pokrywała obie naraz.
**Reguła:** jedna instrukcja = jeden punkt CR, nawet gdy dziś dają ten sam
wynik. Polując na błędy, pytaj nie „co ten kod robi?", tylko „od czego ten kod
UZALEŻNIA regułę i czy CR uzależnia ją tak samo?" (B5 wyszedł z pytania, czy
choroba przywołania naprawdę zależy od odkręcenia).
**Nie każdy trop to błąd:** crew/saddle przeszło 9 sprawdzeń (timing, stos,
chore stwory, „other creatures", typ Artifact, cleanup) BEZ znalezisk — warto
to zapisać, żeby następna sesja nie badała drugi raz. Pilnuj tylko, by narzędzie
repro nie kłamało: pozorna utrata typu `Artifact` okazała się luką skryptu
(`gameObjectDataOf` nie zwraca `types`; prawdziwa ścieżka to `createCardDeck`).

## L15 (2026-08-16) — Gdy detektory milkną, szukaj „ofert bez skutku" (M102)

Audyt Żywym Testerem dał 10 błędów, ale po U7 narzędzie zamilkło (14 partii,
11 kombinacji talii, 4 profile, zero trafień). Trzy ostatnie znalazły się po
zmianie pytania: zamiast „czy coś wygląda źle?" — **„czy panel oferuje akcję,
która nic nie zmienia albo jest pewną stratą?"**. To pytanie o INTENCJĘ: silnik
był w każdym przypadku zgodny z CR.
- **U8:** czar z kosztem „poświęć stwora" mógł celować w tego samego stwora
  (legalne, CR 601.2c/601.2h; kończy się fizzlem 608.2b) i był PIERWSZĄ
  propozycją UI.
- **U9:** equip na stwora, który już nosi ten sprzęt (kliknięte 5× w partii).
- **U10:** fizzle zdolności logowany identycznie jak sukces — czytelnik panelu
  honorował flagę `fizzled` wyłącznie dla equipa.

**Wniosek:** zgodność z zasadami to DOLNA granica jakości. Skan „powtórzona
akcja z tym samym celem" (`grep -ohP "^\s*>> \K.*" transkrypt | uniq -d`) dał
dwa z trzech błędów.
**Druga część:** przy takim polowaniu POŁOWA tropów to fałszywe alarmy (4 na 7)
— każdy zweryfikowany zapisz z uzasadnieniem. Szczególnie zdradliwe są
artefakty własnych narzędzi („brak badge'a wyposażenia" = luka
`extractTileText` nie czytającego `.ovl`).

## L16 (2026-08-16) — Sonda „oferta bez skutku" wymaga, by OCZEKUJĄCA DECYZJA była stanem (M103)

**Objaw:** detektor `noop` (automatyzacja L15) dostał fałszywy alarm na
craftcie Lodestone Needle: „jedyna zmiana to zapłacony koszt", choć kliknięcie
otwierało WYBÓR artefaktu do wygnania.
**Przyczyna:** `stateFingerprint` pomijał 36 pól wstrzymujących grę (w tym
`pendingCraftExile`), więc dwa stany różniące się oczekującą decyzją miały TEN
SAM fingerprint. Osłabiało to też weryfikację replayów (M101/B2).
**Reguła:** każda struktura BLOKUJĄCA priorytet musi być częścią
fingerprintu — generyczna sekcja `pendingDecisions` z listą
`PENDING_DECISION_FIELDS`; nowe pole wstrzymujące MUSI na nią trafić. Obrona w
głąb sondy: po symulacji sprawdza, czy okno priorytetu ma pass (brak passu =
komenda otworzyła decyzję).

## L17 (2026-08-16) — Bundler jednoplikowy nie zna aliasów importów, a jsdom nie zna structuredClone (M103)

**Objaw:** sonda „oferta bez skutku" działała w Node, a w artefakcie umierała
(„runProbeCommandEffect is not defined", potem „structuredClone is not
defined"). `npm test` tego nie widzi: build jest sprawdzany pod kątem
determinizmu, nie wykonania nowych ścieżek.
**Przyczyna:** (1) `tools/build.mjs` skleja moduły w JEDEN scope
(`assertNoNameCollisions`) — `import { x as y }` nie tworzy wiązania, a build i
testy kolizji milczą (w repo NIE ma ani jednego aliasu: to konwencja).
(2) Artefakt wykonuje się w realmie jsdom bez `structuredClone`.
**Reguła:** kod trafiający do artefaktu: (a) bez aliasów importów, (b) żadnych
Node-globali (`structuredClone`, `Buffer`, `process`), (c) po zmianie mostka
artefaktu zweryfikuj go Żywym Testerem na ZBUDOWANYM pliku.

## L18 (2026-08-16) — W detektorze „koszt vs skutek" tylko WŁASNE życie może być kosztem (M103)

**Objaw:** sonda zgłosiła Welder Automaton („{3}{R}: 1 obrażenie każdemu
przeciwnikowi") jako „jedyna zmiana to zapłacony koszt" — jedyną różnicą był
spadek życia PRZECIWNIKA, a sonda śledziła wyłącznie życie gracza sondy.
**Reguła:** życie PRZECIWNIKA to ZAWSZE skutek (przeciwnik nie płaci naszych
kosztów); życie WŁASNE bywa kosztem (ujemna delta) albo skutkiem (zysk).
Analogicznie: tapnięcia cudzych permanentów to skutek, własnych lądów — koszt
many. Przy nowym „liczniku kosztów" sprawdź jego lustrzane odbicie po stronie
przeciwnika.

## L19 (2026-08-16) — Enumeracja wariantów kombinacyjnych musi mieć cap, zanim zobaczy ją bot (M103)

**Objaw:** próbka regresji (1248 meczów) spowolniła ~2×, a modal dla gracza
rósł w setki opcji — po dodaniu wyceny `cast_escape`. Wcześniej warianty Escape
(Sweet Oblivion) nie miały wyceny (0) i bot je pomijał, więc nikt nie czuł, że
`legalEscapeCasts` enumeruje WSZYSTKIE C(n, 4) podzbiory: 10 kart w grobie =
210 podzbiorów × 2 cele = 420 wariantów na okno.
**Reguła:** każda enumeracja kombinacyjna w `legal*Casts`/`legal*Options`
dostaje LIMIT w dniu narodzin (`COMBAT_OPTION_CAP`, `CREW_OPTION_CAP`,
`ESCAPE_OPTION_CAP` — 32) z porządkiem deterministycznym (ADR 0005). „Bot i tak
nie wybierze gorszego" nie jest argumentem: wycena punktuje KAŻDY wariant.
Kanarek eksplozji: czas próbki (~140 s / 1248 meczów).

## L20 (2026-08-16) — Detektor mierzy tylko to, co narzędzie KLIKNIE — skanuj całe okno

**Objaw:** weryfikacja mutacyjna bramki ofert (M104) nie zadziałała: po
cofnięciu bramki panel oferował „Aktywuj: Rustvine Cultivator — odkręć → cel:
Forest", a oś `noop` raportowała zero. Detektor był sprawny — polityka gracza
klikała w tych oknach co innego, a sonda mierzyła WYŁĄCZNIE kliknięcie.
**Przyczyna:** pomiar przypięty do akcji gracza (jedna sonda na kliknięcie), a
przestrzeń ofert jest o rząd wielkości większa niż liczba kliknięć.
**Reguła:** gdy sonda pracuje na KLONIE stanu, mierz KAŻDĄ ofertę widoczną w
oknie (z dedupem po kluczu opcji i limitem na partię). Pytanie ogólne: czy
pomiar obejmuje całą przestrzeń, którą widzi gracz, czy tylko ścieżkę
sterownika? (Ujawniło w M104 dwa braki naraz: nieskanowane opcje modali i
oferty panelu.)

## L21 (2026-08-16) — Pole spoza kontraktu fabryki obiektu ginie po cichu (martwy test)

**Objaw:** testy „Rustvine: odkręć docelowy ląd" tworzyły ląd przez
`addObject(state, { …, tapped: true })` i asertowały
`state.objects.get('land').tapped === false` — przechodziły od zawsze, bo
`addObject`/`createGameObject` nie mają `tapped` w destrukturyzacji (stan
bojowy nadają efekty): ląd powstawał ODKRĘCONY, a asercja sprawdzała stan
początkowy. Wyszło dopiero, gdy bramka ofert M104 przestała oferować odkręcanie
nietapniętych lądów.
**Przyczyna:** fabryka przyjmuje konfigurację i ignoruje nieznane klucze (bez
ostrzeżenia). To samo dotyczy `summoningSickness`, `counters`, `cantBlock`.
**Reguła:** stan spoza kontraktu ustawiaj JAWNIE po dodaniu obiektu
(`state.objects.set(id, Object.freeze({ ...obj, tapped: true }))`). Sprawdź, czy
asercja rozróżnia stan POCZĄTKOWY od skutku.
**Domknięte w M137:** `addObject` porównuje klucze z `ADD_OBJECT_FIELDS` i dla
pola spoza kontraktu wypisuje ostrzeżenie z podpowiedzią (`ADD_OBJECT_HINTS`)
raz na pole; `MTG_STRICT_ADD_OBJECT=1` zamienia je w wyjątek. Twardy rzut
wywalił 141 testów, bo pola wchodzą przez `...spread` w helperach (46 plików) —
żaden statyczny fixer ich nie złapie, stąd tryb ostrzegawczy. Lekcja sama
znalazła ofiarę: „BUG3 amass" oczekiwał 2 liczników, bo startowy z `counters:`
ginął w fabryce (poprawne 3).

## L22 (2026-08-16) — Akcja, która PRZEWIJA grę, musi kończyć się ponownym renderem

**Objaw:** po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne tapnięcie
gracza kończyło się „Ruch odrzucony: illegal_cast: Zagranie poza main phase" /
„not_priority" (3 przypadki w macierzy M104; przy `--tick-rate 0` żadnego).
Ruchy bota z tego momentu nie trafiały do modala „Rozgrywka".
**Przyczyna:** `toggleIgnoredOption` renderował panel, a DOPIERO POTEM wołał
`session.recheckAutoPass()`, które przewija grę (auto-pass, tura bota). Po
przewinięciu nie było renderu, więc na ekranie został panel z MINIONEGO okna —
z komendami sprzed przewinięcia.
**Reguła:** każda ścieżka UI mogąca zmienić stan gry (`apply`,
`continueBotPlay`, `recheckAutoPass`, wznowienie zapisu) kończy się tą samą
sekwencją co `playDirect`: **zapis → render → pokaż ruchy bota**. Render PRZED
zmianą stanu nie jest renderem po zmianie. Objaw klasy: odrzucane komendy tuż
po akcji „nic nie robiącej" w grze (przełącznik, ptaszek, zamknięcie modala) —
szukaj brakującego renderu, zanim podejrzewasz reguły.

## L23 (2026-08-16) — Koszt karty to DANE: pipy kolorowe i mana value weryfikujesz maszynowo

**Objaw:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" zapisane
jako sama liczba many (zdolność opłacalna dowolnym kolorem) oraz {2}{U}
zapisane jako `manaCost: 2` (karta o manę tańsza). Testy kart sprawdzają
SKUTEK zdolności, nie to, czy dało się ją opłacić złym kolorem.
**Przyczyna:** koszt żyje w dwóch reprezentacjach (`MANA_COSTS[id]` jako string
Oracle i `manaCost`/`cost.colors` jako dane silnika) bez bramki między nimi.
**Reguła:** dane w dwóch reprezentacjach dostają strażnika porównującego je
maszynowo (`manaCost` = mana value stringa kosztu dla KAŻDEJ karty; osobny skan
porównuje pipy linii „{koszt}: efekt" z `cost.colors`). Skanery, które trafiły,
zostaw w pakiecie jako test-strażnik.

## L24 (2026-08-16) — „Cichy skutek" to błąd informacyjny: efekt bez zdarzenia nie istnieje dla gracza

**Objaw:** czar za 3 many (Hysterical Blindness, −4/−0 stworom przeciwnika)
rozstrzygał się, a log i panel pokazywały tylko „zostaje rozstrzygnięty". To
samo: Turn the Tide, Angel of the Dawn, Jyoti. Gracz nie miał JAK się
dowiedzieć, co zrobiła jego karta.
**Przyczyna:** efekt zapisywał stan bezpośrednio (`state.untilEndOfTurnBuffs`,
`modifyStats` wyciszony jako szum) i nie emitował zdarzenia; testy silnika
sprawdzają SKUTEK w stanie, nie istnienie zdarzenia.
**Reguła:** każdy efekt zmieniający widoczny stan emituje zdarzenie — także
„tylko" modyfikator statystyk; dla wielu obiektów JEDNO zdarzenie zbiorcze z
listą, nie N osobnych (i tak wyciszonych jako szum). Pytanie przy dodawaniu
efektu: „co zobaczy gracz w logu?" — „nic" oznacza brak zdarzenia. Wyciszanie
klasy zdarzeń jako szumu (M99: `stats_modified`) wymaga sprawdzenia, czy dla
którejś karty ta klasa nie jest CAŁĄ treścią.

## L25 (2026-08-17) — Test scenariuszowy nie może zależeć od tego, KTO wykonał akcję

**Objaw:** po dołożeniu jednej karty do `decks/green.txt` posypało się pięć
testów niezwiązanych z nowymi kartami („log nie opisuje tworzenia tokenu",
„nie znaleziono żadnej okazji zagrania", „żaden seed nie dał własnego
surveil"). Jeden był inny: token POWSTAŁ i log go opisał — „Ty tworzysz
token", a asercja szukała „tworzy token". Wcześniej ten sam seed dawał token
BOTA.
**Przyczyna:** warstwa opisu odmienia czasownik zależnie od gracza („tworzysz"
/ „tworzy"), a test trafił w jedną z form; zmiana talii przetasowała rozgrywkę.
**Reguła:** asercja na TREŚĆ logu opisuje zdarzenie, nie osobę — dopuszczaj
obie formy (`/tworzy(sz)? token/`) albo sprawdzaj zdarzenie w
`session.state.events`. Każdy seed zamrożony w teście dostaje komentarz
„przelosowany po zmianie X"; po batchu kart przejrzyj WSZYSTKIE testy grające
pełne partie.

## L26 (2026-08-17) — Strażnik z klauzulą „brak danych = pomijam" nie jest strażnikiem

**Objaw:** w katalogu siedział adres ilustracji, którego nikt nie pobrał ze
Scryfalla (`…/large/front/9/1/91b1f0f3-krumar-initiate.jpg` — nazwa karty w
miejscu UUID zdradza, że powstał „z głowy"). Efekt: 404 i karta bez ilustracji,
mimo istniejącego testu „imageUri każdej karty zgadza się z plikiem Scryfall".
**Przyczyna:** test miał `if (!expected) continue` — brak pliku
`docs/cards/scryfall-<id>.json` = nie sprawdzam. Dwadzieścia kart dwóch batchy
weszło BEZ pliku źródłowego (ADR 0010 §2a): im więcej kart z pominięciem
procedury, tym mniejszy zasięg testu — a zielony wynik sugerował coś
odwrotnego.
**Reguła:** każda klauzula „nie mam danych, więc przepuszczam" wymaga DRUGIEGO
testu na OBECNOŚĆ tych danych. Pytanie przy strażniku: „co się stanie, gdy dane
wejściowe znikną?" — „test przejdzie" oznacza brak bramki.
**Przy okazji:** ta sama sonda wykryła cztery rozjazdy TEKSTU reguł, w tym
realny błąd: Cellar Door miał w katalogu „Target player mills 1", a Oracle mówi
„puts the bottom card of their library into their graveyard" (mechanika
poprawna — `mill_from_bottom`, błędny był tekst dla gracza). **`oracleText` to
też dane do maszynowej weryfikacji** (L23), nie komentarz.

## L27 (2026-08-17) — Zero zgłoszeń detektorów znaczy „nie mam takiej reguły", nie „jest czysto"

**Objaw:** dwanaście partii Żywego Testera (8 kombinacji talii, 5 profili)
zakończyło się „DETEKTORY: brak zgłoszeń". Ręczna lektura tych samych
transkryptów dała pięć realnych błędów w pół godziny: log nie odmieniał
liczników („dostaje +2 licznik"), mulligan pokazywał 35 opcji z piętnastoma
nieodróżnialnymi, koszt „{2},{T}" renderował się jako „T2", bot filtrował manę
bez powodu.
**Przyczyna:** detektory sprawdzały to, co poprzednie audyty już znalazły
(placeholdery, powtórzenia, oferty bez skutku, martwe okna); żaden nie patrzył
na GRAMATYKĘ tekstu ani na odróżnialność opcji modala.
**Reguła:** raport detektorów to DOLNA GRANICA, nigdy potwierdzenie jakości.
Każda sesja audytowa czyta transkrypt ręcznie wzdłuż osi z
`docs/setup/TESTER_STOLU.md`, a **każda klasa błędu znaleziona ręcznie kończy
się nowym detektorem**. Detektor bez weryfikacji wstecznej na archiwum (czy
zgłasza znane znalezisko? czy milczy na poprawnych danych?) jest wart tyle, co
jego brak.
**Pułapka techniczna:** `\b` w regexie NIE działa po polskich znakach
diakrytycznych („kartę" → granica przed „kart" daje fałszywe alarmy). Granicę
wyrazu w polskim tekście sprawdzaj przez `(?![\p{L}])` z flagą `u`.

## L28 (2026-08-17) — Kary dopisywane „przy okazji zgłoszenia" zostawiają dziurę na każdy nowy typ

Bot tapował własne stwory (Chill of the Grave, Entrancing Lyre) i zakładał
aurę-kotwicę na własnego stwora, choć kary za niszczenie/wygnanie/obrażenia we
własne rzeczy istniały od M91–M96. Powód to WZORZEC PRACY, nie „zapomniany
przypadek": każda kara powstawała jako reakcja na zgłoszenie i obejmowała
jeden typ efektu; nowy typ startował bez ochrony.
**Reguła:** dla rodziny reguł tego samego kształtu („nie rób X samemu sobie")
buduj **tabelę typów + jedną funkcję egzekwującą**, nie n rozproszonych `if`.
Sygnał: druga/trzecia łatka tego samego kształtu = inwentaryzacja WSZYSTKICH
typów (tu: 44 z `card-data.js`) i odwrócenie domyślności.
**Towarzysząca zasada:** testy ANTY-OVER-FIX obowiązkowe — kara na „własny cel"
trywialnie degeneruje się w paraliż, więc każdy naprawiony przypadek ma
bliźniaczy test, że karta nadal działa na permanent przeciwnika.

## L29 (2026-08-17) — Fallback `?? slug` to cichy wyciek, nie zabezpieczenie

Trzy z dziesięciu błędów M122 miały ten sam kształt: gracz widział surowy
identyfikator (`trigger (enchanted_permanent_tapped)`, `efekt
(attach_equipment_to_source)`, `trigger (delayed)`), bo mapa etykiet kończyła
się `LABELS[key] ?? key`. Taki fallback nie wywala się i nie loguje ostrzeżenia
— wypuszcza wewnętrzną nazwę do UI.
**Reguła:** wszędzie, gdzie jest mapa „identyfikator → tekst dla gracza",
napisz **test-niezmiennik**: każdy klucz występujący w danych ma wpis w mapie.
Inwentaryzacja jest tania (jeden przebieg po rejestrze) i wyłapuje całą rodzinę
(przy 35 eventach triggerów tester trafił 1 z 2 braków, przy 121 typach efektów
— 1 z 9).
**Pułapka:** skanuj też źródła spoza bazy danych. Pierwsza wersja strażnika
czytała wyłącznie `card-data.js` i przepuściła `delayed`, bo ten event rodzi się
w `src/engine/triggers.js`. Niezmiennik jest wart tyle, ile kompletność zbioru,
po którym iteruje.

## L30 (2026-08-17) — Ukrycie informacji musi być zrobione w KAŻDEJ ścieżce renderu

Modal „Rozgrywka" pokazywał ilustrację karty dobranej przez bota, choć tekst
wpisu był poprawnie bezimienny („Nieprzyjaciel dobiera kartę"). Powód: wpis ma
DWIE niezależne ścieżki renderu — tekst z `describeGameEvent` i miniaturkę z
`entry.cardId`; zabezpieczono pierwszą, o drugiej zapomniano, bo powstała
później (M89, dla Curate).
**Reguła:** przy informacji ukrytej (ręka, biblioteka, face-down) pytaj nie „czy
ukryłem nazwę?", tylko „ILE jest ścieżek, którymi ta karta może dotrzeć do oczu
gracza?" (tekst, miniaturka, alt, tooltip, log, podgląd strefy). Najbezpieczniej
odciąć dane u ŹRÓDŁA (nie wpuszczać `cardId` do wpisu).
**O testowaniu:** asercja „czy ta karta jest gdzieś w ręce bota" jest za słaba i
daje fałszywe alarmy (bot zagrał Zoraline jawnie, druga kopia leżała w ręce) —
sprawdzaj strefę docelową KONKRETNEGO zdarzenia (naprawa zostawia jawny ślad
`hiddenDestination`).

## L31 (2026-08-17) — Strażnik kompletności słownika nie zastępuje strażnika miejsc użycia

M122 naprawiło wyciek sluga do logu i dołożyło test „każdy event triggera ma
wpis w TRIGGER_EVENT_LABELS". Test zielony, a właściciel zobaczył „Chronic
Flooding — trigger (enchanted_permanent_tapped)": ten sam `case` miał TRZY
gałęzie `return` i tylko jedna sięgała po słownik. Strażnik pilnował DANYCH,
błąd siedział w KODZIE.
**Reguła:** dla mapy „identyfikator → tekst" potrzebne są DWA niezmienniki:
(1) słownik pokrywa wszystkie wartości z danych, (2) kod nie wstawia surowego
identyfikatora z pominięciem słownika (test czytający źródło:
`assert.doesNotMatch(body, /\(\$\{e\.trigger\}\)/)`).
**Powiązane:** gdy właściciel mówi „przycisk jest nieaktywny", zweryfikuj to
dosłownie — tu `disabled` było `false`: przycisk działał, ale jego jedyny
skutek (czyszczenie pustego zaznaczenia) był niewidoczny. „Brak skutku" prowadzi
do innej naprawy niż „element zablokowany".

## L32 (2026-08-17) — Gdy druga enumeracja tworzy duplikat, dedupuj wynik, nie dokładaj bramki

Karta z flash pojawiała się w panelu dwa razy (`playerView` enumeruje ją w
blokach flash i main-phase). Istniała już bramka na ten przypadek — tylko dla
AUR. Trzecia bramka rozwiązałaby zgłoszenie i zostawiła lukę dla czwartego
bloku.
**Reguła:** niezmiennik nakładaj na WYNIK („żadna komenda nie powtarza się w
ofercie"), nie na każde źródło. Koszt znikomy, ochrona obejmuje bloki, które
dopiero powstaną (ten sam wzorzec: mulligan M119/Z3, szukanie M122/#2 — trzy
zgłoszenia tego samego kształtu znaczą, że reguła należy do warstwy wyjścia).
**Anty-over-fix:** dedup idzie po PEŁNEJ tożsamości komendy, nie po
`type`+`objectId` — aura z trzema celami to trzy RÓŻNE decyzje.

## L33 (2026-08-17) — Narzędzie audytu, które „porządkuje" dane, kłamie o stanie gry

Transkrypt Żywego Testera zwijał identyczne kafle (klucz: 40 znaków tekstu):
dwa realne permanenty widniały jako jeden. Gdy panel akcji pokazał dwie grupy
„Cel zdolności: Guidestone Compass", a stół — jeden, diagnoza poszła w stronę
nieistniejącego błędu UI. Prawda była odwrotna: UI miało rację, kłamał snapshot
(drugi Compass to token-kopia z Cogwork Assemblera).
**Reguła:** w narzędziu audytowym deduplikacja jest wrogiem — skracaj wyjście
JAWNIE i bez utraty liczności („×2"). Gdy obraz stołu przeczy panelowi akcji,
najpierw podejrzewaj NARZĘDZIE (L33): panel czyta stan bezpośrednio, transkrypt
przechodzi przez ekstrakcję.

## L34 (2026-08-17) — Kopia „przed naprawą" zrobiona PO edycji kłamie, że test działa

Weryfikacja mutacyjna testu M128 (uwaga B) dwa razy dała fałszywy wynik:
(1) `cp bot.js /tmp/bot.bak` wykonane PO edycji — porównywałem nowy kod z
nowym; (2) asercja sprawdzała `abilityIndex 0` (zdolność many), a bot w tym
stanie sięgał po `abilityIndex 1` (scry).
Prawdę dało: (1) `git show HEAD:<plik>` jako wersja sprzed zmiany, nigdy
lokalna kopia „gdzieś po drodze"; (2) skrypt wypisujący FAKTYCZNIE wybraną
komendę zamiast predykatu.
**Reguła:** mutacja jest wiarygodna tylko gdy wersja bazowa pochodzi z gita,
a diagnostyka drukuje pełną decyzję. Zanim uznasz test regresyjny za dobry,
zobacz go CZERWONYM przeciw wersji sprzed naprawy (`git stash`/`git show`).
Test, którego nigdy nie widziałeś czerwonego, jest opisem bieżącego zachowania
(rozszerzenie L27 na własne narzędzia).

## L35 (2026-08-17) — Nowy widget dziedziczy dług dotykowy, jeśli rodzina nie ma reguły

Uwaga C właściciela („ptaszki w wyborze atakujących za małe na telefonie") nie
była regresją: te pola NIGDY nie miały CSS. Klasy `.combat-wizard-*` istniały w
JS od M66, ale w `index.html` nie było dla nich reguły — przeglądarka
renderowała checkbox ~13-16 px. Identyczny problem rozwiązano w M91 dla
ptaszka wyciszenia (`.action-ignore`), ale poprawka nie objęła drugiego miejsca,
bo nikt nie zapytał „gdzie jeszcze mamy pola wyboru".
**Reguła:** przy poprawce ergonomii dotyku pytaj o RODZINĘ kontrolek (wszystkie
checkboxy / steppery), nie o zgłoszony widget. Jedno zapytanie o
`type = 'checkbox'` i `ghost-btn` wskazało trzy miejsca (atakujący, blokujący,
steppery przydziału obrażeń) — dwa jeszcze niezgłoszone.
**Strażnik:** próg liczbowy (44 px wg Apple HIG) czytający źródło CSS — styl nie
ma reprezentacji w testach DOM-owych.

## L36 (2026-08-17) — Próg regresji na małej próbce mierzy szum, nie jakość

Dosypanie lądów do czterech talii (M132) zbiło benchmark z 61,5% na 56,3% vs
aggro i zapaliło próg regresji, choć **bota nie ruszono**. Odruch „cofnij talie
albo obniż próg" byłby błędem: na szerszej próbce bot wyszedł SILNIEJSZY.
```
 4 seedy (1 248 meczów) → 56,3 %   ← próbka progu
 8 seedów (2 496)       → 62,1 %
16 seedów (4 992)       → 63,6 %   (stan sprzed zmian: 61,5 % na 4 seedach)
```
Rozrzut ~7 p.p. przy 4 seedach = próg mierzył losowanie. Groźne w obie strony:
fałszywy alarm przy niewinnej zmianie i realna regresja schowana w szumie.
**Reguła:** zanim uznasz spadek za regresję, sprawdź, czy zmieniło się to, co
metryka MIERZY. Przy zmianie danych wejściowych powtórz pomiar na większej
próbce. Próbka progu musi mieć rozrzut wyraźnie mniejszy niż różnica do
wykrycia.
**Koszt:** testy z zamrożonym seedem wymagają przelosowania po zmianie talii —
to normalne. Ale test opisujący PRZYPADEK („w ręce jest 7 różnych kart") pęka
przy każdej zmianie; przepisany na REGUŁĘ („oferta = liczba różnych kart")
przestaje być kruchy.

## L37 (2026-08-17) — Zmiana danych wejściowych to darmowy fuzzing silnika

Dosypanie lądów ujawniło crash obecny w kodzie od dawna: `Error: Nieprawidłowy
cel obrażeń` wywracał benchmark, gdy cel zdolności opuścił pole przed jej
rozstrzygnięciem (CR 608.2b: fizzle). Benchmark „przechodził wcześniej", bo
dotychczasowe rozdania nie trafiały w tę ścieżkę. Objaw mylił dwa razy: wyszedł
dopiero przy `--seeds 16` i wyglądał jak skutek zmiany talii.
**Reguła:** gdy zmiana danych wywala coś w silniku, to prawie nigdy wina danych
— to nowa ścieżka wykonania. Traktuj crash jak znalezisko fuzzingu: napraw
REGUŁĘ, nie dane. Przy zmianie danych puść szerszą próbkę niż domyślna.

## L38 (2026-08-18) — Dług, którego nie spłacisz jednym commitem, spłaca się trybem ostrzegawczym

**Objaw:** walidacja kontraktu `addObject` (L21) włączona twardo dała 141
czerwonych testów — „zrób to porządnie" oznaczało „nie rób tego nigdy"
(leżało w backlogu dwa dni).
**Przyczyna:** narzędzie miało jeden tryb — rzucaj. Koszt wdrożenia = koszt
spłaty CAŁEGO długu z góry.
**Reguła:** strażnik na istniejący kod projektuj DWUTRYBOWO: domyślnie
ostrzeżenie z podpowiedzią i deduplikacją (jedno na pole, nie na wywołanie),
twardy tryb za zmienną środowiskową (`MTG_STRICT_ADD_OBJECT=1`) dla sprzątania i
strażnika pilnującego, że ŚWIEŻY kod w `src/` jest czysty. Nowy dług niemożliwy
od dziś, stary spłaca się przy okazji.
**Efekt uboczny:** samo włączenie ostrzeżeń wyprodukowało listę miejsc, gdzie
test mierzył coś innego, niż deklarował (dwa fałszywie zielone). Strażnik
najpierw robi audyt.

## L39 (2026-08-18) — Przegląd, który niczego nie znalazł, wychodzi ze strażnikiem, nie z pustymi rękami

**Objaw:** audyt „czy każda decyzja ma opis w logu" wykazał 177/177 opisanych
zdarzeń i 50/50 obsłużonych komend `resolve_*` — zero usterek. Pokusa: odhaczyć
i iść dalej.
**Przyczyna niepokoju:** kompletności logu nie pilnowało NIC. Zielony stan był
przypadkowy i już dwa razy (M96, M126) przestawał być zielony w najgorszy
sposób: surowym slugiem zdarzenia u gracza, bo `describeGameEvent` ma
`default: return e.type`.
**Reguła:** wynik przeglądu profilaktycznego to nie „czysto", tylko TEST
utrwalający „czysto" — skoro zmierzyłeś własność automatycznie, ten sam pomiar
kosztuje jeden plik testowy. Bez niego przegląd jest ważny przez jeden commit.
Sprawdź też stronę odwrotną rejestru (L29): martwych typów zdarzeń było 6.

## L40 (2026-08-18) — „Detektory nie zgłosiły nic" to pomiar NARZĘDZIA, nie produktu

**Objaw:** 22 partie Żywym Testerem (12 talii, 5 profili) i pusta sekcja
`== DETEKTORY ==`; ręczna lektura tych samych transkryptów dała DZIESIĘĆ
znalezisk, w tym bota płacącego maną za wzmacnianie MOICH stworów 24 razy w
jednej partii.
**Przyczyna:** każdy detektor koduje JEDNĄ hipotezę. `detectBotSelfTargeting`
pilnował efektu SZKODLIWEGO w SIEBIE — druga przekątna (efekt KORZYSTNY w
PRZECIWNIKA) nie miała strażnika. `detectNoEffectOffers` mierzył oferty, nie
OPISY, więc kafel kłamiący o koszcie przechodził bez echa.
**Reguła:** „zero zgłoszeń" czytaj jako „moje reguły nie obejmują tego, co się
wydarzyło" (rozwinięcie L27). Po audycie pytaj o KLASĘ: jaka reguła znalazłaby
to automatycznie? Z dziesięciu znalezisk trzy dały się zamienić w detektory —
i w kontrolnym uruchomieniu wykryły JEDENASTE, którego ręcznie nie zauważyłem.
Właściwa miara: ile klas błędów przestało być niewidzialnych.
**Warunek:** detektor bez weryfikacji DWUSTRONNEJ jest bezwartościowy — na
transkrypcie sprzed naprawy musi zgłosić, po naprawie musi zamilknąć.

## L41 (2026-08-18) — Trzy kopie tej samej logiki rozjeżdżają się cicho i kłamią graczowi

**Objaw:** kafel Goblin Pickera obiecywał „{1}, {T}: dobierz 1 kartę", a
aktywacja odrzucała kartę z ręki i wymagała czerwonej many (Oracle: `{R}, {T},
Discard a card: Draw a card`).
**Przyczyna:** koszt liczyły TRZY miejsca — `abilityCostHtml` (przycisk),
`costTextOf` (kafel) i inline w `describeAbility` — każde z innym podzbiorem pól
(jedno `discardCards`, żadne `discardCard`, tylko jedno pipy kolorów). Audyt 304
kart: osiem pól kosztu bez pokrycia.
**Reguła:** ta sama informacja formatowana w kilku miejscach = JEDNA tabela
używana wszędzie (L28 dla prezentacji). Rozjazd nie wywala testów: objawia się
tylko tym, że gracz płaci koszt, o którym nie wiedział. Strażnik DWUSTRONNY:
„każde pole z DANYCH ma wpis", nie „tabela niepusta" (L31).
**Rodzina, nie przypadek:** ta sama diagnoza objęła etykiety celów („stwór o
sile ≥" bez liczby), deskryptory aur (`losesKeywords` — kafel bez treści) i typy
permanentu (kafel czytał rejestr zamiast stanu: Spacecraft po progu Station
dalej wyglądał na artefakt). Naprawiając jedno pole, skanuj CAŁĄ rodzinę.

## L42 (2026-08-18) — Efekt „do odwołania" wycenia się razem z ZEGAREM, nie tylko z celem

**Objaw (uwaga właściciela):** „najefektywniejsze jest tapowanie kreatur
przeciwnika po jego fazie untap — wtedy kreatura jest nieczynna i w ataku, i w
obronie". Bot tego nie widział: wycena `8 + 2*power` zależała wyłącznie od tego,
KOGO tapujemy, więc tapował w oknach najsłabszych (własny koniec tury — efekt
kasował się przy untapie przeciwnika).
**Przyczyna:** przy efektach trwających „do czegoś" wartość ma ILOŚĆ CZASU
obowiązywania, nie sam skutek.
**Reguła:** wyceniając efekt czasowy, zapytaj „do kiedy to działa i co
przeciwnik straci w tym oknie?". Untap step odkręca permanenty AKTYWNEGO gracza
(CR 502): tapnięcie w mojej turze żyje chwilę, tuż po jego untapie — całą jego
turę i moją następną. Rodzina: „doesn't untap", prewencja obrażeń, pumpy „until
end of turn".
**Haczyki z wdrożenia:** (1) tapnięcie ZADEKLAROWANEGO atakującego nie cofa
ataku (CR 506.4) — okno „w trakcie walki" wygląda dobrze, a jest prawie
bezwartościowe; (2) kara „nie rób tego w złym oknie" nie może dotyczyć akcji
niewykonalnych w dobrym (sorcery tylko we własnej głównej fazie — kara
zamieniłaby kartę w niegrywalną). „Poczekaj na lepszy moment" rozstrzygaj
deskryptorem (`timing`, typ karty), nie nazwą (ADR 0002).

## L43 (2026-08-18) — Deskryptor „po nazwie pola" to heurystyka; do KASOWANIA obiektu potrzeba flagi jawnej

**Objaw:** reguła CR 704.5e („token poza polem bitwy przestaje istnieć")
napisana po deskryptorze „token = obiekt z polem `name`" skasowała zwykłe KARTY
(testy legalnie nadawały `name`, np. `name: 'Forest'` dla landa w bibliotece).
**Przyczyna:** „token ma `name`, karta nie ma" to prawda STATYSTYCZNA, nie
definicja. Dotychczasowe użycia (`delirium`, wybór z grobu) tylko POMIJAŁY
obiekt (koszt pomyłki: jedna niepoliczona karta); nowa reguła USUWAŁA obiekt.
**Reguła:** dobierz siłę deskryptora do siły skutku. Filtrowanie może iść po
heurystyce; TRWAŁE zniszczenie wymaga jawnego znacznika (`isToken` ustawiany
wyłącznie w `createBattlefieldToken`) — wciąż generycznego (ADR 0002).
**Skutek uboczny:** usunięcie obiektu z `state.objects` zabiera triggerom do
niego dostęp (trigger „permanents you control leave the battlefield" przestał
widzieć tokeny). Zdarzenie musi nieść LKI (CR 603.10), a trigger czyta je ze
zdarzenia. Reguła kasująca obiekty przechodzi przez listę „kto o nie pyta".

## L44 (2026-08-18) — Komentarz z numerem reguły nie jest dowodem; sprawdź źródło

**Objaw:** w silniku stało `// CR 701.38: goaded creatures can't block` w trzech
miejscach z testem utrwalającym („deklaracja odrzucona"). CR 701.38b mówi
wyłącznie o WYMOGACH ATAKU i zaznacza, że goad nie jest zdolnością — o
blokowaniu nie ma słowa. Silnik odbierał obrońcy legalne bloki.
**Przyczyna:** błędna interpretacja zyskuje pozory prawdy przez powtórzenie:
komentarz cytuje numer, test „potwierdza", kolejne sesje omijają temat jako
sprawdzony. Test pilnował zgodności z pierwotnym błędem, nie z zasadami.
**Reguła:** gdy kod ogranicza graczowi legalną akcję, czytaj TREŚĆ reguły.
Podejrzane są mechaniki „X nie może Y", gdzie oryginał brzmi „X musi Z" — wymóg
łatwo zmienia się w pamięci w zakaz. Przy korekcie odwróć test i dopisz
uzasadnienie.

## L45 (2026-08-18) — Mgła wojny wycieka polami pobocznymi, nie tożsamością

**Objaw:** widok ukrywał `cardId` i linię typów zakrytego permanentu (CR 708.2),
a każdy z pięciu morphów dawał się rozpoznać po `subtypes` („Bird", „Human
Wizard") i po deskryptorze `morph` (koszt obrócenia + KOLORY karty).
**Przyczyna:** ukrywanie dodano punktowo przy polu, które akurat zdradzało za
dużo; każde następne pole (podtypy „bo bot potrzebuje", morph „bo etykieta")
omijało bramkę, bo bramka pilnowała pól zamiast KLASY informacji.
**Reguła:** ukrytą informację testuj przez NIEROZRÓŻNIALNOŚĆ: weź wszystkie
obiekty, które mają wyglądać tak samo, policz odcisk widoku każdego i wymagaj
JEDNEGO elementu w zbiorze. Taki test łapie każde przyszłe pole; lista pól —
tylko zapamiętane.

## L46 (2026-08-18) — Animacja „do końca tury" + trwały stan = cleanup musi resynchronizować

**Objaw:** Spacecraft Wedgelight Rammer (próg 9+ charge → stwór) ożywiony
animacją Skilled Animator do 5/5, po 9 charge i końcu tury wracał do artefaktu
mimo spełnionego progu: `clearStatModifiers` odtwarzał
`originalBeforeAnimation` (rodzaj artefakt), nie sprawdzając, czy trwały warunek
station nadal czyni go stworem.
**Przyczyna:** dwa współistniejące stany o różnej trwałości — animacja
(chwilowa, zapis cofnięcia) i station (trwały, liczniki charge). Cleanup znał
tylko pierwszy.
**Reguła:** gdy encja ma efekt chwilowy i trwały warunek, cleanup przywracający
chwilowy MUSI przeliczyć trwały. Inaczej trwały stan ginie razem z chwilowym,
choć jego przyczyna nadal istnieje.
**Sygnał:** każdy `clearStatModifiers` / `removeCounter` / `addCounter`
dotykający `kind`/`types` idzie przez `syncStationKind`. Synchronizacja żyjąca
tylko w `addCounter` oznacza dziurę w każdej ścieżce czyszczącej
`originalBeforeAnimation`.

## L47 (2026-08-18) — Kopiowalne cechy to WSZYSTKIE drukowane deskryptory, nie tylko P/T

**Objaw:** token-kopia Wedgelight Rammer (Cogwork Assembler, CR 707.2) rodziła
się jako artefakt bez progu 9+ i nigdy nie stawała się stworem; ten sam wzorzec
w `Jwari Shapeshifter` (enter as copy) — kopia traciła `station`/`saga`.
**Przyczyna:** kopiowanie to ręczne przepisanie pól (`kind`, `power`,
`types`…), a lista pól rosła z mechanikami (station, saga — M33) szybciej niż
kopiowanie. Brak pola nie wywala testu: token po prostu zachowuje się jak
zwykły artefakt.
**Reguła:** przy nowym deskryptorze karty (station, saga,
`entersWithCounters`…) dopisz go w KAŻDEJ ścieżce kopiowania
(`create_copy_token` w `effects.js`, `resolve_enter_as_copy` w
`game-state.js`, `createBattlefieldToken` w `tokens.js`). Listę kopiowalnych pól
trzymaj w jednym miejscu (`copyableDescriptorKeys`).
**Wykrycie:** fuzzer strukturalny nie złapie (token jest legalnym artefaktem).
Potrzebny test semantyczny: „token-kopia ma ten sam `station`/`saga` co
oryginał" (po deskryptorach, ADR 0002).

## L48 (2026-08-18) — Oferta vs walidacja muszą używać tego samego filtra (DEBT)

**Objaw:** bot w benchmarku wybierał biały czar na cel z `protection from
white` (Benevolent Blessing): `legalSpellCasts` oferował go (filtrował tylko
`isProtectedFromSource`), a `validateTargets` odrzucał (sprawdzał też
`effectiveProtectionFromColors`) — crash `illegal_spell: protection`, a
`aggro-bot` nie znał `resolve_color_choice` → drugi crash „nie znalazł ruchu".
**Przyczyna:** filtr ochrony ma dwie gałęzie (jakość, kolor); oferta znała
jedną, walidacja obie. Dla czarów bez `sourceObject` ochrona kolorowa była
niewidoczna. To samo w `aggro-bot`: lista `simple` z `resolve_*` rosła wraz z
nowymi mechanikami (`resolve_color_choice` — M59, `resolve_index_choice` —
M64).
**Reguła:** nowy typ ochrony / nowy `pending*` trafia w TRZY miejsca naraz:
(1) `legalTargetCandidates` (oferta, z `sourceObject`), (2) `validateTargets`,
(3) oba boty (`heuristic` ma fallback `anyResolve`, `aggro` listę `simple` +
fallback). Rozjazd oferta/walidacja to gotowy crash w benchmarku.
**Sygnał:** po nowym deskryptorze ochrony albo `resolve_*` uruchom
`node tools/benchmark.mjs --seeds 2` — `illegal_spell` lub „nie znalazł ruchu"
oznacza niekompletną ofertę.
**Dopisek (M254/A) — zdarzenia tej samej rodziny:** `permanent_destroyed`
(zniszczenie EFEKTEM: Murder, Spin Out) nie było w skanie triggerów „when this
permanent leaves the battlefield" — skan znał `creature_destroyed` (śmierć z
obrażeń), `permanent_sacrificed`, `object_moved`, `object_exiled`. Wormfang
Newt zniszczony czarem zostawiał ląd w exile na zawsze, zniszczony OBRAŻENIAMI
oddawał go prawidłowo. Nowe zdarzenie z rodziny trafia do KAŻDEGO skanu tej
rodziny (`dies`, `leaves_battlefield`, „permanents you control leave").
**Dopisek 2 (M254) — ten sam filtr to za mało: musi zgadzać się KOLEJNOŚĆ
bramek.** Pełna macierz kończyła się „Bot wybrał nielegalną komendę:
rebound_unresolved": gracz miał naraz `pendingReboundCast` (Ojutai's Breath, CR
702.97) i `pendingUndercityRoute` (M190/B); `execute` ma bramkę reboundu PRZED
undercity, a `legalCommands` gałąź reboundu PO undercity — silnik oferował
`resolve_undercity_route` i sam go odrzucał. Reguła przy
`firstPendingDecisionPlayerId`: **pierwszy właściciel decyzji = pierwsza bramka
`execute` = pierwsza gałąź ofert** (`test/m254-kolejnosc-pendingow.test.js`).

## L49 (2026-08-18) — Plik startowy musi kazać CZYTAĆ ADR-y, zanim agent odezwie się w czacie

**Objaw:** nowa sesja zapytała właściciela „co robimy?" zamiast wykonać ADR
0020 (PR → audyt poprzedniego PR → praca), choć ADR 0020, AGENTS i lekcje już
istniały.
**Przyczyna (projekt dokumentacji, nie brak reguły):** jedyny plik wczytywany
zawsze (`AGENTS.md`) chował listę lektur niżej i ustawiał ADR-y jako punkt 8
(„właściwe ADR-y obszaru") — dało się „przeczytać AGENTS" bez otwarcia 0020;
`PROJECT_STATE.md` i handoff były wyżej niż rejestr decyzji; grzecznościowe
„pytaj, jeśli nie wiesz" w prompcie wypełniało lukę lektury.
**Reguła:** `AGENTS.md` to jedyny plik startowy niezależny od czatu. Jego
PIERWSZA sekcja to obowiązkowa lektura: ten plik → **wszystkie** ADR-y →
LESSONS → ENVIRONMENT, potem dopiero stan projektu. Co robić jest w ADR 0020,
nie w pytaniu do właściciela.
**Strażnik:** `AGENTS.md` §0, wskaźnik w `README.md`.

## L52 (2026-08-20) — Ścieżka mechaniki zależna od przyszłych kart: zaimplementuj i zasygnalizuj, nie odnotuj

**Objaw:** audyt PR #66 zostawił dwie obserwacje „bez zmian kodu":
`resolve_madness_cast` wołał bezwarunkowo `castPermanent` (pierwsza karta
instant z madness dostałaby reject) i bramka kolorów sprawdzała pipy KARTY
zamiast kolorów kosztu madness (dziś tożsame dla Revolutionista). Obie były
wyłącznie w raporcie audytu.
**Przyczyna (decyzja właściciela 2026-08-20):** audyt czytał ADR 0001 („nie
budujemy spekulatywnie") jako „nie implementujemy, dopóki karta nie przyjdzie".
Właściciel rozstrzygnął odwrotnie dla KODU MECHANIKI: ścieżka może być dziś
martwa, ale musi być przygotowana i zasygnalizowana. ADR 0001 nadal obowiązuje
dla KATALOGU (kart nie dodajemy spekulatywnie).
**Reguła:** gdy audyt odkryje lukę ujawnioną dopiero przez hipotetyczną kartę:
1. **implementuj generycznie** (routing po `kind`/deskryptorach, bramki wg
   AKTYWNEGO kosztu — `altCostColors` w `castPermanent`), bez specjalnych
   przypadków po nazwie karty (ADR 0002);
2. **wyprowadź ścieżkę na powierzchnię we wszystkich warstwach** — engine,
   oferta playerView (L48), etykieta UI, boty;
3. **zasygnalizuj granice zakresu JAWNYM rejectem** z czytelnym powodem;
4. **daj strażnika czerwieniejącego w dniu wejścia pierwszej takiej karty**
   (test katalogowy z instrukcją w asercji) + testy ścieżki na obiektach
   syntetycznych.
**Sygnał:** „pierwsza karta X będzie wymagała Y" to zadanie na TERAZ dla kodu
mechaniki.
**Strażnik:** M161 (routing madness po `kind`, `castMadnessSpell`,
`test/m161-madness-spell-path.test.js`).

## L56 (2026-08-23) — Twierdzenie o danych sprawdzasz GREPEM, zanim je zapiszesz

**Objaw:** M196 ogłosiło „nowy plan w katalogu: Kamigawa". Właściciel: „Jesteś
pewien? Ja widzę w CSV takie karty z tego planu: Blade-Blizzard Kitsune, Kappa
Tech-Wrecker, Greater Tanuki…". Plan istniał od dawna — nowa karta była jego
czwartą.
**Dlaczego groźne:** nieprawda poszła do `PROJECT_STATE.md`, planu sesji,
komunikatu commita **i asercji testu** (`assert.equal(card.plan, 'Kamigawa',
'NOWY plan w katalogu')`), gdzie zielony test zaczął ją uwiarygodniać. Test
potwierdzał wartość pola, a komentarz kłamał o kontekście (L1 przeniesione do
dokumentacji).
**Reguła:**
1. Zdanie o stanie danych („nowy plan", „pierwsza taka karta", „jedyny
   przypadek") wymaga KOMENDY przed zapisem (`grep` po katalogu i po
   źródłowym CSV) — koszt 5 sekund.
2. Jeśli ma trafić do repo, dostaje STRAŻNIKA, nie samą korektę (M197):
   `test/m197-plany-kolekcji.test.js` skanuje dokumenty i czerwienieje, gdy
   „nowym" nazwano plan, który repo już zna.
3. Strażnik z wyjątkiem opartym o słowo kluczowe jest dziurawy: pierwsza wersja
   zwalniała linie ze słowem „sprostowanie" — mutacja pokazała, że wystarczy
   postawić błędne zdanie obok tego słowa.


## L89 (2026-08-29) — Przebieg, którego nikt nie dograł: długi bieg loguje postęp, a rozmiar macierzy wyznacza budżet, nie liczba kombinacji

**Objaw:** `node tools/benchmark.mjs --full` liczył się 63 minuty CPU bez jednej
linii logu (raport powstaje po ostatnim meczu) — nie dało się odróżnić wolnego
liczenia od meczu, który utknął. Pierwszy log po dopisaniu postępu powiedział
wszystko: `1/75900`, ETA 526 minut.
**Przyczyna:** dwie rzeczy naraz. (1) Narzędzie długiego biegu było NIEME: bez
logu przyrostowego pojedyncza jednostka i całość wyglądają identycznie.
(2) Kombinacje rosną z KWA-DRATEM liczby talii, a szacunek „23 400 meczów,
~40 min" (ADR 0018) był z epoki 12 talii; po podziałach ADR 0024 jest 22 pliki,
czyli 253 pary × 2 strony × 3 pary botów × 50 seedów = 75 900. Nikt nie
zauważył, BO NIKT NIE DOGRAŁ MACIERZY DO KOŃCA — martwa liczba w dokumentacji
nie boli, dopóki nikt jej nie sprawdzi.
**Reguła:**
1. Przebieg dłuższy niż ~1 minutę loguje postęp PRZYROSTOWO: done/total,
   ms/jednostkę, ETA i adres pozycji — pierwszy log po PIERWSZEJ jednostce, nie
   po progu (`--progress` + `onProgress`).
2. Dostaje watchdoga na pojedynczą jednostkę: przerwij ją, wpisz adres do
   raportu, idź dalej (`--stall-ms` + `result.stalls`) — zacinka nie pociąga
   całego przebiegu.
3. Rozmiar macierzy wyznacza BUDŻET, nie liczba kombinacji: algorytm dobiera
   (par, seedy) do liczby talii, każda talia musi być w próbce (ADR 0025).
4. Liczba w dokumentacji, której nikt nie weryfikuje od miesięcy, jest
   PODEJRZANA — sprawdź ją komendą, zanim zaplanujesz według niej sesję.
**Strażnik:** `test/benchmark-progress-watchdog.test.js` (postęp + zacinki),
`test/benchmark-budget-probki.test.js` (budżet trzyma rozmiar dla 6/22/45/120
talii, pokrycie każdej talii, determinizm próbki); raport wypisuje
`ZACINKI (watchdog N ms)` z adresem każdego przerwanego meczu.

## L90 (2026-08-29) — Trzecia powtórka tej samej klasy: oferta i walidacja rozjechały się PORZĄDKIEM (Exploit vs cel triggera)

**Objaw:** pierwsza w życiu pełna macierz, która w ogóle dobiegła do sensownego
momentu, zatrzymała się na 58,5%: `Bot wybrał nielegalną komendę:
exploit_unresolved — aggro(tarkir-bg) vs random(theros), seed 1003`. Bot dostał
w ofercie `resolve_trigger_target` i `activate_ability`, a odrzuciła go bramka
exploitu, której w ofercie nie było widać.
**Przyczyna:** `firstPendingDecisionPlayerId` układał decyzje „cel triggera →
exploit", a bramki w `execute` stały odwrotnie (exploit wcześniej). Gdy gracz
miał obie decyzje naraz, oferta mówiła „najpierw cel triggera", walidacja —
„tylko `resolve_exploit_choice`". Ta sama klasa co F i M254/E, tylko że nie
dwie kopie jednej reguły, lecz **dwa porządki tej samej reguły**.
**Reguła:**
1. Kolejność „kto teraz decyduje" mieszka w JEDNEJ funkcji, która zwraca nie
   tylko właściciela, ale i RODZAJ decyzji (`firstPendingDecision` →
   `{ playerId, kind }`). Bramka execute pyta: „czy pierwsza decyzja jest MOJA
   i tego rodzaju?" — nigdy „czy kolejka jest niepusta".
2. Predykat blokady jest jeden i wołają go OBIE strony, oferta i walidacja
   (`exploitDecisionPendingFor`; wzorzec z F — `closingCombatPassBlocked`).
3. Bramka „coś czeka" ma być warunkiem na właściciela i rodzaj, nie na sam
   fakt niepustości kolejki — inaczej blokuje gracza, którego decyzja jest
   wcześniejsza.
4. Przy N-tej powtórce jednej klasy szukaj WSPÓLNEGO MIANOWNIKA klasy, nie
   kolejnego przypadku (L28).
5. Martwy wartownik to też błąd: sprawdzony dodatkowy warunek okazał się
   nadmiarowy (blok akcji jest już osłonięty wyżej) — mutacja go nie
   czerwieniła, więc go usunąłem, zamiast zostawić jako „dokumentację zamiaru"
   (L83: strażnik ma mierzyć regułę, nie tekst).
**Strażnik:** `test/m255-petla-jakosci.test.js` — G1 (replay adresu z macierzy:
`aggro(tarkir-bg)` vs `random(theros)`, seed 1003, mecz kończy się) i G2
(Exploit blokuje wyłącznie jako PIERWSZA decyzja; opcja `skip` jest w ofercie;
cudza decyzja nie daje komend). Mutacje: „bramka blokuje każdego" → G1
czerwone; „blokuje właściciela bez względu na porządek" → G1 czerwone.

## L91 (2026-08-29) — „Trigger bez efektu" ma trzy różne przyczyny; liczenie zdarzeń to ich przybliżenie, nie reguła

**Objaw:** runda 2 Żywym Testerem (18 partii, M256) wyprodukowała 12 komunikatów
„trigger bez efektu (nie było czego wykonać)": Trostani Discordant ×4,
Veiled Ascension ×3, Jyoti, Moag Ancient ×3, Plague Reaver ×1, Chronic Flooding
×1. Dla czterech pierwszych komunikat był NIEPRECYZYJNY — karta nie miała na
kim działać (brak zakrytych stworów, brak cudzych stworów, brak stworów-lądów,
brak innych stworów), a gracz czytał „nie było czego wykonać", czyli komunikat,
który sugeruje usterkę (kardynał 1 z AUDYT_M255).
**Przyczyna:** `resolveTrigger` wnioskował powód z LICZBY nowych zdarzeń
(`producedNothing`). Milczenie ma jednak TRZY źródła: pusty zbiór odbiorców,
brak paliwa (pusta biblioteka przy młynowaniu) i stan już docelowy (CR 701.20b —
tapnięcie tapniętego, M106/Z2). Dotychczasowe rozróżnienie brało pod uwagę dwa
z nich; trzecie („nikt nie pasuje do efektu") było nierozróżnialne od „efekt
wykonał się bez skutku", bo oba nie produkują zdarzeń.
**Reguła:**
1. **Powód mieszka w warstwie efektu.** Selektor zbioru odbiorców
   (`faceDownCreaturesYouControl`, `creaturesNotControlledByOwner`,
   `landCreaturesYouControl`, …) jest eksportowany z `effects.js` i używany
   także PRZEZ SAM EFEKT — jedna definicja zbioru, nie dwie kopie (L41/L48:
   kopie się rozjeżdżają).
2. **Tabela zwraca POWÓD, nie boolean.** `EMPTY_RECEIVER_EFFECTS[type](…) →
   'no_targets' | 'empty_library' | null` — kolejna przyczyna to kolejna
   WARTOŚĆ, nie kolejny `if` po typie efektu (L28/ADR 0002).
3. **Efekt, który ma w zbiorze samego siebie, nie zgłasza pustego zbioru.**
   Osobna pułapka z tej samej rodziny: efekt idempotentny działa nie zawsze na
   ŹRÓDŁO — aura działa na GOSPODARZA (`attachedTo`), więc reguła „cel albo
   źródło" (M189/Z2e) nie wystarcza (Silken Strength, M256/J).
   Village Bell-Ringer („untap all creatures you control") zawsze jest własnym
   odbiorcą, więc pustka jest niemożliwa; tam obowiązuje tabela idempotentności
   ZBIOROWEJ (`STATE_IDEMPOTENT_MASS_EFFECTS`), bo „wszystkie już odkręcone" to
   wykonana zdolność, nie porażka triggera (M106/Z2).
4. **Do każdego wpisu kontrola pozytywna**: test, w którym zbiór NIE jest
   pusty (H1b/H2b/H3b/H4b/H5b/H6b). Bez niego asercja „brak komunikatu" bywa
   zielona dlatego, że w ogóle nic się nie dzieje (klasa M255/G2).
5. **Heurystyka NAZWY efektu (`_each_`, `_all_`) wolno mieszkać wyłącznie
   w strażniku** (skan katalogu: każdy zbiorowy typ efektu ma wpis w tabeli
   albo udokumentowany wyjątek). Silnik kluczuje po typie efektu i z nazwy nie
   zgaduje — inaczej wracamy do `if` po nazwie typu.
6. Komunikat dla gracza to NIE ozdoba: „brak legalnych celów" i „pusta
   biblioteka" mówią, co zrobić dalej; „nie było czego wykonać" mówi tylko, że
   coś nie zadziałało (oś 2: „wszystko poza szumem powinno tam być").
**Strażnik:** `test/m256-zywy-tester-runda2.test.js` (H1–H7, 15 testów).
Mutacje: brak rozrównienia (`zawsze no_result`) → H1, H1c, H2; `zawsze
no_targets` → H3; selektor bez filtra kontrolera → H1c; selektor właściciela
zawsze pusty → H2b; wycięcie wpisu `buff_land_creatures` → H4, H7;
`sacrifice_each_other_creature` → H5, H7; `mill_cards` → H3, H7;
`empty_library` → `no_targets` → H3; wycięcie masowej idempotentności
(untap_all) → H6.
