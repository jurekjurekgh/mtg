# Lekcje projektowe (trwały rejestr)

Mapa dokumentów: `AGENTS.md` §„Gdzie zapisać regułę"; tu uzupełnienie —
`docs/PROJECT_HISTORY.md` (dziennik sesji) i `docs/LESSONS_PRZYPADKI.md`
(narracja Objaw/Przyczyna) są trwałe, ale **NIE** są lekturą startową: szukać
grepem. Rejestr niesie REGUŁĘ i STRAŻNIKA. Lekcja idzie tu, gdy jest powtarzalna
i nie jest decyzją architektoniczną (te → ADR); wymusza zmianę sposobu pracy →
`AGENTS.md`; ustala granicę komponentów → ADR + odsyłacz. Lekcji nie kasujemy:
nieaktualną oznaczamy z odsyłaczem do nowszej.

**Wzorzec wpisu (obowiązkowy, bez ozdobników):** `## LN (YYYY-MM-DD) — reguła
w jednym zdaniu` / **Przypadek:** JEDNO zdanie z konkretami (karta, test, numer
CR) — po nim poznaje się klasę w nowym przebraniu / **Reguła:** 1–4 punkty,
imperatyw / **Strażnik:** `plik/funkcja` — co czerwienieje po cofnięciu naprawy
/ `→ narracja: docs/LESSONS_PRZYPADKI.md (LN)`.

Pól **Objaw**/**Przyczyna** nie ma — proza idzie do archiwum pod tym samym
numerem, a wpis niesie FAKTY (pliki, testy, karty, numery CR) i regułę; narracja
zostaje w `docs/audits/` (`test/docs-decisions.test.js`: odsyłacz ma adresata,
wpis ma regułę lub strażnika). Rejestr to największa pozycja budżetu lektury
(`test/dokumentacja-budzet-lektury.test.js`, próg 100k): nowy wpis płaci się
skróceniem innego, progu NIE podnosimy. L15–L19: daty z kamieni milowych
(M102/M103 = 2026-08-16), oryginalne zaginęły przy migracji M208.

## Wpisy zbiorcze (mapa klas)

M275: lekcje jednej klasy mają **wpis zbiorczy** (pełna klasa, tabela wariantów,
reguła w jednym miejscu), reszta numerów to **kotwice** (krótki przypadek +
odsyłacz). Numery są cytowane w kodzie ~1150 razy, więc **żaden nie znika**.

| Klasa | Wpis główny | Kotwice |
|---|---|---|
| Jawna lista pól gubi dane (fabryka → generator → transport → widok) | **L21** | L93, L94, L101 |
| Weryfikacja mutacyjna: dowód, że test/detektor działa | **L13** | L61, L70, L114 |
| Strażnik mierzy regułę, nie tekst źródła | **L5** | L26, L31, L44, L83 |
| Zero zgłoszeń detektorów to pomiar narzędzia | **L27** | L40, L73, L75 |
| Oferta i walidacja: jeden filtr, porządek i rejestr | **L48** | L90 |
| Choke point istnieje, ale ścieżka go omija | **L107** | L109, L110, L112, L113 |

**Zasada scalania:** wpisy łączymy, gdy opisują JEDNĄ klasę — nigdy dlatego, że
są stare. Lekcji nie kasujemy ani nie skracamy o fakty (karta, test, CR);
usuwamy tylko powtórzoną regułę, wstawiając odsyłacz.

---

## L107 (2026-08-31) — Najbogatsza żyła błędów: ścieżka robiąca to samo co helper, ale RĘCZNIE. Grep po mutacji pola, nie po nazwie mechaniki

**Przypadek:** — silnik ma choke pointy (`addCounter`, `addPoisonCounters`, `deathZoneFor`, `untapObject`, `moveObjectDirectly`), a obok żyją ścieżki ro…

**Reguła:**
1. **Szukaj po MUTACJI POLA, nie po nazwie funkcji:** `grep -rn "tapped: true"`,
   `grep -rn "\.poison +="`. Trafienie spoza pliku-właściciela = kandydat.
2. **Porównuj ładunki emiterów** jednego zdarzenia — rozjazd pól to błąd
   kontraktu widoczny dla konsumenta.
3. **Strażnik SKANUJE ŹRÓDŁA**, nie scenariusz: obejmuje też przyszłe ścieżki.
4. Od M273 klasy pilnuje automat — `tools/event-contract-audit.mjs` (ADR 0027,
   L112): trzy wymiary skanu wpięte w `npm test`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L107)

## L106 (2026-08-31) — Efekt „do końca tury" z ZAMROŻONYM zbiorem obiektów nie wolno filtrować po BIEŻĄCYM kontrolerze

**Przypadek (M269):** — po „Creatures you control get +2/+2 until end of turn"
kradzież stwora kasowała bonus (4/6 → 2/4), a buff ujemny po przejęciu leczył
—… Pełna narracja: `docs/LESSONS_PRZYPADKI.md` (L106).

**Reguła:** (1) Dokładając precyzyjniejsze kryterium, USUŃ stare — dwa filtry
tej samej przynależności to jeden za dużo. (2) Redundancja jest niewidoczna,
póki kryteria się zgadzają; testu szukaj tam, gdzie się rozjeżdżają (zmiana
kontroli, typu, strefy).
## L105 (2026-08-31) — „Dziś to ryzyko, nie błąd" trzeba ZWERYFIKOWAĆ skanem, a nie założyć; sklejka pipów OBOK kwoty zawyża cenę

**Reguła:** „dziś to tylko ryzyko" jest HIPOTEZĄ o danych — zamyka się ją
skanem katalogu w tej samej sesji, nie wpisem w handoffie. Pipy kolorów wchodzą
W RAMACH kwoty (`{3}{G}` = 4 many), nigdy obok; jedyne źródło to
`costSymbols(amount, colors)`, a strażnik regexem szuka sklejek
`.colors ?? []).map(...).join('')` w `render.js`. Rodzinę alt-kosztów enumeruj
Z NAZWY (bestow, plot, suspend, madness, warp, surge, kicker, flashback,
buyback, escape, cleave, adventure, morph) — skan po jednej mechanice zamyka
jeden przypadek. Morph to WYJĄTEK: `cost` = rzut zakryty ({3}, CR 702.37a),
a pipy żyją w `morphCost`/`megamorphCost` (odkrycie) — skaner po `cost` da
6 fałszywych trafień; porównuj koszt ODKRYCIA.
**Strażnik:** `test/m268-alt-koszt-pelna-rodzina.test.js` — 11 testów; szczegóły: archiwum (L105).

## L104 (2026-08-31) — Poprawny wynik z niepoprawnego źródła to bug uśpiony: alt-koszt musi nieść WŁASNE pipy, nie pożyczać ich z kosztu bazowego

**Reguła:** alternatywny koszt (cleave, escape, madness, suspend, plot, bestow)
to OSOBNA cena — jego pipy należą do jego deskryptora, a czytanie kolorów
z kosztu bazowego jest błędem nawet wtedy, gdy dziś daje dobry wynik (pierwsza
karta o innym kolorze alt-kosztu łamie płatność, CR 601.2b); wzorzec zrobiony
dobrze: madness (M161/O2). „Testy zielone" nie zamyka pytania o ŹRÓDŁO: gdy
poprawność wynika ze zbiegu okoliczności w danych, strażnik pinuje źródło, nie
wynik. Dokładając pole do deskryptora, przejdź WSZYSTKIE kopie jawnej listy pól
(L101) — normalizacja w `registry.js` jest czwartą i najłatwiej o niej
zapomnieć (sygnał: pole widać w `card-data.js`, a `REGISTRY.get(id)` nie).
Strażnik porównuje Oracle z definicją dla CAŁEGO katalogu, nie dla zgłoszonej
karty.
**Strażnik:** `test/m267-alt-koszt-kolory.test.js` — 5 testów; szczegóły: archiwum (L104).

## L103 (2026-08-31) — Skrót „na 1v1" w modelu karty zmienia REGUŁY: brak słowa „target" w Oracle ⇒ brak `targets`, zakres należy do efektu

**Przypadek:** log pisał „Nieprzyjaciel rzuca Liliana's Triumph → cel: Ty", a Oracle: „Each opponent sacrifices a creature of their choice".

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

**Strażnik:** `test/m266-zgloszenia-wlasciciela.test.js` (skan katalogu, dziś
0 naruszeń). Mutacja: przywrócenie `targets` Liliana's Triumph → 4 RED.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L103)

## L102 (2026-08-31) — Rodzina ofert dzieli WYCENĘ i WIDOK: nowy członek bez pinu odziedziczy stary błąd; skutek niewidoczny w odcisku to fałszywy no-op

**Przypadek:** — `theros` vs `worek-basni` seed 332 — bot rzucił Sleep of the Dead (tap + „doesn't untap") we WŁASNEGO Blade-Blizzard Kitsune, który mia…

**Reguła:**
1. Naprawiając wycenę/widok dla JEDNEJ komendy, wypisz całą jej rodzinę
   i zamknij wszystkie naraz — albo dopisz strażnika wymieniającego rodzinę
   z nazwy. Grep po funkcji-karze (`freeCastTargetPenalty`) daje listę od ręki.
2. Deskryptor potrzebny wycenie musi być w widoku KAŻDEJ strefy jawnej, z
   której da się zagrać (grób CR 400.2, wygnanie CR 406.3) — nie tylko tej,
   którą zgłoszono.
3. Pole stanu zmieniające PRZYSZŁE możliwości (liczniki postępu, „n-ty raz
   w turze") należy do odcisku. Test: czy dwa stany różniące się tylko tym
   polem mają ten sam fingerprint? Jeśli tak, sonda no-op jest ślepa.
4. Zgłoszenie sondy „bez skutku" weryfikuj najpierw wobec ODCISKU: fałszywy
   alarm zwykle znaczy brak pola w odcisku, czyli błąd warstwę niżej.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L102)

## L101 (2026-08-31) — Jawna lista pól WIDOKU to czwarta kopia tej samej listy

Panel pokazywał „Rzuć za warp: Weftblade Enhancer (koszt ?)". Enumeracja katalogu
wykazała cztery gubione deskryptory kosztu w `playerView`: `warp`, `surge`,
`kicker` i `treasureAltCost`. M151 dopisał tam wcześniej `suspend` i zamknął temat
testem na JEDNĄ kartę — reszta dojechała później i nikt jej nie zauważył, bo
silnik liczył ofertę poprawnie; kłamała tylko etykieta.

→ Pełna klasa i reguła: [L21].
Tu dodatkowo, specyficzne dla widoku:
1. Koszt alternatywny (warp, surge, kicker, bestow, plot, suspend, morph,
   adventure) to publiczny Oracle (CR 601.2b) — musi dotrzeć do widoku KAŻDEJ
   strefy, z której da się go zapłacić (ręka ORAZ wygnanie: `warpReady`,
   `suspendReady`, `madnessReady`, `reboundReady`).
2. Dwa różne koszty tej samej karty = dwie różne etykiety; identyczny tekst przy
   różnym skutku to błąd panelu, nawet gdy silnik działa.
## L100 (2026-08-31) — Ten sam koszt renderowany w dwóch warstwach: zdarzenie musi nieść WSZYSTKIE składniki ceny, inaczej log kłamie obok poprawnego przycisku

**Przypadek:** modal „Rozgrywka" pisał „Zoraline, Cosmos Caller — zapłacić {2} i 2 życia?", a przycisk pod nim „Zapłać {W}{B} + 2 życia".

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
**Strażnik:** `test/m265-optional-pay-colored-cost.test.js` (5 testów; mutacje
w narracji: `payColors` ze zdarzenia → 1, 2, 5; goły `{N}` w opisie → 2, 3).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L100)

## L99 (2026-08-31) — Fix wdrożony w dwóch warstwach potrzebuje pinu w OBU; test warstwy tekstu nie chroni warstwy obrazu

**Przypadek:** ten sam wyciek nazwy zakrytej karty trzeba było zamknąć w DWÓCH miejscach `session.js` — w opisie tekstowym i w bramce SKANU karty.

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L99)

## L98 (2026-08-31) — Buforowane „dopisywanie" zamyka paczkę na granicy domenowej; promocję zatrzymanej połowy robią punkty WZNOWIENIA, nie wspólna pętla gry

**Przypadek:** modal „Rozgrywka" doklejał „Tura N — Ty" + „Dobierasz…" do ogona tury bota (rozstrzygnięty Divest, discardy z cleanup, obrażenia z walki)…

**Reguła:**
1. „Dopisywanie" staje na granicy OSOBNEJ paczki (tu: tura). Sygnał
   niesie zdarzenie graniczne (`turn_started` przy niepustym buforze
   → `held`), nie heurystyka treści.
2. held → bufor promują TYLKO punkty wznowienia („Rozumiem",
   `continueBotPlay`/`continueArtPlay`/`recheckAutoPass`). Pętla
   z `apply` NIE promuje — skleiłaby paczki z powrotem (błąd v1).
3. Granica wymusza pauzę w KAŻDYM miejscu bufora (`streamAutoEvents`,
   `apply`), a sygnał konsumuje się raz (nie wycieka dalej).
4. Gate na fladze pauz: konsumenci synchroniczni (testy, benchmark)
   dostają STARE zachowanie.

**Strażnik:** `test/m261-granica-tury-w-modalu.test.js` (3 testy, 8
seedów) + pauza (`botPauseAtTurnBoundary`, ogon bez „istotnych").

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L98)

## L97 (2026-08-31) — Warstwa prezentacji potrafi skłamać przy w 100% poprawnym silniku; decyzja „you may look” nie może wyciekać treści przed wyborem

**Przypadek:** — trzy zgłoszenia do Fertile Thicket, przy których SILNIK był bezbłędny (skip/`chosenCardId:null`/ `bottomOrder` — pełny Oracle, walidacj…

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

**Strażnik:** `test/m260-uwagi-wlasciciela.test.js` — 13 testów; szczegóły: archiwum (L97).

## L96 (2026-08-30) — Snapshotty Scryfall w repo = darmowy masowy audyt danych kart; audytuj po registry.all(), nie po nazwie eksportu

**Przypadek:** 7 błędów vs zasady w katalogu kart (Instant zamiast Sorcery ×2, MV bez symboli phyrexian, złe subtypy ×2, koszt craft/echo bez pipów) — po ~15 audytach PR.

**Reguła:** przy jakimkolwiek przeglądzie kart — najpierw automatyczne
diffowanie pól ze snapshotami (one już są w repo dla 155+ kart), potem
czytanie semantyczne tylko miejsc z rozbiejnością lub z mechaniką;
zawsze po całym rejestru. A gdy konwencja deskryptora się zmienia
(tu: manaCost = pełne MV), strażnik zgodności z MANA_COSTS musi znać
NOWĄ konwencję i zapaść razem z nią (aktualizacja testu-strażnika to
część fixu, nie opcja).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L96)

## L95 (2026-08-30) — Nowa decyzja blokująca to NIE handler: checklista ~10 punktów integracji; pierwsze redy testów to brakujące REJESTRY

**Przypadek:** resolve_ward_pay_choice działało po napisaniu handlera, a testy W2 padały na `invalid_command` (COMMAND_TYPES), potem na wyjątek w event() (EVENT_TYPES).

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L95)

## L94 (2026-08-30) — Fabryka z destrukturyzacją configu gubi nieznane pola PO CICHU

`create_copy_token` od lat przekazywał `manaCost` do `createBattlefieldToken`,
a destrukturyzacja w `tokens.js` tego pola nie znała — KAŻDY token-kopia wchodził
z MV 0 (CR 707.2: koszt many jest wartością kopiowalną). Bez błędu, ostrzeżenia
i testu; piny kopiowania sprawdzały `transformTo`/`station`/`saga`, nigdy kosztu.
Ujawnione pytaniem o CR 202.3b zadanym WSZYSTKIM ścieżkom rodziny.

→ Pełna klasa i reguła: [L21].
## L93 (2026-08-30) — Jawna lista pól w warstwie TRANSPORTOWEJ musi pokrywać generator

Crawling Chorus (`toxic: 1`) bił gracza trzy razy bez znaku trucizny: `installDeck`
(`deck.js`) kładzie na obiekcie jawną listę pól, a `toxic`, `echo`, `madness`,
`surge` i `warp` na niej nie było. Testy mechanik omijały tę warstwę, bo budowały
obiekt helperem `putCard`.

→ Pełna klasa i reguła: [L21].
Tu dodatkowo: pełne partie botów (`real-cards-batch3`) łapią zakleszczenia decyzji,
których unit nie widzi — po zmianie warstwy decyzji odpal choć jeden taki test.
## L92 (2026-08-30) — Liczby „bieżącego stanu" aktualizuje się na KONIEC sesji; odświeżenie w środku PR gwarantuje dryf

**Przypadek:** README mówił „3735/3735 testów, 2894.7 kB" — stan sprzed 8 etapów TEGO SAMEGO PR-a (D1 z audytu PR #87 wszedł w etapie 1).

**Reguła:**
1. Sekcje „Bieżący stan" (liczby testów, rozmiar artefaktu, liczba kart)
   odświeżasz w DOMYKANIU sesji — po ostatnim commicie funkcjonalnym, razem
   z handoffem i opisem PR (checklista końca: ENVIRONMENT §7).
2. Przy odświeżaniu liczby ZMIERZAJ (npm run test:all, npm run build) — nie
   przepisuj z ostatniego logu etapu, bo on też może być wczorajszy (L56:
   twierdzenie o danych sprawdzone poleceniem).
3. Sygnał: PR, którego opis/README podaje liczbę testów, a diff ma >1 etap
   funkcjonalny po wpisie „stan" — liczba jest podejrzana z definicji.

**Strażnik:** `test/dokumentacja-budzet-lektury.test.js` — szczegóły: archiwum (L92).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L92)

## L83 (2026-08-28) — Strażnik skanujący ŹRÓDŁO czyta KONSTRUKTY, nie tekst

`test/fingerprint-pending-decisions.test.js` liczył pokrycie jako każde
wystąpienie `pending*` w surowym pliku. Mutacja: `state.pendingZzz` w kodzie
+ wzmianka `pendingZzz` wyłącznie w KOMENTARZU → strażnik zielony. Nowa decyzja
znów wyciekłaby z odcisku stanu.

→ Pełna klasa: [L5].** Kluczowe: `stripComments` przed skanem, pin
o dwóch nogach (kompozycja + ścieżka produkcyjna przez nią przechodzi).

**Strażnik:** `test/fingerprint-pending-decisions.test.js` (`stripComments`
+ `coveredFieldsFromFingerprintFile` + pin A1); raport
`docs/audits/AUDYT_PR86_2026-08-28.md`.
## L88 (2026-08-29) — Błąd bez adresu: narzędzie długiego biegu musi powiedzieć GDZIE (i jedna reguła = jedna funkcja dla oferty i walidacji)

**Przypadek:** — `node tools/benchmark.mjs --full` kończył się „Kontroler nie znalazł ruchu mimo legalnych komend" — bez meczu, bez stanu.

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L88)

## L87 (2026-08-29) — Skutek, którego nie widać, zamienia się w komunikat, że go NIE BYŁO (dwie bramki: zdarzenie i bramka szumu)

**Przypadek:** — transkrypt `worek-mroczny vs theros` (seed 47): „Kulrath Mystic — trigger (rzucenie czaru)" + „trigger bez efektu…

**Reguła:**
1. Skutek bez zdarzenia = skutek niewidoczny: każdy efekt zapisujący stan
   emituje zdarzenie, po którym widać zmianę.
2. DRUGA bramka: zdarzenie musi przejść przez filtr szumu
   (`isBotMoveNoise` — reguła wyciągnięta z session.js, ADR 0011). Buffy
   `untilEndOfTurn` przepuszczamy do modala „Rozgrywka" (M99), zwykłe
   przeliczenia P/T dalej są szumem.

**Strażnik:** `test/m255-petla-jakosci.test.js` A1–A4 (A3 = wyjątek
`untilEndOfTurn` w `isBotMoveNoise`, A4 = anty-over-fix).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L87)

## L86 (2026-08-28) — Warstwa prezentacyjna potrzebuje WŁASNEJ pauzy: obserwator zdarzenia nie zakłada, że gra na niego czeka

**Przypadek:** — „Rzuciłem czar, a akcja poszła dalej i zaczęła się następna tura i nieprzyjaciel rzucił czar i pokazał się ekran z grafikami tego ostat…

**Reguła:** UI pokazujące coś, co gracz ma ZOBACZYĆ (ilustracja, animacja,
„Ruch bota"), potrzebuje:
1. **sygnału zwrotnego** — obserwator mówi, czy warstwa naprawdę się pokazała
   (`true` = wstrzymaj), żeby karty bez ilustracji nie zatrzymywały gry;
2. **własnego stanu pauzy** — nie pożyczonego (wspólna flaga otwierałaby
   naraz modal „Ruch bota" i warstwę grafik);
3. **kolejki** — zamknięcie warstwy otwiera następny element, gra rusza przy
   pustej kolejce. Kolejkę wynieś do CZYSTEGO modułu
   (`src/table/art-showcase.js`): testowalna headless, bez DOM i sesji.

**Strażnik:** `test/m254-uwagi-wlasciciela.test.js` — szczegóły: archiwum (L86).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L86)

## L85 (2026-08-28) — `eventData.manaCost` to mana WYDATKOWANA, nie mana value karty

**Przypadek:** warunek `spellManaValueAtLeast: 4` czytał `eventData.manaCost` — przepuszczał czar z obniżką, odrzucał koszt alternatywny.

**Reguła:** warunek na mana value czyta OBIEKT. Przy dopisywaniu warunku do
triggera sprawdź, czy dane wejściowe to „wartość z karty" czy „wynik
rozliczenia" — w zdarzeniach silnika prawie zawsze to drugie.

**Strażnik:** `conditionHolds` (`src/engine/triggers.js`, wpis
`spellManaValueAtLeast`), testy „MV 4 odpala / MV 1 nie" w
`test/batch51-kart.test.js`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L85)

## L84 (2026-08-28) — Nowy deskryptor mechaniki ma cztery dowiązania poza silnikiem: strażniki zgłaszają je osobno, więc dopisz je od razu

**Przypadek:** — po dodaniu trzech elementów (`buff_attacking_creatures`, `buff_creature_until_end_of_turn`, zdarzenie `creature_became_renowned`) pełny…

**Reguła:** przy nowym deskryptorze (efekt, zdarzenie, filtr celu) odhacz
listę PRZED pierwszym uruchomieniem pełnego testu:
1. `EVENT_TYPES` + `describeGameEventRaw` (`src/table/session.js`) — zdarzenie
   bez opisu jest dla gracza niewidoczne (L24);
2. etykieta w mapie opisów (`src/table/render.js`) — strażnik M122;
3. wycena bota (`src/controllers/heuristic-bot.js`) albo świadomy wpis do
   `REVIEWED_UNVALUED` — strażnik M157;
4. `gameObjectDataOf` (`src/cards/materialize.js`) — deskryptor z definicji
   karty musi dojść na obiekt gry (L21: `renown` ginęło w materializacji).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L84)

## L82 (2026-08-28) — Test UI wiąże SKUTEK z hakiem semantycznym (klasa/`data-*`), copy pina się OSOBNYM testem

**Przypadek:** — poprawna etykieta „Użyj domyślnego przydziału (zabójcze obrażenia…)" złamała test `choice-request-ui` — test lokalizował przycisk po TE…

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L82)

## L81 (2026-08-28) — Zastępując ręczną kopię „wspólną funkcją prawdy", porównaj FILTRY obu stron, nie tylko listę przedmiotów

**Przypadek:** — bramka oferty `pass_priority` dostała `firstDecisionOwner == null` (dokończenie unifikacji z Batch 47).

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L81)

## L80 (2026-08-26) — „Dubel na stosie" to nie to samo co „efekt już zastosowany": strażnik idempotencji patrzy na STAN, nie tylko na stos

**Przypadek:** bot aktywował Saddle na Trained Arynx (`set_saddled`, idempotentny do EOT) 3× w turze, tapując stwory za nic.

**Reguła:** efekt idempotentny do EOT z ODCZYTYWALNĄ flagą stanu (`saddled`,
`cantBlock`, `monstrous`…) ma strażnik o DWÓCH nogach: (1) brak bliźniaka na
stosie (`pendingTwin`) ORAZ (2) cel/źródło nie ma jeszcze tej flagi w widoku
(ADR 0017). Noga (1) chroni tylko przed rozstrzygnięciem, po nim chroni (2).
Flaga po TYPIE efektu i deskryptorze stanu, nie po nazwie karty (ADR 0002).
Anty-over-fix: pierwsza aktywacja musi zostać legalna.

**Strażnik:** `src/controllers/heuristic-bot.js` (`set_saddled` +
`source.saddled` → −10), `test/m219-bot-resaddle-noop.test.js`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L80)

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

**Przypadek:** lektura startowa była czytana WE FRAGMENTACH (narzędzie ucinało pliki) — luki w regułach zostają niewidoczne.

**Reguła:**
1. Plik uznajesz za przeczytany dopiero po OSTATNIEJ linii — sprawdź `wc -l`
   i potwierdź zakres; dla `LESSONS.md` to WSZYSTKIE lekcje, nie tylko z góry.
2. Każdy sygnał fragmentacji (`truncated`, `hasMore`, `stdout_truncated`) to
   polecenie „dobierz następny fragment" — czytaj po zakresach (`sed -n`).
3. „Przejrzałem / streściłem" NIE jest przeczytaniem.

**Strażnik:** `AGENTS.md` §0 (blok „Każdy plik lektury obowiązkowej czytasz
W CAŁOŚCI…").

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L78)

## L77 (2026-08-26) — Wejście na pole bitwy to ZDARZENIE o wielu następstwach: decyzja blokująca ani `return` nie mogą wycinać reszty

**Przypadek:** **Devour** (Gorger Wurm, CR 702.82a): trigger ETB (Impact Tremors) odpalał w tym samym skanie, co decyzja devour — widział stwora PRZED licznikami.

**Reguła:** w zdarzeniu wejścia blokująca decyzja (devour/exploit/endure…)
pomija TYLKO własne następstwo; reszta biegnie dalej. Pytanie kontrolne: czy
ta gałąź (`return` / `push` decyzji) wycina coś, co zdarzyło się niezależnie?
Jeśli tak — `if` wokół decyzji, nie `return` z funkcji. Kolejność też jest
regułą: replacement przed triggerem (devour), trigger przed decyzją (exploit).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L77)

## L75 (2026-08-25) — Fałszywy alarm detektora: napraw POMIAR, nie ucisz objawu

M213: Żywy Tester zgłosił 4 no-opy na „{2}, {T}: Tap target creature". Sonda
dowiodła, że silnik działa poprawnie — zdolność tapuje DWA permanenty naraz
(źródło jako koszt, cel jako skutek), a detektor liczył oba jednym licznikiem,
więc warunek „jedyna zmiana to zapłacony koszt" wychodził prawdą. Rozróżnienie
jest strukturalne: płacących wskazuje KOMENDA (`objectId` + `tapCreatureId`).

→ Pełna klasa: [L27].** Fałszywy alarm kosztuje więcej niż cisza, ale zanim go
uciszysz — sprawdź, czy nie kłamie pomiar.
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

**Przypadek:** — naprawa wyceny darmowego rzutu wyglądała na działającą (testy zielone), a była martwa: helper szukał czaru po `cmd.cardId`…

**Reguła:** rozróżniaj tożsamość karty od tożsamości obiektu i sprawdzaj, po
czym indeksowana jest strefa. Gdy lookup zwraca `undefined`, kod nie jest
neutralny — jest WYŁĄCZONY: asertuj w sondzie, że lookup COŚ znalazł (L68).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L71)

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

M212: trzy partie po naprawie dały 0 zgłoszeń — fałszywie, bo archiwalny
transkrypt SPRZED naprawy zawierał wzorcowy przypadek, którego detektor też nie
widział. `detectBotSelfHarmOnOwnPermanents` ustalał właściciela celu, parsując
snapshoty „MOJE POLA:” / „POLA WROGA:”, a audyt biega z `--quiet`, gdzie w całym
pliku jest JEDEN snapshot. Detektor był martwy w jedynym trybie, w którym go
używano.

→ Pełna klasa: [L27].** Kluczowe: dane strukturalne ze sterownika zamiast
tekstu transkryptu; **zero z martwego detektora wygląda jak zero z czystej gry**.
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

**Przypadek:** sonda mierzyła STAN KOŃCOWY, nie sprawdzając, czy badana ścieżka w ogóle pobiegła.

**Reguła:** sonda silnika NAJPIERW asertuje, że komenda przeszła
(`assert.equal(result.ok, true)`), potem bada skutek; gdy ma udowodnić BŁĄD,
pokazuje stan pośredni (zdarzenie, licznik, zmiana pola). To samo w testach:
`ok` komendy jest częścią asercji, nie tłem (L13/L61).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L68)

## L69 (2026-08-25) — Dane karty i mechanika to dwa źródła prawdy o tym samym: kolor vs. produkowana mana

**Przypadek:** podstawowe landy miały `colors: ['R']` — pole „kolor" zapisano jako „jaką manę produkuje".

**Reguła:** gdy pole da się czytać na dwa sposoby, sprawdź, która ścieżka
silnika je czyta i po co. Kolor obiektu = wyłącznie CR 202.2; produkowana mana
= deskryptor `add_mana`. Test cementujący pomieszanie jest częścią błędu:
poprawiamy go razem z kodem.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L69)

## L70 (2026-08-25) — Weryfikacja mutacyjna wykrywa też kod NADMIAROWY

M210: mutacja gałęzi „obiekt typu Land → kolor pusty" (`effectiveColors`,
CR 202.2) nie uczyniła żadnego testu czerwonym, bo regułę egzekwowały już dane
kart. Gałąź była martwa **i błędna**: efekt animujący może kolor nadać (Genju of
the Spires, CR 613 warstwa 5), a zerowanie po typie by go zgubiło.

→ Pełna procedura: [L13].** Mutuj per gałąź; gałąź bez czerwieni jest
podejrzana — najpierw pytaj, czy powinna istnieć.
## L67 (2026-08-25) — Helper, który istnieje, ale nie jest wołany w gałęzi, gdzie miał chronić

**Przypadek:** — sweep Żywego Testera zaraportował `srodziemie vs ravnica s=7` jako `[STOP] brak akcji w kroku 59`, choć w tej samej linii stało „Koniec…

**Reguła:** gdy narzędzie zgłasza awarię, sprawdź, czy w kodzie nie leży już
gotowy warunek odróżniający awarię od stanu normalnego — i czy jest wołany na
KAŻDEJ ścieżce do tego stanu. Dopisanie warunku obok istniejącego to druga
definicja tej samej reguły (L41).

**Reguła druga:** po uciszeniu fałszywego alarmu udowodnij, że alarm NADAL
potrafi się odezwać (w archiwum zostały 4 realne `[STOP]` z niepustą listą
akcji — naprawa usunęła tylko ten jeden fałszywy). Naprawa wyłączająca
detektor jest gorsza od błędu, który naprawiała (L13/L61).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L67)

## L66 (2026-08-25) — Lektura obowiązkowa to BUDŻET: dokument bez limitu rośnie, aż zje kontekst

**Przypadek:** lektura startowa ważyła ~605 kB, z czego 384 kB to dziennik
125 sesji podszywający się pod „bieżący stan".

**Reguła:** lista lektur ma budżet i strażnika (100k tokenów;
`test/dokumentacja-budzet-lektury.test.js`); rozdziel „zasady" od „dziennika"
(HISTORY nie jest lekturą startową); zanim skrócisz — ZMIERZ rozkład (tu:
pozycja 2/3 zdjęta z listy bez kasowania linijki); numery lekcji to API
(cytowane ~1150 razy — nagłówki `## L<nr>` stabilne, bez renumeracji).

**Strażnik:** M208. → narracja: `docs/LESSONS_PRZYPADKI.md` (L66)
(skondensowana 2026-09-15 — płaci za L144 w budżecie lektury).

## L65 (2026-08-25) — Test, który przechodzi na przypadku odsianym przez WCZEŚNIEJSZY warunek, nie testuje tego warunku

**Przypadek:** — `targetSlotsOf` ma dwie bramki: (1) warianty równej długości, (2) pozycje nie dzielą kandydatów.

**Reguła:** pisząc test na warunek, sprawdź, czy przypadek do niego DOCIERA —
najprościej mutacją (skasuj warunek; zielone = przypadek odsiewany wcześniej).
Dla łańcucha bramek dobierz dane przechodzące wszystkie poprzednie i różnicujące
wyłącznie badaną (tu: czar o STAŁEJ arności 2 z jednej puli). „Mutacja
przeżyła" znaczy „mam lukę w danych", nie „mutacja jest równoważna".

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L65)

## L63 (2026-08-25) — Selektor sterownika, który nie pasuje do niczego, nie daje błędu — daje CICHĄ PĘTLĘ i fałszywe „brak zgłoszeń"

**Przypadek:** przebiegi Żywego Testera na części seedów nie kończyły się w limicie kroków: 300 identycznych linii, zero ruchów — i `== DETEKTORY: brak zgłoszeń ==`.

**Reguła:** gałąź sterownika obsługująca modal: (1) loguje, ILE elementów
znalazła („opcji 0" to alarm); (2) ma licznik nieudanych prób zamknięcia TEGO
SAMEGO okna i przerywa głośno po progu („Anuluj" odtwarzający żądanie nie jest
wyjściem z pętli); (3) traktuje `0 znalezionych` jako zerwany kontrakt DOM.
Kontrakt DOM, na którym opiera się sterownik, wart jest testu po stronie
aplikacji — inaczej refaktor renderera zrywa narzędzie bez czerwonego testu.

**Strażnik:** `tools/table-tester/run-game.mjs` (`MULTI_WIZARD_STUCK_LIMIT`,
log liczby wierszy), `test/m195-multi-target.test.js` (M206).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L63)

## L64 (2026-08-25) — Bramka na FAZĘ nie jest bramką na MOMENT: „phase === 'combat'" przepuszcza krok przed deklaracją

**Przypadek:** bot aktywował pump „+2/+2 do końca tury" w *Początku walki* i nie atakował (dwie many na efekt gasnący w cleanup) — co turę.

**Reguła:** wyceniając efekt ulotny, pytaj o STAN mający wpływ (czy stwór
walczy, czy cel zadeklarowany), nie o nazwę fazy/kroku; sprawdź w `TURN_STEPS`,
ile kroków ma faza i ile faz nosi nazwę kroku. Objaw widać w transkrypcie, nie
w teście jednostkowym.

**Strażnik:** `test/m206-audyt-rozgrywek.test.js` (A1/A1b/A1c — trzy jałowe
okna; A2 — pump w realnej wymianie zostaje).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L64)

## L61 (2026-08-25) — Test regresyjny bez weryfikacji mutacyjnej bywa ślepy

M205: dwa testy „przypinające" fix deduplikacji przedruków modala były zielone
także po cofnięciu fiksu — dane nie miały kształtu, w którym fix działa (test
mierzył `flush()`, nie naprawę). To L1 w najgroźniejszym wariancie: test
istnieje, ma nazwę i komentarz, więc temat uchodzi za zabezpieczony.

→ Pełna procedura: [L13].
## L62 (2026-08-25) — Kolejność renderu to część kontraktu: log rysowany od najnowszego łamie liczenie „nowych" po indeksie

**Przypadek:** — kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie `#log` po indeksie") znajdował 0 wpisów, choć sesja je generow…

**Reguła:** zanim oprzesz narzędzie na „nowe elementy = ogon listy", sprawdź w
renderze kierunek rysowania (`reverse()`, `prepend`, `insertBefore`,
`column-reverse`). Kolejność renderu to kontrakt UI jak nazwy klas.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L62)

## L60 (2026-08-24) — Narzędzie audytu, które milcząco przyjmuje złą konfigurację, produkuje audyty o czymś innym

**Przypadek:** Żywy Tester miał domyślne talie `--human green --bot red`; takich talii nie ma od M178 (ADR 0023).

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

**Strażnik:** M203 (walidacja w `parseArgs`, drugi bezpiecznik przy wyborze w
DOM, `--list-decks`, leniwy import, strażnik dokumentacji).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L60)

## L59 (2026-08-24) — Ograniczenie zasobu i koszt dodatkowy żyją w WIELU ścieżkach: definiuj przez ZAKAZ i pilnuj strażnikiem każdej ścieżki

**Przypadek:** — **N1.** Powerstone: „{T}: Add {C}.

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L59)

## L58 (2026-08-23) — Kod stołu jedzie do PRZEGLĄDARKI: globalna Node w rdzeniu to awaria produktu, której testy nie widzą

**Przypadek:** — w `scoreCommand` heuristic-bota została instrumentacja `if (process.env.BOT_DEBUG_SCORES && cmd.objectId === 'slaad') console.error(…)`.

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L58)

## L57 (2026-08-23) — Zgłoszenie właściciela weryfikujesz wobec Oracle/CR PRZED wdrożeniem; rozbieżność zgłaszasz, nie wdrażasz

**Przypadek:** — właściciel: „bot wszedł do Forge i wzmacnia MÓJ stwór — to bez sensu, powinien fizzle, gdy nie ma [własnej] kreatury".

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L57)

## L55 (2026-08-22) — Jedno pole na „cechę trwałą" i „efekt do końca tury" to bomba zegarowa; badge liczony z pola technicznego kłamie

**Przypadek:** — **M187/N1**: token Phyrexian Mite („This token can't block") blokował po pierwszym cleanupie — `cantBlock` niosło EFEKT…

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L55)

## L54 (2026-08-22) — Kara wyceny bota musi być MIERZONA względem bazy; każda klasa zachowań dostaje whitelistę ze strażnikiem

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
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L54)

## L53 (2026-08-22) — Test scenariuszowy na zamrożonym seedzie pełnej partii to dług odsetkowy

Cztery testy etykiet w table-session miały po 10+ wpisów „przelosowane
hunterem po batchu X" — każda zmiana talii oznaczała polowanie na seedy;
rewolucja talii (M178, ADR 0023) dała 95 czerwonych testów naraz. Reguła: test
etykiet/przepływu budujesz DETERMINISTYCZNIE (putCard + execute +
describeGameEvent), a zamrożony seed pełnej partii jest uzasadniony tylko tam,
gdzie testowana jest cała partia (fingerprint, determinizm, panel end-to-end).
Fixtury talii bierz z talii JEDNOPLANOWYCH (worki są przejściowe — ADR 0023 §5).
## L51 (2026-08-20) — Efekt celowany bez klasyfikacji to remis wariantów; strażnik zamiast łatek

**Przypadek:** — klasa L50 po raz szósty (M96, M135, M138/Z1, M146, M156/F1, M156/Q1+Q2): bot obdarowywał lifelink+indestructible stwora PRZECIWNIKA (Lo…

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L51)

## L50 (2026-08-18) — Nowy typ efektu w karcie batcha wymaga WYCENY w heuristic-bocie

**Przypadek:** — dwie karty Batch 35 weszły z martwą wyceną: bot aktywował Basilisk Gate ({2},{T}: +X/+X) na stwora PRZECIWNIKA, a Twiddle…

**Reguła:** przy nowym typie efektu sprawdź wycenę w OBU ścieżkach
(`cast_spell`, `activate_ability`); sonda: grep typu w
`src/controllers/heuristic-bot.js` przed merge. Audyt Żywym Testerem po batchu
z nowymi mechanikami obejmuje partie, gdzie BOT ma te karty.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L50)

## L1 (2026-08-14) — „Bot robi coś głupiego" bywa ślepotą, nie głupotą

**Przypadek:** `PlayerView` nie niosło danych, których potrzebowały decyzje kontrolera (M82/M84/M91).

**Reguła:** zanim uznasz zachowanie kontrolera za błąd heurystyki, sprawdź, czy
widok niesie potrzebne dane. Strojenie wag wokół brakującej informacji to
maskowanie objawu.

**Strażnik:** [ADR 0017](decisions/0017-playerview-completeness-contract.md).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L1)

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
## L5 (2026-08-14) — Strażnik mierzy REGUŁĘ, a nie tekst źródła

**Przypadek:** Strażnik, który da się przejść bez zmiany kodu, nie jest strażnikiem.

**Wpis zbiorczy** (kotwice: L26, L31, L44, L83).

**Reguła:**
1. Strażnik wydobywa fakty z KONSTRUKTÓW (literał tablicy, odczyt `state.pole`),
   a komentarze usuwa PRZED skanem (`stripComments`). Wzmianka pola nie jest
   pokryciem z definicji.
2. Każda klauzula „nie mam danych, więc przepuszczam" wymaga DRUGIEGO testu na
   OBECNOŚĆ tych danych. Pytanie: „co się stanie, gdy dane wejściowe znikną?" —
   „test przejdzie" oznacza brak bramki.
3. Dla mapy „identyfikator → tekst" potrzeba DWÓCH niezmienników: słownik
   pokrywa wartości z danych **oraz** kod nie wstawia surowego identyfikatora
   z pominięciem słownika (test czytający źródło).
4. Pin ma DWIE nogi (L67): (a) kompozycja nie liczy zakomentowanego odczytu;
   (b) ścieżka produkcyjna idzie przez tę kompozycję. Bez (b) obejście funkcji
   zostawia pin zielony.
6. Pytanie kontrolne do każdego strażnika: **czy da się przejść tę kontrolę bez
   zmiany kodu?** Jeśli tak — mierzy tekst (przykład: `repo-artefakty-audytu`,
   `.gitignore` przez `includes`). Obowiązuje też wobec strażników, które sam
   piszesz, w dniu ich powstania.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L5)

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

**Przypadek:** (a) handoff twierdził, że pięć fixów przepadło — bo nie były wypchnięte; (b) sandbox odtworzył workspace w środku pracy i commit wylądował na `main`.

**Reguła:**
- Commituj i pushuj po każdym samodzielnie zielonym kroku, nie zbieraj
  commitów „na koniec".
- Po commicie sprawdź `git log --oneline -1` (czy HEAD tam, gdzie trzeba).
- Po resecie workspace: `git fetch origin <gałąź>` + `git reset --hard
  FETCH_HEAD`; commit omyłkowo na `main` przenieś `cherry-pickiem` (najpierw
  `git branch backup-… <sha>`).
- Co ma przetrwać sesję, musi być W REPOZYTORIUM: ustalenie z czatu bez pliku
  nie istnieje.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L9)

## L10 (2026-08-14) — Zanim zaczniesz szukać winy w konfiguracji, sprawdź dane

**Przypadek:** — właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani informacji o CI.

**Wniosek:** stan po stronie GitHuba był poprawny — objaw dotyczył warstwy
prezentacji u zgłaszającego (cache przeglądarki).

**Reguła:** przy „coś nie działa w UI GitHuba" zbierz TWARDE DANE Z API przed
zmianą konfiguracji. Zmiana ustawień pod objaw widoczny w jednej przeglądarce
potrafi zepsuć działający setup.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L10)

## L11 (2026-08-14) — Jak skutecznie polować na błędy vs Comprehensive Rules

**Przypadek:** wyzwanie „znajdź 10 błędów" (M95) na engine z 1600 testami.

**Reguła:** kandydat wymaga repro headless PRZED naprawą i odróżnienia błędu
reguł od artefaktu testu (`addObject` domyślnie `summoningSickness: false`,
`pendingScry` wymaga `objectIds` — oba dały fałszywe alarmy). Warto spisać
obszary sprawdzone i POPRAWNE.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L11)

## L12 (2026-08-14) — Narzędzie audytowe też jest produktem: braki naprawiaj w nim

**Przypadek:** — audyt Żywym Testerem (M96) stanął na `[STOP] brak akcji` w oknie z przyciskiem „Epic Experiment: zakończ (reszta kart do grobu)".

**Reguła (decyzja właściciela):** jeśli tester czegoś nie widzi albo nie
obsługuje — POPRAWIAMY TESTER, nie akceptujemy braku. Zmiany w narzędziu idą
tym samym rygorem co produkcja (test + opis w commicie). Wyjątki JS i stderr
nie mogą znikać za „partia ukończona / 0 flag”: obserwuj `error` i
`unhandledrejection` od startu artefaktu, także w profilu impatient.
Strażnicy M348: `test/table-tester-runtime-errors.test.js`, żywe A/B.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L12)

## L13 (2026-08-15) — WERYFIKACJA MUTACYJNA: jedyny dowód, że test lub detektor działa

**Przypadek:** 9 detektorów Żywego Testera miało komplet testów jednostkowych (M102).

**Wpis zbiorczy** (kotwice: L61, L70, L114).

**Reguła:**
1. Test liczy się po dowodzie: **czerwienieje po cofnięciu naprawy**.
   Procedura: mutacja 1-liniowa → test MUSI paść → cofnij → zieleń →
   oba pomiary do commitu.
2. Mutuj per GAŁĄŹ. Gałąź niemutowalna = brak testu albo **zbędna
   reguła** — sprawdź istnienie; usunięcie bije utrwalenie testem.
3. Detektor: cykl „bug → zgłoszenie → fix → 0" w OBU trybach logowania.
   Unit dowodzi reakcji na SPREPAROWANE wejście, nie jego wystąpienia.
4. Gdy mutacja nie czerwieni, dane testu nie mają kształtu produkcyjnego —
   odtwórz je z REALNEGO artefaktu.
5. „Przypięte testem" bez pomiaru przed/po = zdanie do sprawdzenia, nie fakt.
6. Oczekiwanie testu też wymaga Oracle/CR (m334/C: nieistniejące ETB;
   m336/E2: SBA w środku czaru). Nie utrwalaj błędnej reguły dla
   zielonego pinu. Sprawdzaj datę CR: archiwum może cytować starą
   regułę (PR #106).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L13)

## L14 (2026-08-15) — Jedna instrukcja, dwie zasady: sklejone reguły to gotowy bug

**Przypadek:** — M101/B5 (CR 302.6) i B6 (CR 702.19b) to ten sam błąd w dwóch miejscach: **dwie niezależne zasady wyrażone jedną instrukcją** —…

**Wzorzec:** reguła B obowiązywała „przy okazji" reguły A. Kod nie był zły, był
NIEDOSPECYFIKOWANY — w miejscu, gdzie testy przechodziły, bo szczęśliwa
ścieżka pokrywała obie naraz.

**Reguła:** jedna instrukcja = jeden punkt CR, nawet gdy dziś dają ten sam
wynik. Polując na błędy, pytaj nie „co ten kod robi?", tylko „od czego ten kod
UZALEŻNIA regułę i czy CR uzależnia ją tak samo?" (B5 wyszedł z pytania, czy
choroba przywołania naprawdę zależy od odkręcenia).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L14)

## L15 (2026-08-16) — Gdy detektory milkną, szukaj „ofert bez skutku" (M102)

**Przypadek:** Audyt Żywym Testerem dał 10 błędów, ale po U7 narzędzie zamilkło (14 partii, 11 kombinacji talii, 4 profile, zero trafień).

**Wniosek:** zgodność z zasadami to DOLNA granica jakości. Skan „powtórzona
akcja z tym samym celem" (`grep -ohP "^\s*>> \K.*" transkrypt | uniq -d`) dał
dwa z trzech błędów.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L15)

## L16 (2026-08-16) — Sonda „oferta bez skutku" wymaga, by OCZEKUJĄCA DECYZJA była stanem (M103)

**Przypadek:** detektor `noop` (L15) dał alarm na Lodestone Needle: „jedyna zmiana to zapłacony koszt", choć klik otwierał WYBÓR artefaktu do wygnania.

**Reguła:** każda struktura BLOKUJĄCA priorytet musi być częścią
fingerprintu — generyczna sekcja `pendingDecisions` z listą
`PENDING_DECISION_FIELDS`; nowe pole wstrzymujące MUSI na nią trafić. Obrona w
głąb sondy: po symulacji sprawdza, czy okno priorytetu ma pass (brak passu =
komenda otworzyła decyzję).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L16)

## L17 (2026-08-16) — Bundler jednoplikowy nie zna aliasów importów, a jsdom nie zna structuredClone (M103)

**Przypadek:** — sonda „oferta bez skutku" działała w Node, a w artefakcie umierała („runProbeCommandEffect is not defined", potem „structuredClone is not defined").

**Reguła:** kod trafiający do artefaktu: (a) bez aliasów importów, (b) żadnych
Node-globali (`structuredClone`, `Buffer`, `process`), (c) po zmianie mostka
artefaktu zweryfikuj go Żywym Testerem na ZBUDOWANYM pliku.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L17)

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

**Przypadek:** weryfikacja mutacyjna bramki ofert (M104) nie zadziałała: po jej cofnięciu panel oferował „Aktywuj: Rustvine Cultivator…", a oś `noop` raportowała zero.

**Reguła:** gdy sonda pracuje na KLONIE stanu, mierz KAŻDĄ ofertę widoczną w
oknie (z dedupem po kluczu opcji i limitem na partię). Pytanie ogólne: czy
pomiar obejmuje całą przestrzeń, którą widzi gracz, czy tylko ścieżkę
sterownika? (Ujawniło w M104 dwa braki naraz: nieskanowane opcje modali i
oferty panelu.)

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L20)

## L21 (2026-08-16) — JAWNA LISTA PÓL gubi dane po cichu — w każdej z czterech warstw

**Przypadek:** dane karty jadą do gry przez kilka miejsc, z których KAŻDE
wymienia pola z nazwy (destrukturyzacja configu albo ręcznie budowany obiekt).
**Wpis zbiorczy** (klasa w czterech warstwach; kotwice: L93, L94, L101).
**Reguła:** (1) Dodając pole mechaniki do `defineCard`, przejdź **wszystkie
cztery warstwy** (nie tylko tę, w której zgłoszono błąd; grep „M146"
w `deck.js`) — kierunek docelowy: transportować deskryptory ZBIORCZO (spread
listy pól), żeby lista była jedna. (2) Stan spoza kontraktu fabryki ustawiaj
JAWNIE po dodaniu obiektu (`state.objects.set(id, Object.freeze({ ...obj,
tapped: true }))`) i sprawdź, czy asercja odróżnia stan POCZĄTKOWY od skutku.
(3) Pin idzie przez **realną ścieżkę** (`setupCardMatch`: registry →
createCardDeck → installDeck → obiekt), nigdy przez własny helper. (4) Strażnik
jest KLASOWY: enumeruje `REGISTRY.all()`, buduje obiekt realną drogą i porównuje
pola wejścia z polami wyjścia. (6) „Silnik liczy dobrze" nie zamyka zgłoszenia:
`legalCommands` czyta z OBIEKTU, `commandLabel` z WIDOKU — dwa różne źródła.
Pełne przykłady per warstwa: archiwum.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L21)

## L22 (2026-08-16) — Akcja, która PRZEWIJA grę, musi kończyć się ponownym renderem

**Przypadek:** — po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne tapnięcie gracza dawało „Ruch odrzucony: illegal_cast…

**Reguła:** każda ścieżka UI mogąca zmienić stan gry (`apply`,
`continueBotPlay`, `recheckAutoPass`, wznowienie zapisu) kończy się tą samą
sekwencją co `playDirect`: **zapis → render → pokaż ruchy bota**. Render PRZED
zmianą stanu nie jest renderem po zmianie. Objaw klasy: odrzucane komendy tuż
po akcji „nic nie robiącej" w grze (przełącznik, ptaszek, zamknięcie modala) —
szukaj brakującego renderu, zanim podejrzewasz reguły.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L22)

## L23 (2026-08-16) — Koszt karty to DANE: pipy kolorowe i mana value weryfikujesz maszynowo

**Przypadek:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" jako sama liczba many, a {2}{U} jako `manaCost: 2` (karta o manę tańsza).

**Reguła:** dane w dwóch reprezentacjach dostają strażnika porównującego je
maszynowo (`manaCost` = mana value stringa kosztu dla KAŻDEJ karty; osobny skan
porównuje pipy linii „{koszt}: efekt" z `cost.colors`). Skanery, które trafiły,
zostaw w pakiecie jako test-strażnik.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L23)

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

**Przypadek:** — po dołożeniu jednej karty do `decks/green.txt` posypało się pięć testów niezwiązanych z nowymi kartami („log nie opisuje tworzenia tokenu…

**Reguła:** asercja na TREŚĆ logu opisuje zdarzenie, nie osobę — dopuszczaj
obie formy (`/tworzy(sz)? token/`) albo sprawdzaj zdarzenie w
`session.state.events`. Każdy seed zamrożony w teście dostaje komentarz
„przelosowany po zmianie X"; po batchu kart przejrzyj WSZYSTKIE testy grające
pełne partie.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L25)

## L26 (2026-08-17) — Strażnik z klauzulą „brak danych = pomijam" nie jest strażnikiem

W katalogu siedział zmyślony adres ilustracji (nazwa karty w miejscu UUID) —
404 i karta bez obrazka, mimo testu „imageUri zgadza się z plikiem Scryfall".
Test miał `if (!expected) continue`, a 20 kart weszło BEZ pliku źródłowego
(ADR 0010 §2a): im więcej kart z pominięciem procedury, tym mniejszy zasięg
testu — a zielony wynik sugerował coś odwrotnego.

→ Pełna klasa: [L5].** Każde „nie mam danych, więc przepuszczam" wymaga
drugiego testu na OBECNOŚĆ danych.
## L27 (2026-08-17) — ZERO ZGŁOSZEŃ detektorów to pomiar NARZĘDZIA, nie produktu

**Przypadek:** — Dwukrotnie ten sam wynik: 12 partii (L27) i 22 partie (L40) z pustą sekcją `== DETEKTORY ==`, a ręczna lektura TYCH SAMYCH transkryptów…

**Wpis zbiorczy** (kotwice: L40, L73, L75).

**Reguła:**
1. Raport detektorów to DOLNA GRANICA. Czytaj „zero zgłoszeń" jako **„moje
   reguły nie obejmują tego, co się wydarzyło"**.
2. Każda sesja audytowa czyta transkrypt RĘCZNIE wzdłuż osi z
   `docs/setup/TESTER_STOLU.md`, a **każda klasa znaleziona ręcznie kończy się
   nowym detektorem**. Właściwa miara postępu: ile klas przestało być
   niewidzialnych (z 10 znalezisk L40 trzy dały się skodyfikować — i w kontrolnym
   biegu wykryły JEDENASTE, przeoczone ręcznie).
3. **Weryfikacja DWUSTRONNA obowiązkowa:** na materiale sprzed naprawy detektor
   MUSI zgłosić, po naprawie MUSI zamilknąć. Zero z martwego detektora wygląda
   identycznie jak zero z poprawnej gry.
4. Detektor opiera się na danych STRUKTURALNYCH ze sterownika, nigdy na tym, ile
   narzędzie akurat wypisało w danym trybie logowania.

6. Skan transkryptu czytaj PER ETYKIETA: `LOG:` stołu to gra,
   `RĘKA:`/`POLA:` to tekst karty (fałszywe pozytywy skanów), a fraza
   z `textContent` bywa artefaktem ekstrakcji (ikony many) — zanim zgłosisz
   defekt, sprawdź źródło w renderze.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L27)

## L28 (2026-08-17) — Kary dopisywane „przy okazji zgłoszenia" zostawiają dziurę na każdy nowy typ

**Przypadek:** Bot tapował własne stwory (Chill of the Grave) i zakładał aurę na własnego stwora — kary za krzywdzenie własnych rzeczy istniały od M91–M96.

**Reguła:** dla rodziny reguł tego samego kształtu („nie rób X samemu sobie")
buduj **tabelę typów + jedną funkcję egzekwującą**, nie n rozproszonych `if`.
Sygnał: druga/trzecia łatka tego samego kształtu = inwentaryzacja WSZYSTKICH
typów (tu: 44 z `card-data.js`) i odwrócenie domyślności.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L28)

## L29 (2026-08-17) — Fallback `?? slug` to cichy wyciek, nie zabezpieczenie

**Przypadek:** — Trzy z dziesięciu błędów M122 miały ten sam kształt: gracz widział surowy identyfikator (`trigger (enchanted_permanent_tapped)`…

**Reguła:** wszędzie, gdzie jest mapa „identyfikator → tekst dla gracza",
napisz **test-niezmiennik**: każdy klucz występujący w danych ma wpis w mapie.
Inwentaryzacja jest tania (jeden przebieg po rejestrze) i wyłapuje całą rodzinę
(przy 35 eventach triggerów tester trafił 1 z 2 braków, przy 121 typach efektów
— 1 z 9).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L29)

## L30 (2026-08-17) — Ukrycie informacji musi być zrobione w KAŻDEJ ścieżce renderu

**Przypadek:** Modal „Rozgrywka" pokazywał ilustrację karty dobranej przez bota, choć tekst wpisu był poprawnie bezimienny („Nieprzyjaciel dobiera kartę").

**Reguła:** przy informacji ukrytej (ręka, biblioteka, face-down) pytaj nie „czy
ukryłem nazwę?", tylko „ILE jest ścieżek, którymi ta karta może dotrzeć do oczu
gracza?" (tekst, miniaturka, alt, tooltip, log, podgląd strefy). Najbezpieczniej
odciąć dane u ŹRÓDŁA (nie wpuszczać `cardId` do wpisu).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L30)

## L31 (2026-08-17) — Strażnik kompletności słownika nie zastępuje strażnika miejsc użycia

M122 dołożyło test „każdy event triggera ma wpis w `TRIGGER_EVENT_LABELS`".
Zielony — a właściciel zobaczył „Chronic Flooding — trigger
(enchanted_permanent_tapped)": ten sam `case` miał TRZY gałęzie `return`
i tylko jedna sięgała po słownik. Strażnik pilnował DANYCH, błąd siedział
w KODZIE.

→ Pełna klasa: [L5].

**Osobna uwaga:** gdy właściciel mówi „przycisk jest nieaktywny", zweryfikuj to
dosłownie — tu `disabled` było `false`: przycisk działał, ale jego jedyny skutek
był niewidoczny. „Brak skutku" prowadzi do innej naprawy niż „element
zablokowany".
## L32 (2026-08-17) — Gdy druga enumeracja tworzy duplikat, dedupuj wynik, nie dokładaj bramki

**Przypadek:** Karta z flash pojawiała się w panelu dwa razy (`playerView` enumeruje ją w blokach flash i main-phase).

**Reguła:** niezmiennik nakładaj na WYNIK („żadna komenda nie powtarza się w
ofercie"), nie na każde źródło. Koszt znikomy, ochrona obejmuje bloki, które
dopiero powstaną (ten sam wzorzec: mulligan M119/Z3, szukanie M122/#2 — trzy
zgłoszenia tego samego kształtu znaczą, że reguła należy do warstwy wyjścia).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L32)

## L33 (2026-08-17) — Narzędzie audytu, które „porządkuje" dane, kłamie o stanie gry

**Przypadek:** Transkrypt Żywego Testera zwijał identyczne kafle (klucz: 40 znaków tekstu): dwa realne permanenty widniały jako jeden.

**Reguła:** w narzędziu audytowym deduplikacja jest wrogiem — skracaj wyjście
JAWNIE i bez utraty liczności („×2"). Gdy obraz stołu przeczy panelowi akcji,
najpierw podejrzewaj NARZĘDZIE (L33): panel czyta stan bezpośrednio, transkrypt
przechodzi przez ekstrakcję.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L33)

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

**Przypadek:** testy z zamrożonym seedem wymagają przelosowania po zmianie talii — to normalne.

**Reguła:** zanim uznasz spadek za regresję, sprawdź, czy zmieniło się to, co
metryka MIERZY. Przy zmianie danych wejściowych powtórz pomiar na większej
próbce. Próbka progu musi mieć rozrzut wyraźnie mniejszy niż różnica do
wykrycia.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L36)

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

**Przypadek:** — walidacja kontraktu `addObject` (L21) włączona twardo dała 141 czerwonych testów — „zrób to porządnie" oznaczało „nie rób tego nigdy" (le…

**Reguła:** strażnik na istniejący kod projektuj DWUTRYBOWO: domyślnie
ostrzeżenie z podpowiedzią i deduplikacją (jedno na pole, nie na wywołanie),
twardy tryb za zmienną środowiskową (`MTG_STRICT_ADD_OBJECT=1`) dla sprzątania i
strażnika pilnującego, że ŚWIEŻY kod w `src/` jest czysty. Nowy dług niemożliwy
od dziś, stary spłaca się przy okazji.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L38)

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
## L40 (2026-08-18) — Każdy detektor koduje JEDNĄ hipotezę; druga przekątna jest niepilnowana

22 partie i pusta sekcja `== DETEKTORY ==`; ręczna lektura tych samych
transkryptów dała DZIESIĘĆ znalezisk. `detectBotSelfTargeting` pilnował efektu
SZKODLIWEGO w SIEBIE — wariant „efekt KORZYSTNY w PRZECIWNIKA" (bot wzmacniał
moje stwory 24 razy w partii) nie miał strażnika. `detectNoEffectOffers` mierzył
oferty, nie OPISY, więc kafel kłamiący o koszcie przechodził bez echa.

**Reguła:** po audycie pytaj o KLASĘ — jaka reguła znalazłaby to automatycznie?
→ Pełna klasa: [L27].
## L41 (2026-08-18) — Trzy kopie tej samej logiki rozjeżdżają się cicho i kłamią graczowi

**Przypadek:** kafel Goblin Pickera obiecywał „{1}, {T}: dobierz 1 kartę", a aktywacja odrzucała kartę i wymagała czerwonej many.

**Reguła:** ta sama informacja formatowana w kilku miejscach = JEDNA tabela
używana wszędzie (L28 dla prezentacji). Rozjazd nie wywala testów: objawia się
tylko tym, że gracz płaci koszt, o którym nie wiedział. Strażnik DWUSTRONNY:
„każde pole z DANYCH ma wpis", nie „tabela niepusta" (L31).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L41)

## L42 (2026-08-18) — Efekt „do odwołania" wycenia się razem z ZEGAREM, nie tylko z celem

**Przypadek:** — „najefektywniejsze jest tapowanie kreatur przeciwnika po jego fazie untap — wtedy kreatura jest nieczynna i w ataku, i w obronie".

**Reguła:** wyceniając efekt czasowy, zapytaj „do kiedy to działa i co
przeciwnik straci w tym oknie?". Untap step odkręca permanenty AKTYWNEGO gracza
(CR 502): tapnięcie w mojej turze żyje chwilę, tuż po jego untapie — całą jego
turę i moją następną. Rodzina: „doesn't untap", prewencja obrażeń, pumpy „until
end of turn".

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L42)

## L43 (2026-08-18) — Deskryptor „po nazwie pola" to heurystyka; do KASOWANIA obiektu potrzeba flagi jawnej

**Przypadek:** reguła CR 704.5e („token poza polem bitwy przestaje istnieć") napisana po deskryptorze „token = obiekt z polem `name`" skasowała zwykłe KARTY (testy legalnie nadawały `name`, np.

**Reguła:** dobierz siłę deskryptora do siły skutku. Filtrowanie może iść po
heurystyce; TRWAŁE zniszczenie wymaga jawnego znacznika (`isToken` ustawiany
wyłącznie w `createBattlefieldToken`) — wciąż generycznego (ADR 0002).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L43)

## L44 (2026-08-18) — Komentarz z numerem reguły nie jest dowodem; sprawdź źródło

**Przypadek:** W silniku stało `// CR 701.38: goaded creatures can't block` w trzech miejscach, z testem utrwalającym.

**Reguła:** gdy kod ogranicza graczowi legalną akcję, czytaj TREŚĆ reguły.
Podejrzane są mechaniki „X nie może Y", gdzie oryginał brzmi „X musi Z" — wymóg
łatwo zmienia się w pamięci w zakaz. Przy korekcie odwróć test i dopisz
uzasadnienie. → Pokrewne: [L5] (test pilnował zgodności z błędem, nie
z zasadami).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L44)

## L45 (2026-08-18) — Mgła wojny wycieka polami pobocznymi, nie tożsamością

**Przypadek:** — widok ukrywał `cardId` i linię typów zakrytego permanentu (CR 708.2), a każdy z pięciu morphów dawał się rozpoznać po `subtypes` („Bird",…

**Reguła:** ukrytą informację testuj przez NIEROZRÓŻNIALNOŚĆ: weź wszystkie
obiekty, które mają wyglądać tak samo, policz odcisk widoku każdego i wymagaj
JEDNEGO elementu w zbiorze. Taki test łapie każde przyszłe pole; lista pól —
tylko zapamiętane.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L45)

## L46 (2026-08-18) — Animacja „do końca tury" + trwały stan = cleanup musi resynchronizować

**Przypadek:** — Spacecraft Wedgelight Rammer (próg 9+ charge → stwór) ożywiony do 5/5 animacją Skilled Animator wracał do art…

**Reguła:** gdy encja ma efekt chwilowy i trwały warunek, cleanup przywracający
chwilowy MUSI przeliczyć trwały. Inaczej trwały stan ginie razem z chwilowym,
choć jego przyczyna nadal istnieje.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L46)

## L47 (2026-08-18) — Kopiowalne cechy to WSZYSTKIE drukowane deskryptory, nie tylko P/T

**Przypadek:** — token-kopia Wedgelight Rammer (Cogwork Assembler, CR 707.2) rodziła się jako artefakt bez progu 9+ i nigdy nie stawała się stworem; ten s…

**Reguła:** przy nowym deskryptorze karty (station, saga,
`entersWithCounters`…) dopisz go w KAŻDEJ ścieżce kopiowania — rodzinę
ścieżek wymieniaj grepem, bo listy pól żyją per-ścieżka: `create_copy_token`
(`effects.js`), `resolve_enter_as_copy` (`game-state.js`), konfig
`createBattlefieldToken` (`tokens.js`) i `printLki` (`triggers.js` — kopia
z LKI po zejściu źródła, F3/PR #97). **Korekta 2026-09-05 (audyt PR #97/O4):**
`copyableDescriptorKeys` nigdy nie powstało — „listę w jednym miejscu" było
postulatem, nie stanem kodu; strażnikiem jest test kopiujący NOWY deskryptor
przez realną ścieżkę (wzorzec L21 pkt 3), a nie obietnica wspólnej listy.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L47)

## L48 (2026-08-18) — OFERTA i WALIDACJA to jeden filtr, jeden porządek i jeden rejestr

**Przypadek:** Bot wybierał biały czar na cel z `protection from white`: `legalSpellCasts` filtrował tylko `isProtectedFromSource`, a `validateTargets…

**Reguła:**
1. Nowa ochrona / `pending*` trafia w TRZY miejsca: `legalTargetCandidates`
   (oferta), `validateTargets` i OBA boty (`heuristic`: `anyResolve`;
   `aggro`: `simple`).
2. Nowe zdarzenie z rodziny trafia do KAŻDEGO skanu tej rodziny (`dies`,
   `leaves_battlefield`, „permanents you control leave").
3. „Kto decyduje" to JEDNA funkcja (`firstPendingDecision → { playerId, kind }`):
   pierwszy właściciel = pierwsza bramka `execute` = pierwsza gałąź ofert.
4. Bramka „coś czeka" warunkuje na WŁAŚCICIELA i RODZAJ, nie na niepustość
   kolejki (blokowałaby wcześniejszą decyzję).
5. Predykat blokady jest jeden i wołają go OBIE strony (`exploitDecisionPendingFor`,
   `closingCombatPassBlocked`).
6. Przy N-tej powtórce szukaj WSPÓLNEGO MIANOWNIKA (L28).
7. Martwy wartownik (mutacja nie czerwieni) do usunięcia, nie „dokumentacja
   zamiaru" (L5).
8. Nowy `pending*` ma SIEDEM bramek do zmutowania, nie jedną ścieżkę: oferta po
   wariancie, cudzy decydent odrzucony, właściciel bez passa (M337), pole
   w odcisku (B2), etykieta + grupowanie (m163/m201), wycena bota, re-walidacja
   przy wykonaniu (CR 608.2b). Pin ścieżki „szczęśliwej” zostawia pięć żywych
   (audyt PR #130/D: `resolve_aura_host` — mutacje Q3–Q5 przeżyły). Strażnik:
   `test/audyt-pr130-gospodarz-aury.test.js`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L48)

## L49 (2026-08-18) — Plik startowy musi kazać CZYTAĆ ADR-y, zanim agent odezwie się w czacie

**Przypadek:** nowa sesja zapytała właściciela „co robimy?" zamiast wykonać ADR 0020, choć AGENTS i lekcje już istniały.

**Reguła:** `AGENTS.md` to jedyny plik startowy niezależny od czatu. Jego
PIERWSZA sekcja to obowiązkowa lektura: ten plik → **wszystkie** ADR-y →
LESSONS → ENVIRONMENT, potem dopiero stan projektu. Co robić jest w ADR 0020,
nie w pytaniu do właściciela.

**Strażnik:** `AGENTS.md` §0, wskaźnik w `README.md`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L49)

## L52 (2026-08-20) — Ścieżka mechaniki zależna od przyszłych kart: zaimplementuj i zasygnalizuj, nie odnotuj

**Przypadek:** — audyt PR #66 zostawił dwie obserwacje „bez zmian kodu": `resolve_madness_cast` wołał bezwarunkowo `castPermanent` (pierwsza karta insta…

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

**Strażnik:** M161 (routing madness po `kind`, `castMadnessSpell`,
`test/m161-madness-spell-path.test.js`).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L52)

## L56 (2026-08-23) — Twierdzenie o danych sprawdzasz GREPEM, zanim je zapiszesz

**Przypadek:** M196 ogłosiło „nowy plan w katalogu: Kamigawa".

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L56)

## L89 (2026-08-29) — Przebieg, którego nikt nie dograł: długi bieg loguje postęp, a rozmiar macierzy wyznacza budżet, nie liczba kombinacji

**Przypadek:** — `node tools/benchmark.mjs --full` liczył się 63 minuty CPU bez jednej linii logu (raport powstaje po ostatnim meczu) — nie dało się odr…

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

**Strażnik:** `test/benchmark-progress-watchdog.test.js` — szczegóły: archiwum (L89).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L89)

## L90 (2026-08-29) — Trzecia powtórka klasy: oferta i walidacja rozjechały się PORZĄDKIEM

Pierwsza pełna macierz, która dobiegła do sensownego momentu, stanęła na 58,5%:
`exploit_unresolved — aggro(tarkir-bg) vs random(theros), seed 1003`. Bot dostał
w ofercie `resolve_trigger_target`, a odrzuciła go bramka exploitu, której
w ofercie nie było widać: `firstPendingDecisionPlayerId` układał decyzje „cel
triggera → exploit", a bramki w `execute` stały odwrotnie.

To nie dwie kopie jednej reguły, lecz **dwa porządki tej samej reguły**.

→ Pełna klasa i reguła: [L48].
## L91 (2026-08-29) — „Trigger bez efektu" ma trzy różne przyczyny; liczenie zdarzeń to ich przybliżenie, nie reguła

**Reguła:** powód mieszka w warstwie EFEKTU — tabela `EMPTY_RECEIVER_EFFECTS[type]`
zwraca POWÓD (nie boolean), a selektor zbioru odbiorców jest JEDEN dla oferty,
strażnika i samego efektu (L41/L48). Każdy wpis tabeli ma kontrolę POZYTYWNĄ
(zbiór NIE jest pusty), bo bez niej asercja „brak komunikatu" bywa zielona, gdy
nic się nie dzieje (M255/G2). Efekt, który ma w zbiorze samego siebie, nie
zgłasza pustego zbioru — ale idempotentny działa na GOSPODARZA (`attachedTo`),
nie na źródło; są wyjątki zbiorowe (`STATE_IDEMPOTENT_MASS_EFFECTS`, M106/Z2).
Heurystyka NAZWY (`_each_`, `_all_`) żyje wyłącznie w strażniku (silnik kluczuje
po typie), a komunikat dla gracza mówi, co zrobić dalej — nie tylko, że coś nie
zadziałało. Szczegóły punktów 3–5: archiwum.
**Strażnik:** `test/m256-zywy-tester-runda2.test.js` (H1–H7, 15 testów).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L91)

## L108 (2026-08-31) — Deadlock reguł: szukaj par „musisz X" / „nie możesz X"

**Reguła:** wypisz wszystkie ograniczenia jako WYMOGI („attacks each combat
if able", „must be blocked", „must attack a Planeswalker if able") i ZAKAZY
(„can't attack alone", „can't block", „can't attack unless..."). Dla każdej
pary wymóg×zakaz dotyczącej tego samego obiektu sprawdź przypadek brzegowy,
w którym zbiór alternatyw kurczy się do jednego elementu — tam wymóg i zakaz
się spotykają. CR rozstrzyga to klauzulą **„if able"**: wymóg milczy, gdy
czynność jest nielegalna. Silnik musi implementować „if able" jawnie, bo
naiwny zapis („zawsze wymagaj") jest sprzeczny z zakazem.

Test na deadlock jest tani i powinien być domyślnym elementem strażnika
każdego kroku z wyborem: **„gracz ZAWSZE ma co najmniej jedną legalną
opcję"** — enumerator skonfrontowany z walidacją (L48).

**Strażnik:** `test/m270-wymog-ataku-if-able.test.js`,
`test/m372-znaleziska-j-wymog-ataku-pass.test.js`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L108)

## L109 (2026-08-31) — „Komentarz tłumaczący duplikat" to znacznik błędu

**Przypadek:** W M271 (błędy #11/#12) ręczna kopia kodu przenoszenia miała komentarz: „ruch zrealizowany wprost, żeby nie tworzyć cyklu importów".

**Reguła:** komentarz uzasadniający, dlaczego kod NIE korzysta ze wspólnej
ścieżki („żeby uniknąć cyklu", „dla wydajności"), traktuj jak zgłoszenie błędu,
nie jak dokumentację; ograniczenie architektoniczne rozwiązuje przesunięcie
WARSTW, nie powielenie logiki. **Zastosowane w M271:** `deathZoneFor` i
`spellExitZone` zeszły do `zones.js`, `mover.js` wstrzykuje choke point rejestrą,
osiem kopii reguły „gdzie ląduje czar" → jedna.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L109)

→ Pełna klasa i reguła: [L107].

## L110 (2026-08-31) — Usunięcie duplikatu odsłania błędy, które maskował

M271: zastąpienie ręcznej kopii choke pointem wywołało regresję — benchmark
botów wywracał partię na inwariancie „załącznik wskazuje nieistniejącego
gospodarza". Winna nie była nowa zmiana: ręczna kopia nie sprawdzała
inwariantów, więc niespójny stan pośredni nikogo nie bolał. Prawdziwym błędem
była kolejność odczepiania KILKU załączników (#16).

1. Po sprowadzeniu ścieżki do helpera uruchom NAJSZERSZY zestaw
   (`npm run test:all`, w tym benchmark botów) — `npm test` tego nie złapał.
2. Nie cofaj naprawy — znajdź, co duplikat maskował. Inwarianty na końcu
   operacji widzą stan POŚREDNI przy rekurencji: pętla zmieniająca wiele
   powiązanych obiektów musi najpierw zerwać wiązania, potem stosować polityki.

→ Klasa nadrzędna: [L107].
## L111 (2026-08-31) — sonda wołająca `applyEffect` pomija state-based actions

M272: „zmiana kontroli nie usuwa atakującego z walki" (CR 506.4) wyglądało na
błąd — repro przez `applyEffect` pokazywało stwora w `state.combat.attackers`.
Regułę egzekwuje jednak `state-based.js` od M201; sonda nie przepuszczała
stanu przez pętlę SBA, więc widziała stan pośredni. Naprawę wycofano.

Przed uznaniem braku reguły za błąd: (1) repro przez PEŁNĄ komendę
(`execute`), nie `applyEffect`; (2) grep zdarzenia w CAŁYM `src/` — reguła
bywa w `state-based.js`; (3) test falsyfikacyjny: usuń własną łatkę i sprawdź,
czy repro nadal przechodzi. Punkt 3 jako jedyny łapie to niezawodnie.
## L112 (2026-09-01) — Klasę błędów tępi narzędzie, nie kolejna para oczu

M273 (platyna, ADR 0027). 10 z 25 błędów czterech odznak to JEDEN wzorzec
([L107]): ścieżka omija choke point albo gubi pole zdarzenia oczekiwane przez
konsumenta. Emitera bez `toZone` (#20) przeoczyłem wzrokiem — znalazł go skan.
Gdy klasa wraca trzeci raz: przestań szukać egzemplarzy, napisz analizator.

Wymiary skanu (`tools/event-contract-audit.mjs`, w `npm test`):
1. ROZJAZD ŁADUNKÓW — pole w ≥60% i <100% emiterów zdarzenia: konsument
   dostanie `undefined` (#22 `card_revealed.cardId`; #23 `spell_cast.colors`
   w 5 ścieżkach alternatywnego rzucania — czar udawał bezbarwny).
2. CECHY WEJŚCIA — ile ścieżek ETB zna cechę. Liczniki: 1 z 18 (#24,
   CR 121.6 — reanimowany Servant of the Scale wracał jako 0/0).
3. RĘCZNE MUTACJE `state.zones` — ominięcie choke pointu gubi jego reguły
   (#25: skasowany token zostawiał wiszące id w `state.combat`, CR 506.4).

→ Pełna klasa: L27 i L13 (wymogi wobec detektora i jego mutacji tam).
## L113 (2026-09-01) — Filtr wyciszający w strażniku opisuje INTENCJĘ, nie ciąg znaków

M274. Strażnik z M273 („każda ścieżka ETB zna liczniki") przepuścił trzy
ścieżki. Dwie dziury:
1. **Skanował jeden plik** (`effects.js`), a klasa mieszka w trzech (+
   `triggers.js`, `game-state.js`). Zasięg skanu = zasięg KLASY, nie pliku
   z pierwszym przypadkiem.
2. **Wyciszenie po ciągu znaków**: filtr pomijał okno zawierające `faceDown`
   (intencja: „wejście zakryte nie dostaje liczników", CR 708.2), ale Pyxis
   ustawia `faceDown: false` — ODKRYWA kartę — więc wyciszył przypadek, którego
   miał pilnować. Wyjątek zapisuj jako WARUNEK, nie jako obecność słowa.

Po poszerzeniu skanu uruchom go od razu: poprawiony filtr sam wskazał czwartą
ścieżkę (Dragon Arch), której nie dał ręczny przegląd.

**Fałszywe MILCZENIE strażnika jest gorsze od fałszywego alarmu** — po jego
napisaniu sprawdź, ile trafień pominął i czemu (u mnie 3 z 13).

→ Klasa, której pilnuje naprawiony strażnik: [L107]; pomiar narzędzia: L27.
## L114 (2026-09-02) — Kotwica: kontrola mutacji w złym kierunku

„Sprawdziłem mutacją" przy bramce `A && !abilityWindowCast` (okno rzutu z
wygnania, Vaan) dało komplet zieleni: podmiana `!B` na `false` ZNOSI warunek
zamiast go zaciskać. **Reguła:** mutacja = stan PRZED naprawą (tu: usunąć
`!abilityWindowCast` z warunków `canCastFromExile`); sprawdzaj jej KIERUNEK.
**Strażnik:** test 3 z `test/audyt-rulingi-vaan-okno-rzutu.test.js`.
→ Pełna klasa: [L13] (wariant dopisany tamże).
## L115 (2026-09-02) — Tryb agregacji triggerów jest DRUKOWANY NA KARCIE, więc deklaruje go karta

**Objaw:** tryb grupowania rozpoznawało się w silniku po NAZWIE zdarzenia, a
`combat_damage_to_you` scalało się po graczu → druga instancja tej samej zdolności
przepadała (Contested Game Ball ×2, CR 603.3).
**Przyczyna:** rozjazd z CR 603.2 (zdarzenie scala się w jedno) i CR 603.3 (każda
instancja wyzwala osobno); decyzja właściciela: „engine jest headless,
name-agnostic" (ADR 0002).
**Reguła:** tryb nosi deskryptor `trigger.groupPer` ∈ `'affected_player'` |
`'controller'` (brak tagu = ogień per zdarzenie), klucz grupowania zawsze zawiera
instancję zdolności (`${subject}#${abilityIndex}|…`), a katalog i
`test/audyt-grupowanie-triggerow-tag.test.js` pilnują, że tag jest czytany.
Agregat mierz liczbą `ability_triggered`, nie skutkiem — przy `pendingExileCast`
jeden i dwa wyzwalacze zostawiają tyle samo wygnań.
**Strażnik:** usunięcie tagu z Vaana czerwieni testy 1 i 3; klucz bez
`abilityIndex` — test 2 (raport §9 ma narrację).
## L116 (2026-09-02) — Nim oskarżysz silnik: trzy pułapki harnessu testów regułowych

**Objaw:** test okna Vaana dał `trigger_resolved: no_result` — wyglądał jak błąd
efektu, a to brak danych w teście.
**Reguła:** (1) `createGameState` bez `decks` ma WSZYSTKIE strefy puste
(`state.zones.library.length === 0`) — kartę na wierzch kładzie sam test (wzorzec
`test/batch52-kart.test.js`); (2) mana ze źródła
(`addMana(state, playerId, 10, { colors })`, nie `execute({type:'add_mana'})`);
(3) trygery rozstrzygają się przy priorytecie — bez pętli `pass_priority` asercja
o skutku jest fałszywie czerwona, a przy blokadzie decyzji drenaż ma prawo stanąć.
→ Pokrewne: L21, L107.

## L117 (2026-09-02) — Remis punktów jest tak samo arbitralny jak brak wyceny; mierz go na śladzie

**Reguła:** punkty decyzyjne bota audytuje się na ROZEGRANYCH partiach, nie na
grepie po źródle (regiony helperów nachodzą): identyczne `score` przy ≥2 opcjach
⇒ wycena niczego nie rozstrzygnęła, niezależnie od tego, czy w źródle „jest
gałąź punktująca". Klasyfikację remisów prowadź po **wejściach** wyceny
(projekcja danych wystawiona do śladu przez samego bota), nie po tożsamości
wariantów: opcje zamienne muszą zostać w remisie, bo sztuczny tie-breaker
wygląda w metrykach jak działająca wycena i kłamie. Bramka mapowania musi być
monotoniczna w zakresie realnie występującym — klampa „na wszelki wypadek" go
psuje (płaski `play_land` = 90 wybierał manabazę kolejnością `legalCommands`).
**Strażnik:** `tools/bot-tie-audit.mjs` — szczegóły: archiwum (L117).

## L118 (2026-09-02) — Zanim wyłączysz klasę przypadków z pomiaru, udowodnij w teście, że jest równoważna

**Przypadek:** audyt remisów bota (M285→M286): 208/308 remisów wyglądało na
no-op (`block[]`/`attack[]` vs `pass_priority`), a reguła „brak projekcji ⇒
bez danych" wycinała przy okazji findingi realne. Pełna narracja:
`docs/LESSONS_PRZYPADKI.md` (L118).
**Reguła:** każda klasyfikacja w narzędziu audytowym, która redukuje licznik,
potrzebuje testu stwierdzającego równoważność (albo — dla metryk — porównuj
wyłącznie dane mogące zmienić wynik: suma siły ataku przy ataku śmiertelnym jest
różnicą bez znaczenia, dlatego projekcja saturuje na lethalu). Bez tego audyt myli
się w obie strony: straszy szumem i milczy przy błędzie. Bramka dla stanu
przejrzanego bywa grzechotką (`<= N` z przykładami przy przekroczeniu), nie zerem —
zero, którego projekt nie obwieścił, jest kłamstwem w teście (ADR 0019).
**Strażnik:** `test/audyt-bot-walka-remisy.test.js` — szczegóły: archiwum (L118).

## L119 (2026-09-02) — Metryka audytowa nie może być modelem gorszym od mierzonego kodu

**Przypadek:** audyt remisów bota (M286→M287): projekcja „wartość ciała"
(`power + toughness`) flagowała pary słusznie zamienne, bo wycena waży
składniki inaczej; równolegle metryka liczona po składnikach znalazła rzecz
prawdziwą (`cast_permanent` nie znał kosztu many). Pełna narracja:
`docs/LESSONS_PRZYPADKI.md` (L119).
**Reguła:** porównuj warianty po **wejściach, które mierzony kod konsumuje**, w
jednostkach, które ten kod szanuje — jeśli audyt ma gorszy model świata niż
badany kod, produkuje findingi pozorne i zagłusza prawdziwe. Analogicznie od strony
produkcyjnej: gałąź z `finish(score)` nie dowodzi, że wycena widzi wszystkie
istotne dane (tu: pełna formuła bez jednego składnika = wybór z kolejności listy).
**Strażnik:** `test/audyt-bot-cena-stwora.test.js` — szczegóły: archiwum (L119).

## L120 (2026-09-02) — Opcjonalna zależność komponentu to dziura w drucie; pilnuj miejsca użycia

**Przypadek:** — dwie z czterech uwag właściciela z żywej gry (2026-09-02) miały ten
sam kształt.

**Reguła:** jeśli komponent przyjmuje zależność opcjonalną (`hover = null`), zielony
test tego komponentu NIE jest dowodem, że ktoś ją podaje — zależy to od jednego
wywołania. Albo uczyń zależność wymaganą (głośny fail), albo dodaj asercję na
MIEJSCE UŻYCIA (skan wywołania/źródła). To samo dla prezentacji: każda rodzina klas
DOM produkowana przez kod musi mieć co najmniej jedną regułę CSS — brak reguły to
nie „brak zdobień", tylko druga estetyka na tej samej planszy (i drugie zachowanie
na dotyku).

**Strażnik:** `test/uwagi-tura8-hover-kart-specjalnych.test.js` — szczegóły: archiwum (L120).

## L121 (2026-09-02) — Weto przeciw marnotrawstwu sprawdzaj też w drugą stronę: czy nie mrozi naprawy

**Przypadek:** uwaga C z żywej gry — bot płacił manę za przepięcie sprzętu, które nic
nie dawało (M288 to zablokował). Pytanie kontrolne właściciela pokazało drugą stronę
tego samego kodu: Wooden Stake leżał na 3/2 z defenderem, obok stał 3/2, który umie
atakować, a ładunek liczony od samej pompy był na obu identyczny — drabina kazała
stać i sprzęt zakotwiczał się na stworze, który nigdy nie zaatakuje. Żaden gracz
tego nie zgłosi: błąd objawia się ciszą (brak poprawki), nie kaszanem.

**Reguła:** każde „nie płać za X" ma dwie osie: czy odcina ruch bezwartościowy ORAZ
czy nie odcina ruchu, który realnie poprawia stan. Drugiej osi nie widać w logach,
więc testuj ją w tej samej turze co pierwszą i trzymaj ocenę ruchu w JEDNEJ funkcji
para-(sprzęt, nosiciel) — wtedy antysymetria relacji „lepszy dom" jest własnością,
a nie obietnicą.

**Strażnik:** `test/uwagi-tura9-bot-rowne-ciala-equip.test.js` — szczegóły: archiwum (L121).
## L122 (2026-09-02) — Materiał do audytu przepuść przez niezmienniki repo w tej samej minucie

**Przypadek:** żeby podnieść pokrycie kreatora celów w Żywym Testerze, ułożyłem
talię `decks/wielocelowa.txt` (12 kart pickerowych + 12 ciał). Zanim zdążyłem
wymyśleć obejście, dwa strażniki powiedziały „nie": M132/B (3,00 nielandowych na ląd
przy progu 2,00) i M178/ADR 0023 (każda wspierana karta w DOKŁADNIE jednej talii —
11 z 12 moich kart już gdzieś leżało).

**Reguła:** niezmiennik, który mówi „brak materiału", jest rozstrzygnięciem projektu,
nie błędem formatowym do obejścia. Czytaj komunikat strażnika do końca: tu pierwszy
był formatowy (lądy), a drugi zasadniczy — i to on pokazał, że realnym problemem jest
surowiec (7 na 443 kart z >1 celem), nie brak chęci. Trzecia droga (przenieść karty
między taliami) była gorsza niż brak talii, bo talie karmią benchmark i audyt remisów.

**Strażnik:** `test/repo-decks.test.js` + `test/m132-proporcje-landow.test.js`;
wniosek zapisany w `docs/backlog.md` §1 i §4.

## L123 (2026-09-02) — Semantyka zaimplementowana w jednym torze nie istnieje w drugim

**Reguła:** przy każdej wielocelowości audytuj WSZYSTKIE tory, którymi efekt może
nadejść (czar ze stosu, zdolność aktywowana, trigger, tryb modalny, kopia czaru) i
dla każdego z nich zapisz test na DWU celach. Zdanie „silnik to wspiera" bez nazwy
toru jest bezwartościowe — to nie cecha mechaniki, a cecha ścieżki kodu.
Druga połówka lekcji: blokada środowiska nie zamyka zadania, jeśli procedura repo ma
opisany kanał awaryjny — `docs/cards/HOW_TO_ADD_CARD.md` dopuszcza ściągnięcie tych
samych URL-i przez `fetch_page`, a ja w turze 10 uznałem brak egressu za koniec
wątku (b).

**Strażnik:** `test/m291-*.test.js` — szczegóły: archiwum (L123).

## L124 (2026-09-02) — Zmianę w grzechotce przypisz trzema drzewami, zanim podniesiesz próg

**Reguła:** gdy po zmianie wagowej pęka grzechotka, mierz trzy drzewa (stan zeszły /
tylko zmiana wagowa / zmiana wagowa + treść) dokładnie tym samym wywołaniem, którego
używa test. Atrybucja decyduje, czy podnosimy sufit (i wpisujemy PRZYCZYNĘ przy
asercji), czy mamy nową dziurę w wycenie. Ten sam rygor dotyczy fixture’ów: `--write`
puszcza się na GOTOWYM drzewie — u nas pierwszy zapis zamroził ślad bota bez wpisu
`MANA_COSTS` nowej karty i test znowu świecił, choć nic już nie było nie tak z kodem.

**Strażnik:** `test/bot-scoring-snapshot.test.js` — szczegóły: archiwum (L124).

## L125 (2026-09-03) — Strażnik wyglądu ma mierzyć styl efektywny, nie tekst CSS

**Reguła:** test, który sprawdzając wygląd czyta tekst stylesheetu, pilnuje duplikatu, nie
faktu. Licz styl efektywny (klasy z kodu → reguły → scalone deklaracje) i dodaj asercję
antyduplikacyjną. Tekst CSS badaj tylko tam, gdzie nie ma czego renderować (`:root`,
`@media`). Parser CSS w teście musi wyciąć komentarze PRZED dzieleniem na reguły —
inaczej reguła stojąca zaraz po bloku komentarza znika z listy i strażnik fałszywie
zieloneje.

**Strażnik:** `test/m129-combat-wizard-dotyk.test.js`. Mutacje: wycięty `min-height` z
`.picker-row` → RED, dopisana kopia `.damage-wizard-row { min-height… }` → RED, ręcznie
lepiony `checkbox` poza `picker.js` → RED, ptaszek 16 px → RED.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L125)

## L126 (2026-09-03) — Zlanie dwóch „takich samych" kreatorów to test, czy naprawdę robiły to samo

**Reguła:** unifikując dwa „takie same" kreatory, przenieś ZACHOWANIA OBU jako dane
(`flow`), nigdy nie wybieraj wygodniejszego po cichu; każdy RED powstały przy zlewaniu
czytaj jako pomiar rozjazdu, a nie jako wstęp do poluzowania asercji. Nazwy w warstwie
rysującej mają opisywać CZYNNOŚĆ — jeśli renama dotyka zamrożonej listy typów protokołu,
zmierz dług (pliki, wystąpienia, powód zamrożenia), zapisz liczbę i zepnij ją
equality-pinem, żeby spłata świeciła RED-em. Dwa techniczne przykazania z tej samej tury:
strażnik stylu ma porównywać TOKENS klasy (podciąg `look-wizard-card` trafia w kontener
`look-wizard-cards`) i liczyć styl efektywny (L125), a test, który klika, musi mieścić się
W CAŁOŚCI wewnątrz instalatora DOM-u — po wyjściu z `withDocument` każdy kolejny render
woła `document.createElement` na odinstalowanym oknie.

**Strażnik:** `test/m293-peek-jeden-wizard-chipy.test.js` — szczegóły: archiwum (L126).

## L127 (2026-09-03) — Zakres rzutu kartą spoza ręki to cecha ŚCIEŻKI, nie karty: jeden predykat z parametrem „co ta ścieżka potrafi rozliczyć”

**Reguła:** każde wykluczenie w predykacie zakresu pytaj „czy TA ścieżka potrafi
to ROZLICZYĆ", nie „czy karta to ma" — parametr per ścieżka (`allowTargets`,
`allowModes`, `allowAdditionalCost`), JEDEN filtr, oferta i bramka wywołane
z TYMI SAMYMI argumentami; tryby/cele bierz z generatora wspólnego z ręką
(`legalModeCasts`), nigdy z kopii. Nowe uprawnienie (ruling) musi dotrzeć do
KAŻDEJ gałęzi wykonania (`requireSpell`, `castPermanent`, `castModalSpell`,
`castXCostSpell`, `castFireball`) — gałąź bez uprawnienia to rozjazd oferty
i wykonania. **Strażnik:** 6 pinów audytu PR #92/#93 (modalny rzut z okna, discover,
koszt dodatkowy, koszt X, darmowy rzut) — 9 mutacji, tabela w §7
`docs/audits/AUDYT_PR93_2026-09-03.md`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L127)

## L128 (2026-09-03) — Mechanika z dwiema ścieżkami rzutu: reguła ma jedno miejsce prawdy, a skan musi PORÓWNYWAĆ ścieżki, nie tylko liczyć oferty

**Reguła:** pozwolenie na rzut z exile, które realizuje więcej niż jedna
ścieżka kodu (czary vs permanenty, ręka vs exile), dostaje JEDEN predykat
wspólny dla oferty i walidacji — w `impulse-window.js`, obok reszty stempli
grywalności z wygnania (`plottedTurnReached`, `warpTurnReached`). Skan
„czy ta karta ma ofertę w swoim oknie" wykrywa brak oferty, ale NIE wykrywa
rozjazdu między ścieżkami: obie odpowiedziały „tak", tyle że na inne pytania.
Dlatego skan mechaniki pyta per ścieżka i ZESTAWIA odpowiedzi — to ta sama
metoda, która w L48 kazała zestawiać ofertę z walidacją.

**Strażnik:** `test/audyt-pr93-plot-pozniejsza-tura.test.js` — 13 mutacji; szczegóły: archiwum (L128).

## L129 (2026-09-03) — Otwarcie mechaniki w nowym oknie to CAŁY łańcuch wyboru: oferta → walidacja → obiekt stosu → log → etykieta

**Reguła:** wspólny generator ofert NIE gwarantuje kompletności łańcucha —
każde okno samo pushuje komendy i samo składa obiekt stosu. Dodając mechanikę
do okna, przechodzę listę: (1) czy push niesie WSZYSTKIE pola wariantu
z generatora, (2) czy `execute` przekazuje je do walidatora, (3) czy obiekt
stosu dostaje pola, które czyta rozstrzyganie (`modeExtra` itd.), (4) czy
zdarzenie `spell_cast` niesie `modeName`/wybory, które loguje session.js,
(5) czy etykieta rozróżnia warianty o różnych skutkach. Skan po wspólnym
generatorze (L128) pyta „czy oferta istnieje”; ta lista pyta „czy da się nią
zagrać i czy gracz widzi, co wybiera”.

**Strażnik:** `test/audyt-pr94-stun-z-grobu.test.js` — 7 testów, 5 mutacji; szczegóły: archiwum (L129).

## L130 (2026-09-03) — Wynik komendy niesie CAŁY przyrost zdarzeń: przechwyć `state.events.length` PRZED efektem, dołącz `slice(before)` po nim

**Reguła:**
wynik komendy = zdarzenia od jej startu, nie „ostatnie" ani „pierwsze" (combat.js ×3, bramka springbloom).
`const before = state.events.length;` → efekt → do wyniku
`state.events.slice(before)`. Kontrakt: wynik komendy = zdarzenia od jej
startu, nie „ostatnie” ani „pierwsze”. Audyt pozostałych bramek `slice(-1)`:
wszystkie jednocentryczne — bezpieczne.

**Strażnik:** `test/audyt-pr92-grupowe-trygery.test.js` (przyrost liczony przez
`state.events.length` PRZED efektem), `test/batch46-kart.test.js` (Springbloom:
trzy zdarzenia z jednego poświęcenia).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L130)

## L131 (2026-09-05) — Decyzja bez wyceny = pierwsza oferta z listy

**Reguła:** dodając typ `resolve_*` w silniku: (1) `case` w `scoreCommand`
z wyceną (nie domyślne 0), (2) nazwa wariantu w `summarize()`, (3)
`tieProjection`; audyt remisów (`tools/bot-tie-audit.mjs`) jest strażnikiem
klasy — kolumna „bez-danych" to brak wyceny albo projekcji.

**Strażnik:** `node tools/bot-tie-audit.mjs --gate=<kind>` (exit code 0 gdy
brak "rozróżnialnych" remisów = nie ma groźnych decyzji z różnymi danymi
ale tym samym wynikiem).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L131)

## L132 (2026-09-06) — Wycena oparta o STREFĘ UKRYTĄ jest inertna; audyt czytający to samo źródło tego nie zobaczy

**Reguła:** Wycena i projekcja kart ze strefy ukrytej (biblioteka, cudza ręka)
biorą dane z PAYLOADU decyzji, nie ze strefy — silnik tak już robi dla
`pendingSearchChoice.cards`, `pendingManifestDread.cards`, `pendingLookTopN.cards`
tylko dla decydenta (FoW nietknięta). Brak payloadu = luka kompletności widoku
(ADR 0017) do domknięcia w SILNIKU, nie zgadywanie w bocie. Jeden helper
(`decisionCandidateCard`) dla wyceny i projekcji razem.

**Strażnik:** `test/m305-hidden-candidate-valuation.test.js` — różne dane
kandydatów muszą dawać różne punkty, plus strażnik źródła (w bocie nie ma
`zones.library.find(`, wycena i projekcja idą przez ten sam helper) i anty-over-fix
FoW (widok wroga nie niesie kart).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L132)

## L133 (2026-09-06) — Detektor narzędzia nie może dublować scrapingu tekstu: strukturalny sygnał jest tańszy i nie milczy

**Reguła:** Narzędzia pętli jakości czytają stan przez mostek
(`window.__mtgDebug`), tekst UI tylko jako fallback bez mostka. Jeśli skrypt
czyta TEN SAM fakt z dwóch miejsc, drugie musi zniknąć albo wywoływać pierwsze.

**Strażnik:** partia z końcem w turze bota (`wyczerpanie biblioteki`) i partia
wygrana przez gracza kończą się linią `== KONIEC PARTII ==` bez `LIMIT KROKÓW`
i bez `[STOP]` (zmierzone w tej sesji: 4 partie, 0 zgłoszeń detektorów).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L133)

## L134 (2026-09-06) — Brak nośnika mechaniki NIE powodem poszerzania katalogu: talia jest wyprowadzona z katalogu

**Przypadek:** — sesja PR #93 potrzebowała karty do testu `counter_ability` i
dopisała do katalogu realną kartę `Stifle` — poprawną, ze snapshotem Scryf… Pełna narracja: `docs/LESSONS_PRZYPADKI.md` (L134).

**Reguła:** katalog rośnie wyłącznie z list właściciela (ADR 0029); wolno tylko
tokenom i landom podstawowym. Test potrzebujący nośnika buduje kartę
SYNTERETYCZNĄ w swoim pliku — engine nie zna rejestru (ADR 0002), więc sama
definicja podana do `gameObjectDataOf` żyje na stole i w `legalCommands`.
Mechanika bez nośnika w kolekcji to wpis do backlogu (propozycja do batcha),
nie edit `card-data.js`. Usuwanie karty jest pełne, gdy znika definicja, klucz
`MANA_COSTS`, snapshot `docs/cards/scryfall-<id>.json`, `plan` (regeneracja
`decks/`) i testy pinujące nazwę karty.

**Strażnik:** `test/proweniencja-katalogu.test.js` — szczegóły: archiwum (L134).

## L135 (2026-09-06) — Nowy KSZTAŁT komendy musi mieć obsługę u każdego konsumenta: silnik → kreator UI → sterownik testera

**Reguła:** dodając nowy kształt oferty w silniku, przejrzyj WSZYSTKICH konsumentów:
kreator (`commandFor*`), sterownik testera (rozpoznawanie intro), wycena bota.
Deskryptor kształtu czytaj z KOMEND silnika, nie z karty (`slotOptional` w planie).
Pusta pozycja OPCJONALNA = wariant `null` (wybór kompletny); pozycja OBOWIĄZKOWA bez
zaznaczenia = wybór niekompletny (status „Brakuje" M200 wymienia tylko obowiązkowe).

**Strażnik:** `test/m309-slot-opcjonalny-kreator.test.js` (6: plan z deskryptorem,
UI: wariant bez celu + anty-over-fix na obowiązkowych, pin przez realne
`legalCommands`); sterownik testera mierzy partia z tym kreatorem (`== KONIEC PARTII`
bez zgłoszeń detektorów, zmierzone).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L135)

## L136 (2026-09-07) — `git checkout <plik>` kasuje NIEZAKOMMITOWANE poprawki w tym pliku; scratch piaskownicy znika między turami

**Reguła:** w tym środowisku istnieje tylko to, co wypchnięte do `origin` —
więc każdy finding zamknij commitem i pushem, a plików z tej tury nigdy nie
przywracaj gitem (cofa je do indeksu, a nie do „stanu przed mutacją"):
- jeden finding = jeden commit = push (`git status` po każdym; nie zbieraj
  pięciu findingów w drzewie — ENVIRONMENT §2 „Profilaktyka"),
- PRZED każdym `git checkout <plik>` / `git restore` sprawdź, czy ten plik ma
  pracę z tej tury: `git diff --stat -- <plik>`; na mutacje testowe kopiuj
  plik `cp plik /tmp/plik.bak` i przywracaj KOPIĄ, nie gitem,
- scratch (wiadomości commitów, sondy, transkrypty) trzymaj w `.arena/` albo w
  gitignorowanym `tools/table-tester/**` i i tak zapisuj WNIOSKI w `docs/` —
  plik poza repozytorium nie jest dowodem,

**Strażnik:** `test/repo-artefakty-audytu.test.js` — szczegóły: archiwum (L136).

## L137 (2026-09-07) — etykieta to rodzina: jedno źródło brzmienia, test na PRAWDZIWYM widoku, partia celowana

**Reguła:** fakt prezentowany w UI ma JEDNO źródło brzmienia i tylu
konsumentów, ilu formatuje ten sam tekst — podnosząc nowe pole do widoku zrób
grep po WSZYSTKICH miejscach formatujących DANY TEKST (nie po nazwie pola!)
i przepnij je na jeden helper; konsumentem jest TEŻ log (`nameOfObject`)
i karty (`cardInfo`), nie tylko kafel. Asercję kładź na PRAWDZIWYM
`playerView`/`createSession` (fikcje testowe zaktualizuj do nowego kształtu —
inaczej test pinuje nieaktualny stan), dodaj strażnika ŹRÓDŁOWEGO rodziny
(L107: skan „żaden konsument nie wyprowadza znacznika z pola
znajomości-reguły"), a mechanikę rzadką w talii sprawdź partią na CHWILOWEJ
talii (`docs/setup/TESTER_STOLU.md`; plik usuń przed bramką — M178 nie znosi
dubli). Strona PTASZKA (`OPTION_IGNORABLE_TYPES` w UI i `actions.mjs`
w testerze) jest częścią kontraktu etykiety — idą razem (W1).
**Strażnik:** `test/m326-cloak-przyczyna.test.js` — szczegóły: archiwum (L137).

## L138 (2026-09-07) — zwrot prawdy z efektu = blokada; ścieżka bez decyzji nie może jej zgłaszać

**Reguła:**
- rozstrzygacz czyta PRAWDZIWY zwrot efektu jako „czekam na gracza" i odkłada
  resztę listy do `state.pendingSpell`, a zdejmują go wyłącznie komendy
  `resolve_*` → każda gałąź z `return true` musi w tym samym ruchu postawić
  `state.pending* = {...}` (F12: `manifest_dread` przy jednej karcie w bibliotece,
  CR 701.62a — czar wisiał na stosie z `effects: []`),
- przy zmianie efektu sprawdza się ZWROTY, nie tylko efekty uboczne,
- test asertuje, że gra się TOCZY (pasy przyjęte, stos pusty,
  `status === 'active'`), nie tylko że obiekt powstał,
- nie maskować: sprzątanie osieroconego `pendingSpell` u konsumenta (pas,
  cleanup) ukryłoby każdy kolejny błąd tej klasy.

Zatrzymane rozstrzyganie (`pendingSpell`, także `effects: []`) nie otwiera
okna na SBA. Decyzja UI to nie oddanie priorytetu — M343, CR 704.4.
Strażnik: `test/m343-sba-po-rozstrzygnieciu.test.js` (liczniki, życie,
wytrzymałość i zanik tokenów przed/po końcu czaru).

**Strażnik:** `test/m335-manifest-bez-wybory.test.js` — szczegóły: archiwum (L138).

## L139 (2026-09-07) — skryptowe cięcie pliku: jednoznaczny krótki klucz, `node --check` przed `git add`

**Reguła:**
- przed wstawką `assert s.count(klucz) == 1`; klucz krótki i NIEOBECNY w tekście
  wstawianym przed chwilą (mój `s.index("return;")` trafił w `return;` w komentarzu
  dodanym minutę wcześniej → commit z plikiem o błędnej składni),
- wkładka po `idx + len(klucz)` pewniejsza niż `replace(długie, długie + nowe)`:
  długie dopasowania padają o jeden znak, a wyjątek w połowie zostawia plik
  częściowo zmieniony,
- po zmianie strukturalnej `node --check` KAŻDEGO zmienionego pliku PRZED
  `git add` (objaw: wiele `not ok <plik>` bez szczegółów); póki commit lokalny,
  ratuje `--amend` bez force pusha (ADR 0020 D).

**Strażnik:** zwyczaj; składnię sprawdza import w każdym teście.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L139)
## L140 (2026-09-07) — ta sama reguła w wielu ręcznych listach = gwarancja rozjazdu; bramkuj jednym predykatem

**Reguła:** ta sama reguła legalności jako kilka ręcznie enumerowanych list
(54 warunki pasa vs ~64 bramki `resolve_*` w execute) — każda nowa decyzja
pending rozsypie którąś kopię (M337: padł cały B0). Zostań przy JEDNYM
predykacie ze wspólnego źródła + strażnik źródła przeciw czwartej kopii.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L140)

## L141 (2026-09-07) — Pochodna tajnej informacji też może ujawnić kartę

**Reguła:** FoW obejmuje pochodne danych: numer grupy, liczność i kolejność,
nie tylko samo `cardId`. Testuj CAŁY widok przeciwnika na stanach różniących
się wyłącznie tajną tożsamością. Jawne znaczniki wyprowadzaj z jawnych faktów.
M339: numery cloaków po cardId zdradzały równość zakrytych kart i tworzyły
duplikaty etykiet dla różnych kart; teraz zależą od jawnych wejść na stół.

**Strażnik:** `test/m339-cloak-numeracja-fow.test.js` — pełny widok dla czterech
wariantów zakrytych kart, etykiety obu widzów, ciągłość po obrocie/przejęciu.

## L142 (2026-09-14) — Proweniencja znaleziska to fakt, nie ozdobnik

**Reguła:** „zgłoszenie właściciela" wolno wpisać tylko przy cytacie jego słów
z sesji/repo; audyt własny musi być nazwany („audyt własny") — inaczej
dokument kłamie o historii. 2026-09-14c: 4 rozjazdy kosztów (błąd agenta)
opisane jako zgłoszenie właściciela; sprostowanie objęło plan, historię,
milestone, handoff i 2 testy.

**Strażnik:** zwyczaj. → narracja: PRZYPADKI (L142).

## L143 (2026-09-14) — Sweep numerów CR zmienia NUMER, nie znaczenie

**Reguła:** przy przenumerowaniu sprawdź, co podreguła znaczy DZIŚ: 702.34e
(timing madnessu) nie istnieje w 702.35a–c (702.35b to koszt alternatywny;
poprawnie 702.35a + ruling DMU 2023-01-06); „604.3" przy „liczone przy każdym
odczycie" to CDA (właściwy: 611.3a).

**Strażnik:** `test/cr-numery-mechanik-straznik.test.js` (2 pary). → narracja: PRZYPADKI (L143).

## L144 (2026-09-15) — Decyzja z jedną opcją to nie decyzja: silnik rozstrzyga sam w chwili kolejkowania

**Reguła:** wymuszony wybór całości („odrzuć N" przy N kartach, obowiązkowy
1 z 1) NIE kolejkuje pending ani eventu — rozstrzyga się w tej samej komendzie
wspólnym helperem (L41); kontynuacje lustrzą ścieżkę ręczną (kontynuuj zamiast
„zawieś", L138; madness — hook w accepted()). Decyzja w chwili kolejkowania,
nie post-pass ani auto-klik w UI: brak eventu = brak modala bez splicingu.
Wyjątek: allowDecline ZAWSZE pyta, nawet przy 1 karcie.

**Strażnik:** `test/owner-cathartic-reunion-auto-discard.test.js` (8). → narracja: PRZYPADKI (L144).

## L145 (2026-09-16) — Efekt bez słowa „target" nie fizzluje: zniknięty obiekt daje LKI, nie zero

**Reguła:** efekt czytający cechę NIEncelowanego obiektu („its power")
podlega LKI (CR 608.2h / ruling), nie 608.2b. Wzorzec: snapshot cechy
przy koszcie niesie wpis stosu (jak `sacrificedToughness`); rozstrzygnięcie:
żywa wartość albo snapshot. Alarm: komentarz wołający 608.2b przy karcie
bez słowa „target" (tu: Station, Wedgelight Rammer).

**Strażnik:** `test/m360-silver-station-lki.test.js` (3: LKI, pin żywy, pin pompy). → narracja: PRZYPADKI (L145).

## L146 (2026-09-16) — Trigger podpina się pod ZDARZENIE REGUŁY, nie pod najczęstszą przyczynę

**Reguła:** gdy Oracle mówi „loses life", hookiem jest `life_changed`,
nie `damage_dealt` — damage to tylko jedna z dróg (obok lose_life,
płatności życiem). Subskrypcja przyczyny gubi resztę po cichu, a testy
na samej przyczynie tego nie łapią (speed rósł od obrażeń — brak testu
na stratę-bez-damage). FixMatchers: zdarzenie węższe od pojęcia reguł
+ brak testu na alternatywną drogę. Wzorzec: jeden hook na pojęciu
reguł (tu: strata życia obejmuje damage, prewencja/infect odpadają
z natury), bramki („raz na turę") bez zmian.

**Strażnik:** `test/m361-gold-speed-lifeloss.test.js` (5: RED strata-bez-damage, pin damage, dedup, bramki tury/własnej-straty).

## L147 (2026-09-17) — Płatność wieloetapowa: rezerwa pipów obowiązuje też FINANSOWANIE cudzego kosztu

**Przypadek:** auto-tap zapłacił pip czaru {U} jednostką odłożoną na KOSZT zdolności źródła (seed 2027) — pula przestała kryć `requirements`.

**Reguła:** każdy etap płatności (pipy → suma → źródła kosztowe) musi KOŃCZYĆ się pokryciem `requirements`; przed konsumpcją dociągnij brakujące pokrycie z nietapniętych źródeł — mutacja tylko w stronę puli. Bramka oferty (`fundableCostedPlan`) i płatność muszą kończyć w tym samym stanie.

**Strażnik:** `test/mana-cylix-costed-source.test.js` A/12 (RED po cofnięciu fixa) + A/13 (kontrola: nielegalny kształt bez oferty, zero częściowej płatności).

## L148 (2026-09-17) — „You control" w triggerach śmierci czytaj z LKI zdarzenia

**Reguła:** obiekt w grobie należy do WŁAŚCICIELA (CR 400.3) — jego
`controllerId` nie mówi, kto kontrolował go w chwili śmierci (CR 603.10a);
kontrolera bierz ze zdarzenia (objaw: Necrosquito bez oil po śmierci stwora
PRZEJĘTEGO; to samo w „dies"/„leaves the battlefield"). Strażnik:
`test/m371-znaleziska-d-e-triggery-smierci.test.js`.

## L149 (2026-09-17) — Grant lądu to JEDEN rachunek dla oferty i płatności (także w fazie pipów)

**Przypadek:** Vandalize przy „lądzie za dwa many”: oferta obiecywała 5 many, płatność do-tapnęła ląd „za 1”, rzut odrzucony (seed 2039).

**Reguła:** ląd z grantem liczy się w ofercie jako `grant` jednostek (producibleMana), więc
płatność MUSI wyprodukować tyle, ile oferta obiecuje — także gdy tapnie go FAZA PIPÓW bez
wiersza w planie kolorów: kolor bierz z `firstUncoveredPipColor`, jak auto-tap sumy. Druga
strona klasy (L48): bramka sumy stoi PRZED pierwszą mutacją (CR 601.2h, pula pusta).

**Strażnik:** `test/m374-l48-grant-w-pipach.test.js` (4 piny; mutacje: brak fallbacku koloru
grantu → piny 1 i 4 RED, brak bramki atomowości → piny 2 i 3 RED).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L149)

## L150 (2026-09-19) — Ubytek zasobu licz po WSZYSTKICH drogach; tutor też uszczupla bibliotekę

**Przypadek:** Dawntreader Elk — bot poświęcał stwora po ląd, bo kara cienkiej biblioteki widziała tylko mill/draw, a tutor nie był wyceniany nigdzie.
**Reguła:** (1) Wypisz WSZYSTKIE drogi ubytku zasobu (płatność, efekt wariantu, koszt poświęcenia) i prowadź je jedną drabiną kary. (2) Typy efektów czytaj z deskryptora (ADR 0002). (3) Kara na wariant, nie na turę — inaczej bot przestaje używać narzędzi.
**Strażnik:** `test/dawntreader-elk-tutor-cienka-biblioteka.test.js` (5 pinów; M21 → 3 RED, M22 → 1 RED).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L150)

## L151 (2026-09-19) — Enumeracja oferty musi pokryć granicę legalności; cap tnie OPCJE, nie użycia

**Przypadek:** bloker o 3 slotach nie dostawał w ofercie potrójnego bloku, choć `declareBlockers` go przyjmuje.
**Reguła:** (1) Liczbę przebiegów tnij do granicy LEGALNOŚCI (min. sloty, liczba atakujących), nie „na wygodę”. (2) Enumerację z powtórzeniami deduplikuj kluczem kanonicznym i dopiero potem tnij do cap. (3) Pin na oba kierunki: kompletność (legalny ruch jest w ofercie) i dźwięczność (każda opcja przechodzi walidację).
**Strażnik:** `test/block-slots-trojka-oferta.test.js` (4 piny; M23 → 1 RED, M24 → 1 RED).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L151)

## L152 (2026-09-19) — Dane proweniencji też mają strażnika; „pomiń, bo dane zepsute” to dług

**Przypadek:** pełny diff katalog↔snapshot wykrył literalne „\n” w `oracleText` 20 wpisów i w 7 plikach `docs/cards/*.json`.
**Reguła:** (1) Audyt danych to osobna ścieżka: porównuj CAŁE zbiory, nie pliki z ostatniego PR-a. (2) Wyjątek „ta karta wypada ze strażnika, bo dane są zepsute” znosi się naprawą danych i licznikiem pominięć = 0. (3) Strażnik danych pilnuje obu stron i ma bramkę na degenerację (minimum sprawdzonych rekordów).
**Strażnik:** `test/oracle-bez-literalnego-backslash-n.test.js` (4 piny; M25 → 2 RED, M26 → 2 RED) + `test/ability-cost-pips.test.js` (pominięcia = 0).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L152)

## L153 (2026-09-19) — Zdarzenie wywołane WEWNĄTRZ komendy musi wrócić z komendą

**Reguła:** każda funkcja pomocnicza, która mutuje stan i emituje zdarzenie,
przyjmuje OPCJONALNY kolektor `events` i dopisuje do niego obok `state.events`
(wzorzec M114 dla tapu lądu, M117 dla regeneracji, teraz `tapObject`
i `declareAttackers`). Komenda zwraca PEŁNĄ listę zdarzeń swojej pracy
(`[...tapEvents, e]`), bo tylko ona wchodzi w skan triggerów — zdarzenie
zostawione wyłącznie w stanie jest dla triggerów niewidzialne. Pin pisz na
ścieżce UŻYCIA (atak), nie na samym helperze: helper był zielony, czerwony był
efekt („whenever this creature becomes tapped" nie odpalał od ATAKU).
**Strażnik:** `test/real-cards-batch57.test.js` (pin „tapnięcie wygania
dokładnie DWIE karty"), `test/m257r5b-awaken-sleeper.test.js`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L153)

## L154 (2026-09-19) — Skutek odmowy jest częścią decyzji, a wybór bez alternatywy domyka silnik

**Reguła:** (1) Gałąź „If you don't …" jedzie w DESKRYPTORZE decyzji
(`elseEffect`) i wykonuje się przy odmowie — inaczej odmowa jest ruchem
jałowym, a wycena bota kłamie o połowie Oracle. (2) JEDEN predykat
(`elseEffectSummary`) karmi widok gracza, log, etykietę przycisku i wycenę —
przycisk odmowy musi nazywać nagrodę za odmowę („utwórz token …"). (3) Gdy
zbiór legalnych wariantów jest PUSTY, decyzja nie ma o co pytać: silnik
domyka ją sam, wykonuje skutek i loguje, DLACZEGO (`noCandidates`), zamiast
pokazywać modal z jednym przyciskiem.
**Strażnik:** `test/real-cards-batch57.test.js` — 5 pinów B6b (token 2/1
Legendary z `keywordGrants: ['haste']` atakujący w tej samej turze;
auto-domknięcie z `noCandidates`; pusta ręka; rzut zabiera gałąź „If you
don't"; etykiety panelu i logu).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L154)

## L155 (2026-09-20) — Premię za zegar licz razem z ceną gardy

**Przypadek:** bot z 2 życia atakował 2/2 w 2/2 (zgłoszenie właściciela).
**Reguła:** wycenę ataku licz na stanie PO ataku — gdy garda wystarczała do
przeżycia, a po ataku już nie, premia za wyścig znika i wchodzi jawna kara.
Wyjątki: atak wygrywający teraz oraz atak letalny (wróg MUSI blokować).
**Strażnik:** `test/zgloszenie-e-oddana-garda.test.js` — 6/6, RED 5/1.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L155)

## L156 (2026-09-20) — Trzy warstwy zgłoszenia: prowadzenie płatności, dane decyzji, narracja zdarzenia

**Przypadek:** paczka F–I: kreator many kazał tapnąć 4 lądy do czaru za 2,
modal Explore pytał „co z odsłoniętą kartą?” BEZ nazwy karty, a discover bez
trafienia nie zostawił w logu ŻADNEGO wpisu.

**Reguła:** (1) ścieżka płatności proponuje tylko kroki, które przybliżają
koszt — źródła brakującego koloru pierwsze, nadmiarowe po zebranej sumie nie
są proponowane (tapnięć ≤ koszt); (2) decyzja bez karty w komendzie bierze ją
z OCZEKUJĄCEJ decyzji wystawionej decydentowi (tytuł + podgląd), a nie z logu;
(3) każde rozstrzygnięcie potrzebuje trzech warstw: FAKTY w zdarzeniu, TEKST
opisu (nigdy `null`) i BRAMKĘ logu/„Rozgrywki”.

**Strażnik:** `test/zgloszenie-{f,g,h,i}-*.test.js` (RED 0/3, 0/4, 0/3, 0/4 →
GREEN; end-to-end G w `test/table-ui.test.js`: 4 lądy → 2 tapnięcia).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L156)

## L157 (2026-09-20) — Log debugowy bierze zdarzenie o treści, której szuka gracz

**Przypadek:** „w «Log partii» chcę widzieć DODATKOWO każdy permanent tapnięty
na manę (co i kiedy) — to ułatwi debugowanie”.

**Reguła:** (1) do logu bierz zdarzenie, które niesie pytanie gracza:
`mana_produced` (źródło + kolory + kto) mówi „co i kiedy”, `object_tapped` nie
mówi nic; (2) „dodatkowo” nie znaczy „wszędzie” — wpis idzie do logu stołu
(czyta go „Log partii”), a granicę (brak wpisu w modalu „Rozgrywka” i w zapisie
tur dla AI — decyzja właściciela 2026-08-02) pinuj testem; (3) pomocnik istnieje
tylko w SWOIM closure: `whoN` z deskryptora zdarzeń nie jest widoczny w zasięgu
sesji — wołaj `who()` z tego samego zakresu; (4) zlecenie „dodaj wpis do logu”
nie jest zgodą na dodatki obok: wpis dostaje zwykły rodzaj (bez własnego
koloru), a sekcji nie przybywa drugie pole — właściciel odrzucił oba
(2026-09-20d).

**Strażnik:** `test/zgloszenie-j-tapniecia-many-w-logu.test.js` — 3 piny
(reguła; wpis w logu; granice), przed poprawką plik czerwony.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L157)

## L158 (2026-09-20) — Menu opcji to nie pula możliwości gracza

**Przypadek:** `legalBlockerOptions` ponad `COMBAT_OPTION_CAP` kończy się
`slice(0, cap)`, a wizard bloków brał kandydatów z SUMY OFERT — 6×6 traciło
5 legalnych par (atakujący, bloker), 10×10 — 69 (CR 509.1b).
**Reguła:** (1) cap ogranicza ROZMIAR MENU, nie zbiór ruchów dozwolonych: pula
kandydatów z reguł (`blockCandidatePool`) idzie osobnym polem widoku; (2) gdy UI
buduje komendę z zaznaczeń, brak wiersza = brak ruchu, więc pin idzie od KOMENDY
(brute-force `execute`) przez widok po UI; (3) pomiar/sprzątanie bez strażnika
klasy gnije (skan cyrylicy wrócił jako 15 znaków w 13 plikach); (4) lustro cudzej
kaskady pinowane testami kłamie (`modeFollowUpPlanOf`: inna kolejność niż
produkcja po M300/1) — pinuj funkcje, które woła gracz.
**Strażnik:** `test/e6-pula-blokerow-ponad-cap.test.js` (+E6/5),
`test/e5-znaki-nielacinskie-w-zrodlach.test.js`, D/5.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L158)

## L159 (2026-09-20) — Mutacja, która nie zaszła, i mutacja, która zaszła w no-op, kłamią tak samo

**Przypadek:** (a) N17 — podmiana wielolinijkowego bloku `auraCard` (z komentarzami)
zakończyła się komunikatem „WZORZEC NIEZNALEZIONY", a wynik wyglądał jak zielony;
(b) N18 — usunięcie wpisu `resolve_aura_host` z listy komend aggro-bota przeszło
ZIELONO, bo przy domyślnych wagach (`ability: 1`) wpis był no-opem, nie dlatego,
że droga jest osłonowa.

**Reguła:**
1. Mutuj DOKŁADNY blok: przed podmianą `sed -n`/`grep -n`, wymiana konkretnych
   linii. „WZORZEC NIEZNALEZIONY" znaczy „mutacja się NIE WYKONAŁA", nie „kod
   jest odporny" — wynik takiej próby jest nieważny, nie zielony.
2. Zielona mutacja to pytanie „czy ta droga była W OGÓLE wykonywana": redundantna
   (N5a/b), osłonowa (M11–M13), czy no-op przy domyślnej konfiguracji (N18).
   Dopiero odpowiedź rozstrzyga luka vs „dokumentacja zamiaru" (L5 pkt 7).
3. Drogi redundantne mutuj PARAMI — o tym, co trzyma kontrakt, mówi dopiero
   usunięcie OBU (N5c).

**Strażnik:** procedura (`/tmp/mut*.sh`; po każdej próbie `git diff` pusty poza
zamierzonym).

## L160 (2026-09-20) — Strażnik ŹRÓDŁA (regex na kształcie kodu) idzie w jednym commicie z refaktorem, ale mierzy NIEZMIENNIK

**Przypadek:** E6/6 (`test/e6-pula-blokerow-ponad-cap.test.js`) czytał regexem
kształt pola widoku (`buildBlockCandidatesView(...)`); po refaktorze z F14
(nowy `buildBlockerView` → `{pool, slots}`) pin padł — nie dlatego, że reguła
się zepsuła, tylko dlatego, że zmienił się literał implementacji.

**Reguła:**
1. Gdy pin czyta kształt implementacji, refaktor i pin idą w JEDNYM commicie:
   guard aktualizujesz do nowego kształtu, nie cofasz źródła pod regex (cofanie
   = maskowanie objawu, L5).
2. Guard ma mierzyć NIEZMIENNIK: pole widoku zbudowane z funkcji reguł
   (`blockSlotsFor` po puli `blockCandidates`), a nie nazwę funkcji, która je
   akurat buduje. Wersja „nazwa funkcji" czerwienieje przy każdym refaktorze
   i uczy ignorować czerwone (L13).
3. Zanim uznasz czerwony guard za regresję, sprawdź, co mierzy: regułę czy
   implementację dnia.

**Strażnik:** `test/e6-pula-blokerow-ponad-cap.test.js` E6/6 + pin F14
(mutacje N19/N20 czerwienią).

## L161 (2026-09-20) — Narracja efektu zbiorczego nazywa ZAKRES z deskryptora karty; pin mierzy też FALLBACK

**Przypadek:** log prewencji Ethersworn Shieldmage mówił „obrażenia zadawane
chronionym obiektom będą niwelowane do końca tury" — bez zakresu, choć karta
mówi o tworach artefaktowych. Zero zgłoszeń detektorów (L27); znalazła ręczna
lektura transkryptu E3 (alara-76, krok z Shieldmage).

**Reguła:**
1. Komunikat o efekcie zbiorczym bierze ZAKRES z danych karty (deskryptor
   `description`), przenoszonych przez silnik do zdarzenia (`filterDescription`)
   i do filtra stanu — nie z warstwy sesji/renderu, która nie wie, kogo efekt
   obejmuje (wzorzec L156).
2. Efekt bez opisu potrzebuje FALLBACKU, a pin mierzy OBA kierunki (opisany →
   jego treść; nieopisany → fallback). Pin tylko na opisie przechodzi zielono,
   gdy inna karta nie ma opisu (i odwrotnie) — kontrakt jest dwustronny.
3. Zanim zgłosisz tekst logu jako defekt, sprawdź, czy nie jest artefaktem
   ekstrakcji transkryptu (symbol many jest w DOM ikoną → „zapłacić 1W?").

**Strażnik:** `test/audyt-pr131-piny-nowych-bramek.test.js` F15
(mutacje N21–N23 czerwienią).

## L162 (2026-09-21) — „Klik nie działa i nie ma błędu" to zwykle cichy `return`; dowód bierz z EFEKTU w DOM

**Przypadek (uwaga B właściciela, Toll of the Invasion):** „klikanie nazw kart
nie otwiera obrazka". Kod wyglądał poprawnie (`log-card`, `data-card-id`,
listener), konsola czysta. Dopiero pomiar SKUTKU na artefakcie (jsdom: czy
`#card-fullscreen` ma klasę `active` i `img` w środku) dał `pełny ekran=false`:
`data-card-id` niósł **objectId**, a ścieżka obrazu po objectId dla obiektu
nieobecnego w widocznych strefach gracza (FoW: cudza ręka = `{id, hidden:true}`)
kończy MILCZENIEM.

**Reguły:**
1. Interakcja „nic nie robi, a nie ma wyjątku" to prawie zawsze wczesny
   `return` na warunku widoczności. Sprawdź, czy identyfikator oddany do DOM
   (`data-*`) należy do TEJ SAMEJ przestrzeni nazw, którą rozumie opener
   (objectId kontra cardId) — inaczej klik „działa", a nie ma czego pokazać.
2. Dowód dla warstwy UI bierz z EFEKTU (element/klasa w DOM), nie z tego, że
   handler się wykonał: sonda wołająca tylko callback nie odróżnia „otworzyło"
   od „nic nie zrobiło".
3. Jeśli etykieta wiersza NAZYWA kartę (pełna nazwa z sesji), wolno jej też
   pokazać obraz — podgląd idzie wtedy drogą definicji (cardId). FoW zostaje
   tam, gdzie obiekt jest zakryty i BEZIMIENNY (biblioteka, morf): granicę
   wyznacza jedno miejsce (`hiddenObjectCardId`) z pinem na oba wyjątki.

**Strażnik:** `test/uwagi-2026-09-21-b-klik-w-nazwe-otwiera-obraz.test.js`
B/1–B/3; mutacje (bez fallbacku, bez wyjątku biblioteki, bez sprawdzenia
widoczności) czerwienią.
