# Lekcje projektowe (trwały rejestr)

Ten plik gromadzi **powtarzalne wnioski z pracy nad projektem** — rzeczy, które
kolejne sesje powinny wiedzieć, zanim popełnią ten sam błąd po raz trzeci.

**Czym różni się od innych dokumentów:**

| Dokument | Zakres | Trwałość |
|---|---|---|
| `docs/setup/HANDOFF_*.md` | stan JEDNEJ sesji: co zrobiono, co dalej | jednorazowy, traci aktualność |
| `docs/plans/PLAN_*.md` | roadmapa JEDNEGO zadania | jednorazowy |
| `docs/PROJECT_HISTORY.md` | dziennik sesji (historia) | żywy, ale NIE jest lekturą startową |
| `docs/decisions/*.md` (ADR) | wiążąca decyzja architektoniczna | trwała, formalna |
| **`docs/LESSONS.md`** | **wniosek/heurystyka diagnostyczna** | **trwała, nieformalna** |

Lekcja trafia tutaj, gdy jest **powtarzalna**, ale nie jest decyzją
architektoniczną (te idą do ADR). Jeżeli lekcja wymusza zmianę sposobu pracy —
dopisz ją też do `AGENTS.md`; jeżeli ustala granicę komponentów — napisz ADR
i tu zostaw tylko odsyłacz.

**Zasada dopisywania:** nowa lekcja = nowa sekcja z datą, objawem, przyczyną
i regułą na przyszłość. Nie kasujemy starych lekcji; jeśli przestały
obowiązywać, oznaczamy je jako nieaktualne z odsyłaczem do nowszej.

---


## L83 (2026-08-28) — Strażnik skanujący ŹRÓDŁO czyta KOD, nie komentarz: pokrycie „wspomnieniem" zamyka kontrolę

**Objaw (audyt PR #86, sesja arena/01a049c7):** `test/fingerprint-pending-decisions.test.js`
— strażnik klasy L16, którym PR #86 domknął pięć decyzji blokujących grę
poza odciskiem stanu (N1) — liczył pokrycie jako **każde** wystąpienie
`pending*` w pliku `src/engine/fingerprint.js`. Syntetyczna mutacja:
dopisanie `state.pendingZzz` do `firstPendingDecisionPlayerId` i wspomnienie
`pendingZzz` wyłącznie w komentarzu obok listy → strażnik **zielony (2/2)**.
Czyli kolejna nowa decyzja blokująca znów wyciekłaby z fingerprintu dokładnie
tak, jak te naprawione w PR #86.

**Przyczyna:** regex puszczony po SUROWYM pliku nie odróżnia kodu od
komentarza, a komentarz obok listy to najnaturalniejsze miejsce, w którym
autor nowej decyzji opisuje swoją zmianę. To L31 (strażnik pilnował danych,
błąd siedział w kodzie) i L56 (zwolnienie oparte o słowo kluczowe jest
dziurą) przeniesione na skan źródła: kontrola mierzyła TEKST, nie regułę.

**Reguła:**
1. Strażnik czytający plik wydobywa fakty z **konstruktów**, nie z tekstu:
   lista — z literału tablicy, projekcje — z odczytów `state.pole`, a
   komentarze usuwa się PRZED skanem (świadomie: ciągi znakowe, `//`,
   blokowe). Wtedy „wspomnienie" pola nie jest pokryciem z definicji.
2. Pin na strażniku ma **DWIE nogi** (L67): (a) kompozycja nie liczy
   komentarza jako pokrycia (syntetyczne źródło z zakomentowanym odczytem
   `if (state.pendingZzz) …`), (b) **ścieżka produkcyjna musi iść przez tę
   kompozycję** — inaczej obejście funkcji zostawia pin zielony, a lukę
   otwartą. Nogę (b) złapała dopiero trzecia mutacja: przy produkcji
   czytającej surowy plik obie pozostałe asercje nadal świeciły na zielono.
3. **Sygnał ostrzegawczy przy audycie:** strażnik, który „udowadnia" własność
   regexem po całym pliku. Zadaj pytanie: *czy da się przejść tę kontrolę,
   nie zmieniając kodu?* Jeśli tak — kontrola mierzy tekst, nie regułę.

**Sformalizowane w:** `test/fingerprint-pending-decisions.test.js`
(`stripComments` + `coveredFieldsFromFingerprintFile` + pin A1 z dwiema
nogami), raport `docs/audits/AUDYT_PR86_2026-08-28.md`.

**Pułapka uderzyła drugi raz w tej samej sesji — w moim własnym strażniku.**
`test/repo-artefakty-audytu.test.js` sprawdzał kompletność reguł `.gitignore`
przez `ignore.includes('tmp-audyt-*/')`, a komentarz NAD tą regułą cytuje ją
dosłownie: usunięcie reguły zostawiało strażnik zielony (wykryła to mutacja
M2, nie code review). Wniosek praktyczny: reguła 1 obowiązuje także wobec
strażników, które sam piszesz — i to w dniu ich powstania.


## L86 (2026-08-28) — Warstwa prezentacyjna potrzebuje WŁASNEJ pauzy: obserwator zdarzenia nie może zakładać, że gra na niego czeka

**Objaw (zgłoszenie właściciela, tryb wysoko-graficzny):** „Rzuciłem czar, a
akcja poszła dalej i zaczęła się następna tura i nieprzyjaciel rzucił czar i
pokazał się ekran z grafikami tego ostatniego czaru nieprzyjaciela, a mojego
w ogóle nie było pokazanego." Warstwa otwierała się z obserwatora `onCast`,
ale pętla `advance()` sesji leciała dalej — w jednej komendzie potrafią
przejść trzy rzuty i następna tura.

**Przyczyna:** obserwator był „donosicielem" (wypadek przy grze), a nie
„uczestnikiem" (ktoś, kogo gra musi zapytać o zgodę). Brakowało mu dwóch
rzeczy naraz: **pauzy** (sesja musi przerwać `advance()` po bieżącej komendzie)
i **kolejki** (każdy rzut osobno, nie tylko ostatni). Bez kolejki pauza
zamienia „widzę ostatni" na „widzę pierwszy" — drugi błąd tej samej klasy.

**Reguła:** gdy UI pokazuje coś, co gracz ma ZOBACZYĆ (ilustracja, animacja,
„Ruch bota"), potrzebuje:

1. **sygnału zwrotnego** — obserwator mówi, czy warstwa naprawdę się pokazała
   (`true` = wstrzymaj), żeby karty bez ilustracji nie zatrzymywały gry;
2. **własnego stanu pauzy** — nie pożyczonego od innej warstwy (wspólna flaga
   otwierałaby jednocześnie modal „Ruch bota" i warstwę grafik);
3. **kolejki** — zamknięcie warstwy otwiera następny element, a gra rusza
   dopiero przy pustej kolejce.

Kolejkę warto wynieść do CZESTEGO modułu (`src/table/art-showcase.js`): wtedy
jej zachowanie jest testowalne headless, bez DOM-u i bez sesji.

**Sformalizowane w:** `session.artPausePending` / `continueArtPlay()`
(`src/table/session.js`), `createArtShowcaseQueue` (`src/table/art-showcase.js`),
testy w `test/m254-uwagi-wlasciciela.test.js` (C1–C3).

## L85 (2026-08-28) — `eventData.manaCost` to mana WYDATKOWANA, nie mana value karty

**Objaw (Batch 51, Kulrath Mystic — „Whenever you cast a spell with mana value
4 or greater"):** pierwsza implementacja warunku `spellManaValueAtLeast: 4`
czytała `eventData.manaCost` zdarzenia `permanent_cast` i przepuszczała czar
z obniżką (MV 5 zapłacone {3} po redukcji), a odrzucała czar bez obniżki przy
alternatywnym koszcie. Testy własne karty były zielone, bo w nich koszt równał
się wartości many.

**Przyczyna:** dwa różne fakty niosą to samo pole. `eventData.manaCost` w
zdarzeniu rzutu to koszt faktycznie ZAPŁACONY (po obniżkach, po koszcie
alternatywnym), a mana value (CR 202.3) wynika z KOSZTU WYDRUKOWANEGO na
obiekcie — czyli `eventData.object.manaCost`.

**Wniosek:** warunek na mana value czyta OBIEKT (`eventData.object?.manaCost`),
nigdy kwotę ze zdarzenia płatności. Przy dopisywaniu warunku do triggera
sprawdź, czy dane wejściowe są „wartością z karty" czy „wynikiem rozliczenia" —
w zdarzeniach silnika to prawie zawsze to drugie.

**Sformalizowane w:** `conditionHolds` (`src/engine/triggers.js`, wpis
`spellManaValueAtLeast`), testy „MV 4 odpala / MV 1 nie" w
`test/batch51-kart.test.js`.


## L84 (2026-08-28) — Nowy deskryptor mechaniki ma cztery dowiązania poza silnikiem: strażniki zgłaszają je osobno, więc dopisz je od razu

**Objaw (Batch 51):** po dodaniu trzech nowych elementów (`buff_attacking_creatures`,
`buff_creature_until_end_of_turn`, zdarzenie `creature_became_renowned`) pełny
`npm test` pokazał **pięć** czerwonych testów naraz, z czego cztery nie miały
nic wspólnego z mechaniką, tylko z jej OTOCZENIEM: brak etykiety PL
(strażnik M122), brak wyceny bota (strażnik M157), brak wpisu w `EVENT_TYPES`
i brak opisu zdarzenia w `describeGameEventRaw` (strażniki M134/uwagi
właściciela). Piąty to złoty fixture bota (osobna lekcja L25).

**Przyczyna:** mechanika w silniku to **jedno** z kilku miejsc, w których nowy
deskryptor musi istnieć. Strażniki są pisane osobno i każdy zgłasza swój brak
własnym komunikatem, więc kolejka redów jest kosztem PROCESOWYM, nie dowodem
błędu w mechanice. Czekanie na nie uruchamia pełny test za każdym razem
(~2 min), a komunikat i tak mówi wprost, czego brakuje.

**Wniosek:** wprowadzając nowy deskryptor (efekt, zdarzenie, filtr celu),
odhacz listę PRZED pierwszym uruchomieniem pełnego testu:

1. `EVENT_TYPES` + `describeGameEventRaw` (`src/table/session.js`) — zdarzenie
   bez opisu jest dla gracza niewidoczne (L24);
2. etykieta w mapie opisów (`src/table/render.js`) — strażnik M122;
3. wycena bota (`src/controllers/heuristic-bot.js`) albo świadomy wpis do
   `REVIEWED_UNVALUED` — strażnik M157;
4. `gameObjectDataOf` (`src/cards/materialize.js`) — deskryptor z definicji
   karty musi dojść na obiekt gry (L21 uderzyła tu po raz kolejny: `renown`
   ginęło w materializacji).

**Sformalizowane w:** sekcja „Obowiązki przy nowym deskryptorze" w
`docs/cards/HOW_TO_ADD_CARD.md`, strażniki M122/M134/M157.


## L82 (2026-08-28) — Test UI wiąże SKUTEK z hakiem semantycznym (klasa/`data-*`), copy pina się OSOBNYM testem

**Objaw (sesja M251):** poprawna etykieta „Użyj domyślnego przydziału
(zabójcze obrażenia…)" złamała test `choice-request-ui`, choć test ten
nazywał się „przycisk Domyślnie wysyła wariant z legalCommands" — testował
SKUTEK komendy, a lokalizował przycisk po TEKŚCIE (`findAll(host, 'button',
'Domyślnie')`). Copy poprawne + logika poprawna = test czerwony; złowił go
pełny rdzeń, nie punktowy grep (szukałem referencji do „lethal-first"
i klasy — wzorzec „Domyślnie" mi umknął).

**Przyczyna:** jeden test wiązał DWIE rzeczy — lokalizację widgetu i regułę
gry — przez najbardziej lotną warstwę (copy). Etykiety tekstowe to warstwa,
którą najczęściej ruszają uwagi UX (M162/C, M202/D, M211); kontraktem DOM
jest klasa semantyczna / `data-*` (tu: `damage-wizard-default`). Test
pisał się wtedy, gdy copy było stabilne — i działał, póki rozmowa o UX
nie dotarła do tego tekstu.

**Reguła:**
1. Test zachowania („klik → komenda X") lokalizuje element po haku
   semantycznym, NIGDY po tekście — tekst to dekoracja, klasa to rura.
2. Treść widoczną dla gracza pilnuje OSOBNY, jawny pin (u mnie: osobny
   test M251 z `doesNotMatch(/lethal-first/)`). Wtedy regresja copy mówi
   „zmieniłeś tekst gracza", a nie symuluje złamania logiki.
3. Przy zmianie stringów UI: punktowy grep ma ślepe półki (ja przegapiłem
   wzorzec po słowie, bo grepem szukałem po INNYM słowie z tej samej
   etykiety). Minimalny rytuał: grep po KLASIE elementu + pełny rdzeń
   przed commitem (ADR 0020 C złapało — ale kosztem jednego cyklu).

**Sformalizowane w:** `test/choice-request-ui.test.js` (lokalizacja po
`damage-wizard-default` + pin copy); znaleisko i naprawa etykiet żargonu
„lethal-first" w wizardzie i `commandLabel` (M251).


## L81 (2026-08-28) — Zastępując ręczną kopię „wspólną funkcją prawdy", porównaj FILTRY obu stron, nie tylko listę przedmiotów

**Objaw (audyt PR #85, znalezisko N2, ta sesja):** bramka oferty
`pass_priority` dostała `firstDecisionOwner == null` — dokończenie
unifikacji z Batch 47 (bramki czarów i lądów/ataków już ją mają). Zielony
rdzeń odpowiedział JEDNYM czerwonym testem: M33 („ślepa decyzja pokoju
gaśnie, gra toczy się dalej"). Wspólna funkcja `firstPendingDecisionPlayerId`
 liczyła `pendingRoomTargets` po SUROWEJ długości tablicy, podczas gdy
zastępowana kopia miała filtr „na żywo" (`legalRoomTargetCandidates(…)`
> 0) — ślepe wpisy (kandydaci zniknęli po zakolejkowaniu decyzji) nie mogą
blokować gry.

**Przyczyna:** unifikując N kopii w jedno źródło (L41) porównałem
PRZEDMIOTY list (61 pól ręcznego łańcucha ⊆ 62 funkcji), ale nie SEMANTYKĘ
poszczególnych pozycji. Kopie ręczne narosły o lokalne filtry jakości
(`triggerTargetsBlock` — żywe wpisy, `roomTargetBlocks` — wpisy z legalnym
celem); funkcja „jednego źródła prawdy" miała ten filtr tylko dla jednej
z nich (`triggerTargetDecisionPending`). Rozjazd ujawnił się dopiero
w pętli uruchomieniowej, jak w L37: zmiana ścieżki to darmowy fuzzing
kontraktów.

**Reguła:**
1. Przy zamianie kopii na wspólną funkcję zrób tabelę DWÓCH kolumn:
   „co kopia sprawdza" × „co funkcja sprawdza" — różnica w FILTRZE jest
   kontraktem do przeniesienia, nie szumem. Surowe `length > 0` kontra
   `some(legal(…))` to RÓŻNE reguły gry: pierwsza patrzy na kolejkę, druga
   na skutek (pokrewne L80).
2. Zanim zaakceptujesz regresję testu po takiej zamianie, rozstrzygnij,
   która strona mówi prawdę o REGULE (tu: M33 ma rację — ślepa decyzja MUSI
   przestać blokować; naprawiana jest funkcja wspólna, nie test). Regresja
   po unifikacji bywa sygnałem, że funkcja „prawdy" dotąd kłamała.
3. Ślepe decyzje to stała klasa stanu silnika: `pendingRoomTargets`,
   `pendingTriggerTargets` (i przyszłe kolejki z kandydatami) — każda nowa
   kolejka wieloelementowa dostaje pytanie „co, gdy wpis zdążył umrzeć?"
   (przycinanie w `pruneDeadPendingDecisions` + filtr
   w `firstPendingDecisionPlayerId`).

**Sformalizowane w:** filtr pokoju w `firstPendingDecisionPlayerId`
(2026-08-28), test `test/room-targets-staleness.test.js` (kontrakt M33),
`test/manifest-dread-pass-offer.test.js` (N2).


## L80 (2026-08-26) — „Dubel na stosie" to nie to samo co „efekt już zastosowany": strażnik idempotencji musi patrzeć na STAN, nie tylko na stos

**Objaw (M220, pętla jakości Żywym Testerem, h9):** bot aktywował Saddle na
Trained Arynx (efekt `set_saddled`, idempotentny do końca tury) 3× z rzędu
w jednej turze, tapując kolejne stwory za nic. `set_saddled` był w
`IDEMPOTENT_EOT_EFFECTS`, a mimo to bot dublował aktywację.

**Przyczyna:** strażnik idempotencji (`pendingTwin`, M179/B) sprawdzał tylko,
czy IDENTYCZNA aktywacja WISI NA STOSIE. Gdy pierwsza już się rozstrzygnęła
i nadała trwały-do-EOT stan, na stosie nic nie wisiało — a stan `saddled`
siedział na permanencie na polu bitwy. Strażnik pilnował KOLEJKI, nie SKUTKU.

**Reguła:** dla efektu idempotentnego do EOT, który nadaje ODCZYTYWALNĄ flagę
stanu (`saddled`, `cantBlock`, `monstrous`…), strażnik musi mieć DWIE nogi:
(1) brak bliźniaka na stosie (`pendingTwin`) ORAZ (2) cel/źródło nie ma jeszcze
tej flagi w PlayerView. Sam warunek (1) chroni tylko w oknie, gdy pierwsza
kopia jeszcze się nie rozstrzygnęła; po rozstrzygnięciu chroni wyłącznie (2).
Flagę czytaj z widoku (ADR 0017), rozpoznawaj po TYPIE efektu i deskryptorze
stanu, nie po nazwie karty (ADR 0002). Anty-over-fix: pierwsza aktywacja
(flaga jeszcze nieustawiona) musi zostać legalna — pilnuj tego osobnym testem.

**Sformalizowane w:** `src/controllers/heuristic-bot.js` (`set_saddled` +
`source.saddled` → −10), `test/m219-bot-resaddle-noop.test.js` (RED→GREEN
+ anty-over-fix).


## L79 (2026-08-26) — Decyzja `resolve_*` emitująca dwa zdarzenia o tej samej treści dubluje wpis w logu

**Objaw (M219, pętla jakości Żywym Testerem, g9):** aktywacja Unstable
Frontier pokazywała w modalu „Rozgrywka" i logu DWA identyczne wiersze na
jedną akcję: „Swamp staje się typem Plains do końca tury" ×2.

**Przyczyna:** rozstrzygnięcie decyzji `resolve_land_type_choice` emituje dwa
zdarzenia — `land_type_changed` (niska warstwa: sama mutacja typu, jak
licznik/tap) ORAZ `land_type_choice_resolved` (narracja decyzji) — a
`describeGameEvent` renderował OBA tym samym zdaniem. To wariant L24/L6:
warstwa opisu dostała dwa zdarzenia niosące tę samą TREŚĆ dla gracza. Klasa
pokrewna L41 (jedna informacja, dwa źródła), ale po stronie zdarzeń, nie kopii
kodu.

**Reguła:** gdy jedna decyzja emituje parę „zdarzenie mechaniczne + zdarzenie
narracyjne" (mutacja stanu + `*_resolved`), TYLKO JEDNO ma renderować zdanie
dla gracza — zwykle to narracyjne (`*_resolved`), bo niesie komplet kontekstu.
Drugie wycisz w warstwie opisu (`return null`), ale ZOSTAW zdarzenie
w strumieniu: jest potrzebne do determinizmu/fingerprintu i innym konsumentom
(tu `real-cards-batch7` sprawdza OBECNOŚĆ `land_type_changed`). Kontrolne
pytanie przy dodawaniu `*_resolved`: „czy niższa warstwa już emituje zdarzenie
z tą samą treścią?" — jeśli tak, jedno z nich nie może mieć opisu.

**Sformalizowane w:** `src/table/session.js` (`land_type_changed` → null),
`test/m219-log-land-type-duplikat.test.js` (integracja: dwa zdarzenia, opis
raz).


## L78 (2026-08-26) — Lektura obowiązkowa czytana fragmentami to lektura NIEwykonana

**Objaw:** sesja „przeczytała” lekturę startową, ale `docs/LESSONS.md`
(1930 linii) i część ADR-ów zostały obejrzane tylko we fragmentach — kilka
najnowszych lekcji plus nagłówki, bo narzędzie czytające zwracało pliki
z ucięciem (`truncated`/`hasMore`) i agent nie dobrał reszty. Właściciel
wychwycił to od razu: „jeśli jakiś plik z obowiązkowej lektury nie został
przeczytany w całości, to należy go pobrać tak, żeby przeczytać go w całości”.

**Przyczyna:** narzędzia czytające (fetch/read/„head”) często zwracają tylko
kawałek dużego pliku i sygnalizują to flagą, którą łatwo przeoczyć. „Zielony”
odczyt jednego chunku wygląda identycznie jak przeczytanie całości —
dokładnie jak L68 (brak skutku nieodróżnialny od poprawnego skutku), tylko
w warstwie dokumentacji. AGENTS.md §0 mówiło „czytasz wszystkie [ADR-y]”
i „cały rejestr”, ale nie nazywało wprost, że pojedynczy plik też ma być
przeczytany od pierwszej do ostatniej linii, i co zrobić z ucięciem.

**Reguła:**
1. Plik z lektury obowiązkowej uznajesz za przeczytany dopiero, gdy dotarłeś
   do jego OSTATNIEJ linii. Sprawdź `wc -l` i potwierdź, że pomiar objął cały
   zakres — dla `LESSONS.md` znaczy to WSZYSTKIE lekcje `L1…`, nie tylko te
   z góry/dołu.
2. Każdy sygnał fragmentacji (`truncated`, `hasMore`, `stdout_truncated`,
   stronicowanie, twardy limit bajtów) to polecenie „dobierz następny
   fragment”, nie koniec czytania. Czytaj po zakresach linii (`sed -n`),
   aż wyczerpiesz plik.
3. „Przejrzałem / streściłem / doczytałem ostatnie wpisy” NIE jest
   przeczytaniem i nie zwalnia z pkt 1–2.

**Sformalizowane w:** `AGENTS.md` §0 (blok „Każdy plik lektury obowiązkowej
czytasz W CAŁOŚCI…” + doprecyzowanie pozycji 2 i 3 listy lektur).


## L77 (2026-08-26) — Wejście na pole bitwy to ZDARZENIE o wielu następstwach: decyzja blokująca ani `return` nie mogą wycinać reszty

**Objaw (M216/M217):** dwa błędy tej samej klasy, znalezione w tej samej sesji:

- **Devour (Gorger Wurm, CR 702.82a):** trigger ETB (Impact Tremors) odpalał w
  tym samym przebiegu skanu, w którym do kolejki trafiała decyzja devour —
  więc widział stwora PRZED licznikami. Devour to ZASTĘPCZY efekt wejścia:
  liczniki są na permanencie, zanim odpali się jakikolwiek trigger ETB.
- **Exploit (Gurmag Drowner, CR 702.110a):** `return` przy braku kandydatów
  przerywał przetwarzanie CAŁEGO zdarzenia wejścia — pomijały się też
  triggery niezwiązane z exploitem („creature_you_control_enters",
  „another_creature_enters", landfall…).

**Przyczyna:** blok wejścia traktował „kolejkuj decyzję" i „odpal triggery"
jako jedną niepodzielną jednostkę — pierwszy warunek mógł wstrzymać dalszy
bieg (devour) albo go całkiem uciąć (exploit). Tymczasem to niezależne
następstwa jednego faktu: permanent WSZEDŁ na pole bitwy niezależnie od tego,
czy gracz ma co poświęcić i co wybierze.

**Reguła:** w przetwarzaniu zdarzenia wejścia każda blokująca decyzja
(devour/exploit/endure…) i każdy warunek „brak wyboru" pomija TYLKO własne
następstwo; dalsze następstwa (własne ETB, triggery innych permanentów, saga,
liczniki) muszą biec dalej. Kontrolne pytanie przy patchu: „czy ta gałąź
(`return` / `push` decyzji) wycina coś, co zdarzyło się niezależnie od tej
decyzji?" — jeśli tak, to `if` wokół decyzji, nie `return` z funkcji. Ta sama
klasa obejmuje też „kolejkuj, ale kontynuuj skan" — kolejność następstw
względem decyzji też jest częścią reguł (replacement przed triggerem —
devour; trigger przed decyzją — exploit).


## L75 (2026-08-25) — Fałszywy alarm detektora kosztuje więcej niż cisza; ale zanim go uciszysz, sprawdź POMIAR

**Objaw (M213):** Żywy Tester zgłosił 4 no-opy na zdolności
„{2}, {T}: Tap target creature" wycelowanej we własnego stwora. Zdolność
działa poprawnie — sonda dowiodła, że silnik nie oferuje nawet tapowania
już-tapniętego celu.

**Przyczyna:** taka zdolność tapuje DWA permanenty naraz — źródło (koszt)
i cel (skutek). Sonda liczyła oba do jednego licznika, więc warunek „jedyna
zmiana to zapłacony koszt" wychodził prawdą. Rozróżnienie jest dostępne
strukturalnie: obiekty płacące koszt wskazuje sama KOMENDA (`objectId` plus
jawne `tapCreatureId`/`crewCreatureIds`/...), więc nie trzeba żadnej
heurystyki po nazwie karty.

**Reguła:** gdy detektor audytu oskarża kod, który po sprawdzeniu okazuje się
poprawny, błąd leży w POMIARZE — i tam go napraw, zamiast dopisywać wyjątek
na etykietę albo nazwę karty. Jeden licznik zbierający dwa różne zjawiska
(koszt i skutek) zawsze będzie kłamał na przypadkach, gdzie występują razem.

**Reguła druga:** po uciszeniu alarmu udowodnij, że detektor NADAL krzyczy na
prawdziwym przypadku (L67). Tu: osobny test z realnym no-opem obok testu
z poprawą oferty.


## L76 (2026-08-25) — Żywy Tester mierzy `dist/`, nie `src/`

**Objaw (M213):** po naprawie sondy partia kontrolna zwróciła **niezmienioną**
liczbę zgłoszeń. Wyglądało to na „patch nie działa" i o mało nie doprowadziło
do szukania drugiej przyczyny w kodzie, który był już poprawny.

**Przyczyna:** `tools/table-tester/run-game.mjs` ładuje zbudowany artefakt
`dist/mtg-table.html` (ADR 0011), a nie moduły z `src/`. Bez `npm run build`
Tester mierzy poprzednią wersję aplikacji.

**Reguła:** `npm run build` jest częścią pętli „popraw → zmierz" dla każdej
zmiany w `src/`, nie tylko przed commitem. Gdy wynik pomiaru nie drgnął ani
o jotę po realnej zmianie kodu, **najpierw podejrzewaj nieaktualny artefakt**,
a dopiero potem własną diagnozę (L33 — najpierw podejrzewaj narzędzie).


## L71 (2026-08-25) — Zmiana strefy tworzy NOWY obiekt (CR 400.7); „ten sam” id to złudzenie

**Objaw (M212):** naprawa wyceny darmowego rzutu wyglądała na działającą
(testy zielone), a była martwa. Helper szukał opisu czaru po `cmd.cardId`
w `view.zones.exile` i zawsze dostawał `undefined`, więc kara za zły cel
wynosiła 0 — dokładnie tyle, ile przed naprawą.

**Przyczyna:** oferta darmowego rzutu niesie **dwa różne identyfikatory** —
`cardId` (która to karta) i `objectId` (który to obiekt w strefie). Deskryptor
`spell` wisi na OBIEKCIE, bo według CR 400.7 karta zmieniająca strefę staje się
nowym obiektem i nie dziedziczy stanu poprzedniego. Lookup po `cardId` w strefie
obiektów jest składniowo poprawny i semantycznie pusty.

**Reguła:** przy pracy ze strefami rozróżniaj „tożsamość karty” od
„tożsamości obiektu” i sprawdzaj, po którym kluczu indeksowana jest strefa.
Gdy helper wyszukujący zwraca `null`/`undefined`, **kod nie jest neutralny —
jest wyłączony**: asertuj w sondzie, że lookup COŚ znalazł, zanim uznasz
naprawę za działającą (L68 — brak skutku bywa nieodróżnialny od poprawnego
skutku).


## L72 (2026-08-25) — Jeden objaw, kilka bliźniąt: naprawę kończy przegląd RODZEŃSTWA

**Objaw (M212):** zgłoszenie „bot tapuje własnego blokera” dotyczyło rebounda.
Po naprawie okazało się, że ta sama ślepota siedzi w `resolve_suspend_cast`,
a po kolejnym przeglądzie — także w `resolve_madness_cast`. Trzy gniazda,
jedna przyczyna: silnik enumeruje ofertę **per zestaw celów**, a bot wyceniał
wyłącznie TYP efektu, więc wszystkie warianty miały identyczny wynik i wygrywał
pierwszy z brzegu.

**Reguła:** gdy przyczyną błędu jest **kształt interfejsu** („oferta niesie
cele, konsument ich nie czyta”), znajdź WSZYSTKICH konsumentów tego kształtu,
zanim uznasz temat za zamknięty — `grep` po nazwie komendy/rodzinie `case`.
Naprawę wynieś do wspólnego helpera, żeby czwarte gniazdo rodziło się już
poprawne. Każda gałąź potrzebuje **własnej** mutacji i **własnego** testu:
mutacja bliźniaczej gałęzi (suspend) przeszła niewykryta przez test rebounda.


## L73 (2026-08-25) — Detektor sprzężony z TRYBEM logowania milczy tam, gdzie audyt patrzy

**Objaw (M212):** trzy partie Żywego Testera po naprawie dały 0 zgłoszeń.
Zero było fałszywe: archiwalny transkrypt SPRZED naprawy zawierał wzorcowy
przypadek (`Nieprzyjaciel rzuca Ojutai's Breath → cel: <własny stwór>`),
a detektor `detectBotSelfHarmOnOwnPermanents` również go nie widział.

**Przyczyna:** detektor ustalał właściciela celu, parsując snapshoty
„MOJE POLA:” / „POLA WROGA:” z transkryptu. Audyt biega z `--quiet`, gdzie
snapshotów niemal nie ma — w całym pliku był JEDEN, na końcu partii. Warunek
„cel stoi po stronie bota” nigdy nie był spełniony, więc detektor był
strukturalnie martwy w jedynym trybie, w którym go używano.

**Reguła:** detektor opiera się na danych **strukturalnych** zbieranych przez
sterownik (L40/M99), nigdy na tym, ile narzędzie akurat wypisało. A gdy
detektor raportuje zero, udowodnij, że jest żywy: puść go na archiwalnym
materiale z potwierdzonym błędem albo rozluźnij warunek i sprawdź, że
zgłoszenie się pojawia. **Zero z martwego detektora wygląda identycznie jak
zero z poprawnej gry.**


## L74 (2026-08-25) — Ustalenie o UI weryfikuj w DOM, nie w spłaszczonym transkrypcie

**Objaw (M212):** część „znalezisk” audytu brała się z czytania transkryptu,
gdzie osobne elementy interfejsu są sklejane separatorem w jedną linię.
Dwie różne opcje w panelu wyglądają tam jak jedna zlepiona etykieta —
i odwrotnie, realny błąd sklejenia bywa nieodróżnialny od artefaktu zapisu.
Z 13 partii 11 tropów okazało się poprawnym zachowaniem.

**Reguła:** zanim zgłosisz błąd UI, sprawdź **strukturę DOM** (ile jest
elementów `button.action`, jakie mają teksty), a nie jej spłaszczony zapis.
Transkrypt służy do namierzenia miejsca, DOM — do rozstrzygnięcia.

**Reguła druga (nazewnictwo):** nazwa karty w kodzie mechaniki (np. mechanika
ochrzczona po karcie, która ją wprowadziła) **nie jest zgodą** na pokazanie
tej nazwy w etykiecie UI. Gracz widzi wtedy w swoim panelu nazwę cudzej karty,
której nie ma w talii. Deskryptor w interfejsie opisuje **czynność**
(rzeczownik odczasownikowy), nigdy źródło implementacji (ADR 0002).


## L68 (2026-08-25) — Sonda, która „nie znalazła błędu”, bo komenda została cicho odrzucona

**Objaw (M210):** sonda sprawdzająca, czy obrażenia z delirium respektują
`protection from red`, wypisała „OK — brak obrażeń”. Wniosek był fałszywy:
komenda w ogóle się nie wykonała (`ok:false`, `unsupported_command`), bo
`pending` nie miał pola `opponentId` i filtr kandydatów zwracał pustą listę.
Brak skutku wziąłem za poprawny skutek.

**Przyczyna:** sonda mierzyła STAN KOŃCOWY (`damage === 0`), nie sprawdzając,
czy badana ścieżka w ogóle została wykonana. Każdy powód odrzucenia komendy —
literówka w polu, brak wymaganego klucza, niespełniony warunek wejścia —
produkuje ten sam „zielony” obraz co poprawna implementacja.

**Reguła:** sonda silnika ZAWSZE asertuje najpierw, że komenda przeszła
(`assert.equal(result.ok, true)`), a dopiero potem bada skutek. Gdy sonda ma
udowodnić BŁĄD, musi też pokazać stan pośredni świadczący, że kod się wykonał
(zdarzenie, licznik, zmiana pola). To samo dotyczy testów: `ok` komendy jest
częścią asercji, nie tłem. Patrz też L13/L61 — dowód wymaga, żeby test potrafił
być czerwony z właściwego powodu.


## L69 (2026-08-25) — Dane karty i mechanika to dwa źródła prawdy o tym samym; kolor vs. produkowana mana

**Objaw (M210):** podstawowe landy miały w danych `colors: ['R']` itd. — pole
„kolor” zostało użyte do zapisania, JAKĄ MANĘ karta produkuje. Ponieważ kolor
obiektu wyznacza jego koszt many (CR 202.2), a land kosztu nie ma, każdy land
był w silniku kolorowy. Po animacji (Awaken) Swamp stawał się czarnym stworem:
obchodził „protection from black” i spełniał „can't be blocked except by black”.
Test regresyjny utrwalał pomyłkę, asertując `def.colors === ['B']` z komentarzem
„produkuje {B}”.

**Przyczyna:** dwa różne pojęcia (kolor obiektu / kolor produkowanej many)
trafiły do jednego pola, bo dla landu „czarny” brzmi tak samo w obu znaczeniach.
Ujawniło to dodatkowo, że Immersturm Skullcairn NIE MIAŁ deskryptora
`{T}: Add {B}` — działał wyłącznie dzięki tej pomyłce.

**Reguła:** gdy pole danych karty da się przeczytać na dwa sposoby, sprawdź,
która ścieżka silnika je czyta i po co. Kolor obiektu = wyłącznie CR 202.2
(koszt many, plus efekty nadające kolor); produkowana mana = deskryptor
`add_mana`. Test, który cementuje takie pomieszanie, jest częścią błędu —
poprawiamy go razem z kodem, nie „dostosowujemy” kodu do testu.


## L70 (2026-08-25) — Weryfikacja mutacyjna wykrywa też kod NADMIAROWY, nie tylko brakujące testy

**Objaw (M210):** nowa funkcja `effectiveColors` miała gałąź „obiekt typu Land
→ kolor pusty” (CR 202.2). Mutacja tej gałęzi (wyłączenie jej) NIE uczyniła
żadnego testu czerwonym, choć testy sprawdzały dokładnie ten scenariusz.

**Przyczyna:** regułę egzekwowały już dane kart (landy mają `colors: []`),
więc gałąź była martwa. Co gorsza, była też BŁĘDNA: efekt animujący może
kolor nadać (Genju of the Spires — „becomes a 6/1 red Spirit creature land”,
CR 613 warstwa 5), a zerowanie po typie by go zgubiło.

**Reguła:** mutację robimy per GAŁĄŹ, nie per funkcja. Gałąź, której mutacja
nie czerwieni żadnego testu, jest podejrzana z definicji: albo brakuje testu,
albo gałąź jest zbędna. Zanim dopiszesz test, sprawdź najpierw, czy gałąź
w ogóle powinna istnieć — usunięcie nadmiarowej reguły jest lepszą naprawą
niż utrwalenie jej testem.


## L67 (2026-08-25) — Helper, który istnieje, ale nie jest wołany w gałęzi, gdzie miał chronić

**Objaw (M209):** sweep audytowy Żywego Testera zaraportował partię
`srodziemie vs ravnica s=7` jako `[STOP] brak akcji w kroku 59` — czyli
zacięcie narzędzia. W tej samej linii transkryptu stało jednak
„Koniec partii — wygrywa Bot”. Podsumowanie sweepu policzyło tę partię jako
niedokończoną (`koniec=0`), co fałszowało obraz audytu.

**Przyczyna:** `run-game.mjs` miał helper `isGameOver()` z komentarzem
opisującym dokładnie ten przypadek („panel akcji jest wtedy pusty
prawidłowo”). Pętla kroków wołała go w dwóch miejscach — ale **nie w gałęzi
`res === 'none'`**, czyli akurat tam, gdzie pusty panel jest objawem. Ochrona
była napisana i nieużyta w jedynym miejscu, dla którego powstała.

**Reguła:** gdy narzędzie diagnostyczne zgłasza awarię, sprawdź najpierw, czy
w kodzie nie leży już gotowy warunek odróżniający awarię od stanu
normalnego — i czy jest wołany na **każdej** ścieżce, która do tego stanu
prowadzi. Nowy warunek dopisany obok istniejącego to druga definicja tej
samej reguły (L41).

**Reguła druga (kontrola po naprawie):** po uciszeniu fałszywego alarmu
udowodnij, że alarm **nadal potrafi się odezwać**. Tu: w archiwalnych
transkryptach zostały 4 przypadki `[STOP]` z niepustą listą akcji, czyli
realne zacięcia; zmiana usunęła wyłącznie ten jeden fałszywy. Naprawa, która
przy okazji wyłącza detektor, jest gorsza od błędu, który naprawiała
(L13/L61).

---

## L66 (2026-08-25) — Lektura obowiązkowa to BUDŻET: dokument bez limitu rośnie, aż zje kontekst

**Objaw (M208):** obowiązkowa lektura startowa z `AGENTS.md` §0 ważyła ~605 kB
(~194-258 tys. tokenów). Z tego **384 kB to `PROJECT_STATE.md`** — plik
nazwany „bieżący stan projektu", który urósł do **125 sekcji sesji i 5904
linii**, sięgając wstecz o ~80 sesji. Każda sesja czytała całą historię
projektu, zanim dowiedziała się, co ma robić.

**Przyczyna:** plik miał w nazwie „STATE", a w treści był dziennikiem. Każda
sesja dopisywała swoją sekcję (słusznie, ADR 0013), nikt nic nie usuwał
(też słusznie — historia bywa potrzebna), a **nikt nie pilnował sumy**, bo
żadna reguła nie mówiła, ile lektura startowa MOŻE ważyć. Rozjazd nazwy
z zawartością sprawił, że przez ~80 sesji nikt nie zakwestionował jego
obecności na liście lektur.

**Reguła:**
1. **Lista lektur obowiązkowych ma budżet i strażnika.** Bez liczbowego progu
   nie ma sygnału, kiedy zrobiło się źle — plik rośnie liniowo i cicho.
   Tu: 100 tys. tokenów na `AGENTS` + ADR-y + `LESSONS` + `ENVIRONMENT`
   (`test/dokumentacja-budzet-lektury.test.js`).
2. **Rozdziel „zasady" od „dziennika".** Agent kontynuujący pracę potrzebuje
   REGUŁ (co wolno, czego nie, jakie są pułapki) i PUNKTU ZACZEPIENIA
   (ostatni PR, najnowszy handoff). Historia „kto co kiedy zrobił" jest
   materiałem do **grepowania punktowego**, nie do czytania od góry.
   Dziennik ma się nazywać dziennikiem (`PROJECT_HISTORY.md`) i mieć
   w nagłówku jawne „to NIE jest lektura startowa".
3. **Sygnał ostrzegawczy:** dokument z listy lektur, którego nazwa mówi
   „bieżący/aktualny", a treść przyrasta monotonicznie. Sprawdź `grep -c '^## '`
   i datę najstarszej sekcji — jeśli sięga dziesiątek sesji wstecz, to jest
   archiwum, nie stan.
4. **Zanim zaczniesz skracać, ZMIERZ rozkład.** Pierwotny plan tej sesji
   („skondensujmy `LESSONS.md`") dotyczył pliku, który odpowiadał za **16%**
   problemu — przy pełnym ryzyku zgubienia niuansu w 65 lekcjach. Pomiar
   przekierował pracę na pozycję, która ważyła 2/3 całości i którą dało się
   usunąć z listy **bez kasowania jednej linijki treści**. Optymalizacja bez
   pomiaru trafia w to, co akurat rzuciło się w oczy.
5. **Numery lekcji to API dokumentacji.** `L1`-`L65` są cytowane w kodzie
   **~1150 razy w 242 plikach** (`// klasa L48`, `L21/L41`). Renumeracja
   unieważniłaby je wszystkie **bez jednego czerwonego testu** — kondensując
   rejestr zachowaj nagłówki `## L<nr>` jako stabilne kotwice.

**Sformalizowane w:** M208 (`PROJECT_HISTORY.md`, `AGENTS.md` §0 z budżetem
i blokiem „Czego NIE czytasz na start", `test/dokumentacja-budzet-lektury.test.js`).

---

## L65 (2026-08-25) — Test, który przechodzi na przypadku odsianym przez WCZEŚNIEJSZY warunek, nie testuje tego warunku

**Objaw (M207, weryfikacja mutacyjna):** funkcja `targetSlotsOf` rozbija cele
czaru na pozycje i ma dwie bramki ochronne — (1) warianty muszą mieć równą
długość, (2) pozycje nie mogą dzielić kandydatów (pula jednorodna). Test B2
sprawdzał, że Fireball („up to three”) i „any number of targets” zostają
płaską listą. Przechodził. Mutacja polegająca na **usunięciu bramki (2)**
przeżyła — komplet 23 testów nadal zielony.

**Przyczyna:** oba przypadki z B2 mają warianty o RÓŻNYCH długościach
(`sizes = [1, 2]`), więc odpadały już na bramce (1) i do bramki (2) nigdy nie
docierały. Test formalnie dotykał funkcji i asertował poprawny wynik, ale
o badanym warunku nie mówił nic — jego zieloność była zasługą zupełnie innej
linijki kodu.

**Reguła na przyszłość:** pisząc test na konkretny warunek, sprawdź, czy
przypadek testowy **dociera** do tego warunku — najprościej mutacją
(skasuj warunek; jeśli testy nadal zielone, przypadek jest odsiewany
wcześniej). Dla funkcji z łańcuchem bramek dobierz dane, które przechodzą
wszystkie bramki poprzedzające i różnicują wyłącznie badaną: tu był to czar
o STAŁEJ arności 2 z jednej puli (permutacje `a/b/c`), gdzie sama arność
niczego nie wyklucza. Zasada obowiązuje wszędzie, gdzie funkcja ma kilka
warunków `return` pod rząd — „mutacja przeżyła” zawsze znaczy „mam lukę
w danych testowych”, nie „mutacja jest równoważna”.

---

## L63 (2026-08-25) — Selektor sterownika, który nie pasuje do niczego, nie daje błędu — daje CICHĄ PĘTLĘ i fałszywe „brak zgłoszeń”

**Objaw (M206, audyt rozgrywek):** przebiegi Żywego Testera na części seedów
nie kończyły się w limicie kroków. W transkrypcie 300 identycznych linii
o tym samym oknie wyboru, zero wykonanych ruchów — i pogodne podsumowanie
`== DETEKTORY: brak zgłoszeń ==`. Raport wyglądał jak czysty przebieg.

**Przyczyna:** sterownik szukał zaznaczeń jako
`.choice-request-option input[type="checkbox"]`, a kreator wielocelowy
(M195/C) renderuje **przyciski** `.multi-target-toggle` ze stanem w tekście
(„[ ]” / „[x]”). W tym modalu nie ma ani jednego `<input type=checkbox>`.
`querySelectorAll` na nieistniejącym selektorze nie rzuca wyjątku — zwraca
pustą listę. Lista pusta → nic nie zaznaczono → „Zatwierdź” został `disabled`
→ „Anuluj” **odtworzył to samo żądanie wyboru** → pętla.

**Dlaczego to gorsze niż crash:** narzędzie nadal raportowało sukces. Skutkiem
ubocznym była luka w pokryciu, o której nikt nie wiedział: ŻADEN czar
wielocelowy (Fireball, Wrap in Flames, Grave Exchange) ani mulligan
z odłożeniem kart nie został nigdy przeklikany — czyli dokładnie ta klasa
modali, którą właściciel kazał sprawdzić. Dwa błędy UI (nieodróżnialne wiersze
celów, „zaznacz 5 karty”) czekały tam od wprowadzenia kreatora.

**Reguła:** gałąź sterownika obsługująca modal musi (1) logować, ILE elementów
sterujących znalazła — „opcji 0” w transkrypcie to alarm, nie szum; (2) mieć
licznik nieudanych prób zamknięcia TEGO SAMEGO okna i przerywać głośno po
progu, bo „Anuluj”, które odtwarza żądanie, nie jest wyjściem z pętli;
(3) traktować `0 znalezionych elementów` jako podejrzenie zerwanego kontraktu
DOM, nie jako legalny stan. Dodatkowo: kontrakt DOM, na którym opiera się
sterownik (klasa, forma stanu), wart jest testu po stronie aplikacji —
inaczej refaktor renderera zrywa narzędzie audytu bez jednego czerwonego testu.

**Sformalizowane w:** `tools/table-tester/run-game.mjs` (licznik
`MULTI_WIZARD_STUCK_LIMIT`, log liczby wierszy) oraz
`test/m195-multi-target.test.js` (M206: kontrakt `.multi-target-toggle`,
brak `<input>`, stan w tekście).

---


## L64 (2026-08-25) — Bramka na FAZĘ nie jest bramką na MOMENT: „phase === 'combat'” przepuszcza krok przed deklaracją

**Objaw (M206):** bot aktywował pump „+2/+2 do końca tury” w kroku *Początek
walki* i nie atakował — dwie many na efekt, który wygasał w cleanup. Powtarzał
to w kolejnych turach tej samej partii. Warunek brzmiał
`const inCombat = view.turn.phase === 'combat'`, a komentarz nad nim mówił
wprost „pump ma sens po deklaracji atakujących/blokujących”.

**Przyczyna:** `beginning_of_combat`, `declare_attackers`, `declare_blockers`,
`combat_damage` i `end_of_combat` należą do TEJ SAMEJ fazy `combat`
(`TURN_STEPS`). Sprawdzenie fazy przepuszczało więc kroki, w których nikt
jeszcze (albo już) nie walczy. Ta sama pomyłka co M202/F, gdzie `step === 'main'`
obejmował precombat i postcombat — tylko z drugiej strony: tam jedna nazwa
kroku w dwóch fazach, tu jedna faza na pięć kroków.

**Poprawka nie polegała na wykluczeniu kroku po nazwie.** Pierwsze podejście
(`&& step !== 'beginning_of_combat'`) tylko przesunęło marnotrawstwo w dwa inne
okna (koniec walki bez udziału w walce, upkeep przeciwnika). Regułą jest stan,
nie etykieta kroku: efekt „do końca tury” kupuje coś tylko wtedy, gdy stwór
REALNIE bierze udział w walce (`attacking || blocking`).

**Reguła:** wyceniając efekt ulotny, pytaj o STAN, który ma na niego wpływ
(czy stwór walczy, czy cel jest zadeklarowany), a nie o nazwę fazy czy kroku.
Gdy już piszesz warunek na czas, sprawdź w `TURN_STEPS`, ile kroków obejmuje
dana faza i ile faz nosi daną nazwę kroku. Objaw dobrze widać dopiero
w transkrypcie rozgrywki — testy jednostkowe pytają zwykle o jedno okno.

**Uwaga poboczna (ta sama sesja):** `attacking` NIE jest polem, które można
ustawić na obiekcie w teście — `playerView` wyprowadza je z
`state.combat.attackers`. Test, który ustawia je wprost, przechodzi z
niewłaściwego powodu.

**Sformalizowane w:** `test/m206-audyt-rozgrywek.test.js` (A1/A1b/A1c — trzy
jałowe okna; A2 — kontrola, że pump w realnej wymianie bojowej zostaje).

---


## L61 (2026-08-25) — Test regresyjny bez WERYFIKACJI MUTACYJNEJ bywa ślepy; „zielony" nie znaczy „pilnuje"

**Objaw (M205, audyt PR #77):** poprzednia sesja dołożyła dwa testy opisane
w PR jako regresja przypinająca fix deduplikacji przedruków modala. Oba były
zielone. Po cofnięciu samego fiksu (`if (text !== prevBlock) deduped.push(...)`
→ `deduped.push(...)`) plik testów nadal dawał **91/91 pass** — fix nie był
pilnowany przez nic.

**Przyczyna:** dane testowe nie miały kształtu, w którym fix w ogóle działa.
Przypadek sklejał bloki bez separatora i powtarzał w każdym linię
`• Tura 7 — Nieprzyjaciel`, a ta linia sama woła `flush()` w detektorze, więc
licznik zerował się przed progiem — niezależnie od deduplikacji. Test mierzył
`flush()`, nie fix. To L1 („test może być zielony z niewłaściwego powodu")
w wariancie najgroźniejszym: test istnieje, ma poprawną nazwę i sensowny
komentarz, więc następna sesja uzna temat za zabezpieczony.

**Reguła:** test regresyjny liczy się dopiero, gdy pokazano, że **czerwienieje
po cofnięciu naprawy**. Procedura (koszt: ~30 s):
1. nałóż mutację odwracającą fix (jedna linia),
2. uruchom plik testu — MUSI paść, i to ten właściwy test,
3. cofnij mutację, potwierdź zielone,
4. wynik obu pomiarów wpisz do komunikatu commita / raportu audytu.
Jeśli mutacja nie czerwieni testu, dane testowe nie mają kształtu produkcyjnego
— odtwórz kształt z REALNEGO artefaktu (tu: transkrypt ma między renderami
modala nagłówek kroku `--- krok N | T. X ---`), zamiast pisać go „z głowy".

**Sygnał:** w opisie PR pada „przypięte testem" bez podanego wyniku pomiaru
przed/po. To zdanie do sprawdzenia, nie do przyjęcia na wiarę.

## L62 (2026-08-25) — Kolejność renderu to część kontraktu: log rysowany od najnowszego łamie liczenie „nowych" po indeksie

**Objaw (M205):** kolektor wpisów logu w Żywym Testerze — napisany dokładnie
wg recepty z handoffu („odpytuj nowe linie `#log` po indeksie") — znajdował
**0 wpisów**, mimo że sesja wpis generowała, a `session.log` go zawierał.

**Przyczyna:** `render.js` rysuje log od NAJNOWSZEGO
(`[...session.log].reverse()`), więc nowe wpisy dokładają się na POCZĄTKU
listy DOM. Pętla `for (i = widzianeDotąd; i < entries.length; i++)` czytała
więc najstarsze wpisy jako „nowe" i nigdy nie dochodziła do świeżych.
Poprawnie: `entries.slice(0, nowe).reverse()`.

**Reguła:** zanim oprzesz narzędzie na „nowe elementy = ogon listy", sprawdź
w kodzie renderu, w którą stronę jest rysowana lista (`reverse()`,
`prepend`, `insertBefore`, `flex-direction: column-reverse`). Kolejność
renderu jest częścią kontraktu UI tak samo jak nazwy klas — i tak samo cicho
psuje narzędzia czytające DOM.

**Wariant tej samej klasy z tej samej sesji:** `--out katalog/plik.txt` do
nieistniejącego katalogu wywracał zapis na ENOENT **dopiero po zakończeniu**
~40-sekundowego przebiegu — cały transkrypt (i dowód audytu) przepadał.
Narzędzie audytowe ma walidować miejsce zapisu ZANIM zacznie mierzyć, a nie
po; inaczej koszt pomyłki to powtórzenie całego pomiaru (L33).

## L60 (2026-08-24) — Narzędzie audytu, które milcząco przyjmuje złą konfigurację, produkuje audyty o czymś innym

**Objaw (M203, audyt PR #74):** Żywy Tester stołu miał domyślne talie
`--human green --bot red`. Takich talii nie ma od M178 (ADR 0023 — talie per
plan, „stare nazwy talii … przestały istnieć"). Sterownik wybierał talię pętlą
`for (const opt of select.options) if (opt.value === human) select.value = …`
— **bez `else`**, więc nieistniejąca nazwa nie była błędem: partia startowała
na tym, co artefakt miał wybrane domyślnie, a pierwsza linia transkryptu i tak
głosiła `== NOWA PARTIA: gracz=green vs bot=red ==`. Audyt „green vs red"
mierzył więc inną partię, niż zapowiadał — i żaden test ani detektor tego nie
widział, bo narzędzie działało „poprawnie".

**Dlaczego to groźne:** to L33 („narzędzie audytu, które porządkuje dane,
kłamie o stanie gry") i L24 („cichy skutek to błąd informacyjny") w jednym.
Narzędzie audytowe jest **źródłem dowodów** dla kolejnych decyzji; jeśli jego
konfiguracja milcząco rozmija się z rzeczywistością, wnioski z audytu są
nie do obrony, a wyglądają na zmierzone. W tym repo rozjazd przeżył ~25 sesji,
bo nikt nie kwestionował nazw talii w dokumentacji narzędzia.

**Reguła:**

1. **Każdy parametr narzędzia audytu, który wskazuje dane w repozytorium,
   musi być walidowany jawnie** — nieistniejąca nazwa to błąd z listą
   dostępnych, nigdy cichy fallback. Pętla wyboru „jeśli pasuje, ustaw"
   wymaga `else`, które rzuca.
2. **Domyślne wartości nie mogą być przepisywane z dokumentacji** — bierze się
   je z tego samego źródła, z którego czyta narzędzie (tu: `decks/*.txt` /
   `BENCH_DECKS`), a listę w dokumentacji zastępuje komendą
   (`--list-decks`). Lista przepisana ręcznie starzeje się przy każdym batchu.
3. **Rozjazd nazw między dokumentacją a katalogiem danych dostaje strażnika**
   (`test/m203-talie-testera-i-dokumentacji.test.js`) — L56: twierdzenie
   o danych sprawdzasz grepem, a jeśli ma żyć w repo, pilnuje go test.
4. **Sygnał ostrzegawczy:** narzędzie, które „działa" i zwraca sensowny
   wynik przy parametrze wskazującym nieistniejący plik. Sprawdź to raz
   celowo — koszt 10 sekund, a rozjazd bywa wielosesyjny.

**Dopisek z tej samej sesji (pułapka weryfikacji):** test, który uruchamia CLI
narzędzia, dziedziczy jego zależności. Pierwsza wersja strażnika M203 była
zielona lokalnie i **czerwona w CI**, bo `run-game.mjs` importował `jsdom`
statycznie na górze pliku, a CI (`node tools/run-tests.mjs all`) nie robi
`npm i` w `tools/table-tester`. Fix: leniwy `await import('jsdom')` w `boot()`
— walidacja argumentów, `--help` i `--list-decks` nie potrzebują DOM-u.
**Reguła:** jeśli test woła narzędzie przez `spawnSync`, sprawdź jego importy
i uruchom test raz **bez** katalogu `node_modules` narzędzia — „zielone
lokalnie" nie znaczy „zielone w CI" (AGENTS.md: samodzielnie zielony = cały
pakiet, w środowisku bramki).

**Sformalizowane w:** M203 (walidacja talii w `parseArgs`, drugi bezpiecznik
przy wyborze w DOM, `--list-decks`, leniwy import jsdom, strażnik dokumentacji).

## L59 (2026-08-24) — Ograniczenie zasobu i koszt dodatkowy żyją w WIELU ścieżkach: definiuj przez ZAKAZ i pilnuj strażnikiem każdej ścieżki

**Objaw (M202, audyt PR #73 — dwa znaleziska jednej klasy):**

1. **N1.** Druk tokenu Powerstone: „{T}: Add {C}. This mana can't be spent **to
   cast a nonartifact spell**”. Implementacja (`purpose.artifactSpell`) opisała
   regułę odwrotnie — „mana działa TYLKO przy czarze-artefakcie” — więc
   `producibleMana` odejmował manę ograniczoną dla każdej płatności, a zdolność
   `{1}: Add {U/R/W}` przy Powerstone jako jedynym źródle many nie miała oferty
   i nie dała się aktywować. Silnik odbierał graczowi legalną akcję (L44).
2. **N4.** „As an additional cost to cast this spell, exile a creature you
   control” jest zapisane NA OBIEKCIE, a `payFreeCastAdditionalCost` (M201/U2)
   czyta `obj.spell.additionalCost`. Gałąź impulsu w `playerView` nie wiedziała
   o koszcie wcale: Fear of Abduction wygnany impulsem dostawał ofertę
   `cast_permanent` bez `exileTargetId`, a `execute` ją odrzucał. Trzy gałęzie
   tej samej oferty (z ręki, z flash, z impulsu) liczyły koszt osobno — znała go
   jedna (L41).

**Przyczyna (wspólna):** reguła „czego NIE wolno” została zakodowana jako
„co wolno”, a katalog ścieżek, które o niej decydują, nie był znany w jednym
miejscu. Ograniczenie many ma w silniku ~25 miejsc liczących budżet
(`producibleMana`/`spendMana` w spells.js, resources.js, abilities.js,
game-state.js, effects.js); koszt dodatkowy — kilka gałęzi enumeracji ofert.
Ani jedno, ani drugie nie ma naturalnego choke pointa, więc każda nowa ścieżka
dziedziczy domyślne (błędne) zachowanie.

**Reguły:**

1. **Ograniczenie definiuj przez to, czego druk ZAKAZUJE**, nie przez to, co
   dozwolone: `restrictionApplies = purpose.castingSpell === true &&
   purpose.artifactSpell !== true`. Wtedy domyślna płatność (zdolność, plot,
   suspend, proliferate) jest z definicji legalna, a wyjątek jest JAWNY i
   widoczny w sygnaturze wywołania.
2. **Cel wydania jest częścią kontraktu każdej płatności.** Przy >10 ścieżkach
   przegląd „które wywołanie zapomniało” nie jest zabezpieczeniem — jest nim
   **strażnik źródła** (`test/m202-straznik-celu-wydania-many.test.js`): każda
   funkcja `cast*`/`*Casts` musi pytać o manę z celem. Zweryfikowany
   mutacyjnie (usunięcie `purpose` z `castPermanent` → RED).
3. **Oferta i walidacja czytają JEDEN odczyt** (L48/L41): koszt dodatkowy na
   obiekcie ma jedną funkcję (`exileAdditionalCostCandidates`) użytą przez
   wszystkie gałęzie `cast_permanent`. Test pinujący to nie „test karty”, tylko
   „test ścieżki”: wygnaj impulsem, sprawdź że oferta niesie cel albo nie
   istnieje wcale.
4. **Sygnał ostrzegawczy przy audycie diffa:** nowe pole `purpose`/`spendOnly`/
   `additionalCost` + brak wyliczenia ścieżek, które go czytają. Zapytaj wtedy
   wprost: „ile jest miejsc, które liczą ten budżet?” i policz je grepem
   (5 sekund), zamiast zakładać, że autor zmienił wszystkie.
5. **Testy pinujące zachowanie POPRZEDNIEJ sesji są sondą na tę sesję.** Piny
   N3 pisałem jako „utwierdzenie dobrego zachowania” — dwa z trzech okazały się
   RED, bo zachowanie wcale nie było dobre. Pin, który nigdy nie był RED, nie
   dowodzi niczego (L13); pin, który jest RED w dniu pisania, to znalezisko.

## L58 (2026-08-23) — Kod stołu jedzie do PRZEGLĄDARKI: globalna Node w rdzeniu to awaria produktu, której testy nie widzą

**Objaw (M201/N1, audyt PR #72):** w `scoreCommand` heuristic-bota została
z poprzedniej sesji instrumentacja:
`if (process.env.BOT_DEBUG_SCORES && cmd.objectId === 'slaad') console.error(…)`.
Pakiet testów był zielony (3023/3023), CI zielone, PR scalony — a w sklejonym
artefakcie (`dist/mtg-table.html`, ADR 0011) ta linia wywala `ReferenceError:
process is not defined` przy PIERWSZEJ wycenie ruchu bota. Czyli: stół
właściciela przestaje działać w pierwszej turze, a repozytorium tego nie widzi.

**Przyczyna:** testy i Żywy Tester chodzą w Node (i w jsdom NA Node), gdzie
`process` jest globalne. Środowisko docelowe — przeglądarka z `file://` —
nie ma ani `process`, ani `require`, ani `__dirname`. Różnica środowisk czyni
całą pętlę zieloną przy zepsutym produkcie (klasa L5: test sprawdza funkcję,
nie wiring). Dodatkowo instrumentacja niosła dwa mniejsze długi: warunek po ID
karty w rdzeniu (ADR 0002) i debug w kodzie produkcyjnym (`ENVIRONMENT.md` §3).

**Reguły:**
1. Każdy moduł osiągalny z `src/table/main.js` jest **kodem przeglądarkowym** —
   nie wolno mu dotknąć globali Node. Dotyczy to także `src/engine/**`
   i `src/controllers/**`, bo wchodzą do artefaktu.
2. Instrumentację diagnostyczną usuwa się **w tym samym commicie**, w którym
   powstała; jeśli ma zostać, musi być bezpieczna w przeglądarce (`globalThis`)
   i bezwarunkowo generyczna (bez nazw/ID kart).
3. Zakaz egzekwuje **strażnik skanujący graf modułów artefaktu**
   (`test/m201-audyt-pr72.test.js`, `collectModules`), a nie recenzja: to
   różnica środowisk, więc pojedynczy test funkcji nigdy jej nie złapie.
4. Sygnał ostrzegawczy przy audycie diffa: `process.`, `console.log/error`,
   nazwa konkretnej karty w kodzie rdzenia — trzy niezależne powody do RED.

## L57 (2026-08-23) — Zgłoszenie właściciela weryfikujesz wobec Oracle/CR PRZED wdrożeniem; rozbieżność zgłaszasz, nie wdrażasz

**Objaw (M200/A):** właściciel zgłosił: „bot wszedł do Forge i wzmacnia MÓJ stwór —
to bez sensu, powinien fizzle, gdy nie ma [własnej] kreatury”. Wdrożyłem to
ślepko (kandydaci pokoju = tylko własne stwory, 3 testy, commit, push).
Właściciel po przeanalizowaniu Oracle wycofał zgłoszenie: zdolność pokoju
MUSI się rozstrzygnąć, gdy istnieje legalny cel — stwór przeciwnika jest
legalnym celem. Fix został wycofany (revert + testy zamieniające).

**Przyczyna:** zgłoszenie z rozgrywki opisuje SYMPTOM z perspektywy gracza
(„bez sensu”), a nie regułę. Symptom był prawdziwy (bot buffował mojego stwora),
ale wniosek naprawczy sprzeczny z Oracle (celowanie w dowolnego stwora jest
legalne i obowiązkowe przy istnieniu celu). Zgoda właściciela na zgłoszenie
≠ weryfikacja regułowa — ADR 0022/0002 i „engine jest autorytetem reguł”
obligują do sprawdzenia w źródle, zanim zmieni się zachowanie.

**Reguły:**
1. Zanim wdrożysz zmianę sugerowaną przez zgłoszenie, przeczytaj Oracle text
   kart i/lub CR (pliki `docs/cards/scryfall-*.json` w repo) i napisz JAWNIE
   (w opisie commita / w czacie), jak reguła rozstrzyga zgłoszenie — także
   wtedy, gdy zgłoszenie się potwierdza.
2. Gdy sugerowana naprawa KONTRA DYCTUJE regułę (zaczyna zmieniać legalność
   celów/kosztów/efektów niezgodnie z Oracle): NIE wdrażaj — zgłoś właścicielowi
   rozbieżność z powołaniem na regułę i poczekaj na decyzję. Symptom można
   poprawić legalnymi środkami (np. etykieta, kolejność ofert), ale legalność
   się nie negocjuje.
3. Wycofanie fixa = nowy commit (nie force push) + testy pinujące ostateczny
   stan (także negatywny — „stwór przeciwnika JEST legalnym celem”) i wpis
   lekcji. Historia git zostawia ślad błędu procesu — to dobrze.

**Sformalizowane w:** AGENTS.md § Nienegocjowalne granice (weryfikacja zgłoszeń
wobec Oracle/CR przed wdrożeniem).

## L55 (2026-08-22) — Jedno pole na „cechę trwałą" i „efekt do końca tury" to bomba zegarowa; badge liczony z pola technicznego kłamie

**Objaw (trzy niezależne trafienia w jednej sesji):**
1. **M187/N1** — token Phyrexian Mite („This token can't block") zaczynał
   legalnie blokować po pierwszym cleanupie: pole `cantBlock` niosło
   jednocześnie EFEKT „can't block this turn" (Panic Spellbomb, ma wygasać —
   CR 514.2) i cechę WYDRUKOWANĄ tokenu (trwałą). Cleanup kasował obie.
   Bug żył od M69, a Batch 45 tylko dołożył mu drugą kartę.
2. **M188/A** — Evangel of Synthesis pokazywał na kaflu „menace", ale nie
   „+1/+0": badge liczono z `powerModifier`, a statyka warunkowa (CR 604.3)
   jest read-time i tego pola nie ustawia. Dotyczyło KAŻDEJ statyki
   warunkowej, aury, equipmentu i anthemu — nie jednej karty.
3. **M188/B** — log pisał `token_squirrel`, bo `nameOf` czyta mapę zbudowaną
   z rejestru KART, a token po śmierci (CR 111.7) nie ma już obiektu, więc
   warstwa opisu miała wyłącznie `cardId` spoza rejestru.

**Wspólna przyczyna:** to warianty L14 (dwie zasady w jednej instrukcji)
i L21 (pole spoza kontraktu ginie po cichu). Warstwa prezentacji pytała
o dane POCHODNE (pole techniczne: modyfikator, mapa rejestru), zamiast
o fakt, który chce pokazać („czy ten stwór ma zakaz blokowania", „o ile
efekty ciągłe podbijają P/T", „jak nazywa się ten obiekt").

**Reguły:**
1. Jeżeli jedno pole ma opisywać stan TRWAŁY i stan WYGASAJĄCY, rozdziel je
   (`cantBlockPrinted` vs `cantBlock`) i daj JEDEN centralny odczyt
   (`creatureCantBlock()`), którego używają wszystkie ścieżki: oferta,
   walidacja, widok, render, fingerprint (L41 — trzy kopie rozjeżdżają się
   cicho, a fingerprint pominięty psuje determinizm replayów).
2. Badge/etykieta liczona jako różnica po stronie renderu jest martwa, gdy
   widok wysyła wartości EFEKTYWNE (obie strony odejmowania już zawierają
   bonus — M175/A3). Różnicę liczy warstwa, która zna SKŁADNIKI (silnik),
   i wysyła ją jawnym polem.
3. Nie wliczaj do „nadanego" bonusu tego, co ma już własny badge (liczniki
   +1/+1, pumpy) — inaczej gracz zobaczy ten sam bonus dwa razy.
4. Nazwy/obiekty potrzebne PO zniknięciu obiektu (token, LKI) muszą dać się
   odtworzyć z danych trwałych — mapę buduj GENERYCZNIE ze skanu katalogu
   (ADR 0002) i pilnuj strażnikiem „każdy token ma nazwę", a nie ręczną listą.
5. Sygnał ostrzegawczy: jeżeli sonda pokazuje, że **silnik liczy dobrze,
   a gracz i tak nie widzi skutku** — błąd jest w kontrakcie widoku
   (ADR 0017), nie w regułach. Nie strój heurystyk wokół brakującej danej.

## L54 (2026-08-22) — Kara wyceny bota musi być MIERZONA względem bazy; każda klasa zachowań dostaje whitelistę ze strażnikiem

**Objaw (M179, inwentaryzacja właściciela):** „kara −20 za trik we własnej
main” (M146) nie działała od początku — bazowa wartość rzutu czaru (~50–65)
zjadała ją w całości i bot dalej rzucał triki w Głównej 1 zamiast w oknie
walki. Ten sam wzorzec co L50/L51, ale głębiej: kara ISTNIAŁA, tylko była
liczona w oderwaniu od sumy, do której wchodzi.

**Reguły:**
1. Każda kara/premia okna czasowego w wycenie musi być zwymiarowana względem
   BAZY gałęzi (dla czarów ~50–65) — inaczej jest dekoracją. Test zachowania
   („bot NIE rzuca X w oknie Y”) obowiązkowy, bo tylko on mierzy sumę.
2. Timing czaru to CZĘŚĆ okna: sorcery nie poczeka na combat — jego jedyne
   sensowne okno na trik to Główna 1 przed atakiem (M179/C), a kara za
   instant w main ma wymuszać czekanie na deklaracje (M179/A1).
3. Klasy zachowań bota trzymamy jako WHITELISTY z eksportem + strażnikiem
   katalogowym (wzorzec L51): IDEMPOTENT_EOT_EFFECTS/STACKING_ACTIVATED_EFFECTS
   (duble na stosie, M179/B), FRIENDLY_TARGET_EFFECTS + HOSTILE_* (klamry
   celowania, M179/E), KEYWORD_LABELS/KEYWORD_EVENT_LABELS (etykiety grantów,
   M179/A2). Nowy typ efektu bez przydziału = czerwony strażnik, nie cicha
   dziura.
4. Klamry celowania są SYMETRYCZNE i centralne: wrogi efekt we własny cel
   (selfHarmPenalty) ORAZ przyjazny efekt we wroga (friendlyMisaimPenalty)
   — w call-site'ach gałęzi czarów i zdolności, nie w każdej gałązce osobno.

## L53 (2026-08-22) — Test scenariuszowy na zamrożonym seedzie pełnej partii to dług odsetkowy

Cztery testy etykiet w table-session miały po 10+ wpisów historii
„przelosowane hunterem po batchu X” — KAŻDA zmiana talii oznaczała rundę
polowań na seedy. Rewolucja talii (M178, ADR 0023) pokazała koszt zbiorczo:
95 czerwonych testów naraz. Reguła: jeśli test sprawdza ETYKIETY/przepływ
decyzji, buduj DETERMINISTYCZNY scenariusz silnikowy (putCard + execute +
describeGameEvent) zamiast łowić seed pełnej partii; zamrożony seed jest
uzasadniony tylko tam, gdzie testowana jest właśnie cała partia (fingerprint,
determinizm, panel end-to-end). Przy okazji: fixtury talii w testach wybieraj
z talii JEDNOPLANOWYCH (worki są przejściowe — ADR 0023 §5).

## L51 (2026-08-20) — Efekt celowany bez klasyfikacji to remis wariantów; strażnik zamiast łatek

**Objaw:** klasa L50 po raz szósty (M96, M135, M138/Z1, M146, M156/F1, M156/Q1+Q2):
bot obdarowywał lifelink+indestructible najlepszego stwora PRZECIWNIKA
(Lotusguard), rzucał prewencję „any target" we wroga (Withstand), przekazywał
liczniki +1/+1 najsłabszemu własnemu stworowi (Servant of the Scale). Każdy
raz: efekt w kontekście CELOWANYM bez wyceny/klasyfikacji → wszystkie warianty
remisują → pierwsza oferta z listy.

**Przyczyna:** klasyfikacja żyje w ROZPROSZONYCH miejscach (trzy tabele
heuristic-bota + `triggerTargetEffectFriendly` w game-state + gałęzie
per-effekt). Nowa karta z nowym typem efektu nie wymusza żadnej z nich —
każde wystąpienie łataliśmy pojedynczym wpisem (dokładnie wzorzec L28).

**Reguła:**
1. Typ efektu w **triggerze z celem** musi być świadomie sklasyfikowany:
   wrogi (`HOSTILE_TRIGGER_TARGET_EFFECTS` / `triggerEffectIsHostile`),
   przyjazny (gałąź `triggerTargetEffectFriendly`) albo przejrzany neutralny
   (wpis w `REVIEWED_NEUTRAL` w strażniku). Pilnuje tego
   `test/bot-trigger-target-classification-guard.test.js` — nowy typ = czerwony
   test PRZED merge, nie „głupi bot" po merge.
2. Przy dodawaniu czaru/zdolności z celem uruchom sondę inwentaryzacji:
   policz typy efektów w kontekstach celowanych z `card-data.js` i sprawdź
   obecność w wycenach (grep w heuristic-bocie). Połowa tropów będzie fałszywa
   (L15) — każdy zweryfikowany zapisz z uzasadnieniem.
   **Od M157 to STAŁY strażnik** (obydwie ścieżki): triggery —
   `test/bot-trigger-target-classification-guard.test.js` (M156); czary/
   zdolności — `test/bot-targeted-effect-valuation-guard.test.js`.
3. Klasyfikacja per ZDOLNOŚĆ, nie per efekt: zdolność [tap_permanent +
   add_counter stun] (Lodestone Needle) jest wroga przez dowolny efekt wrogi.

**Sygnał ostrzegawczy:** trzecia łatka w tej samej tabeli = czas na
inwentaryzację WSZYSTKICH typów i odwrócenie domyślności (strażnik), nie na
czwarty wpis.

## L50 (2026-08-18) — Nowy typ efektu w karcie batcha wymaga WYCENY w heuristic-bocie

**Objaw:** dwie nowe karty Batch 35 weszły z martwą wyceną efektów — bot
aktywował Basilisk Gate ({2},{T}: +X/+X) na stwora PRZECIWNIKA i rzucał
Twiddle-Odkręcenie na górę wroga w swoim upkeepie (audyt Żywym Testerem M146).
Oba odkryte dopiero na żywym stole — testy engine były zielone.

**Przyczyna:** nowe typy efektów (`pump_by_gates`, `untap_permanent` w
ścieżce czarów) nie trafiły do wyceny heuristic-bota. Efekt spoza wyceny
dostaje domyślną wartość, więc WSZYSTKIE warianty remisują i bot bierze
pierwszą ofertę z listy — zwykle pierwszy cel, niezależnie od sensowności.
To ten sam wzorzec co M96 (cele-gracze), M135 (scry), M138/Z1
(grant_keywords) — czwarte powtórzenie tej samej klasy.

**Reguła:** przy dodawaniu karty z NOWYM typem efektu sprawdź w
`src/controllers/heuristic-bot.js`, czy efekt ma wycenę w OBU ścieżkach:
`cast_spell` (czary) i `activate_ability` (zdolności) — inaczej partia gra
się dobrze, a bot „głupieje" na tej jednej karcie. Szybka sonda:
`grep -n "'<typ>'\` w wycenie` przed merge. Audyt Żywym Testerem po batchu
z nowymi mechanikami obowiązkowo obejmuje partie, gdzie BOT ma te karty.

## L1 (2026-08-14) — „Bot robi coś głupiego" bywa ślepotą, nie głupotą

**Objaw (trzykrotny):** bot pompował liczniki Station bez końca (M84), celował
zdolnością w nielegalne obiekty (M82), rzucił Inspire Awe i zaatakował we
własną prewencję (M91). Za każdym razem zgłoszone jako „bot-idiota".

**Przyczyna:** we wszystkich przypadkach `PlayerView` nie niosło danych
potrzebnych do decyzji. Kontroler dostaje widok, nie stan (ADR 0003), więc
pole spoza widoku jest dla niego **fizycznie nieosiągalne**.

**Reguła:** zanim uznasz zachowanie kontrolera za błąd heurystyki, sprawdź, czy
widok w ogóle niesie potrzebne dane. Strojenie wag wokół brakującej informacji
to maskowanie objawu.

**Sformalizowane w:** [ADR 0017](decisions/0017-playerview-completeness-contract.md).

**Metoda audytu (do powtórzenia):** zestaw trzy zbiory — pola
`createGameState`, zawartość `playerView`, odczyty `view.X` w kontrolerach.
Pole obecne w stanie, nieobecne w widoku i mające wpływ na wybór komendy = luka.
Audyt M92 znalazł tak pięć luk, w tym brak `types` permanentu.

---

## L2 (2026-08-14) — Benchmark bota nie wykrywa błędów rzadkich mechanik

**Objaw:** po naprawie pięciu realnych luk decyzyjnych (M92) pełna macierz
benchmarku (5616 meczów) dała wynik **identyczny co do 0,1 pp**.

**Przyczyna:** karty wnoszące daną mechanikę (tu: prewencja obrażeń) występują
w jednej–dwóch taliach na kilkanaście. Poprawa ginie w uśrednieniu.

**Reguła:**

- Benchmark jest siecią bezpieczeństwa przed **regresją siły gry**, nie
  detektorem błędów decyzyjnych.
- Poprawki dotyczące konkretnej mechaniki mierz **pomiarem ukierunkowanym**:
  `node tools/benchmark.mjs --seeds 20 --decks <talie zawierające tę mechanikę>`.
  W M92 pełna macierz pokazała 65,2% vs aggro, a pomiar ukierunkowany 69,8%.
- Błędy decyzyjne wykrywa audyt kontraktu widoku, Żywy Tester i raport gracza.

---

## L3 (2026-08-14) — Kara w heurystyce musi przebić premię, inaczej jest martwa

**Objaw:** dodana kara −70 za jałowe zagranie (destroy w cel z tarczą
regeneracji) nie zmieniła zachowania bota — test nadal czerwony.

**Przyczyna:** scoring sumuje składniki. Kara była naliczana, ale zaraz po niej
ta sama gałąź dodawała premię za „usunięcie permanentu przeciwnika", która ją
przebijała.

**Reguła:** przy zagraniu **jałowym** (efekt z definicji nie zadziała) nie
wystarczy dodać karę — trzeba **pominąć premię** (`continue`). Po każdej
zmianie wag sprawdź testem, że decyzja faktycznie się zmieniła; sam fakt
naliczenia kary niczego nie dowodzi.

---

## L4 (2026-08-14) — Odrzucona komenda nie może zmieniać stanu sesji

**Objaw:** gracz zostawał na ekranie z jedyną opcją „Poddaj partię", w logu
`Ruch odrzucony: not_priority` (M90/B).

**Przyczyna:** `session.apply()` czyścił bufor modala i kasował pauzę bota
**przed** `execute()`, „defensywnie" zakładając powodzenie. Gdy engine odrzucił
komendę, sesja traciła pauzę i drogę wznowienia.

**Reguła:** mutuj stan warstwy UI/sesji **dopiero po** potwierdzeniu, że
komenda została przyjęta. Operacje „na wszelki wypadek przed" zostawiają
system w stanie niespójnym przy każdej ścieżce błędu.

---

## L5 (2026-08-14) — Test na obecność kodu to nie test zachowania

**Objaw:** funkcja ptaszka wyciszenia miała pięć zielonych testów, a mimo to nie
działała dla czarów z wariantami (M91/B).

**Przyczyna:** testy sprawdzały regexami, czy w źródle występują odpowiednie
identyfikatory (`ignoredOptionKeys`, `action-ignore`). Kod istniał, ale nie był
wywoływany dla tej ścieżki UI.

**Reguła:** testy UI mają renderować i sprawdzać **wynik** (drzewo elementów,
reakcja na zdarzenie), nie obecność napisów w pliku. Testy na źródło dopuszczalne
są wyłącznie jako uzupełnienie (np. strażnik konfiguracji), nigdy jako jedyne
zabezpieczenie. Kontrola jakości testu: **wyłącz fix i sprawdź, czy test
czerwienieje** (weryfikacja mutacyjna).

---

## L6 (2026-08-14) — Zdarzenie musi nieść dane, których opis nie odtworzy

**Objaw:** log i modal „Ruch przeciwnika" nie mówiły, który tryb czaru modalnego
wybrał bot — Ruinous Rampage wyglądał identycznie niezależnie od wyboru (M91/D).

**Przyczyna:** `describeGameEvent` jest czystą funkcją bez dostępu do rejestru
kart (świadomie — jest testowalna headless). Zdarzenie niosło `modeIndex`, ale
nie nazwę trybu, więc warstwa opisu nie miała jak jej ustalić.

**Reguła:** projektując zdarzenie, sprawdź, czy warstwa opisu ma **wszystko**,
czego potrzebuje do zbudowania czytelnego komunikatu. Jeżeli wymagałaby dostępu
do rejestru albo stanu — dołóż dane do zdarzenia.

---

## L7 (2026-08-14) — Weryfikuj stan repozytorium, nie treść zlecenia

**Objaw:** handoff stwierdzał, że pięć fixów przepadło wraz z working tree
poprzedniej sesji. Audyt `main` wykazał, że cztery z nich są w repozytorium
wraz z testami (M90).

**Przyczyna:** opis zadania powstał na podstawie pamięci o przebiegu sesji,
a nie pomiaru stanu repozytorium.

**Reguła:** repozytorium, testy i dokumentacja są źródłem prawdy (AGENTS.md).
Sesję zaczynaj od pomiaru (`npm test`, `npm run build`, `git log`, przegląd
plików), nie od przyjęcia treści zlecenia na wiarę. Rozbieżność zgłoś jawnie —
oszczędza to pracy nad problemem, którego już nie ma.

---

## L8 (2026-08-14) — `git checkout <plik>` cofa także własne, niezacommitowane zmiany

**Objaw:** przy usuwaniu tymczasowego `console.error` z pliku poleceniem
`git checkout` zniknął również fix wprowadzony w tym samym pliku (M90).

**Reguła:** przed instrumentowaniem kodu (debug print) **zacommituj fix** albo
przywracaj zmiany punktowo (edycja odwrotna). Po każdym `git checkout` sprawdź
`git diff`/testem, że zamierzona zmiana nadal istnieje.

Więcej pułapek środowiska: [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md).

---

## L9 (2026-08-14) — Praca istnieje dopiero po `git push`

**Objaw (dwukrotny w tej sesji):** (a) handoff twierdził, że pięć fixów
przepadło razem z workspace poprzedniej sesji — bo nie zostały wypchnięte;
(b) sandbox odtworzył workspace ze świeżego klona w środku pracy i commit
wylądował na `main` zamiast na gałęzi sesji.

**Przyczyna:** nowa sesja Areny widzi **wyłącznie** `main` na GitHubie i tekst
pierwszego promptu (ADR 0013). Środowisko może też zresetować workspace
w trakcie sesji — reflog pokazuje wtedy świeży wpis `clone: from …`.

**Reguła:**

- Commituj i pushuj **po każdym samodzielnie zielonym kroku**, nie zbieraj
  pięciu commitów „na koniec".
- Po każdym commicie sprawdź `git log --oneline -1` — czy HEAD jest tam,
  gdzie ma być.
- Po resecie workspace: `git fetch origin <gałąź>` + `git reset --hard
  FETCH_HEAD`; commit omyłkowo zrobiony na `main` przenieś `cherry-pickiem`
  (najpierw `git branch backup-… <sha>`).
- Wszystko, co ma przetrwać sesję, musi być **w repozytorium** — ustalenie
  z czatu, którego nie ma w plikach, nie istnieje.

Procedury krok po kroku: [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md) §1–2.

---

## L10 (2026-08-14) — Zanim zaczniesz szukać winy w konfiguracji, sprawdź dane

**Objaw:** właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani
informacji o CI. Naturalny odruch: szukać błędu w workflow albo w ochronie
gałęzi.

**Diagnoza (kolejność, która dała odpowiedź w 4 zapytaniach):**

1. `gh pr view --json state,mergeable,mergeStateStatus,statusCheckRollup`
   → `MERGEABLE`, `CLEAN`, check `test` = `SUCCESS`;
2. porównanie `git ls-remote origin <gałąź>` z `head_sha` runu CI
   → ten sam commit, więc check dotyczy aktualnego HEAD;
3. `gh api repos/…/rules/branches/main` → reguły (tu: tylko squash,
   `required_review_thread_resolution`), `reviewThreads.totalCount = 0`;
4. `githubstatus.com/api/v2/summary.json` → brak incydentów.

**Wniosek:** stan po stronie GitHuba był poprawny — objaw dotyczył warstwy
prezentacji u zgłaszającego (cache przeglądarki / nieodświeżona zakładka).

**Reguła:** przy zgłoszeniu „coś nie działa w UI GitHuba" najpierw zbierz
**twarde dane z API** (stan PR, SHA checku vs HEAD, reguły gałęzi, status
platformy), zanim zaczniesz zmieniać konfigurację. Zmiana ustawień pod wpływem
objawu widocznego tylko w jednej przeglądarce potrafi zepsuć działający setup.


---

## L11 (2026-08-14) — Jak skutecznie polować na błędy vs Comprehensive Rules

**Kontekst:** wyzwanie „znajdź 10 błędów" (M95) na dojrzałym engine z 1600
testami. Punktowe sondy „sprawdźmy regułę X" dawały głównie potwierdzenia
poprawności; realne błędy wyszły z technik systemowych.

**Skuteczność technik (od najlepszej):**

1. **Szukanie NIESPÓJNOŚCI między podobnymi implementacjami.** Jeśli dwa
   analogiczne efekty robią to samo inaczej, jeden z nich jest błędem.
   Przykład: `bounce_permanent` zwracał kartę właścicielowi, `destroy_permanent`
   nie → CR 400.3 złamane w drugim (M95 bug 2).
2. **Skan strukturalny zamiast scenariuszowego.** Zamiast pytać „czy X działa",
   zestaw KOMPLET pól obiektu przed i po operacji i sprawdź, co przeciekło.
   Jeden taki skan dał trzy błędy (tapped, damagedThisTurn, attackedThisTurn).
3. **Ręczne obejścia jako sygnał.** `grep -c "tapped: false"` pokazał 12 miejsc
   ustawiających to samo pole po przeniesieniu obiektu — to wskazywało brak
   naprawy u źródła, nie 12 niezależnych decyzji.
4. **Skan katalogu kart** (Oracle vs zakodowane pola) — dobry do wykrywania
   braków, ale w dojrzałym katalogu daje głównie fałszywe alarmy (reminder
   text keywordów, pola o innych nazwach niż zgadywane).
5. **Punktowe sondy CR** — najsłabsze na dojrzałym kodzie, ale niezastąpione
   do POTWIERDZENIA poprawności obszaru i jako dokumentacja audytu.

**Reguła:** każdy kandydat wymaga repro headless PRZED naprawą i odróżnienia
błędu reguł od artefaktu testu (np. `addObject` domyślnie daje
`summoningSickness: false`, a `pendingScry` wymaga `objectIds` — oba dały
fałszywe alarmy). Warto też jawnie spisać obszary sprawdzone i POPRAWNE:
oszczędza to pracy następnym sesjom.


---

## L12 (2026-08-14) — Narzędzie audytowe też jest produktem: braki naprawiaj w nim

**Objaw:** podczas audytu Żywym Testerem (M96) partia spellslinger stanęła na
`[STOP] brak akcji` w oknie z przyciskiem „Epic Experiment: zakończ (reszta
kart do grobu)". Gracz-człowiek po prostu by go kliknął — to była luka
w polityce gracza (`pickAction`), nie błąd UI.

**Ryzyko:** najprostszą reakcją jest „ta talia się nie testuje" albo zmiana
seeda. Każde takie obejście **cicho zawęża zakres kolejnych audytów** — a im
dłużej trwa, tym trudniej zauważyć, że całe mechaniki nigdy nie były sprawdzone
na żywym stole.

**Reguła (decyzja właściciela):** jeśli tester czegoś nie widzi albo nie
obsługuje — **poprawiamy tester**, nie akceptujemy braku. Zmiany w narzędziu
idą tym samym rygorem co produkcja (test + opis w commicie).

**Druga strona tej samej monety:** odróżniaj *artefakt narzędzia* od *błędu
produktu*. jsdom nie liczy CSS ani nie renderuje nakładek, więc sklejony
wskaźnik tury i brak P/T na kaflach w transkrypcie **nie są** błędami UI.
Zanim opiszesz coś jako bug, potwierdź źródło w kodzie — inaczej zgłoszenie
zabiera czas, a naprawa psuje działający kod.

Osie audytu i checklisty: `docs/setup/TESTER_STOLU.md` → „Czego szukać".

## L13 (2026-08-15) — Detektor, którego nie zweryfikowałeś mutacyjnie, nie działa

Dziewięć detektorów Żywego Testera miało komplet testów jednostkowych i było
„gotowe". Weryfikacja mutacyjna — świadome **przywrócenie naprawionego buga**
i sprawdzenie, czy narzędzie samo go znajdzie — pokazała co innego:

1. `detectNoResponseWindow` **zgłaszał fałszywy alarm** pod `--quiet` (czar
   „Index", przy którym gracz priorytet dostał): jedynym dowodem „okno było"
   była linia snapshotu, której w tym trybie nie ma.
2. `detectDeadEndWindow` pod `--quiet` widział **jedno okno na całą partię**
   zamiast wszystkich — mógł przegapić dokładnie ten przypadek, dla którego
   powstał.
3. Przypadku właściciela „ekran z samym *Poddaj partię*" **żaden z czterech
   profili nie potrafił odtworzyć** — wszystkie najpierw zamykały modal ruchu
   bota, więc nigdy nie wysyłały komendy w trakcie pauzy. Trzeba było dopisać
   profil `impatient` (double-tap z telefonu).

Test jednostkowy dowodzi, że detektor reaguje na **spreparowane** wejście.
Nie dowodzi, że takie wejście w ogóle powstanie w prawdziwym przebiegu.

**Reguła:** każdy detektor przechodzi cykl „przywróć bug → narzędzie zgłasza →
przywróć fix → 0 zgłoszeń", w OBU trybach logowania. Jeśli buga nie da się
odtworzyć żadnym profilem, brakuje **profilu**, a nie dowodu, że błędu nie ma.

Przy okazji tej weryfikacji znalazły się trzy realne błędy produkcyjne, których
nie szukano: log „wskazuje **?** z ręki przeciwnika", brak rozstrzygnięcia czaru
bota w modalu i brak jego skutku (`+3/+3`). Weryfikacja narzędzia opłaca się
podwójnie.

## L14 (2026-08-15) — Jedna instrukcja, dwie zasady: sklejone reguły to gotowy bug

M101/B5 (CR 302.6) i B6 (CR 702.19b) to ten sam błąd popełniony dwa razy
w różnych miejscach silnika: **dwie niezależne zasady MtG zostały wyrażone
jedną instrukcją kodu**, więc gdy jedna z nich przestawała obowiązywać,
druga milcząco znikała razem z nią.

- **B5:** `untapControlled` kasowało chorobę przywołania w tej samej linii,
  w której odkręcało permanent (`{ tapped: false, summoningSickness: false }`).
  Dopóki każdy permanent się odkręcał, wynik był poprawny. Ale każda blokada
  odkręcania (licznik stun, untap-lock, „doesn't untap next untap step")
  robiła `continue` PRZED tą linią — i zabierała ze sobą zdjęcie choroby.
  Stwór pod blokadą zostawał chory na zawsze, bo CR 302.6 mówi o **ciągłości
  kontroli**, a kod pytał o **fakt odkręcenia**.
- **B6:** `validateDamageAssignment` pilnowało sumy i kolejności lethal
  (CR 510.1d), co przy braku trample w zupełności wystarcza. Reguła trample
  (CR 702.19b) to jednak osobny warunek — „nadmiar na gracza dopiero po lethal
  dla WSZYSTKICH blokerów" — a ponieważ nadmiar trample nie jest jawną pozycją
  przydziału (silnik liczy go jako `remaining`), nie sprawdzał go nikt.

Wspólny wzorzec: reguła B obowiązywała „przy okazji" reguły A. Kod nie był
zły — był **niedospecyfikowany**, i to w miejscu, gdzie testy przechodziły,
bo szczęśliwa ścieżka pokrywała obie zasady naraz.

**Reguła:** gdy jedna instrukcja realizuje dwa punkty CR, rozdziel je — nawet
jeśli dziś dają ten sam wynik. Przy polowaniu na błędy pytaj nie „co ten kod
robi?", tylko **„od czego ten kod UZALEŻNIA regułę i czy CR na pewno tak samo
ją uzależnia?"**. B5 znalazł się od pytania „czy choroba przywołania na pewno
zależy od odkręcenia?" — CR odpowiada, że zależy wyłącznie od kontroli.

Przy okazji: nie każdy trop musi być błędem. Zgłoszone do weryfikacji
crew/saddle przeszło 9 sprawdzeń (timing, stos, chore stwory, „other
creatures", typ Artifact, cleanup) **bez jednego znaleziska** — i to też jest
wynik wart zapisania, żeby następna sesja nie badała tego drugi raz. Warto
tylko pilnować, by narzędzie repro nie kłamało: pozorna utrata typu `Artifact`
przez pojazd okazała się luką skryptu (`gameObjectDataOf` nie zwraca `types`;
prawdziwa ścieżka to `createCardDeck`), a nie błędem silnika.

## L15 (M102) — gdy detektory milkną, szukaj „ofert bez skutku"

Audyt Żywym Testerem z perspektywy gracza dał 10 błędów, ale rozkład pracy był
nierówny: pierwsze siedem wyłapały detektory i zgłoszenia właściciela, a po U7
narzędzie zamilkło — 14 partii, 11 kombinacji talii, 4 profile, zero trafień.
Kuszące jest wtedy uznać, że błędów już nie ma.

Trzy ostatnie znalazły się dopiero po zmianie pytania. Zamiast „czy coś
wygląda źle?" (na co detektor odpowiada wzorcami) zapytaliśmy: **„czy panel
oferuje graczowi akcję, która nic nie zmienia albo jest pewną stratą?"**.
To pytanie o INTENCJĘ, nie o poprawność — silnik był w każdym z tych trzech
przypadków zgodny z CR:

- **U8**: czar z kosztem „poświęć stwora" mógł celować w tego samego stwora.
  Legalne (CR 601.2c/601.2h), kończy się fizzlem (608.2b) — i było
  **pierwszą** propozycją UI, więc tester je kliknął i stracił kartę za nic.
- **U9**: equip na stwora, który już nosi ten sprzęt. Legalne, całkowicie
  bezcelowe; kliknięte 5× w jednej partii.
- **U10**: fizzle zdolności logowany identycznie jak sukces. Silnik poprawnie
  emitował `fizzled: true` — czytelnik panelu honorował tę flagę wyłącznie dla
  equipa.

Wniosek praktyczny: **zgodność z zasadami to dolna granica jakości, nie
górna.** Interfejs, który sumiennie wylicza wszystkie legalne ruchy, potrafi
być wrogi, jeśli nie odróżnia ruchu sensownego od samobójczego. Warto mieć
w repertuarze skan „powtórzona akcja z tym samym celem":
`grep -ohP "^\s*>> \K.*" transkrypt | uniq -d` — dwa z trzech błędów wyszły
dosłownie z tej jednej linijki.

Druga część lekcji: przy takim polowaniu **połowa tropów to fałszywe alarmy**
(tu: 4 na 7 zbadanych). Nie jest to strata czasu pod warunkiem, że każdy
zweryfikowany trop zostanie zapisany z uzasadnieniem — inaczej następna sesja
zbada go od nowa. Szczególnie zdradliwe są artefakty własnych narzędzi:
„brak badge'a wyposażenia" (T4′) okazał się luką `extractTileText`, które nie
czyta `.ovl` — dokładnie to samo źródło, co wcześniejsze „Hero · 0" bez P/T.
Zanim uznasz zgłoszenie za błąd produktu, sprawdź, czy nie jest błędem
obserwatora.

## L16 (M103) — Sonda „oferta bez skutku" wymaga, by OCZEKUJĄCA DECYZJA była stanem

**Objaw:** nowy detektor `noop` (automatyzacja wzorca L15) dostał fałszywy
alarm na aktywacji craftu Lodestone Needle: „jedyna zmiana to zapłacony
koszt". Tymczasem kliknięcie otwierało graczowi WYBÓR artefaktu do
wygnania — realny skutek.

**Przyczyna:** `stateFingerprint` pomijał 36 pól wstrzymujących grę
(poza trzynastoma ręcznie projekowanymi) — w tym `pendingCraftExile`.
Dwa stany różniące się oczekującą decyzją miały TEN SAM fingerprint,
więc sonda nie widziała skutku. Ten sam fingerprint osłabiał też
weryfikację replayów (M101/B2: zamrożony zbiór to stan — dotyczy
WSZYSTKICH decyzji, nie tylko buffów).

**Reguła:** każda struktura, która BLOKUJE priorytet (decyzja gracza),
musi być częścią fingerprintu. W fingerprint jest teraz generyczna sekcja
`pendingDecisions` z listą `PENDING_DECISION_FIELDS` — nowe pole
wstrzymujące grę MUSI trafić na tę listę. Sonda ma dodatkowo obronę
w głąb: po symulacji sprawdza, czy okno priorytetu ma pass — brak passu
to dowód, że komenda otworzyła decyzję (skutek), niezależnie od listy.

## L17 (M103) — Bundler jednoplikowy nie zna aliasów importów, a jsdom nie zna structuredClone

**Objaw:** sonda „oferta bez skutku" działała w testach Node i umierała
w artekfakcie („runProbeCommandEffect is not defined"), a po jej naprawie —
„structuredClone is not defined". Oba błędy niewidoczne dla `npm test`,
bo pakiet build jest sprawdzany tylko pod kątem determinizmu, nie
wykonania nowych ścieżek.

**Przyczyny:** (1) `tools/build.mjs` skleja moduły w JEDEN scope
(`assertNoNameCollisions`) — `import { x as y }` nie tworzy wiązania `y`,
a build i testy kolizji nic nie zgłaszają (w repo NIE ma ani jednego
aliasu importu — to konwencja, nie przypadek). (2) Artefakt wykonuje się
w realmie jsdom, gdzie nie ma `structuredClone` (ani Node-owego globalsa) —
trzeba własnego deep-clone dla Map/Set.

**Reguła:** w kodzie trafiającym do artefaktu: (a) bez aliasów importów,
(b) żadnych Node-globali (structuredClone, Buffer, process), (c) po każdej
zmianie mostka artefaktu zweryfikuj ją Żywym Testerem na zbudowanym
pliku — testy Node jej nie pokryją. Klasę błędu z (b) wykrył dopiero
detektor mutacyjny z lekcji L13.

## L18 (M103) — W detektorze „koszt vs skutek" tylko WŁASNE życie może być kosztem

**Objaw:** sonda „oferta bez skutku" zgłosiła Welder Automaton
(„{3}{R}: 1 obrażenie każdemu przeciwnikowi") jako „jedyną zmianę jest
zapłacony koszt" — bo jedyną różnicą stanu był spadek życia PRZECIWNIKA,
a sonda śledziła wyłącznie życie gracza sondy (pod kątem kosztów życiem)
i pozostałe ścieżki życia odrzucała.

**Reguła:** przy klasyfikowaniu zmian stanu na koszty i skutki: **życie
PRZECIWNIKA to zawsze skutek** (obrażenia, drenaż — przeciwnik nie płaci
naszych kosztów), życie WŁASNE może być kosztem (ujemna delta) albo
skutkiem (zysk). Analogicznie: tapnięcia cudzych permanentów to skutek,
tapnięcia własnych lądów to koszt many. Przy każdym nowym „liczniku
kosztów" sprawdź, czy jego lustrzane odbicie po stronie przeciwnika nie
jest przypadkiem skutkiem.

## L19 (M103) — Enumeracja wariantów kombinacyjnych musi mieć cap, zanim zobaczy ją bot

**Objaw:** próbka regresji benchmarku (1248 meczów) spowolniła ~2×, a modal
wyboru dla gracza rósł w setki opcji — po dodaniu wyceny `cast_escape`.
Poprzednio warianty Escape (Sweet Oblivion) nie miały wyceny (default 0)
i bot pomijał je natychmiast, więc nikt nie czuł, że `legalEscapeCasts`
enumeruje WSZYSTKIE C(n, 4) podzbiory wygnania z cmentarza: 10 kart
w grobie = 210 podzbiorów × 2 cele = 420 wariantów na okno, 15 kart =
setki tysięcy. Wycena zaczęła je punktować i eksplozja wyszła na jaw.

**Reguła:** każda enumeracja wariantów kombinacyjnych w `legal*Casts`/
`legal*Options` dostaje LIMIT w dniu narodzin (precedensy:
`COMBAT_OPTION_CAP`, `CREW_OPTION_CAP`, `ESCAPE_OPTION_CAP` — wszystkie
32), z deterministycznym porządkiem (ADR 0005). „Bot i tak nie wybierze
gorszego wariantu" nie jest argumentem — wycena punktuje KAŻDY wariant
w każdym oknie, a gracz dostaje modal z setek opcji. Po capie sprawdź,
że próbka regresji bota wróciła do poprzedniego czasu (~140 s na 1248
meczów) — czas to kanarek eksplozji enumeracji.

## L20 (2026-08-16) — Detektor mierzy tylko to, co narzędzie KLIKNIE — skanuj całe okno

**Objaw:** weryfikacja mutacyjna nowej bramki ofert (M104) NIE zadziałała:
po cofnięciu bramki panel Żywego Testera pokazywał oferty bez skutku
(„Aktywuj: Rustvine Cultivator — odkręć → cel: Forest"), a oś `noop`
raportowała zero zgłoszeń. Detektor był sprawny — po prostu polityka gracza
klikała w tych oknach co innego, a sonda mierzyła WYŁĄCZNIE kliknięcie.

**Przyczyna:** pomiar był przypięty do akcji gracza (jedna sonda na jedno
kliknięcie), a przestrzeń ofert jest o rząd wielkości większa niż liczba
kliknięć: w oknie widać kilkanaście przycisków i wariantów w modalu, gracz
wybiera jeden. Pokrycie osi zależało więc od heurystyki profilu, a nie od
tego, co gra faktycznie oferuje.

**Reguła:** jeśli sonda pracuje na KLONIE stanu (nie dotyka partii), mierz
**każdą ofertę widoczną w oknie**, nie tylko wybraną — z dedupem po kluczu
opcji i twardym limitem na partię. Ogólniej: przy narzędziu audytowym
pytaj „czy pomiar obejmuje całą przestrzeń, którą widzi gracz, czy tylko
ścieżkę, którą przeszedł sterownik?". To samo pytanie ujawniło w M104 dwa
braki naraz — nieskanowane opcje modali i nieskanowane oferty panelu.

## L21 (2026-08-16) — Pole spoza kontraktu fabryki obiektu ginie po cichu (martwy test)

**Objaw:** dwa testy „Rustvine: odkręć docelowy ląd" tworzyły ląd przez
`addObject(state, { …, tapped: true })` i kończyły się asercją
`assert.equal(state.objects.get('land').tapped, false)`. Przechodziły od
zawsze — bo `addObject`/`createGameObject` nie mają pola `tapped`
w destrukturyzacji (stan bojowy nadają efekty, nie fabryka), więc ląd
powstawał ODKRĘCONY, a asercja sprawdzała stan początkowy, nie skutek
zdolności. Wyszło to na jaw dopiero, gdy bramka ofert M104 przestała
oferować odkręcanie nietapniętych lądów i testy padły.

**Przyczyna:** fabryka przyjmuje obiekt-konfigurację i ignoruje nieznane
klucze (JS nie ma na to ostrzeżenia). Ta sama pułapka dotyczy
`summoningSickness`, `counters`, `cantBlock` — pól, które w testach
„ustawia się" pozornie.

**Reguła:** stan spoza kontraktu tworzenia ustawiaj JAWNIE po dodaniu
obiektu (`state.objects.set(id, Object.freeze({ ...obj, tapped: true }))`).
Pisząc test, sprawdź, czy asercja rozróżnia stan POCZĄTKOWY od skutku —
jeśli test przechodzi także bez badanej mechaniki, nie testuje niczego.
**Domknięte w M137 (2026-08-18):** strażnik istnieje. `addObject` porównuje
klucze konfiguracji z listą `ADD_OBJECT_FIELDS` i dla pola spoza kontraktu
wypisuje ostrzeżenie z KONKRETNĄ podpowiedzią (`ADD_OBJECT_HINTS`), raz na
pole. `MTG_STRICT_ADD_OBJECT=1` zamienia je w wyjątek. Nawias „wywraca ~40
plików" był trafny co do rzędu wielkości i zaniżony co do przyczyny:
twardy rzut wywalił **141 testów**, bo pola wchodzą nie literalnie, tylko
przez `...spread` w helperach — takich plików jest **46** i żaden statyczny
fixer ich nie złapie. Stąd tryb ostrzegawczy jako domyślny.
Ta lekcja sama znalazła kolejną ofiarę: „BUG3 amass" oczekiwał 2 liczników,
bo startowy z `counters:` ginął w fabryce (poprawne 3).

## L22 (2026-08-16) — Akcja, która PRZEWIJA grę, musi kończyć się ponownym renderem

**Objaw:** po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne
tapnięcie gracza kończyło się w logu komunikatem „Ruch odrzucony:
illegal_cast: Zagranie poza main phase" / „not_priority" (3 przypadki
w macierzy Żywego Testera M104; przy `--tick-rate 0` żadnego). Dodatkowo
ruchy bota rozegrane w tym momencie nie trafiały do modala „Rozgrywka".

**Przyczyna:** `toggleIgnoredOption` renderował panel, a DOPIERO POTEM
wywoływał `session.recheckAutoPass()`, które przewija grę (auto-pass, tura
bota). Po przewinięciu nie było już żadnego renderu, więc na ekranie
zostawał panel z MINIONEGO okna — a przyciski panelu niosą komendy
sprzed przewinięcia.

**Reguła:** każda ścieżka UI, która może zmienić stan gry (`apply`,
`continueBotPlay`, `recheckAutoPass`, wznowienie zapisu), kończy się tą samą
sekwencją co `playDirect`: **zapis → render → pokaż ruchy bota**. Render
PRZED zmianą stanu nie jest renderem po zmianie. Objaw diagnostyczny tej
klasy: odrzucane komendy gracza tuż po akcji, która „nic nie robi" w grze
(przełącznik, ptaszek, zamknięcie modala) — szukaj brakującego renderu,
zanim zaczniesz podejrzewać reguły.

## L23 (2026-08-16) — Koszt karty to DANE: pipy kolorowe i mana value trzeba weryfikować maszynowo

**Objaw:** po pięciu odznakach mechaniki silnika były czyste, a mimo to
w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" zapisane jako
sama liczba many (zdolność opłacalna dowolnym kolorem) oraz {2}{U} zapisane
jako `manaCost: 2` (karta o manę tańsza). Żaden test tego nie łapał, bo
testy kart sprawdzają SKUTEK zdolności, a nie to, czy dało się ją opłacić
złym kolorem.

**Przyczyna:** koszt żyje w dwóch miejscach (`MANA_COSTS[id]` jako string
Oracle i `manaCost`/`cost.colors` jako dane silnika), a między nimi nie było
żadnej bramki. Przy ręcznym przepisywaniu batchy kart to najłatwiejszy błąd
do popełnienia i najtrudniejszy do zauważenia w rozgrywce.

**Reguła:** dane, które istnieją w DWÓCH reprezentacjach, dostają strażnika
porównującego je maszynowo (tu: `manaCost` = mana value stringa kosztu dla
KAŻDEJ karty; osobny skan porównuje pipy kolorowe linii „{koszt}: efekt"
z `cost.colors` zdolności). Skanery pisz jako jednorazowe sondy, a te,
które trafiły, zostawiaj w pakiecie jako test-strażnik — inaczej następny
batch kart wprowadzi tę samą klasę błędu.

## L24 (2026-08-16) — „Cichy skutek" to błąd informacyjny: efekt bez zdarzenia nie istnieje dla gracza

**Objaw:** czar za 3 many (Hysterical Blindness, −4/−0 wszystkim stworom
przeciwnika) rozstrzygał się, a w logu i w panelu „Rozgrywka" był tylko
„zostaje rozstrzygnięty". To samo dotyczyło Turn the Tide, Angel of the Dawn
i Jyoti. Gracz nie miał JAK się dowiedzieć, co zrobiła jego karta.

**Przyczyna:** efekt zapisywał stan bezpośrednio (`state.untilEndOfTurnBuffs`,
`modifyStats` wyciszony jako szum) i nie emitował zdarzenia. Warstwa
prezentacji nie ma czego pokazać — a testy silnika sprawdzają SKUTEK w stanie,
nie to, czy powstało zdarzenie.

**Reguła:** każdy efekt, który zmienia widoczny stan gry, emituje zdarzenie —
także wtedy, gdy zmiana jest „tylko" modyfikatorem statystyk albo dotyczy
wielu obiektów naraz (wtedy JEDNO zdarzenie zbiorcze z listą obiektów, nie N
osobnych, które i tak zostaną wyciszone jako szum). Przy dodawaniu efektu
zadaj pytanie: „co zobaczy gracz w logu?" — jeśli odpowiedź brzmi „nic",
brakuje zdarzenia. Wyciszanie klasy zdarzeń jako szumu (M99: `stats_modified`)
zawsze wymaga sprawdzenia, czy dla którejś karty ta klasa nie jest CAŁĄ treścią.

## L25 (2026-08-17) — Test scenariuszowy nie może zależeć od tego, KTO wykonał akcję

**Objaw:** po dołożeniu jednej karty do `decks/green.txt` posypało się pięć
testów, które z rozgrywką nowych kart nie miały nic wspólnego: „log nie
opisuje tworzenia tokenu\", „nie znaleziono żadnej okazji zagrania\", „żaden
seed nie dał własnego surveil\". Kilka z nich to zwykłe przelosowanie seeda,
ale jeden był inny: token POWSTAŁ i log go opisał — tyle że napisem
„Ty tworzysz token\", a asercja szukała frazy „tworzy token\". Wcześniej ten
sam seed dawał token BOTA.

**Przyczyna:** warstwa opisu odmienia czasownik zależnie od gracza
(„tworzysz\" / „tworzy\", „nie wskazujesz\" / „nie wskazuje\"), a test
przypadkiem trafił w jedną z form. Zmiana zawartości talii przetasowała
rozgrywkę i tę samą treść wypowiedział drugi gracz.

**Reguła:** asercja na TREŚĆ logu opisuje zdarzenie, nie osobę — dopuszczaj
obie formy (`/tworzy(sz)? token/`) albo sprawdzaj zdarzenie w
`session.state.events`. Osobno: każdy seed zamrożony w teście scenariuszowym
dostaje komentarz „przelosowany po zmianie X\" — po batchu kart trzeba
przejrzeć WSZYSTKIE testy grające pełne partie, nie tylko te dotyczące
nowych kart.

## L26 (2026-08-17) — Strażnik z klauzulą „brak danych = pomijam" nie jest strażnikiem

**Objaw:** w katalogu siedział adres ilustracji, którego nikt nigdy nie pobrał
ze Scryfalla — `…/large/front/9/1/91b1f0f3-krumar-initiate.jpg`. Adres wygląda
wiarygodnie (ta sama domena, ta sama struktura katalogów), ale nazwa karty
w miejscu UUID zdradza, że powstał „z głowy”. Efekt w grze: 404 i karta bez
ilustracji. Istniał test dokładnie na to: „imageUri każdej karty zgadza się
z plikiem Scryfall”.

**Przyczyna:** test miał klauzulę `if (!expected) continue` — „brak pliku
`docs/cards/scryfall-<id>.json`, więc nie sprawdzam”. Dwadzieścia kart dwóch
kolejnych batchy weszło do katalogu **bez pliku źródłowego** (ADR 0010 §2a),
więc dla nich strażnik milczał. Im więcej kart dochodziło z pominięciem
procedury, tym mniejszy był zasięg testu — a jego zielony wynik sugerował
coś odwrotnego.

**Reguła:** każda klauzula „nie mam danych, więc przepuszczam” w teście
wymaga **drugiego testu na OBECNOŚĆ tych danych**. Inaczej pominięcie
procedury wyłącza kontrolę po cichu, a pokrycie spada bez jednego czerwonego
testu. Przy pisaniu strażnika zadaj pytanie: „co się stanie, gdy dane
wejściowe znikną?” — jeśli odpowiedź brzmi „test przejdzie”, brakuje bramki.

Ta sama sonda porównawcza (katalog ↔ plik źródłowy) wykryła przy okazji
cztery rozjazdy TEKSTU reguł, w tym realny błąd: Cellar Door miał w katalogu
„Target player mills 1” (wierzch biblioteki), a Oracle mówi „puts the bottom
card of their library into their graveyard”. Mechanika była poprawna
(`mill_from_bottom`) — błędny był tekst, który gracz czyta w interfejsie.
Wniosek dodatkowy: **`oracleText` to też dane do maszynowej weryfikacji**
(L23), nie komentarz.

## L27 (2026-08-17) — Zero zgłoszeń detektorów znaczy „nie mam takiej reguły”, nie „jest czysto”

**Objaw:** dwanaście partii Żywego Testera (osiem kombinacji talii, pięć
profili gracza) zakończyło się komunikatem „DETEKTORY: brak zgłoszeń”.
Ręczne przeczytanie tych samych transkryptów w roli gracza dało pięć realnych
błędów w pół godziny: log nie odmieniał liczników („dostaje +2 licznik”),
mulligan pokazywał 35 opcji z piętnastoma nieodróżnialnymi, koszt „{2},{T}”
renderował się jako „T2”, a bot filtrował manę bez powodu w każdej turze.

**Przyczyna:** detektory sprawdzały to, co poprzednie audyty już kiedyś
znalazły (placeholdery, powtórzenia bota, oferty bez skutku, martwe okna).
Żaden nie patrzył na GRAMATYKĘ tekstu ani na to, czy opcje modala różnią się
między sobą. Zielony raport mówił więc wyłącznie „żadna ze znanych mi reguł
nie zadziałała” — a został odczytany jako „stół jest w porządku”.

**Reguła:** raport detektorów jest **dolną granicą**, nigdy potwierdzeniem
jakości. Każda sesja audytowa czyta transkrypt ręcznie wzdłuż osi
z `docs/setup/TESTER_STOLU.md`, a **każda klasa błędu znaleziona ręcznie
kończy się nowym detektorem** — inaczej następny audyt zacznie od zera
w tym samym miejscu. Odwrotnie też: detektor bez weryfikacji wstecznej na
archiwalnych transkryptach (czy zgłasza znane znalezisko? czy milczy na
poprawnych danych?) jest wart tyle, co jego brak.

**Pułapka techniczna przy okazji:** `\b` w wyrażeniu regularnym **nie działa
po polskich znakach diakrytycznych** — „kartę” kończy się literą spoza
`[A-Za-z0-9_]`, więc `\b` dopasowuje przedrostek „kart” i produkuje fałszywe
alarmy na poprawnym tekście. Granicę wyrazu w polskich tekstach sprawdzaj
przez `(?![\p{L}])` z flagą `u`.

## L28 (2026-08-17) — Kary dopisywane „przy okazji zgłoszenia” zostawiają dziurę na każdy nowy typ

Bot tapował własne stwory (Chill of the Grave, Entrancing Lyre) i zakładał
aurę-kotwicę na własnego stwora, mimo że kary za niszczenie/wygnanie/obrażenia
we własne rzeczy istniały od M91–M96. Powód nie był „zapomnianym przypadkiem”,
tylko **wzorcem pracy**: każda kara powstawała jako reakcja na konkretne
zgłoszenie i obejmowała dokładnie ten jeden typ efektu. Domyślność była
odwrócona — nowy typ efektu startował bez ochrony i czekał, aż ktoś go zobaczy
w rozgrywce.

**Wniosek:** dla rodziny reguł tego samego kształtu („nie rób X samemu sobie”)
buduj **tabelę typów + jedną funkcję egzekwującą**, a nie n rozproszonych `if`.
Wtedy dopisanie efektu do tabeli chroni go od razu. Sygnałem ostrzegawczym jest
druga lub trzecia łatka o tym samym kształcie w różnych miejscach pliku —
to moment na inwentaryzację WSZYSTKICH typów (tu: 44 z `card-data.js`) i odwrócenie
domyślności, zamiast dokładania czwartego `if`.

Towarzysząca zasada: przy takiej zmianie **testy anty-over-fix są obowiązkowe**.
Kara na „własny cel” trywialnie degeneruje się w paraliż, więc każdy naprawiony
przypadek ma bliźniaczy test, że karta nadal działa na permanent przeciwnika.

## L29 (2026-08-17) — Fallback `?? slug` to cichy wyciek, nie zabezpieczenie

Trzy z dziesięciu błędów M122 miały identyczny kształt: kod pokazywał graczowi
surowy identyfikator (`trigger (enchanted_permanent_tapped)`,
`efekt (attach_equipment_to_source)`, `trigger (delayed)`), bo mapa etykiet
kończyła się fallbackiem `LABELS[key] ?? key`. Taki fallback **nie wywala się
i nie loguje ostrzeżenia** — po prostu wypuszcza wewnętrzną nazwę do UI i czeka,
aż ktoś zobaczy ją w rozgrywce.

**Wniosek:** wszędzie, gdzie istnieje mapa „identyfikator → tekst dla gracza”,
napisz **test-niezmiennik**: każdy klucz faktycznie występujący w danych ma wpis
w mapie. Inwentaryzacja jest tania (jeden przebieg po rejestrze), a wyłapuje
całą rodzinę naraz: przy 35 eventach triggerów tester trafił 1 z 2 braków, przy
121 typach efektów — 1 z 9. Reszta czekała na rzadszy układ partii.

Pułapka do zapamiętania: **skanuj też źródła spoza bazy danych**. Pierwsza wersja
strażnika czytała wyłącznie `card-data.js` i przepuściła `delayed`, bo ten event
rodzi się w `src/engine/triggers.js`. Niezmiennik jest wart tyle, ile kompletność
zbioru, po którym iteruje.

## L30 (2026-08-17) — Ukrycie informacji musi być zrobione w KAŻDEJ ścieżce renderu

Modal „Rozgrywka" pokazywał ilustrację karty, którą bot dobrał do ręki, mimo że
tekst wpisu był poprawnie bezimienny („Nieprzyjaciel dobiera kartę" — FoW było
obsłużone). Powód: wpis ma DWIE niezależne ścieżki renderu — tekst z
`describeGameEvent` i miniaturkę z `entry.cardId`. Zabezpieczono pierwszą,
o drugiej zapomniano, bo powstała później (M89, dla Curate).

**Wniosek:** przy informacji ukrytej (ręka, biblioteka, karta face-down) pytaj
nie „czy ukryłem nazwę?", tylko „ile jest ścieżek, którymi ta karta może dotrzeć
do oczu gracza?" — tekst, miniaturka, alt obrazka, tooltip, log, podgląd strefy.
Najbezpieczniej odciąć dane u ŹRÓDŁA (nie wpuszczać `cardId` do struktury wpisu),
a nie maskować je w każdym widoku z osobna.

Drugi wniosek — o testowaniu: asercja „czy ta karta jest gdzieś w ręce bota" jest
za słaba i daje fałszywe alarmy (bot zagrał Zoraline jawnie, a druga kopia leżała
w ręce). Sprawdzaj strefę docelową KONKRETNEGO zdarzenia. Dlatego naprawa zostawia
jawny ślad (`hiddenDestination`): test weryfikuje intencję, nie skutek uboczny.

## L31 (2026-08-17) — Strażnik kompletności słownika nie zastępuje strażnika miejsc użycia

M122 naprawiło wyciek surowego sluga do logu i dołożyło test: „każdy event
triggera ma wpis w TRIGGER_EVENT_LABELS". Test był zielony, a mimo to właściciel
zobaczył „Chronic Flooding — trigger (enchanted_permanent_tapped)". Powód: ten
sam `case` miał TRZY gałęzie `return` i tylko jedna sięgała po słownik; dwie
pozostałe interpolowały `e.trigger` bezpośrednio. Strażnik pilnował DANYCH,
a błąd siedział w KODZIE.

**Wniosek:** przy mapach „identyfikator → tekst" potrzebne są dwa niezmienniki:
(1) słownik pokrywa wszystkie wartości z danych, (2) w kodzie nie ma miejsca,
które wstawia surowy identyfikator z pominięciem słownika. Drugi łatwo napisać
jako test czytający źródło (`assert.doesNotMatch(body, /\(\$\{e\.trigger\}\)/)`).

Powiązana obserwacja z tej samej sesji: gdy właściciel mówi „przycisk jest
nieaktywny", zweryfikuj to dosłownie, zanim uwierzysz w opis. Tutaj `disabled`
było `false` — przycisk działał, ale jego jedyny skutek (czyszczenie pustego
zaznaczenia) był niewidoczny. Diagnoza „brak skutku" prowadzi do zupełnie innej
naprawy niż „element zablokowany".

## L32 (2026-08-17) — Gdy druga enumeracja tworzy duplikat, dedupuj wynik, nie dokładaj bramki

Karta z flash pojawiała się w panelu dwa razy, bo `playerView` enumeruje ją
w dwóch blokach (flash + main-phase). W kodzie istniała już bramka dokładnie na
ten przypadek — ale tylko dla AUR, dopisana przy okazji wcześniejszego
zgłoszenia. Trzecia taka bramka rozwiązałaby zgłoszenie właściciela i zostawiła
lukę dla czwartego bloku.

**Wniosek:** jeśli ta sama decyzja może powstać w kilku niezależnych miejscach,
niezmiennik nakładaj na WYNIK („żadna komenda nie powtarza się w ofercie"),
a nie na każde źródło z osobna. Koszt jest znikomy (jeden przebieg po liście),
a ochrona obejmuje też bloki, które dopiero powstaną. Ten sam wzorzec zadziałał
już przy mulliganie (M119/Z3) i szukaniu w bibliotece (M122/#2) — trzy
niezależne zgłoszenia o tym samym kształcie to sygnał, że reguła należy do
warstwy wyjścia.

Uwaga o anty-over-fixie: dedup MUSI iść po pełnej tożsamości komendy, nie po
`type`+`objectId`. Aura z trzema legalnymi celami to trzy RÓŻNE decyzje i test
regresyjny musi to pilnować, inaczej „naprawa" odbiera graczowi wybory.

## L33 (2026-08-17) — Narzędzie audytu, które „porządkuje" dane, kłamie o stanie gry

Transkrypt Żywego Testera zwijał identyczne kafle (klucz: 40 znaków tekstu),
żeby snapshot był krótszy. Skutek: dwa realne permanenty o tej samej nazwie
widniały jako jeden. Gdy panel akcji pokazał dwie grupy „Cel zdolności:
Guidestone Compass", a stół — jeden Compass, diagnoza poszła w stronę
nieistniejącego błędu grupowania w UI. Prawda była odwrotna: UI miało rację,
kłamał snapshot (drugi Compass to token-kopia z Cogwork Assemblera).

**Wniosek:** w narzędziu audytowym deduplikacja jest wrogiem. Jeśli skracasz
wyjście, rób to **jawnie i bez utraty liczności** („×2"), nigdy przez ciche
pominięcie. Inaczej narzędzie zaczyna generować własne fałszywe hipotezy,
a każda kosztuje pełny cykl diagnozy.

Reguła praktyczna: gdy obraz stołu przeczy panelowi akcji, **najpierw podejrzewaj
narzędzie**, dopiero potem produkt — panel czyta stan bezpośrednio, transkrypt
przechodzi przez warstwę ekstrakcji, która może gubić dane.

## L34 (2026-08-17) — Kopia „przed naprawą" zrobiona PO edycji kłamie, że test działa

Weryfikacja mutacyjna testu M128 (uwaga B właściciela) dwa razy z rzędu dała
fałszywy wynik. Pierwszy raz: `cp bot.js /tmp/bot.bak` wykonane **po** edycji
pliku — porównywałem nowy kod z nowym i „stary" wariant też przechodził, co
sugerowało bezużyteczny test. Drugi raz: asercja sprawdzała `abilityIndex 0`
(zdolność many), podczas gdy bot w tym stanie sięgał po `abilityIndex 1`
(scry) — test był zielony, mimo że mierzył zupełnie inną decyzję.

Prawdę pokazało dopiero: (1) `git show HEAD:<plik>` jako źródło wersji sprzed
zmiany — nigdy lokalna kopia zrobiona „gdzieś po drodze"; (2) skrypt wypisujący
FAKTYCZNIE wybraną komendę zamiast predykatu `tapped === false`.

**Wniosek:** mutacja jest wiarygodna wyłącznie wtedy, gdy wersja bazowa
pochodzi z gita, a diagnostyka drukuje pełną decyzję, nie wynik predykatu.
Predykat zawężony do jednego pola (`abilityIndex === 0`) potrafi być zielony
z dokładnie tego powodu, dla którego test miał być czerwony.

Reguła praktyczna: zanim uznasz test regresyjny za dobry, uruchom go przeciw
`git stash`/`git show` wersji sprzed naprawy i **zobacz go czerwonym**. Test,
którego nigdy nie widziałeś czerwonego, nie jest testem regresyjnym — jest
opisem bieżącego zachowania. To rozszerzenie L27 („zero zgłoszeń" ≠ „czysto")
na własne narzędzia weryfikacji.

## L35 (2026-08-17) — Nowy widget dziedziczy dług dotykowy, jeśli rodzina nie ma reguły

Uwaga C właściciela („ptaszki w wyborze atakujących są za małe na telefonie")
nie była regresją — te pola NIGDY nie miały CSS. Klasy `.combat-wizard-*`
istniały w JS od M66, ale w `index.html` nie było dla nich ani jednej reguły,
więc przeglądarka renderowała domyślny checkbox ~13-16 px bez obszaru wokół.
Identyczny problem rozwiązano już w M91 dla ptaszka wyciszenia
(`.action-ignore`) — poprawka nie objęła jednak drugiego miejsca z ptaszkami,
bo nikt nie zapytał „gdzie jeszcze mamy pola wyboru".

**Wniosek:** przy poprawce ergonomii dotyku pytaj o RODZINĘ kontrolek
(wszystkie checkboxy / wszystkie steppery), nie o zgłoszony widget. Tu jedno
zapytanie o `type = 'checkbox'` i `ghost-btn` w wizardach wskazało od razu
trzy miejsca: wybór atakujących, wybór blokujących i steppery przydziału
obrażeń — dwa z nich właściciel jeszcze nie zdążył zgłosić.

Dobrą praktyką jest strażnik liczbowy na progu (44 px z Apple HIG) czytający
źródło CSS: styl nie ma reprezentacji w testach DOM-owych, więc bez niego
regresja wróci przy pierwszym refaktorze arkusza.

## L36 (2026-08-17) — Próg regresji na małej próbce mierzy szum, nie jakość

Dosypanie lądów do czterech talii (M132) zbiło benchmark bota z 61,5 % na
56,3 % vs aggro i zapaliło czerwone światło progu regresji — mimo że **bota
w ogóle nie ruszono**. Odruch podpowiadał „cofnij zmianę talii albo obniż
próg". Oba byłyby błędem: pomiar na szerszej próbce pokazał, że bot jest po
zmianie SILNIEJSZY niż przedtem.

```
 4 seedy (1 248 meczów) → 56,3 %      ← próbka progu regresji
 8 seedów (2 496)       → 62,1 %
16 seedów (4 992)       → 63,6 %      (stan sprzed zmian: 61,5 % na 4 seedach)
```

Rozrzut ~7 p.p. przy 4 seedach znaczy, że próg mierzył losowanie. To groźne
w OBIE strony: fałszywy alarm przy niewinnej zmianie danych i — gorzej —
realna regresja bota schowana w szumie, gdy losowanie akurat sprzyja.

**Wniosek:** zanim uznasz spadek metryki za regresję, sprawdź, czy zmieniło
się to, co metryka MIERZY. Gdy zmiana dotyczy danych wejściowych (talie,
zestaw kart), a nie mierzonego kodu — najpierw powtórz pomiar na większej
próbce, dopiero potem wyciągaj wnioski. Próbka progu musi mieć rozrzut
wyraźnie mniejszy niż różnica, którą próg ma wykrywać.

Uwaga o kosztach: to samo dotyczy testów z zamrożonym seedem. Pięć testów
scenariuszowych wymagało przelosowania hunterem, bo inny skład talii to inne
rozdania — i to jest normalny koszt, nie awaria. Ale test, który zamiast
reguły opisuje przypadek („w ręce jest 7 różnych kart"), pęka przy KAŻDEJ
takiej zmianie; przepisany na regułę („oferta = liczba różnych kart") przestaje
być kruchy.

## L37 (2026-08-17) — Zmiana danych wejściowych to darmowy fuzzing silnika

Dosypanie lądów do talii ujawniło **crash silnika obecny w kodzie od dawna**:
`Error: Nieprawidłowy cel obrażeń` wywracał cały proces benchmarku, gdy cel
zdolności opuścił pole bitwy przed jej rozstrzygnięciem (CR 608.2b mówi, że ma
wtedy nastąpić fizzle). Benchmark „przechodził wcześniej" wyłącznie dlatego,
że dotychczasowe rozdania nie trafiały w tę ścieżkę.

Objaw był mylący na dwa sposoby: pojawił się dopiero przy `--seeds 16`
(przy 4 seedach go nie było), a wyglądał jak skutek zmiany talii — czyli
kusił, by „cofnąć to, co zepsuło benchmark".

**Wniosek:** kiedy zmiana danych (talie, karty, deck lista) wywala coś
w silniku, to prawie nigdy nie jest wina danych — to nowa ścieżka wykonania,
której dotąd nikt nie odwiedził. Traktuj taki crash jak znalezisko fuzzingu:
napraw REGUŁĘ w silniku, nie dane. Warto też przy każdej zmianie danych
puścić szerszą próbkę niż domyślna — to najtańszy sposób na odwiedzenie
ścieżek, których testy jednostkowe nie dotykają.

## L38 (2026-08-18) — Dług, którego nie da się spłacić jednym commitem, spłaca się trybem ostrzegawczym

**Objaw:** walidacja kontraktu `addObject` (L21) była oczywiście słuszna
i równie oczywiście nie do wdrożenia: włączona twardo dała **141 czerwonych
testów**. Klasyczna sytuacja, w której „zrób to porządnie" oznacza „nie rób
tego nigdy" — i faktycznie leżało to w backlogu dwa dni.

**Przyczyna:** narzędzie miało jeden tryb — rzucaj. Przy takim projekcie
progu wejścia koszt wdrożenia jest równy kosztowi spłaty CAŁEGO długu,
płatnemu z góry, przez jedną osobę, w jednym commicie.

**Reguła:** strażnik na istniejący kod projektuj DWUTRYBOWO. Domyślnie
ostrzeżenie z konkretną podpowiedzią naprawy i deduplikacją (jedno na pole,
nie na wywołanie — inaczej pakiet tonie w tysiącach linii). Twardy tryb za
zmienną środowiskową (`MTG_STRICT_ADD_OBJECT=1`) — dla sprzątania i dla
testu-strażnika, który pilnuje, żeby ŚWIEŻY kod w `src/` był czysty.
Wtedy: nowy dług jest niemożliwy od dziś, stary spłaca się przy okazji,
a wdrożenie kosztuje jeden commit zamiast czterdziestu sześciu.

**Efekt uboczny, na który warto liczyć:** samo włączenie ostrzeżeń
wyprodukowało listę miejsc, gdzie test mierzył coś innego, niż deklarował.
Dwa okazały się fałszywie zielone. Strażnik, zanim cokolwiek zabezpieczy,
najpierw robi audyt — i to jest jego pierwsza wypłata.

## L39 (2026-08-18) — Przegląd, który niczego nie znalazł, wychodzi ze strażnikiem, nie z pustymi rękami

**Objaw:** profilaktyczny audyt „czy każda decyzja ma opis w logu" wykazał
177/177 opisanych zdarzeń i 50/50 obsłużonych komend `resolve_*`. Zero
usterek. Pokusa: odhaczyć temat i pójść dalej.

**Przyczyna niepokoju:** kompletności logu nie pilnowało DOTĄD NIC. Stan
zielony był przypadkowy — i już dwa razy (M96, M126) przestawał być zielony
w najgorszy możliwy sposób: surowym slugiem zdarzenia wyświetlonym graczowi,
bo `describeGameEvent` ma `default: return e.type`.

**Reguła:** wynik przeglądu profilaktycznego to nie „czysto" — to TEST,
który utrwala „czysto". Skoro potrafiłeś zmierzyć własność automatycznie
w ramach audytu, to ten sam pomiar kosztuje jeden plik testowy. Bez niego
przegląd jest ważny przez dokładnie jeden commit. Przy okazji sprawdź
stronę odwrotną rejestru (L29): martwych typów zdarzeń było 6.

## L40 (2026-08-18) — „Detektory nie zgłosiły nic” to pomiar NARZĘDZIA, nie produktu

**Objaw:** 22 partie audytu Żywym Testerem, komplet 12 talii i 5 profili —
i sekcja `== DETEKTORY ==` praktycznie pusta. Ręczne czytanie tych samych
transkryptów w roli gracza dało **dziesięć** znalezisk, w tym bota płacącego
maną za wzmacnianie MOICH stworów 24 razy w jednej partii.

**Przyczyna:** każdy detektor koduje JEDNĄ hipotezę o tym, jak wygląda błąd.
`detectBotSelfTargeting` pilnował efektu SZKODLIWEGO wycelowanego w SIEBIE —
druga przekątna tej samej macierzy (efekt KORZYSTNY w PRZECIWNIKA) nie była
pilnowana przez nikogo. Tak samo `detectNoEffectOffers` mierzy oferty, ale nie
mierzy OPISÓW, więc kafel kłamiący o koszcie przechodził bez echa.

**Reguła:** czytaj „zero zgłoszeń” jako „moje reguły nie obejmują tego, co się
wydarzyło” (rozwinięcie L27), i po każdym audycie pytaj o KLASĘ, nie o
przypadek: jeśli znalazłem błąd ręcznie, jaka reguła znalazłaby go automatycznie
następnym razem? Z dziesięciu znalezisk trzy dały się zamienić w detektory —
i w pierwszym uruchomieniu kontrolnym wykryły JEDENASTE, którego ręcznie nie
zauważyłem. To jest właściwa miara: nie ile błędów naprawiłeś, tylko ile
klas błędów przestało być niewidzialnych.

**Uwaga praktyczna:** detektor bez weryfikacji DWUSTRONNEJ jest bezwartościowy.
Każdy nowy sprawdzaj na transkrypcie SPRZED naprawy (musi zgłosić) i PO
naprawie (musi zamilknąć) — inaczej nie wiesz, czy mierzy cokolwiek.

## L41 (2026-08-18) — Trzy kopie tej samej logiki rozjeżdżają się cicho i kłamią graczowi

**Objaw:** kafel Goblin Pickera obiecywał „{1}, {T}: dobierz 1 kartę”, a
aktywacja odrzucała kartę z ręki i wymagała czerwonej many. Oracle:
`{R}, {T}, Discard a card: Draw a card`.

**Przyczyna:** koszt zdolności liczyły TRZY niezależne miejsca —
`abilityCostHtml` (przycisk), `costTextOf` (kafel) i wyliczanka inline
w `describeAbility`. Każde znało inny podzbiór pól: jedno `discardCards`
(liczbę), żadne `discardCard` (boolean), tylko jedno pipy kolorów. Audyt
304 kart wykazał **osiem** pól kosztu bez pokrycia i kilkanaście kart, które
pokazywały graczowi nieprawdę.

**Reguła:** gdy ta sama informacja jest formatowana w więcej niż jednym
miejscu, wyciągnij JEDNĄ tabelę i każ wszystkim jej używać (L28 w wersji dla
prezentacji). Rozjazd takich kopii nie wywala testów ani nie rzuca wyjątkiem —
objawia się wyłącznie tym, że gracz płaci koszt, o którym nie został
uprzedzony. Strażnik musi być DWUSTRONNY: „każde pole obecne w DANYCH ma wpis
w tabeli opisów”, a nie tylko „tabela jest niepusta” (L31).

**Rodzina, nie przypadek:** ta sama diagnoza objęła etykiety celów (parametr
gubiony: „stwór o sile ≥” bez liczby), deskryptory aur (`losesKeywords`
i cztery inne pola — kafel bez treści reguł) i typy permanentu (kafel czytał
statyczny rejestr zamiast stanu gry, więc Spacecraft po przekroczeniu progu
Station dalej wyglądał na zwykły artefakt). Naprawiając jedno pole, sprawdź
skanem CAŁĄ rodzinę — inaczej reszta czeka na następny audyt.

## L42 (2026-08-18) — Efekt „do odwołania” wycenia się razem z ZEGAREM, nie tylko z celem

**Objaw:** uwaga właściciela — „najefektywniejsze jest tapowanie kreatur
przeciwnika po jego fazie untap, wtedy kreatura jest nieczynna i w ataku,
i w obronie”. Bot tego nie widział: wycena tapowania brzmiała `8 + 2*power`,
czyli zależała WYŁĄCZNIE od tego, kogo tapujemy. Trace pokazał, że tapował
w oknach najsłabszych (własny koniec tury — efekt kasował się chwilę później
przy untapie przeciwnika), a najlepsze pomijał.

**Przyczyna:** przy efektach trwających „do czegoś” wartość ma nie sam skutek,
tylko ILOŚĆ CZASU, przez którą skutek obowiązuje, i to, co przez ten czas
przeciwnikowi odbieramy. Ta sama akcja o tej samej cenie bywa warta wszystko
albo zero — zależnie wyłącznie od kroku tury.

**Reguła:** wyceniając efekt czasowy, zapytaj „do kiedy to działa i co
przeciwnik straci w tym oknie?”. Dla tapowania: untap step odkręca permanenty
AKTYWNEGO gracza (CR 502), więc tapnięcie w mojej turze żyje kilka chwil,
a tuż po jego untapie — całą jego turę I moją następną (nie zaatakuje
i nie zablokuje). Analogicznie działa reszta rodziny: „doesn't untap”,
prewencja obrażeń, pumpy „until end of turn”.

**Dwa haczyki, które wyszły dopiero przy wdrożeniu:**
1. Tapnięcie ZADEKLAROWANEGO atakującego nie cofa ataku (CR 506.4) — okno
   „w trakcie walki” wygląda na dobre, a jest prawie bezwartościowe.
2. Kara „nie rób tego w złym oknie” nie może dotyczyć akcji, których w dobrym
   oknie wykonać SIĘ NIE DA. Sorcery wolno rzucić tylko we własnej głównej
   fazie, więc kara zamieniłaby taką kartę w niegrywalną na zawsze. Zawsze
   sprawdź, czy „poczekaj na lepszy moment” jest w ogóle wykonalną radą —
   i rozstrzygaj to deskryptorem (`timing`, typ karty), nie nazwą (ADR 0002).


## L43 (2026-08-18) — Deskryptor „po nazwie pola” to heurystyka; do KASOWANIA obiektu potrzeba flagi jawnej

**Objaw:** reguła CR 704.5e („token poza polem bitwy przestaje istnieć”) napisana
po deskryptorze „token = obiekt z polem `name`” skasowała zwykłe KARTY. Testy
legalnie nadawały kartom `name` (np. `name: 'Forest'` dla landa w bibliotece),
bo żaden kontrakt tego nie zabraniał.

**Przyczyna:** „token ma `name`, karta z rejestru nie ma” to prawda
STATYSTYCZNA o dzisiejszym stanie danych, nie definicja. Wnioskowanie
„skoro pole jest wypełnione, to obiekt jest tej klasy” działa, dopóki ktoś nie
wypełni pola z innego powodu. Istniejące użycia (`delirium`, wybór karty
z grobu) były bezpieczne, bo tylko POMIJAŁY obiekt — koszt pomyłki to jedna
niepoliczona karta. Nowa reguła USUWAŁA obiekt z gry, więc ta sama pomyłka
kasowała czyjąś kartę.

**Reguła:** dobierz siłę deskryptora do siły skutku. Filtrowanie/pomijanie może
się opierać na heurystyce; TRWAŁE zniszczenie obiektu wymaga jawnego,
jednoźródłowego znacznika (`isToken` ustawiany wyłącznie w
`createBattlefieldToken`). To nadal reguła generyczna w duchu ADR 0002 —
deskryptorem jest klasa obiektu, nie nazwa karty.

**Skutek uboczny wart zapamiętania:** usunięcie obiektu z `state.objects`
zabiera triggerom dostęp do niego. Trigger „permanents you control leave the
battlefield” przestał widzieć odchodzące tokeny, bo szukał obiektu po id.
Naprawa: zdarzenie niesie LKI (CR 603.10), a trigger czyta je ze zdarzenia,
gdy obiektu już nie ma. Każda nowa reguła kasująca obiekty musi przejść przez
listę „kto o tym obiekcie jeszcze pyta”.

## L44 (2026-08-18) — Komentarz z numerem reguły nie jest dowodem; sprawdź źródło

**Objaw:** w silniku stało `// CR 701.38: goaded creatures can't block` w trzech
miejscach, wraz z testem utrwalającym to zachowanie („deklaracja odrzucona”).
Wyglądało na przemyślane i przetestowane. CR 701.38b mówi wyłącznie
o WYMOGACH ATAKU i wprost zaznacza, że goad nie jest zdolnością — o blokowaniu
nie ma tam ani słowa. Silnik odbierał obrońcy legalne bloki.

**Przyczyna:** raz zapisana błędna interpretacja zyskuje pozory prawdy przez
powtórzenie: komentarz cytuje numer reguły, test „potwierdza” zachowanie,
kolejne sesje traktują to jako obszar sprawdzony i go omijają. Test pilnował
wtedy nie ZGODNOŚCI Z ZASADAMI, tylko zgodności z pierwotnym błędem.

**Reguła:** kiedy kod ogranicza graczowi legalną akcję, przeczytaj treść reguły
u źródła, a nie sam numer w komentarzu. Szczególnie podejrzane są mechaniki
opisane jako „X nie może Y”, gdzie oryginał brzmi „X musi Z” — wymóg łatwo
przekształca się w pamięci w zakaz. Przy korekcie odwróć też test i dopisz
uzasadnienie, żeby następna sesja nie przywróciła błędu.

## L45 (2026-08-18) — Mgła wojny wycieka polami pobocznymi, nie tożsamością

**Objaw:** widok gracza sumiennie ukrywał `cardId` i linię typów zakrytego
permanentu (CR 708.2), a mimo to każdy z pięciu morphów w rejestrze dawał się
jednoznacznie rozpoznać — po `subtypes` („Bird”, „Human Wizard”) i po
deskryptorze `morph` niosącym koszt obrócenia oraz KOLORY karty.

**Przyczyna:** ukrywanie dodano punktowo, przy polu, które akurat wtedy
zdradzało za dużo. Każde następne pole dokładane do widoku (podtypy „bo bot
potrzebuje”, morph „bo etykieta przycisku”) omijało tę bramkę, bo bramka
pilnowała pojedynczych pól zamiast całej klasy informacji.

**Reguła:** ukrytą informację testuj przez NIEROZRÓŻNIALNOŚĆ, nie przez listę
zasłoniętych pól. Test regresyjny bierze wszystkie obiekty, które mają
wyglądać tak samo, liczy odcisk widoku każdego z nich i wymaga jednego
elementu w zbiorze. Taki test łapie każde przyszłe pole automatycznie — lista
pól łapie tylko te, o których ktoś pamiętał.

## L46 (2026-08-18) — Animacja „do końca tury" + trwały stan = cleanup musi resynchronizować

**Objaw:** Spacecraft Wedgelight Rammer (próg 9+ charge → stwór) ożywiony animacją Skilled Animator do 5/5, po 9 charge i końcu tury wracał do artefaktu mimo spełnionego progu. `clearStatModifiers` odtwarzał `originalBeforeAnimation` (rodzaj artefakt), ale nie sprawdzał, czy trwały warunek station nadal czyni go stworem.

**Przyczyna:** dwa współistniejące stany o różnej trwałości: animacja — efekt „until end of turn" (chwilowy, zapis `originalBeforeAnimation`), station — trwały stan permanentu (liczniki charge). Cleanup znał tylko pierwszy.

**Reguła:** gdy jedna encja ma zarówno efekt chwilowy (z zapisem cofnięcia), jak i trwały warunek (station, saga, liczniki), cleanup przywracający efekt chwilowy MUSI natychmiast przeliczyć trwały warunek. Inaczej trwały stan ginie razem z chwilowym, choć jego przyczyna (liczniki) nadal istnieje.

**Sygnał:** każdy `clearStatModifiers` / `removeCounter` / `addCounter` dotykający `kind`/`types` musi iść przez `syncStationKind`. Jeśli synchronizacja żyje tylko w `addCounter`, to każda ścieżka czyszcząca `originalBeforeAnimation` jest dziurą.

## L47 (2026-08-18) — Kopiowalne cechy to WSZYSTKIE drukowane deskryptory, nie tylko P/T

**Objaw:** token-kopia Wedgelight Rammer (Cogwork Assembler, CR 707.2) rodziła się jako artefakt bez progu 9+, nigdy nie stawała się stworem, choć kopia ma mieć wszystkie cechy oryginału. Ten sam wzorzec w `Jwari Shapeshifter` (enter as copy) — kopia traciła `station`/`saga`.

**Przyczyna:** kopiowanie zaimplementowano jako ręczne przepisanie pól (`kind`, `power`, `types`, …), ale lista pól rosła razem z mechanikami (station — M33, saga — M33), a kopiowanie nie nadążało. Brak pola nie wywala testu ani gry — token po prostu zachowuje się jak zwykły artefakt, więc błąd jest cichy.

**Reguła:** przy dodawaniu nowego deskryptora karty (station, saga, entersWithCounters, ...) zapytaj „czy kopiowanie go zachowuje?" i dopisz go w KAŻDEJ ścieżce kopiowania (`create_copy_token` w `effects.js`, `resolve_enter_as_copy` w `game-state.js`, `createBattlefieldToken` w `tokens.js`). Najbezpieczniej trzymać listę kopiowalnych pól w jednym miejscu (np. `copyableDescriptorKeys`) i testować, że token-kopia ma te same deskryptory co oryginał.

**Wykrycie:** fuzzer strukturalny nie złapie — token jest legalnym artefaktem, po prostu bez station. Potrzebny jest test semantyczny: „token-kopia ma ten sam `station`/`saga` co oryginał" (po deskryptorach, ADR 0002).

## L48 (2026-08-18) — Oferta vs walidacja muszą używać tego samego filtra (DEBT)

**Objaw:** bot w benchmarku wybierał biały czar na cel z `protection from white` (Benevolent Blessing), `legalSpellCasts` oferował go (filtrował tylko `isProtectedFromSource` dla jakości), a `validateTargets` odrzucał (sprawdzał także `effectiveProtectionFromColors` dla koloru) — crash `illegal_spell: protection`, a `aggro-bot` nie znał `resolve_color_choice`, więc drugi crash `Kontroler nie znalazł ruchu`.

**Przyczyna:** filtr ochrony ma dwie gałęzie: jakość (`isProtectedFromSource`) i kolor (`effectiveProtectionFromColors`). Oferta znała tylko pierwszą, walidacja obie. Dla czarów bez `sourceObject` (oferta) ochrona kolorowa była niewidoczna, więc legalne cele po stronie oferty zawierały chronione. To samo dla `aggro-bot`: lista `simple` z `resolve_*` rosła z nowymi mechanikami (`resolve_color_choice` — M59, `resolve_index_choice` — M64), ale bot nie nadążał.

**Dopisek 2 (M254, 2026-08-28) — to samo dotyczy ZDARZEŃ tej samej rodziny.**
`permanent_destroyed` (zniszczenie EFEKTEM: Murder, Spin Out) nie było w ogóle
w skanie triggerów „when this permanent leaves the battlefield\" — skan znał
`creature_destroyed` (śmierć z obrażeń), `permanent_sacrificed`, `object_moved`
i `object_exiled`. Wormfang Newt zniszczony czarem zostawiał wygnany ląd w
exile na zawsze, a zniszczony OBRAŻENIAMI oddawał go prawidłowo — ta sama
karta, dwa różne wyniki, zależnie od tego, jak umarła. Nowe zdarzenie z
rodziny musi trafić do KAŻDEGO skanu tej rodziny (tu: `dies`, `leaves_-
battlefield`, „permanents you control leave"), nie tylko do jednego.

**Reguła:** każdy nowy typ ochrony / nowy `pending*` musi trafić w TRZY miejsca naraz: (1) `legalTargetCandidates` (oferta, z `sourceObject`), (2) `validateTargets` (walidacja), (3) oba boty (`heuristic` ma fallback `anyResolve`, `aggro` ma listę `simple` + fallback). Rozjazd oferta/walidacja to gotowy crash w benchmarku — wykrywa go `tools/benchmark.mjs` z `maxCommands` i deterministycznym seedem.

**Sygnał:** gdy dodajesz nowy deskryptor ochrony lub nowy `resolve_*`, uruchom `node tools/benchmark.mjs --seeds 2` — jeśli bot rzuca `illegal_spell` lub `nie znalazł ruchu`, oferta jest niekompletna.

**Dopisek (M254, 2026-08-28) — ten sam filtr to za mało: musi zgadzać się też
KOLEJNOŚĆ bramek.** Pełna macierz benchmarku (`--full`) kończyła się wyjątkiem
„Bot wybrał nielegalną komendę: rebound_unresolved": gracz miał naraz
`pendingReboundCast` (Ojutai's Breath, CR 702.97) i `pendingUndercityRoute`
(M190/B). `execute` ma bramkę reboundu **przed** undercity, a `legalCommands`
gałąź reboundu **po** undercity — więc silnik oferował `resolve_undercity_route`
i sam go odrzucał (bramka reboundu odrzuca wszystko poza `resolve_rebound_cast`).
Żadna z kart nie była nowa: zmiana talii tylko sprawiła, że kolizja wyszła
w próbce. Reguła dopisana przy `firstPendingDecisionPlayerId` brzmi teraz
wprost: **pierwszy właściciel decyzji = pierwsza bramka `execute` = pierwsza
gałąź ofert** — przy każdym nowym `pending*` dopisz go w tych trzech miejscach
w tej samej kolejności (`test/m254-kolejnosc-pendingow.test.js` czerwieni
rozjazd).

## L49 (2026-08-18) — Plik startowy musi kazać CZYTAĆ ADR-y zanim agent odezwie się w czacie

**Objaw:** nowa sesja, zamiast wykonać ADR 0020 (PR → audyt poprzedniego PR →
praca), zapytała właściciela „co robimy?”. ADR 0020, AGENTS i lekcje już
istniały. Agent ich nie przeczytał.

**Przyczyna (projekt dokumentacji, nie brak reguły):**
- jedyny plik, który runner wczytuje zawsze (`AGENTS.md`), zaczynał od trybu
  sesji, ale **listę lektur** chował niżej i ustawiał ADR-y jako punkt 8
  („właściwe ADR-y obszaru”) — więc dało się „przeczytać AGENTS” bez otwarcia
  0020;
- `PROJECT_STATE.md` i handoff były wyżej niż rejestr decyzji, więc agent
  szedł w stan projektu i w ankietę, zamiast w obowiązującą procedurę;
- grzecznościowe „pytaj, jeśli nie wiesz” w prompcie wypełniało lukę
  lektury.

**Reguła:** `AGENTS.md` jest jedynym plikiem startowym niezależnym od
wiadomości w czacie. Jego **pierwsza** sekcja to obowiązkowa lektura:
ten plik → **wszystkie** ADR-y → LESSONS → ENVIRONMENT. Potem dopiero
stan projektu. Co robić jest w ADR 0020, nie w pytaniu do właściciela.

**Sformalizowane w:** nagłówek `AGENTS.md` §0, wskaźnik w `README.md`.

## L52 (2026-08-20) — Ścieżka mechaniki zależna od przyszłych kart: zaimplementuj i zasygnalizuj, nie odnotuj

**Objaw:** audyt PR #66 zostawił dwie obserwacje „bez zmian kodu":
`resolve_madness_cast` wołał bezwarunkowo `castPermanent` (pierwsza karta
instant z madness dostalaby reject), a bramka kolorów sprawdzała pipy
KARTY zamiast kolorów kosztu madness (dziś tożsame dla Revolutionista).
Obie były zapisane wyłącznie w raporcie audytu — wiedza o nich nie
przetrwałaby dłużej niż pamięć o pliku `docs/audits/AUDYT_PR66_*`.

**Przyczyna (decyzja właściciela 2026-08-20, nadająca regułę trwałą):**
audyt interpretował ADR 0001 („nie budujemy spekulatywnie") jako
"nie implementujemy, dopóki karta nie przyjdzie". Właściciel rozstrzygnął
odwrotnie dla KODU MECHANIKI: nie zostawiamy takich sytuacji nieobsłużonych
— przygotowujemy kod zdolności na sytuację, gdy takie karty się pojawią.
Ścieżka może być dziś martwa (bo nie występuje karta, która ją obsługuje),
ale musi być zasygnalizowana, żeby w przyszłości o niej nie zapomnieć.
ADR 0001 nadal obowiązuje dla KATALOGU: karty nie dodajemy spekulatywnie.

**Reguła:** gdy audyt/realizacja odkryje lukę mechaniki ujawnioną dopiero
przez hipotetyczną kartę:
1. **implementuj generycznie** (routing po `kind`/deskryptorach, bramki wg
   AKTYWNEGO kosztu — jak altCostColors w `castPermanent`), bez specjalnych
   przypadków po nazwie karty (ADR 0002);
2. **wyprowadź ścieżkę na powierzchnię we wszystkich warstwach** — engine,
   oferta playerView (L48), etykieta UI (cel musi być nazwany), boty;
3. **zasygnalizuj granice zakresu JAWNYM rejectem** (czytelny powód), nie
   cichym obejściem;
4. **daj strażnika, który czerwienieje w dniu wejścia pierwszej takiej
   karty** (test katalogowy z instrukcją w komunikacie asercji) + testy
   ścieżki na obiektach syntetycznych (RED→GREEN).

**Sygnał:** fraza w raporcie audytu „pierwsza karta X będzie wymagała Y"
to zadanie na TERAZ dla kodu mechaniki — nie wpis do zapomnienia.

**Sformalizowane w:** M161 (routing madness po kind, `castMadnessSpell`,
strażnik katalogu w `test/m161-madness-spell-path.test.js`).

## L56 (2026-08-23) — Twierdzenie o danych sprawdzasz GREPEM, zanim je zapiszesz

**Objaw:** M196 ogłosiło „nowy plan w katalogu: Kamigawa". Właściciel: *„Jesteś
pewien? Ja widzę w CSV takie karty z tego planu: Blade-Blizzard Kitsune, Kappa
Tech-Wrecker, Greater Tanuki…"*. Plan istniał od dawna — nowa karta była jego
czwartą, nie pierwszą.

**Dlaczego to groźne:** nieprawda nie została w czacie. Poszła do
`PROJECT_STATE.md`, do planu sesji, do komunikatu commita **i do asercji
testu** (`assert.equal(card.plan, 'Kamigawa', 'NOWY plan w katalogu')`), gdzie
zielony test zaczął ją uwiarygodniać. Test potwierdzał wartość pola, a
komentarz przy nim kłamał o kontekście — to L1 przeniesione do dokumentacji.

**Reguła:**
1. Zdanie o stanie danych („nowy plan", „pierwsza taka karta", „jedyny
   przypadek") wymaga **komendy przed zapisem** — `grep` po katalogu i po
   źródłowym CSV/arkuszu. Koszt: 5 sekund.
2. Jeśli takie zdanie ma trafić do repo, dostaje **strażnika**, nie samą
   korektę: `test/m197-plany-kolekcji.test.js` skanuje dokumenty i czerwienieje,
   gdy „nowym" nazwano plan, który repozytorium już zna.
3. Strażnik z **wyjątkiem opartym o słowo kluczowe jest dziurawy**. Pierwsza
   wersja zwalniała linie zawierające „sprostowanie" — mutacja pokazała, że
   wystarczy postawić błędne zdanie obok tego słowa i kontrola znika.
   Zwolnienie musi być **jawnym, nieprzypadkowym markerem** (`<!-- plan-cytat -->`).

**Powiązane:** ten sam audyt ujawnił, że plany 8 kart były **zgadnięte po
secie** zamiast odczytane z arkusza (Lab Rats „Rath", Deadly Recluse „Core",
Ballista Watcher „Innistrad"…). Sygnał do wychwycenia: **wartość występująca
wyłącznie po jednej stronie** dwóch reprezentacji tych samych danych (plany
`Rath`/`Core`/`Commander`/`Modern Horizons`/`Phyrexia` istniały tylko
w katalogu, nigdy w arkuszu) — to prawie zawsze zgadywanka, nie dana. L23 mówi
„porównuj maszynowo"; L56 dodaje: **rozkład wartości też jest sygnałem**.

**Wariant „brak danych" (ta sama sesja, trzeci zarzut właściciela):** 21 kart
miało `artId: null`, choć słownik znał ich numery. Strażnik ich nie widział, bo
filtrował `card.artId != null` — sprawdzał WYŁĄCZNIE rekordy, które już mają
dane. To L23 w czystej postaci. **Reguła:** strażnik zgodności dwóch
reprezentacji potrzebuje bliźniaka na OBECNOŚĆ: „skoro źródło zna wartość,
katalog nie może mieć `null`". Skutek bywa niewidoczny w testach, a dotkliwy
dla gracza — tu karty bez `artId` znikały z torów podglądu FOT/KON.

**Wariant „pole zapisane dwa razy":** 11 definicji miało `plan: null` w linii
z `artId` i właściwy `plan` linijkę niżej. Działało, bo w literalu JS wygrywa
ostatnia wartość — ale przestawienie linii cicho zmieniłoby dane. Duplikat pola
w literalu to zawsze mina; wart osobnego strażnika.

**Sformalizowane w:** M197 (`test/m197-plany-kolekcji.test.js` — strażnik
dokumentacji, higieny słownika, spójności plan katalog↔druk, OBECNOŚCI artId
oraz braku zdublowanych pól w definicjach).
