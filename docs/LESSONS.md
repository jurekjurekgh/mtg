# Lekcje projektowe (trwały rejestr)

Powtarzalne wnioski z pracy nad projektem — to, co kolejna sesja ma wiedzieć,
zanim popełni ten sam błąd.

| Dokument | Zakres | Trwałość |
|---|---|---|
| `docs/setup/HANDOFF_*.md` | stan JEDNEJ sesji | jednorazowy |
| `docs/plans/PLAN_*.md` | roadmapa JEDNEGO zadania | jednorazowy |
| `docs/PROJECT_HISTORY.md` | dziennik sesji | żywy, **NIE** jest lekturą startową |
| `docs/decisions/*.md` (ADR) | wiążąca decyzja architektoniczna | trwała, formalna |
| `docs/LESSONS_PRZYPADKI.md` | narracja przypadków (Objaw/Przyczyna) | trwałe archiwum, **NIE** lektura startowa |
| **`docs/LESSONS.md`** | **wniosek / heurystyka diagnostyczna** | **trwała, nieformalna** |

Rejestr podaje REGUŁĘ i STRAŻNIKA; pełna narracja (Objaw/Przyczyna) wpisów
skondensowanych w PR #93 mieszka w `docs/LESSONS_PRZYPADKI.md` pod tym
samym numerem — szukać grepem, nie czytać na starcie.

Rejestr podaje REGUŁĘ i STRAŻNIKA; pełna narracja (Objaw/Przyczyna) wpisów
skondensowanych w PR #93 mieszka w `docs/LESSONS_PRZYPADKI.md` pod tym
samym numerem — szukać grepem, nie czytać na starcie.

Lekcja idzie tu, gdy jest powtarzalna, ale NIE jest decyzją architektoniczną
(te → ADR). Wymusza zmianę sposobu pracy? Dopisz ją też do `AGENTS.md`.
Ustala granicę komponentów? ADR + tu odsyłacz. Lekcji nie kasujemy:
nieaktualną oznaczamy z odsyłaczem do nowszej.

**Wzorzec wpisu (obowiązkowy, bez ozdobników):**

```
## LN (YYYY-MM-DD) — reguła w jednym zdaniu

**Przypadek:** JEDNO zdanie z konkretami (karta, test, numer CR) — po nim
poznaje się klasę w nowym przebraniu.
**Reguła:** 1–4 punkty, imperatyw.
**Strażnik:** `plik/funkcja` — co czerwienieje po cofnięciu naprawy.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (LN)
```

W rejestrze nie ma osobnych pól **Objaw** i **Przyczyna** — to proza, więc idzie
do archiwum pod tym samym numerem (pilnuje tego `test/docs-decisions.test.js`:
odsyłacz musi mieć adresata, a wpis — regułę lub strażnika).

Wpis niesie FAKTY (nazwy plików, testów, kart, numery CR) i regułę — nie
narrację (ta zostaje w `docs/audits/`). Rejestr to największa pozycja budżetu lektury
startowej (~113 kB z ~240 kB po kondensacji PR #93) (`test/dokumentacja-budzet-lektury.test.js`, 100k tokenów), więc nowy
wpis płaci się skróceniem innego — progu NIE podnosimy. L15–L19 są datowane po
numerze kamienia milowego (M102/M103 = 2026-08-16 wg `PROJECT_HISTORY.md`):
oryginalne daty zaginęły przy migracji M208.

## Wpisy zbiorcze (mapa klas)

Kilka lekcji opisywało tę samą klasę z różnych stron; M275 zebrał je we **wpisy
zbiorcze**: pełna klasa, tabela wariantów i reguła w jednym miejscu, a reszta
numerów zostaje jako **kotwice** (krótki przypadek + odsyłacz). Numery są cytowane
w kodzie ~1150 razy, więc **żaden nie znika**; narrację najdłuższych przypadków
wynosimy do `docs/LESSONS_PRZYPADKI.md`.

| Klasa | Wpis główny | Kotwice |
|---|---|---|
| Jawna lista pól gubi dane po cichu (fabryka → generator → transport → widok) | **L21** | L93, L94, L101 |
| Weryfikacja mutacyjna: jedyny dowód, że test/detektor działa | **L13** | L61, L70, L114 |
| Strażnik mierzy regułę, nie tekst źródła | **L5** | L26, L31, L44, L83 |
| Zero zgłoszeń detektorów to pomiar narzędzia | **L27** | L40, L73, L75 |
| Oferta i walidacja: jeden filtr, porządek i rejestr | **L48** | L90 |
| Choke point istnieje, ale ścieżka go omija | **L107** | L109, L110, L112, L113 |

**Zasada scalania:** wpisy łączymy, gdy opisują JEDNĄ klasę — nigdy dlatego, że
są stare. Lekcji nie kasujemy i nie skracamy o fakty (karta, test, numer CR);
usuwamy wyłącznie powtórzoną regułę, zastępując ją odsyłaczem. Stara lekcja
bywa cenniejsza od nowej, bo jej klasa zdążyła wrócić kilka razy.

---

## L107 (2026-08-31) — Najbogatsza żyła błędów: ścieżka robiąca to samo co helper, ale RĘCZNIE. Grep po mutacji pola, nie po nazwie mechaniki

**Przypadek:** silnik ma choke pointy (`addCounter`, `addPoisonCounters`, `deathZoneFor`, `untapObject`, `moveObjectDirectly`), a obok żyją ścieżki robiące to samo własnym kodem: `player.poison += 1`, ręcznie złożone `counters`, `'graveyard'` na sztywno, `tapped: false` przez `Object.freeze`, mutacja…

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

**Przypadek (M269):** po „Creatures you control get +2/+2 until end of turn"
kradzież stwora kasowała bonus (4/6 → 2/4), a buff ujemny po przejęciu leczył
— `untilEndOfTurnBonuses` miało DWA filtry tej samej przynależności (zamrożony
`objectIds` i starszy `object.controllerId`), więc żaden test nie świecił,
póki się zgadzały (CR 611.2c: zbiór ustala się RAZ). Pełny opis:
`docs/LESSONS_PRZYPADKI.md`, sekcja „L106".

**Reguła:** (1) Dokładając precyzyjniejsze kryterium, USUŃ stare — dwa filtry
tej samej przynależności to jeden za dużo. (2) Redundancja jest niewidoczna,
póki kryteria się zgadzają; testu szukaj tam, gdzie się rozjeżdżają (zmiana
kontroli, typu, strefy).
## L105 (2026-08-31) — „Dziś to ryzyko, nie błąd" trzeba ZWERYFIKOWAĆ skanem, a nie założyć; sklejka pipów OBOK kwoty zawyża cenę

**Przypadek:** handoff M267 odnotował, że etykiety `bestow`/`morph` składają koszt po staremu, ale „dziś ich koszty są generyczne, więc to ryzyko, nie błąd". to samo co L100/4 — powtórzona składanka „generic + pipy", tylko groźniejsza.

**Reguła:**
1. „Dziś to tylko ryzyko" jest HIPOTEZĄ o danych — zamyka się ją skanem
   katalogu w tej samej sesji, nie wpisem w handoffie.
2. Pipy kolorów wchodzą W RAMACH kwoty (`{3}{G}` = 4 many), nigdy obok.
   Jedyne źródło to `costSymbols(amount, colors)`; strażnik regexem szuka
   sklejek `.colors ?? []).map(...).join('')` w `render.js`.
3. Rodzinę alt-kosztów enumeruj Z NAZWY (bestow, plot, suspend, madness, warp,
   surge, kicker, flashback, buyback, escape, cleave, adventure, morph) — skan
   po jednej mechanice zamyka jeden przypadek.
4. Morph jest w tej rodzinie WYJĄTKIEM: ma dwa koszty (`cost` = rzut
   zakryty, zawsze {3} bezbarwnych wg CR 702.37a; `morphCost`/
   `megamorphCost` = odkrycie, tu żyją pipy). Skaner porównujący Oracle
   z polem `cost` da 6 fałszywych trafień — porównuj koszt ODKRYCIA.

**Strażnik:** `test/m268-alt-koszt-pelna-rodzina.test.js` (11 testów: skan
katalogu po 14 mechanikach, piny bestow/plot/morph/kicker, test ŹRÓDŁA
płatności, strażnik regexowy przeciw kolejnym sklejkom). Mutacje: `colors`
z normalizacji bestow → 4 RED; `coloredPipsOf(cardId)` w bestow → 1 RED;
pipy obok kwoty w morph → 1 RED.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L105)

## L104 (2026-08-31) — Poprawny wynik z niepoprawnego źródła to bug uśpiony: alt-koszt musi nieść WŁASNE pipy, nie pożyczać ich z kosztu bazowego

**Przypadek:** panel pokazywał „Rzuć z Cleave: Lunar Rejection (koszt 4)" i „Ucieczka: Sweet Oblivion (koszt 4)", a Oracle mówi „Cleave {3}{U}" i „Escape {3}{U}". `colors` w ogóle nie istniało w definicjach trzech kart z cleave/escape, a normalizacja w `registry.js` i tak by je ucięła: jawna lista pól…

**Reguła:**
1. Alternatywny koszt (cleave, escape, madness, suspend, plot, bestow) to
   OSOBNA cena — jego pipy należą do jego deskryptora. Czytanie kolorów
   z kosztu bazowego jest błędem nawet gdy dziś daje dobry wynik: pierwsza
   karta o innym kolorze alt-kosztu złamie płatność (CR 601.2b). Wzorzec
   zrobiony dobrze: madness (M161/O2).
2. „Testy zielone" nie zamyka pytania o ŹRÓDŁO. Gdy poprawność wynika ze
   zbiegu okoliczności w danych, strażnik pinuje źródło, nie tylko wynik —
   inaczej regres przyjdzie z nową kartą, nie ze zmianą kodu.
3. Dokładając pole do deskryptora karty, przejdź WSZYSTKIE kopie jawnej listy
   pól (L101); normalizacja w `registry.js` jest czwartą i najłatwiej o niej
   zapomnieć. Sygnał: pole widać w `card-data.js`, a `REGISTRY.get(id)` nie.
4. Strażnik porównuje Oracle z definicją (regex po pipach) dla CAŁEGO
   katalogu, nie dla zgłoszonej karty.

**Strażnik:** `test/m267-alt-koszt-kolory.test.js` (5 testów, w tym skan
katalogu i test ŹRÓDŁA płatności czytający `spells.js`). Mutacje: usunięcie
`colors` z normalizacji `registry.js` → testy 1–3; powrót do
`coloredPipsOf(object.cardId)` w ścieżce cleave/escape → test 5.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L104)

## L103 (2026-08-31) — Skrót „na 1v1" w modelu karty zmienia REGUŁY: brak słowa „target" w Oracle ⇒ brak `targets`, zakres należy do efektu

**Przypadek:** log pisał „Nieprzyjaciel rzuca Liliana's Triumph → cel: Ty", a Oracle brzmi „Each opponent sacrifices a creature of their choice" — bez słowa „target". M203/2 zamodelował „każdy przeciwnik" jako `targets: [{ type: 'player', opponent: true }]`. W 1v1 wskazuje to zawsze tę samą osobę, więc wyglądało…

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
4. Strażnik KLASOWY: skan katalogu sprawdza implikację „brak słowa target
   w Oracle ⇒ brak `targets`". Pin na jedną kartę uśpiłby klasę — bliźniaki
   (Dreams of Steel and Oil: poprawne, ma „Target opponent") wyglądają
   identycznie w kodzie i różnią się TYLKO Oracle.

**Strażnik:** `test/m266-zgloszenia-wlasciciela.test.js` (skan katalogu, dziś
0 naruszeń). Mutacja: przywrócenie `targets` Liliana's Triumph → 4 RED.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L103)

## L102 (2026-08-31) — Rodzina ofert dzieli WYCENĘ i WIDOK: nowy członek bez pinu odziedziczy stary błąd; skutek niewidoczny w odcisku to fałszywy no-op

**Przypadek:** `theros` vs `worek-basni` seed 332 — bot rzucił Sleep of the Dead (tap + „doesn't untap") we WŁASNEGO Blade-Blizzard Kitsune, który miał atakować, płacąc za to {1}. 2. Rodzina „darmowych rzutów" (suspend / rebound / madness / grave-free-cast) enumeruje ofertę PER ZESTAW CELÓW. M212/Z7 dołożył…

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

**Przypadek:** modal „Rozgrywka" pisał „Zoraline, Cosmos Caller — zapłacić {2} i 2 życia?", a przycisk decyzji tuż pod nim „Zapłać {W}{B} + 2 życia — efekt odpali". dwie warstwy prezentacji czytają z DWÓCH różnych źródeł. Przycisk bierze koszt z `playerView` (`costColors` z `trigger.payColors` —…

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
   `ward_choice_required` renderowały koszt jako gołe `{N}`.
   **DOMKNIĘTE w M266/E.** Skan katalogu pokazał, że dla MADNESS ta karta już
   istniała (Terminal Agony {B}{R}, Revolutionist {3}{R}) — log pisał „rzuć za
   {2}", cenę niemożliwą do zapłacenia. Naprawa nie dołożyła trzeciej kopii
   składanki: `costSymbols(amount, colors)` (`src/table/mana-icons.js`) jest
   JEDYNYM źródłem dla obu warstw, a `madness_ready_required` i komendy
   `resolve_madness_cast`/`resolve_pay_or_sacrifice` niosą `costColors`.
   Strażnik: `test/m266-koszt-pipy.test.js` (5). Wniosek: „dziś to prawda"
   w ostrzeżeniu o rodzeństwie weryfikuj od razu SKANEM KATALOGU — błąd
   zwykle już jest w grze.

**Strażnik:** `test/m265-optional-pay-colored-cost.test.js` (5 testów).
Mutacje: usunięcie `payColors` ze zdarzenia (`triggers.js`) → testy 1, 2, 5;
uproszczenie opisu do `{${e.payMana}}` (`session.js`) → testy 2, 3.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L100)

## L99 (2026-08-31) — Fix wdrożony w dwóch warstwach potrzebuje pinu w OBU; test warstwy tekstu nie chroni warstwy obrazu

**Przypadek:** M264 zamknął wyciek nazwy zakrytej karty przy `trigger_resolved` w DWÓCH miejscach `src/table/session.js` — w opisie tekstowym (`objectOrLki`) i w bramce SKANU karty (`hiddenLive` w `noteBotMove`).

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

**Przypadek:** modal „Rozgrywka" doklejał „Tura N — Ty" + „Dobierasz…" do ogona tury bota (rozstrzygnięty Divest, discardy z cleanup, obrażenia z walki) w jednym oknie — bufor ruchów narastał między pauzami bez świadomości, że przekroczył granicę tury.

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L98)

## L97 (2026-08-31) — Warstwa prezentacji potrafi skłamać przy w 100% poprawnym silniku; decyzja „you may look” nie może wyciekać treści przed wyborem

**Przypadek:** trzy zgłoszenia do Fertile Thicket, przy których SILNIK był bezbłędny (skip/`chosenCardId:null`/ `bottomOrder` — pełny Oracle, walidacja permutacji działała). `commandLabel` liczy etykietę z SAMEJ komendy i nie wie, czym komenda jest w kontekście decyzji; etykiety powstawały „na oko” bez…

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L97)

## L96 (2026-08-30) — Snapshotty Scryfall w repo = darmowy masowy audyt danych kart; audytuj po registry.all(), nie po nazwie eksportu

**Przypadek:** 7 błędów vs zasady w katalogu kart (Instant zamiast Sorcery ×2, MV bez symboli phyrexian, złe subtypy ×2, koszt craft/echo bez pipów kolorowych) — po ~15 audytach PR i wielu bug-huntach.

**Reguła:** przy jakimkolwiek przeglądzie kart — najpierw automatyczne
diffowanie pól ze snapshotami (one już są w repo dla 155+ kart), potem
czytanie semantyczne tylko miejsc z rozbiejnością lub z mechaniką;
zawsze po całym rejestru. A gdy konwencja deskryptora się zmienia
(tu: manaCost = pełne MV), strażnik zgodności z MANA_COSTS musi znać
NOWĄ konwencję i zapaść razem z nią (aktualizacja testu-strażnika to
część fixu, nie opcja).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L96)

## L95 (2026-08-30) — Nowa decyzja blokująca to NIE handler: checklista ~10 punktów integracji; pierwsze redy testów to brakujące REJESTRY

**Przypadek:** mechanika resolve_ward_pay_choice działała regułowo po napisaniu handlera w game-state.js — a testy W2 padały na `invalid_command` (COMMAND_TYPES), potem na wyjątek w event() (EVENT_TYPES).

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

**Przypadek:** README mówił „3735/3735 testów, 2894.7 kB" — to stan sprzed 8 etapów TEGO SAMEGO PR-a (naprawa D1 z audytu PR #87 weszła w etapie 1, potem etapy 3–10 dołożyły 76 testów i 39 kB).

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

**Przypadek:** `node tools/benchmark.mjs --full` kończył się „Kontroler nie znalazł ruchu mimo legalnych komend" — bez meczu, bez stanu. reguła M172/C „pass nie domknie kroku obrażeń" żyła w DWÓCH kopiach — `execute` (odrzucenie `combat_unresolved`) i budowa oferty (`blockedByCombat`) — i obie blokowały pass…

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

**Przypadek:** transkrypt `worek-mroczny vs theros` (seed 47): „Kulrath Mystic — trigger (rzucenie czaru)" + „trigger bez efektu (nie było czego wykonać)", a na stole w tej samej turze: „Kulrath Mystic · Czujność · +2/+0 · 4/4".

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

**Przypadek:** „Rzuciłem czar, a akcja poszła dalej i zaczęła się następna tura i nieprzyjaciel rzucił czar i pokazał się ekran z grafikami tego ostatniego czaru nieprzyjaciela, a mojego w ogóle nie było pokazanego." Warstwa otwierała się z obserwatora `onCast`, ale pętla `advance()` leciała dalej — w jednej…

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L86)

## L85 (2026-08-28) — `eventData.manaCost` to mana WYDATKOWANA, nie mana value karty

**Przypadek:** warunek `spellManaValueAtLeast: 4` czytał `eventData.manaCost` zdarzenia `permanent_cast`: przepuszczał czar z obniżką (MV 5 zapłacone {3}) i odrzucał czar bez obniżki przy koszcie alternatywnym.

**Reguła:** warunek na mana value czyta OBIEKT. Przy dopisywaniu warunku do
triggera sprawdź, czy dane wejściowe to „wartość z karty" czy „wynik
rozliczenia" — w zdarzeniach silnika prawie zawsze to drugie.

**Strażnik:** `conditionHolds` (`src/engine/triggers.js`, wpis
`spellManaValueAtLeast`), testy „MV 4 odpala / MV 1 nie" w
`test/batch51-kart.test.js`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L85)

## L84 (2026-08-28) — Nowy deskryptor mechaniki ma cztery dowiązania poza silnikiem: strażniki zgłaszają je osobno, więc dopisz je od razu

**Przypadek:** po dodaniu trzech elementów (`buff_attacking_creatures`, `buff_creature_until_end_of_turn`, zdarzenie `creature_became_renowned`) pełny `npm test` pokazał PIĘĆ czerwonych testów, z czego cztery nie dotyczyły mechaniki, tylko jej OTOCZENIA: brak etykiety PL (strażnik M122), brak wyceny bota (M157)…

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

**Przypadek:** poprawna etykieta „Użyj domyślnego przydziału (zabójcze obrażenia…)" złamała test `choice-request-ui` — test lokalizował przycisk po TEKŚCIE (`findAll(host, 'button', 'Domyślnie')`), nie po klasie `damage-wizard-default`. Copy poprawne + logika poprawna = test czerwony.

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

**Przypadek:** bramka oferty `pass_priority` dostała `firstDecisionOwner == null` (dokończenie unifikacji z Batch 47). unifikując N kopii (L41) porównałem PRZEDMIOTY list (61 pól ręcznego łańcucha ⊆ 62 funkcji), ale nie SEMANTYKĘ pozycji.

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

**Przypadek:** bot aktywował Saddle na Trained Arynx (`set_saddled`, idempotentny do EOT) 3× w jednej turze, tapując kolejne stwory za nic — mimo że `set_saddled` był w `IDEMPOTENT_EOT_EFFECTS`..

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

**Przypadek:** `docs/LESSONS.md` (1930 linii) i część ADR-ów zostały obejrzane we fragmentach (kilka najnowszych lekcji + nagłówki), bo narzędzie czytające zwracało pliki z ucięciem (`truncated`/`hasMore`).

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

**Przypadek:** **Devour** (Gorger Wurm, CR 702.82a): trigger ETB (Impact Tremors) odpalał w tym samym przebiegu skanu, w którym do kolejki trafiała decyzja devour — widział stwora PRZED licznikami.

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

**Przypadek:** naprawa wyceny darmowego rzutu wyglądała na działającą (testy zielone), a była martwa: helper szukał opisu czaru po `cmd.cardId` w `view.zones.exile` i zawsze dostawał `undefined`, więc kara za zły cel wynosiła 0 — tyle samo co przed naprawą.

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

**Przypadek:** sonda sprawdzająca, czy obrażenia z delirium respektują `protection from red`, wypisała „OK — brak obrażeń". sonda mierzyła STAN KOŃCOWY (`damage === 0`), nie sprawdzając, czy badana ścieżka w ogóle pobiegła.

**Reguła:** sonda silnika NAJPIERW asertuje, że komenda przeszła
(`assert.equal(result.ok, true)`), potem bada skutek; gdy ma udowodnić BŁĄD,
pokazuje stan pośredni (zdarzenie, licznik, zmiana pola). To samo w testach:
`ok` komendy jest częścią asercji, nie tłem (L13/L61).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L68)

## L69 (2026-08-25) — Dane karty i mechanika to dwa źródła prawdy o tym samym: kolor vs. produkowana mana

**Przypadek:** podstawowe landy miały `colors: ['R']` — pole „kolor" zapisano jako „jaką manę produkuje". dwa pojęcia w jednym polu, bo dla landu „czarny" brzmi tak samo w obu znaczeniach.

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

**Przypadek:** sweep Żywego Testera zaraportował `srodziemie vs ravnica s=7` jako `[STOP] brak akcji w kroku 59`, choć w tej samej linii stało „Koniec partii — wygrywa Bot". `run-game.mjs` miał helper `isGameOver()` z komentarzem opisującym ten przypadek („panel akcji jest wtedy pusty prawidłowo"), wołany w dwóch…

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

**Przypadek:** lektura startowa z `AGENTS.md` §0 ważyła ~605 kB (~194-258 tys. tokenów), z czego **384 kB to `PROJECT_STATE.md`** — „bieżący stan projektu" urósł do 125 sekcji i 5904 linii (~80 sesji wstecz).

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

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L66)

## L65 (2026-08-25) — Test, który przechodzi na przypadku odsianym przez WCZEŚNIEJSZY warunek, nie testuje tego warunku

**Przypadek:** `targetSlotsOf` ma dwie bramki: (1) warianty równej długości, (2) pozycje nie dzielą kandydatów. oba przypadki mają warianty RÓŻNEJ długości (`sizes = [1, 2]`), więc odpadały na bramce (1) i nigdy nie docierały do (2).

**Reguła:** pisząc test na warunek, sprawdź, czy przypadek do niego DOCIERA —
najprościej mutacją (skasuj warunek; zielone = przypadek odsiewany wcześniej).
Dla łańcucha bramek dobierz dane przechodzące wszystkie poprzednie i różnicujące
wyłącznie badaną (tu: czar o STAŁEJ arności 2 z jednej puli). „Mutacja
przeżyła" znaczy „mam lukę w danych", nie „mutacja jest równoważna".

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L65)

## L63 (2026-08-25) — Selektor sterownika, który nie pasuje do niczego, nie daje błędu — daje CICHĄ PĘTLĘ i fałszywe „brak zgłoszeń"

**Przypadek:** przebiegi Żywego Testera na części seedów nie kończyły się w limicie kroków: 300 identycznych linii o tym samym oknie, zero ruchów — i pogodne `== DETEKTORY: brak zgłoszeń ==`..

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

**Przypadek:** bot aktywował pump „+2/+2 do końca tury" w kroku *Początek walki* i nie atakował (dwie many na efekt wygasający w cleanup); powtarzał to co turę. Warunek: `view.turn.phase === 'combat'`, a komentarz nad nim mówił „pump ma sens po deklaracji atakujących/blokujących".

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

**Przypadek:** kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie `#log` po indeksie" — wg handoffu) znajdował 0 wpisów, choć sesja je generowała i `session.log` je miał. `render.js` rysuje log od NAJNOWSZEGO (`[...session.log].reverse()`), więc nowe wpisy dokładają się na POCZĄTKU listy DOM; pętla `for…

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

**Przypadek:** **N1.** Powerstone: „{T}: Add {C}. This mana can't be spent **to cast a nonartifact spell**". regułę „czego NIE wolno" zakodowano jako „co wolno", a katalog ścieżek decydujących o niej nie był znany w jednym miejscu (ograniczenie many: ~25 miejsc liczących budżet w spells/resources/abilities/…

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

**Przypadek:** w `scoreCommand` heuristic-bota została instrumentacja `if (process.env.BOT_DEBUG_SCORES && cmd.objectId === 'slaad') console.error(…)`. Testy 3023/3023, CI zielone, PR scalony — a w artefakcie (`dist/mtg-table.html`, ADR 0011) ta linia wywala `ReferenceError: process is not defined` przy PIERWSZEJ…

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

**Przypadek:** właściciel: „bot wszedł do Forge i wzmacnia MÓJ stwór — to bez sensu, powinien fizzle, gdy nie ma [własnej] kreatury". zgłoszenie z rozgrywki opisuje SYMPTOM z perspektywy gracza, nie regułę. Zgoda właściciela na zgłoszenie ≠ weryfikacja regułowa (ADR 0022/0002: silnik jest autorytetem…

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

**Przypadek:** **M187/N1** — token Phyrexian Mite („This token can't block") zaczynał legalnie blokować po pierwszym cleanupie: `cantBlock` niosło EFEKT „can't block this turn" (Panic Spellbomb, ma wygasać — CR 514.2) i cechę WYDRUKOWANĄ tokenu.

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

**Przypadek:** klasa L50 po raz szósty (M96, M135, M138/Z1, M146, M156/F1, M156/Q1+Q2): bot obdarowywał lifelink+indestructible stwora PRZECIWNIKA (Lotusguard), rzucał prewencję „any target" we wroga (Withstand), przekazywał liczniki +1/+1 najsłabszemu własnemu stworowi (Servant of the Scale).

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

**Przypadek:** dwie karty Batch 35 weszły z martwą wyceną: bot aktywował Basilisk Gate ({2},{T}: +X/+X) na stwora PRZECIWNIKA i rzucał Twiddle na górę wroga w swoim upkeepie (audyt Żywym Testerem M146) — testy engine zielone.

**Reguła:** przy nowym typie efektu sprawdź wycenę w OBU ścieżkach
(`cast_spell`, `activate_ability`); sonda: grep typu w
`src/controllers/heuristic-bot.js` przed merge. Audyt Żywym Testerem po batchu
z nowymi mechanikami obejmuje partie, gdzie BOT ma te karty.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L50)

## L1 (2026-08-14) — „Bot robi coś głupiego" bywa ślepotą, nie głupotą

**Przypadek:** bot pompował liczniki Station bez końca (M84), celował zdolnością w nielegalne obiekty (M82), rzucił Inspire Awe i atakował we własną prewencję (M91). `PlayerView` nie niosło danych potrzebnych do decyzji.

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

**Wpis zbiorczy.** Numery L26, L31, L44 i L83 zostają jako kotwice i odsyłają tutaj.

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
5. Testy UI renderują i sprawdzają WYNIK (drzewo elementów, reakcja na
   zdarzenie), nie obecność napisów w pliku.
6. Pytanie kontrolne do każdego strażnika: **czy da się przejść tę kontrolę bez
   zmiany kodu?** Jeśli tak — mierzy tekst. Obowiązuje też wobec strażników,
   które sam piszesz, i to w dniu ich powstania (`repo-artefakty-audytu`
   sprawdzał `.gitignore` przez `includes`, a komentarz cytował regułę
   dosłownie — usunięcie reguły zostawiało zielono).

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

**Przypadek:** (a) handoff twierdził, że pięć fixów przepadło z workspace — bo nie zostały wypchnięte; (b) sandbox odtworzył workspace ze świeżego klona w środku pracy i commit wylądował na `main`..

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

**Przypadek:** właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani informacji o CI. Odruch: szukać błędu w workflow albo w ochronie gałęzi. (1) `gh pr view --json state,mergeable, mergeStateStatus,statusCheckRollup` → `MERGEABLE`, `CLEAN`, check `test` = `SUCCESS`; (2) `git ls-remote origin <gałąź>`…

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

**Przypadek:** audyt Żywym Testerem (M96) stanął na `[STOP] brak akcji` w oknie z przyciskiem „Epic Experiment: zakończ (reszta kart do grobu)". reakcja „ta talia się nie testuje" albo zmiana seeda cicho zawęża zakres kolejnych audytów; po czasie nie widać, że całe mechaniki nigdy nie były sprawdzone na żywym…

**Reguła (decyzja właściciela):** jeśli tester czegoś nie widzi albo nie
obsługuje — POPRAWIAMY TESTER, nie akceptujemy braku. Zmiany w narzędziu idą
tym samym rygorem co produkcja (test + opis w commicie).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L12)

## L13 (2026-08-15) — WERYFIKACJA MUTACYJNA: jedyny dowód, że test lub detektor działa

**Przypadek:** **Detektor (L13, M102):** dziewięć detektorów Żywego Testera miało komplet testów jednostkowych.

**Wpis zbiorczy.** Numery L61, L70 i L114 zostają jako kotwice cytowań i odsyłają tutaj.

**Reguła:**
1. Test regresyjny liczy się dopiero, gdy pokazano, że **czerwienieje po
   cofnięciu naprawy**. Procedura (~30 s): mutacja odwracająca fix jedną linią →
   uruchom plik testu (MUSI paść właściwy test) → cofnij → potwierdź zielone →
   oba pomiary wpisz do commitu.
2. Mutuj per GAŁĄŹ, nie per funkcję. Gałąź, której mutacja nie czerwieni, jest
   podejrzana z definicji: albo brakuje testu, albo gałąź jest **zbędna**.
   Najpierw sprawdź, czy powinna istnieć — usunięcie nadmiarowej reguły bije
   utrwalenie jej testem.
3. Detektor przechodzi cykl „przywróć bug → narzędzie zgłasza → przywróć fix →
   0 zgłoszeń" w OBU trybach logowania. Test jednostkowy dowodzi reakcji na
   SPREPAROWANE wejście, nie tego, że takie wejście powstanie w przebiegu.
4. Gdy mutacja nie czerwieni, dane testu nie mają kształtu produkcyjnego —
   odtwórz je z REALNEGO artefaktu.
5. „Przypięte testem" bez pomiaru przed/po = zdanie do sprawdzenia, nie fakt.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L13)

## L14 (2026-08-15) — Jedna instrukcja, dwie zasady: sklejone reguły to gotowy bug

**Przypadek:** M101/B5 (CR 302.6) i B6 (CR 702.19b) to ten sam błąd w dwóch miejscach silnika: **dwie niezależne zasady wyrażone jedną instrukcją** — gdy jedna przestawała obowiązywać, druga znikała razem z nią. - **B5:** `untapControlled` kasowało chorobę przywołania w tej samej linii, w której odkręcało…

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

**Przypadek:** detektor `noop` (automatyzacja L15) dostał fałszywy alarm na craftcie Lodestone Needle: „jedyna zmiana to zapłacony koszt", choć kliknięcie otwierało WYBÓR artefaktu do wygnania.

**Reguła:** każda struktura BLOKUJĄCA priorytet musi być częścią
fingerprintu — generyczna sekcja `pendingDecisions` z listą
`PENDING_DECISION_FIELDS`; nowe pole wstrzymujące MUSI na nią trafić. Obrona w
głąb sondy: po symulacji sprawdza, czy okno priorytetu ma pass (brak passu =
komenda otworzyła decyzję).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L16)

## L17 (2026-08-16) — Bundler jednoplikowy nie zna aliasów importów, a jsdom nie zna structuredClone (M103)

**Przypadek:** sonda „oferta bez skutku" działała w Node, a w artefakcie umierała („runProbeCommandEffect is not defined", potem „structuredClone is not defined"). (1) `tools/build.mjs` skleja moduły w JEDEN scope (`assertNoNameCollisions`) — `import { x as y }` nie tworzy wiązania, a build i testy kolizji milczą…

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

**Przypadek:** weryfikacja mutacyjna bramki ofert (M104) nie zadziałała: po cofnięciu bramki panel oferował „Aktywuj: Rustvine Cultivator — odkręć → cel: Forest", a oś `noop` raportowała zero.

**Reguła:** gdy sonda pracuje na KLONIE stanu, mierz KAŻDĄ ofertę widoczną w
oknie (z dedupem po kluczu opcji i limitem na partię). Pytanie ogólne: czy
pomiar obejmuje całą przestrzeń, którą widzi gracz, czy tylko ścieżkę
sterownika? (Ujawniło w M104 dwa braki naraz: nieskanowane opcje modali i
oferty panelu.)

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L20)

## L21 (2026-08-16) — JAWNA LISTA PÓL gubi dane po cichu — w każdej z czterech warstw

**Przypadek:** dane karty jadą do gry przez kilka miejsc, z których KAŻDE wymienia pola z nazwy (destrukturyzacja configu albo ręcznie budowany obiekt).

**Wpis zbiorczy** dla jednej klasy błędu, która wystąpiła w czterech różnych
warstwach. Numery L93, L94 i L101 zostają jako kotwice cytowań i odsyłają tutaj.

**Reguła:**
1. Dodając pole mechaniki do `defineCard`, przejdź **wszystkie cztery
   warstwy** — nie tylko tę, w której zgłoszono błąd (grep „M146" w `deck.js`).
   Kierunek docelowy: transportować deskryptory ZBIORCZO (spread listy pól),
   żeby lista była jedna.
2. Stan spoza kontraktu fabryki ustawiaj JAWNIE po dodaniu obiektu
   (`state.objects.set(id, Object.freeze({ ...obj, tapped: true }))`)
   i sprawdź, czy asercja odróżnia stan POCZĄTKOWY od skutku.
3. Pin idzie przez **realną ścieżkę** (`setupCardMatch`: registry →
   createCardDeck → installDeck → obiekt), nigdy przez własny helper.
4. Strażnik jest KLASOWY: enumeruje `REGISTRY.all()`, buduje obiekt realną
   drogą i porównuje pola wejścia z polami wyjścia. Pin na jedną kartę zamyka
   jeden przypadek i usypia klasę.
5. Test anty-over-fix obowiązkowy (np. kopia PRZODU zachowuje koszt) — sam fix
   „tył → 0" przeszedłby zielono także z fabryką ignorującą pole.
6. „Silnik liczy dobrze" nie zamyka zgłoszenia: `legalCommands` czyta
   z OBIEKTU, `commandLabel` z WIDOKU — to dwa różne źródła.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L21)

## L22 (2026-08-16) — Akcja, która PRZEWIJA grę, musi kończyć się ponownym renderem

**Przypadek:** po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne tapnięcie gracza kończyło się „Ruch odrzucony: illegal_cast: Zagranie poza main phase" / „not_priority" (3 przypadki w macierzy M104; przy `--tick-rate 0` żadnego).

**Reguła:** każda ścieżka UI mogąca zmienić stan gry (`apply`,
`continueBotPlay`, `recheckAutoPass`, wznowienie zapisu) kończy się tą samą
sekwencją co `playDirect`: **zapis → render → pokaż ruchy bota**. Render PRZED
zmianą stanu nie jest renderem po zmianie. Objaw klasy: odrzucane komendy tuż
po akcji „nic nie robiącej" w grze (przełącznik, ptaszek, zamknięcie modala) —
szukaj brakującego renderu, zanim podejrzewasz reguły.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L22)

## L23 (2026-08-16) — Koszt karty to DANE: pipy kolorowe i mana value weryfikujesz maszynowo

**Przypadek:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" zapisane jako sama liczba many (zdolność opłacalna dowolnym kolorem) oraz {2}{U} zapisane jako `manaCost: 2` (karta o manę tańsza).

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

**Przypadek:** po dołożeniu jednej karty do `decks/green.txt` posypało się pięć testów niezwiązanych z nowymi kartami („log nie opisuje tworzenia tokenu", „nie znaleziono żadnej okazji zagrania", „żaden seed nie dał własnego surveil").

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

**Przypadek:** Dwukrotnie ten sam wynik: 12 partii (L27) i 22 partie (L40) z pustą sekcją `== DETEKTORY ==`, a ręczna lektura TYCH SAMYCH transkryptów dała odpowiednio pięć i dziesięć realnych błędów — w tym bota płacącego maną za wzmacnianie CUDZYCH stworów 24 razy w jednej partii.

**Wpis zbiorczy.** Numery L40, L73 i L75 zostają jako kotwice i odsyłają tutaj.

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
5. Gdy detektor oskarża kod, który po sprawdzeniu jest POPRAWNY, błąd leży
   w POMIARZE — napraw pomiar, nie dopisuj wyjątku na nazwę karty. Jeden licznik
   na dwa zjawiska zawsze skłamie, gdy wystąpią razem. Po uciszeniu alarmu
   udowodnij, że detektor nadal krzyczy na prawdziwym przypadku (L67).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L27)

## L28 (2026-08-17) — Kary dopisywane „przy okazji zgłoszenia" zostawiają dziurę na każdy nowy typ

**Przypadek:** Bot tapował własne stwory (Chill of the Grave, Entrancing Lyre) i zakładał aurę-kotwicę na własnego stwora, choć kary za niszczenie/wygnanie/obrażenia we własne rzeczy istniały od M91–M96.

**Reguła:** dla rodziny reguł tego samego kształtu („nie rób X samemu sobie")
buduj **tabelę typów + jedną funkcję egzekwującą**, nie n rozproszonych `if`.
Sygnał: druga/trzecia łatka tego samego kształtu = inwentaryzacja WSZYSTKICH
typów (tu: 44 z `card-data.js`) i odwrócenie domyślności.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L28)

## L29 (2026-08-17) — Fallback `?? slug` to cichy wyciek, nie zabezpieczenie

**Przypadek:** Trzy z dziesięciu błędów M122 miały ten sam kształt: gracz widział surowy identyfikator (`trigger (enchanted_permanent_tapped)`, `efekt (attach_equipment_to_source)`, `trigger (delayed)`), bo mapa etykiet kończyła się `LABELS[key] ?? key`. Taki fallback nie wywala się i nie loguje ostrzeżenia —…

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

**Przypadek:** walidacja kontraktu `addObject` (L21) włączona twardo dała 141 czerwonych testów — „zrób to porządnie" oznaczało „nie rób tego nigdy" (leżało w backlogu dwa dni). Koszt wdrożenia = koszt spłaty CAŁEGO długu z góry.

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

**Przypadek:** kafel Goblin Pickera obiecywał „{1}, {T}: dobierz 1 kartę", a aktywacja odrzucała kartę z ręki i wymagała czerwonej many (Oracle: `{R}, {T}, Discard a card: Draw a card`).

**Reguła:** ta sama informacja formatowana w kilku miejscach = JEDNA tabela
używana wszędzie (L28 dla prezentacji). Rozjazd nie wywala testów: objawia się
tylko tym, że gracz płaci koszt, o którym nie wiedział. Strażnik DWUSTRONNY:
„każde pole z DANYCH ma wpis", nie „tabela niepusta" (L31).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L41)

## L42 (2026-08-18) — Efekt „do odwołania" wycenia się razem z ZEGAREM, nie tylko z celem

**Przypadek:** „najefektywniejsze jest tapowanie kreatur przeciwnika po jego fazie untap — wtedy kreatura jest nieczynna i w ataku, i w obronie". przy efektach trwających „do czegoś" wartość ma ILOŚĆ CZASU obowiązywania, nie sam skutek.

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

**Przypadek:** widok ukrywał `cardId` i linię typów zakrytego permanentu (CR 708.2), a każdy z pięciu morphów dawał się rozpoznać po `subtypes` („Bird", „Human Wizard") i po deskryptorze `morph` (koszt obrócenia + KOLORY karty).

**Reguła:** ukrytą informację testuj przez NIEROZRÓŻNIALNOŚĆ: weź wszystkie
obiekty, które mają wyglądać tak samo, policz odcisk widoku każdego i wymagaj
JEDNEGO elementu w zbiorze. Taki test łapie każde przyszłe pole; lista pól —
tylko zapamiętane.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L45)

## L46 (2026-08-18) — Animacja „do końca tury" + trwały stan = cleanup musi resynchronizować

**Przypadek:** Spacecraft Wedgelight Rammer (próg 9+ charge → stwór) ożywiony animacją Skilled Animator do 5/5, po 9 charge i końcu tury wracał do artefaktu mimo spełnionego progu: `clearStatModifiers` odtwarzał `originalBeforeAnimation` (rodzaj artefakt), nie sprawdzając, czy trwały warunek station nadal czyni…

**Reguła:** gdy encja ma efekt chwilowy i trwały warunek, cleanup przywracający
chwilowy MUSI przeliczyć trwały. Inaczej trwały stan ginie razem z chwilowym,
choć jego przyczyna nadal istnieje.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L46)

## L47 (2026-08-18) — Kopiowalne cechy to WSZYSTKIE drukowane deskryptory, nie tylko P/T

**Przypadek:** token-kopia Wedgelight Rammer (Cogwork Assembler, CR 707.2) rodziła się jako artefakt bez progu 9+ i nigdy nie stawała się stworem; ten sam wzorzec w `Jwari Shapeshifter` (enter as copy) — kopia traciła `station`/`saga`..

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

**Przypadek:** Bot wybierał biały czar na cel z `protection from white`: `legalSpellCasts` filtrował tylko `isProtectedFromSource`, a `validateTargets` sprawdzał też `effectiveProtectionFromColors`. Dla czarów bez `sourceObject` ochrona kolorowa była w ofercie niewidoczna.

**Wpis zbiorczy** — klasa z czterema powtórkami. Numer L90 zostaje jako kotwica
i odsyła tutaj. Rozjazd oferty i walidacji to gotowy crash w benchmarku:
silnik proponuje ruch, po czym sam go odrzuca („Bot wybrał nielegalną komendę").

**Reguła:**
1. Nowy typ ochrony albo nowy `pending*` trafia w TRZY miejsca naraz:
   `legalTargetCandidates` (oferta, z `sourceObject`), `validateTargets`
   i OBA boty (`heuristic` — fallback `anyResolve`; `aggro` — lista `simple`).
2. Nowe zdarzenie z rodziny trafia do KAŻDEGO skanu tej rodziny (`dies`,
   `leaves_battlefield`, „permanents you control leave").
3. Kolejność „kto teraz decyduje" mieszka w JEDNEJ funkcji zwracającej
   właściciela **i rodzaj** decyzji (`firstPendingDecision → { playerId, kind }`).
   Zasada: **pierwszy właściciel decyzji = pierwsza bramka `execute` = pierwsza
   gałąź ofert.**
4. Bramka „coś czeka" jest warunkiem na WŁAŚCICIELA i RODZAJ, nigdy na sam fakt
   niepustości kolejki — inaczej blokuje gracza, którego decyzja jest wcześniejsza.
5. Predykat blokady jest jeden i wołają go OBIE strony (`exploitDecisionPendingFor`,
   `closingCombatPassBlocked`).
6. Przy N-tej powtórce klasy szukaj WSPÓLNEGO MIANOWNIKA, nie kolejnego
   przypadku (L28).
7. Martwy wartownik to też błąd: warunek, którego mutacja nie czerwieni, usuń
   zamiast zostawiać jako „dokumentację zamiaru" (L5).

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L48)

## L49 (2026-08-18) — Plik startowy musi kazać CZYTAĆ ADR-y, zanim agent odezwie się w czacie

**Przypadek:** nowa sesja zapytała właściciela „co robimy?" zamiast wykonać ADR 0020 (PR → audyt poprzedniego PR → praca), choć ADR 0020, AGENTS i lekcje już istniały. jedyny plik wczytywany zawsze (`AGENTS.md`) chował listę lektur niżej i ustawiał ADR-y jako punkt 8 („właściwe ADR-y obszaru") — dało się…

**Reguła:** `AGENTS.md` to jedyny plik startowy niezależny od czatu. Jego
PIERWSZA sekcja to obowiązkowa lektura: ten plik → **wszystkie** ADR-y →
LESSONS → ENVIRONMENT, potem dopiero stan projektu. Co robić jest w ADR 0020,
nie w pytaniu do właściciela.

**Strażnik:** `AGENTS.md` §0, wskaźnik w `README.md`.

→ narracja: `docs/LESSONS_PRZYPADKI.md` (L49)

## L52 (2026-08-20) — Ścieżka mechaniki zależna od przyszłych kart: zaimplementuj i zasygnalizuj, nie odnotuj

**Przypadek:** audyt PR #66 zostawił dwie obserwacje „bez zmian kodu": `resolve_madness_cast` wołał bezwarunkowo `castPermanent` (pierwsza karta instant z madness dostałaby reject) i bramka kolorów sprawdzała pipy KARTY zamiast kolorów kosztu madness (dziś tożsame dla Revolutionista).

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

**Przypadek:** `node tools/benchmark.mjs --full` liczył się 63 minuty CPU bez jednej linii logu (raport powstaje po ostatnim meczu) — nie dało się odróżnić wolnego liczenia od meczu, który utknął. Pierwszy log po dopisaniu postępu powiedział wszystko: `1/75900`, ETA 526 minut.

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

**Przypadek (M256, 18 partii Żywym Testerem):** 12 komunikatów „trigger bez
efektu" na pięciu kartach (Trostani Discordant ×4, Veiled Ascension ×3,
Jyoti, Moag Ancient ×3, Plague Reaver, Chronic Flooding) — dla czterech
pierwszych NIEPRECYZYJNY, bo karta nie miała na kim działać, a
`resolveTrigger` wnioskował powód z LICZBY nowych zdarzeń. Pełny Objaw i
Przyczyna: `docs/LESSONS_PRZYPADKI.md`, sekcja „L91”.

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
## L108 (2026-08-31) — Deadlock reguł: szukaj par „musisz X" / „nie możesz X"

Odkryte w M270 (błąd #9, CR 508.1c). Dotąd polowanie na błędy zakładało, że
silnik robi coś **źle**. Istnieje groźniejsza klasa: silnik nie pozwala
zrobić **niczego**. Goadowany stwór z „can't attack alone", jedyny zdolny do
ataku, unieruchamiał krok deklaracji atakujących — każda możliwa komenda była
odrzucana, partia stawała.

Jak szukać: wypisz wszystkie ograniczenia jako WYMOGI („attacks each combat
if able", „must be blocked", „must attack a Planeswalker if able") i ZAKAZY
(„can't attack alone", „can't block", „can't attack unless..."). Dla każdej
pary wymóg×zakaz dotyczącej tego samego obiektu sprawdź przypadek brzegowy,
w którym zbiór alternatyw kurczy się do jednego elementu — tam wymóg i zakaz
się spotykają. CR rozstrzyga to klauzulą **„if able"**: wymóg milczy, gdy
czynność jest nielegalna. Silnik musi implementować „if able" jawnie, bo
naiwny zapis („zawsze wymagaj") jest sprzeczny z zakazem.

Test na deadlock jest tani i powinien być domyślnym elementem strażnika
każdego kroku z wyborem: **„gracz ZAWSZE ma co najmniej jedną legalną
opcję"** — enumerator skonfrontowany z walidacją (L48). Ten test wyłapał
drugą połowę błędu #9, której naprawa pierwszej połowy nie ruszyła:
`legalAttackerOptions` zwracało pustą listę, więc silnik nie proponował nawet
legalnej deklaracji pustej.
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

Rygor, bez którego narzędzie szkodzi: trafienie weryfikuj wobec KONSUMENTA (grep
pola w `session.js`, `triggers.js`) — z 36 kandydatów realne były 2; lista
wyjątków JAWNA i z POWODEM; analizator jest produktem (fałszywy alarm poprawiaj w
TEŚCIE, nie w kodzie).
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

**Przypadek:** audyt „działań niescoringowanych" bota. Statyczna inwentaryzacja
`createHeuristicBot` (84 zagnieżdżone helpery) wskazała 6 podejrzanych miejsc — ale
regiony funkcji nachodzą na siebie, więc wynik był zaniżony. Pomiar na `bot.trace()`
z 12 partii: 30,4% decyzji z alternatywami to ex aequo na maksimum; `play_land` miał
płaskie 90, więc wybór manabazy zapadał w kolejności `legalCommands` (i w rng puli
top-3). Złapana przy okazji pułapka: wspólny sufit klampy (`min(16, suma)`) zgrywał do
jednego wyniku ląd pokrywający 2 i 3 pipów — test jednostkowy „lepszy wygrywa" tego nie
widział, bo oba warianty były „lepsze".
**Reguła:** punkty decyzyjne bota audytuje się na rozegranych partiach, nie na grepie:
identyczne `score` przy ≥2 opcjach ⇒ wycena nic nie rozstrzygnęła, niezależnie od tego,
czy w źródle „jest gałąź punktująca". Klasyfikację remisów prowadź po **wejściach**
wyceny (projekcja danych wystawiona do śladu przez samego bota), nie po tożsamości
wariantów: zamienne opcje muszą pozostać w remisie, bo sztuczny tie-breaker wygląda w
metrykach jak działająca wycena i kłamie. Jeśli bramka ma łapać niedoinfekcyjność
mapowania, mapping musi być monotoniczny w zakresie realnie występującym — klampa
„na wszelki wypadek" go psuje.
**Strażnik:** `tools/bot-tie-audit.mjs` (eksport `audytRemisow`, CLI `--gate=<kind>`)
+ `test/audyt-bot-wybior-landu.test.js`; mutacje: płaska wycena ⇒ RED 1/3/5, kara za
`entersTapped` usunięta ⇒ RED 3/5, ślad bez karty ⇒ RED 1/2/3/4.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L117). → Pokrewne: L1, L5, L48.

## L118 (2026-09-02) — Zanim wyłączysz klasę przypadków z pomiaru, udowodnij w teście, że jest równoważna

**Przypadek:** audyt remisów bota (M285→M286): 208 z 308 remisów wyglądało na
`block[]`/`attack[]` vs `pass_priority`, czyli „ten sam no-op" — i dość byłoby
jedno zdanie w kodzie narzędzia, żeby je wyłączyć. Równocześnie reguła „brak
projekcji u którejkolwiek opcji ⇒ bez danych" **wycinała findingi realne**
(null przy passie pochłaniał całą decyzję). Po dowodzie regułowym
(`test/audyt-bot-walka-remisy.test.js` test 1 — identyczny stan po obrażeniach)
i po odrzuceniu tylko opcji bez projekcji wypłyneły 4 groźby, których wcześniejszy
pomiar nie widział.
**Reguła:** każda klasyfikacja w narzędziu audytowym, która redukuje licznik,
potrzebuje testu stwierdzającego równoważność (albo — dla metryk — porównuj
wyłącznie dane mogące zmienić wynik: suma siły ataku przy ataku śmiertelnym jest
różnicą bez znaczenia, dlatego projekcja saturuje na lethalu). Bez tego audyt myli
się w obie strony: straszy szumem i milczy przy błędzie. Bramka dla stanu
przejrzanego bywa grzechotką (`<= N` z przykładami przy przekroczeniu), nie zerem —
zero, którego projekt nie obwieścił, jest kłamstwem w teście (ADR 0019).
**Strażnik:** `test/audyt-bot-walka-remisy.test.js` (dowód no-opa + grzechotka) i
`tools/bot-tie-audit.mjs` (`tieNoOp`, `tieAkcyjne`, klasyfikacja po projekcji).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L118). → Pokrewne: L18, L5, L117.

## L119 (2026-09-02) — Metryka audytowa nie może być modelem gorszym od mierzonego kodu

**Przypadek:** audyt remisów bota (M286→M287). Projekcja „wartość ciała" liczona
jako `power + toughness` flagowała pary słusznie uznane za zamienne, bo sama wycena
waży siłę i wytrzymałość inaczej (2/pt vs 1/pt); projekcja „obrona zostawiona w
domu" flagowała rzekomy brak ostrożności, którego nie ma — stwór tapnięty atakiem
odświeża się w naszym następnym kroku odświeżania, czyli zdąży zablokować (CR 502.3,
wyjątek „doesn't untap" ma osobną gałąź). Równolegle ta sama metryka, ale liczona po
składnikach, znalazła rzecz prawdziwą: `cast_permanent` w ogóle nie znał kosztu many.
**Reguła:** porównuj warianty po **wejściach, które mierzony kod konsumuje**, w
jednostkach, które ten kod szanuje — jeśli audyt ma gorszy model świata niż
badany kod, produkuje findingi pozorne i zagłusza prawdziwe. Analogicznie od strony
produkcyjnej: gałąź z `finish(score)` nie dowodzi, że wycena widzi wszystkie
istotne dane (tu: pełna formuła bez jednego składnika = wybór z kolejności listy).
**Strażnik:** `test/audyt-bot-cena-stwora.test.js` (pin arytmetyczny
`Δwyniku = Δkoszt × waga × waga rodziny`, kierunek na parach z katalogu,
kontra-przykład „większy korpus broni ceny") + grzechotka per kind w
`test/audyt-bot-walka-remisy.test.js`; pomiar: `tools/bot-tie-audit.mjs`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L119). → Pokrewne: L117, L118, L5.

## L120 (2026-09-02) — Opcjonalna zależność komponentu to dziura w drucie; pilnuj miejsca użycia

**Przypadek:** dwie z czterech uwag właściciela z żywej gry (2026-09-02) miały ten
sam kształt. B: „karty specjalne mają powiększać się na hover, działa tylko klik" —
`renderUndercity` umiał hover od M153/C i jego test przechodził zielono przez rok,
bo test PODAWAŁ `hover` sam, a `renderTableView` przekazywał go tylko Day/Night.
A: modal celów wielokrotnych wyglądał jak inny produkt, bo `.multi-target-*` i
`.escape-exile-*` nie miały ANI JEDNEJ reguły CSS, a testy patrzyły na strukturę
DOM, nie na to, czy struktura ma styl.

**Reguła:** jeśli komponent przyjmuje zależność opcjonalną (`hover = null`), zielony
test tego komponentu NIE jest dowodem, że ktoś ją podaje — zależy to od jednego
wywołania. Albo uczyń zależność wymaganą (głośny fail), albo dodaj asercję na
MIEJSCE UŻYCIA (skan wywołania/źródła). To samo dla prezentacji: każda rodzina klas
DOM produkowana przez kod musi mieć co najmniej jedną regułę CSS — brak reguły to
nie „brak zdobień", tylko druga estetyka na tej samej planszy (i drugie zachowanie
na dotyku).

**Strażnik:** `test/uwagi-tura8-hover-kart-specjalnych.test.js` (strażnik
przekazania `hover` w `renderTableView` + strażnik reguł `:hover`) i
`test/uwagi-tura8-picker-wielocelowy.test.js` (reguły `.picker-*` z progiem dotyku
44 px, „renderPickerRow wywołany ≥ 3razy", brak osobnego przycisku Podglądu).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L120). → Pokrewne: L16, L21, L118, L119.

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

**Strażnik:** `test/uwagi-tura9-bot-rowne-ciala-equip.test.js` (T9/5 i T9/6 — obie
strony, T9/3 — antysymetria na 40 parach, T9/8 — jedno miejsce definicji wagi).
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

**Przypadek:** M291 (wpis w rejestrze oznaczony jako cofnięte). Karta „up to two target
creatures EACH get +1/+0" miała być
dopisaniem wpisu do katalogu. Tor triggerów umiał to od M157 F4(a)
(`applyTriggerEffects`: `count > 1` → lista efektów aplikowana raz na cel), a tor
czaru — nie: aplikuje listę efektów RAZ z pełną tablicą celów, a `pump` i
`grant_keywords_until_end_of_turn` czytają `targets[0]`. Gdybym skończył na
„katalog = dane, silnik już to umie", karta wchodziłaby do repo z cichym błędem:
pompowałaby pierwszy cel dwa razy, a drugi wcale. Żaden test jej by nie przyłapał,
bo nie istniała.

**Reguła:** przy każdej wielocelowości audytuj WSZYSTKIE tory, którymi efekt może
nadejść (czar ze stosu, zdolność aktywowana, trigger, tryb modalny, kopia czaru) i
dla każdego z nich zapisz test na DWU celach. Zdanie „silnik to wspiera" bez nazwy
toru jest bezwartościowe — to nie cecha mechaniki, a cecha ścieżki kodu.
Druga połówka lekcji: blokada środowiska nie zamyka zadania, jeśli procedura repo ma
opisany kanał awaryjny — `docs/cards/HOW_TO_ADD_CARD.md` dopuszcza ściągnięcie tych
samych URL-i przez `fetch_page`, a ja w turze 10 uznałem brak egressu za koniec
wątku (b).

**Strażnik:** dziś żaden — rodzina `test/m291-*.test.js` (dwa cele / jeden / zero oraz
to, że silnik nie zna nazw kart i że `allTargets` nie łączy się z efektem blokującym
decyzję) istniała i świeciła 14/14 na zielono, lecz właściciel cofnął zgodę na karty
wielocelowe 2026-09-03 i cała gałąź `0434199` została zrevertowana. Lekcja przeżywa kod właśnie po
to; jeśli karta wielocelowa wejdzie kiedyś za zgodą właściciela, te cztery asercje są
pierwszą rzeczą do odtworzenia (treść testu jest w commicie `0434199`).

## L124 (2026-09-02) — Zmianę w grzechotce przypisz trzema drzewami, zanim podniesiesz próg

**Przypadek:** M291 (tura 11). Po dodaniu jednej karty do katalogu zmienił się skład
`decks/ravnica.txt` i zazęły dwie bramki jakości: sufit `block` w
`test/audyt-bot-walka-remisy.test.js` (4 → 5) oraz zamrożony golden-master bota. Ten
sam audyt odpalony na `f6a5459` dał 4/4/130, a na drzewie z SAMĄ zmianą wagową M290
(też 4/4/130) — czyli waga nie zepsuła żadnej decyzji, a dokładkę remisu zrobiło inne
rozdanie talii. Bez tego pomiaru jedynym dostępnym komunikatem byłoby „podnieś próg”.

**Reguła:** gdy po zmianie wagowej pęka grzechotka, mierz trzy drzewa (stan zeszły /
tylko zmiana wagowa / zmiana wagowa + treść) dokładnie tym samym wywołaniem, którego
używa test. Atrybucja decyduje, czy podnosimy sufit (i wpisujemy PRZYCZYNĘ przy
asercji), czy mamy nową dziurę w wycenie. Ten sam rygor dotyczy fixture’ów: `--write`
puszcza się na GOTOWYM drzewie — u nas pierwszy zapis zamroził ślad bota bez wpisu
`MANA_COSTS` nowej karty i test znowu świecił, choć nic już nie było nie tak z kodem.

**Strażnik:** `test/bot-scoring-snapshot.test.js` (fixture, który ta lekcja chroni przed
przedwczesnym `--write`) oraz tabela atrybucji i kolejność wejścia karty w
`docs/audits/AUDYT_PR92_2026-09-02.md` §15. Komentarz z tabelką przy suficie `block` w
`test/audyt-bot-walka-remisy.test.js` zniknął razem z Revertem kart — sufit znowu
wynosi 4 — stan z `f6a5459`.


## L125 (2026-09-03) — Strażnik wyglądu ma mierzyć styl efektywny, nie tekst CSS

**Przypadek:** M288/A zbudował jeden komponent wiersza (`src/table/picker.js`), a
`test/m129-combat-wizard-dotyk.test.js` kazał każdej rodzinie kreatora mieć WŁASNĄ regułę
`min-height: 44px` w `index.html`. Efekt: bloki bajt w bajt identyczne (po 261 znaków,
różnił je tylko selektor), utrzymywane ręcznie w dwóch miejscach — i strażnik zielony także
wtedy, gdy wspólna rodzina straciła próg dotyku, bo kopia w rodzinie kreatora nadal go
miała. M292 odwrócił zależność: test liczy deklaracje rozwiązane po realnej liście klas z
renderera, a drugi test pilnuje, żeby rodzina kreatora nie dublowała wyglądu wiersza.
Dopiero wtedy kasacja duplikatu była bezpieczna, bo RED-em grozi zarówno regresja w
komponencie współdzielonym, jak i dorzucenie kopii po stronie wołającego.

**Reguła:** test, który sprawdzając wygląd czyta tekst stylesheetu, pilnuje duplikatu, nie
faktu. Licz styl efektywny (klasy z kodu → reguły → scalone deklaracje) i dodaj asercję
antyduplikacyjną. Tekst CSS badaj tylko tam, gdzie nie ma czego renderować (`:root`,
`@media`). Przy okazji: parser CSS w teście musi wyciąć komentarze PRZED dzieleniem na
reguły — inaczej reguła stojąca zaraz po bloku komentarza znika z listy i strażnik
fałszywie zieloneje (to złapało mutację B w M292 za pierwszym podejściem).

**Strażnik:** `test/m129-combat-wizard-dotyk.test.js`. Mutacje: wycięty `min-height` z
`.picker-row` → RED, dopisana kopia `.damage-wizard-row { min-height… }` → RED, ręcznie
lepiony `checkbox` poza `picker.js` → RED, ptaszek 16 px → RED.

## L126 (2026-09-03) — Zlanie dwóch „takich samych" kreatorów to test, czy naprawdę robiły to samo

**Przypadek:** `renderLookWizard` i kreator „zajrzyj → weź jeden land" miały po osobnym
budowniczym listy chipów, osobnej polityce klucza sondy i osobnym sorterze — 46 linii
wspólnego rysunku przy 358 liniach ogółem (difflib po wierszach). Po zlaniu ich w
`renderPeekWizard` z parametrem `flow` wyszły DWA czerwone testy i jedna kradziona naprawa:
`M112` (klucz na decyzji kończącej) spadł, bo silnik odziedziczył pulę sortera po scry i
kreator „ułóż wierzch" pytał o karty odłożone na spód; a dawny kreator landa NIGDY nie dawał
klucza, gdy po wyborze zostawała ≤1 karta — błąd, którego nikt nie zgłosił, bo obie
implementacje maskowały się nawzajem. Nazwa komponentu od konkretnej karty
(`renderFertileThicketWizard`, `lookKind === 'fertile'`) była tym samym grzechem co porównanie
stringa karty, tylko cichszym — i osiadała w routing widoku, nie w logice efektu.

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

**Strażnik:** `test/m293-peek-jeden-wizard-chipy.test.js` (12), `M112` w
`test/choice-request-ui.test.js`, `test/m129-*` + `test/look-wizard-contrast.test.js` przez
`test/harness/css-effective.js`. Mutacje: pula sortera bez warunku na `flow` → RED M112;
dopisana druga lista chipów w kreatorze → RED M293/1; przywrócona kopia stopki → RED
M293/1; wycięty `min-height` rodziny → RED m129; nazwa karty w kodzie rysującym (bez
komentarza) → RED M293/11.

## L127 (2026-09-03) — Zakres rzutu kartą spoza ręki to cecha ŚCIEŻKI, nie karty: jeden predykat z parametrem „co ta ścieżka potrafi rozliczyć”

**Przypadek:** PR #93 zlał trzy kopie filtru „prostego zakresu” w jeden
`outsideHandCastScope` (słusznie, L48), ale zostawił w nim wykluczenia NA SZTYWNO:
`modes`, `targets`, `additionalCost`. Każde powstało dla Discover — jego oferta
nie pyta ani o tryb, ani o cel — a po unifikacji obowiązywało też okno zdolności
Vaana, które tryby i cele ENUMERUJE (`epicCastOffers`), a koszt dodatkowy rozlicza
w `castSpell`. Skutek: **zero ofert rzutu** dla kart, które Oracle dopuszcza
(repro na realnych kartach: `aerith-rescue-mission` wygnana przez Vaana → tylko
rezygnacja; `ruinous-rampage` trafiona Discover → tylko „weź do ręki”;
`village-rites` w obu oknach → nic). Cztery fakty z tej samej tury: egzekucja
modę OBSŁUGIWAŁA (`chosenMode` na stosie, rozstrzyganie je czyta), więc był to
czysty rozjazd oferty i wykonania (L41/L48); `castModalSpell` nie znał
`abilityWindowCast`, bo stempel `playableUntilTurn` słusznie zniknął z karty
(ruling WotC 2025-02-10) i gałąź modalna straciła jedyną drogę autoryzacji; własna
kopia generatora ofert w `epicCastOffers` pomijała tryby z „up to N target …”,
które rzut z ręki oferuje; a test z poprzedniej sesji piętnował brak oferty jako
zamierzony i zakładał stempel, którego silnik już nie stawia — przechodziłby
nawet bez naprawy.

**Reguła:** każde wykluczenie w predykacie zakresu pytaj „czy TA ścieżka potrafi
to ROZLICZYĆ”, nie „czy karta to ma” — parametr per ścieżka (`allowTargets`,
`allowModes`, `allowAdditionalCost`), jeden filtr, oferta i bramka wywołane z
TYMI SAMYMI argumentami. Oferty trybów/celów liczy generator wspólny z rzutem
z ręki (`legalModeCasts`), nie kopia okna. Gdy naprawa odbiera stempel albo
uprawnienie (ruling), sprawdź, czy nowe uprawnienie dotarło do KAŻDEJ gałęzi
wykonania (`requireSpell`, `castPermanent`, `castModalSpell`, `castXCostSpell`,
`castFireball`) — gałąź bez uprawnienia to rozjazd oferty i wykonania. Test
odziedziczony po poprzedniej sesji traktuj jak hipotezę: sprawdź, czy jego stan
przygotowawczy odtwarza to, co silnik robi DZIŚ (stempel zdjęty ⇒ test vacuous
aż do usunięcia stempla z helpera). Koszt wymagający wyboru kart w trakcie
płacenia („discard two cards”) zostaw bez oferty (L5) — pominięcie kosztu to
złamanie reguł, nie naprawa. I wreszcie: wariant ruchu bez wyboru X (X = 0) jest
pułapką, więc dopóki okno nie potrafi wyliczyć X, wyłączenie zostaje — ale jako
świadomy wpis w backlogu, nie jako milczenie predykatu.

Oferta kontra walidacja przy wykładniczej liczbie wariantów: OFERTA bywa
WYCINKIEM (limit wariantów, jak `COMBAT_OPTION_CAP`), ale WALIDACJA w `execute`
musi pozostać PEŁNA i niezależna — inaczej ograniczenie panelu staje się
ograniczeniem reguł (znalezisko H audytu PR #93).

Test nie może porównywać mierzonej wartości ze STAŁĄ ZAIMPORTOWANĄ z
testowanego modułu: mutacja zmienia obie naraz i test przechodzi (tautologia
wykryta przy H). Wartość graniczna wpisana literą, stała sprawdzana osobno.

Skan katalogu zamiast czekania na zgłoszenie: dla każdej karty otwórz badaną
ścieżkę i wypisz te bez ŻADNEJ oferty — to znalazło znalezisko E (aury), którego
nie doszedł Żywy Tester w 6 partiach. Strażnik klasy w teście utrwala wynik.

Dopisek z tej samej tury (koszt X): **wariant legalny, ale nic nie robiący, nie
jest ofertą.** Rzut bez kosztu many zmusza X = 0 (CR 107.3b), więc ten sam czar
bywa pełnoprawnym ruchem w oknie, które płaci manę (X wybiera gracz, CR 107.3a),
i no-opem w oknie darmowym. Zamknij tę ścieżkę PARAMETREM (`allowX`) i przypnij
testem, że milczy — domyślna wartość predykatu nie może być jedynym śladem
decyzji (uwaga właściciela F z M280).

**Strażnik:** `test/audyt-pr93-modalny-rzut-z-okna.test.js` (6, w tym skan
katalogu: każdy z 12 czarów modalnych ma ofertę w oknie zdolności),
`test/audyt-pr93-modalny-discover.test.js` (6, w tym etykieta stołu z nazwą
trybu), `test/audyt-pr93-koszt-dodatkowy-z-exile.test.js` (7) oraz odwrócony
`test/audyt-pr92-darmowy-rzut-zakres.test.js`. Dziewięć mutacji — tabela w §7
`docs/audits/AUDYT_PR93_2026-09-03.md`; znalezisko D —
`test/audyt-pr93-koszt-x-z-exile.test.js` (7, w tym strażnik: każda karta X
katalogu rzucalna w oknie zdolności oraz Discover milczące dla kart X).

## L128 (2026-09-03) — Mechanika z dwiema ścieżkami rzutu: reguła ma jedno miejsce prawdy, a skan musi PORÓWNYWAĆ ścieżki, nie tylko liczyć oferty

**Przypadek:** skan poboczny audytu PR #93 przejechał każdą kartę katalogu
z mechaniką „rzutu spoza ręki" (flashback 3, escape 2, madness 2, suspend 1,
plot 2 — wszystkie w realnych taliach) i znalazł dwa odchylenia, oba w tym
samym miejscu: regułę znała JEDNA ścieżka rzutu, druga nie.
- **I (plot, CR 702.170d):** zaplotowany STWÓR czeka do następnej tury
  (`castPermanent` od Batcha 24), a zaplotowany CZAR wracał w tej samej
  (`plottedCastAllowed` pilnowało tylko „własna faza main + pusty stos").
  Żywe w talii `worek-dziki` — dwie karty z plotem, dwie różne odpowiedzi.
- **J (warp, CR 702.185a):** `warpCard` = `castPermanent({ warpCast: true })`
  obsługiwał rękę i exile jedną komendą, więc karta wygnana po warp-caście
  wracała na stół ZA KOSZT WARP (Weftblade Enhancer: 3 many zamiast 6),
  choć warp jest kosztem alternatywnym wyłącznie z ręki.

**Reguła:** pozwolenie na rzut z exile, które realizuje więcej niż jedna
ścieżka kodu (czary vs permanenty, ręka vs exile), dostaje JEDEN predykat
wspólny dla oferty i walidacji — w `impulse-window.js`, obok reszty stempli
grywalności z wygnania (`plottedTurnReached`, `warpTurnReached`). Skan
„czy ta karta ma ofertę w swoim oknie" wykrywa brak oferty, ale NIE wykrywa
rozjazdu między ścieżkami: obie odpowiedziały „tak", tyle że na inne pytania.
Dlatego skan mechaniki pyta per ścieżka i ZESTAWIA odpowiedzi — to ta sama
metoda, która w L48 kazała zestawiać ofertę z walidacją.

**Strażnik:** `test/audyt-pr93-plot-pozniejsza-tura.test.js` (6: czar i stwór,
obie strony granicy, anty-over-fix dla ręki/impulsu/braku stempla) oraz
`test/audyt-pr93-warp-z-exile.test.js` (6: brak oferty za koszt warp, pobranie
6 many, odrzucenie `warp_card` z exile, anty-over-fix dla warpu z ręki,
przebieg integracyjny ze stempel `warpedAtTurn`). 13 mutacji — tabela w §7
`docs/audits/AUDYT_PR93_2026-09-03.md`; mutacja `>=` zamiast `>` we wspólnym
predykacie czerwieni testy OBU mechanik naraz (5 RED).

## L129 (2026-09-03) — Otwarcie mechaniki w nowym oknie to CAŁY łańcuch wyboru: oferta → walidacja → obiekt stosu → log → etykieta

**Przypadek:** audyt PR #94 (K1). Fix F otworzył w oknie darmowego rzutu
z grobu tryby z celami zmiennymi — oferty liczył już wspólny `legalModeCasts`,
więc warianty ze stunem (`stunAmongTargets`) pojawiły się w panelu. Ale okno
Vaan, które ten sam łańcuch dostało w tym samym PR (`pushExileCast`), przenosi
`stunTargetId` komendą, a okno grobu — nie: push gubił pole (duplikaty
przycisków), `execute` nie przekazywał go do `validateVariableTargets`
(warianty ≥1 celu odrzucane), obiekt stosu nie dostawał `modeExtra`
(`extra:stunTargetId` nie miał czego czytać), a zdarzenie i etykieta nie
nazywały wyboru. Repro: Aerith Rescue Mission (tryb „Schody”) przez okno
Halo Foragera. Ta sama klasa wyszła też przy etykietach `cast_spell`
i okna Vaana (K2): warianty różniące się wyłącznie stun celem były
nierozróżnialne (M91).

**Reguła:** wspólny generator ofert NIE gwarantuje kompletności łańcucha —
każde okno samo pushuje komendy i samo składa obiekt stosu. Dodając mechanikę
do okna, przechodzę listę: (1) czy push niesie WSZYSTKIE pola wariantu
z generatora, (2) czy `execute` przekazuje je do walidatora, (3) czy obiekt
stosu dostaje pola, które czyta rozstrzyganie (`modeExtra` itd.), (4) czy
zdarzenie `spell_cast` niesie `modeName`/wybory, które loguje session.js,
(5) czy etykieta rozróżnia warianty o różnych skutkach. Skan po wspólnym
generatorze (L128) pyta „czy oferta istnieje”; ta lista pyta „czy da się nią
zagrać i czy gracz widzi, co wybiera”.

**Strażnik:** `test/audyt-pr94-stun-z-grobu.test.js` (7 testów: warianty niosą
stun cel, każda oferta wykonalna, licznik na WYBRANYM celu, etykiety trzech
okien nazywają wybór, strażnik klasy po katalogu). 5 mutacji RED.

## L130 (2026-09-03) — Wynik komendy niesie CAŁY przyrost zdarzeń: przechwyć `state.events.length` PRZED efektem, dołącz `slice(before)` po nim

Dwa zgłoszenia właściciela (uwagi C/D) miały JEDEN root cause: bramki
wyniku komendy brały `state.events.slice(-1)` albo zwracały listę pobraną
przed efektem. Efekt dokładający WIĘCEJ niż jedno zdarzenie (infect: licznik
+ opis, renown, poświęcenie Springblooma: 3 zdarzenia) tracił część przyrostu
— gracz widział skutek na stole, ale log i Rozgrywka milczały.

Wzorzec naprawczy (combat.js ×3, bramka springbloom):
`const before = state.events.length;` → efekt → do wyniku
`state.events.slice(before)`. Kontrakt: wynik komendy = zdarzenia od jej
startu, nie „ostatnie” ani „pierwsze”. Audyt pozostałych bramek `slice(-1)`:
wszystkie jednocentryczne — bezpieczne.

Pułapki sesji: (1) testy harnessa sesyjnego potrzebują `gameObjectDataOf`
przy wstrzykiwaniu obiektów i widzą ukryte karty przeciwnika (liczniki ręki);
(2) wycena bota per-attacker paraliżuje przy samotnym blokerze odstraszającym
(deathtouch) — klasa wymaga modelowania gang-ataków, nie należy jej łatać
w pętli per-attacker (zmierzone: −2 partie benchmarku); (3) benchmark szybki
jest deterministyczny — każda różnica jest prawdziwa; (4) po re-konie
workspacu `git reset --soft FETCH_HEAD` odtwarza referencje z wypchniętej
gałęzi bez dotykania drzewa roboczego.

## L131 (2026-09-05) — Decyzja bez wyceny = pierwsza oferta z listy

**Przypadek:** `tools/bot-tie-audit.mjs` pokazał 50+ remisów przy wyborach
`resolve_*` (discard/search/trigger_target/exploit/opponent_target/
color_choice/...), z czego połowa jako "bez danych" (projekcja `tieProjection`
zwracała null), a połowa jako "remisy przy różnych danych". Wszystkie trzy
typy (`resolve_exploit_choice`, `resolve_opponent_target`,
`resolve_color_choice`) padały do `default: return finish(0)` w `scoreCommand`,
więc KAŻDY wariant dostawał 0 pkt i stabilny sort w greedyChoice wybierał
PIERWSZĄ ofertę z listy. Konsekwencja w rozgrywce: bot przy Exploit poświęcał
najsilniejszego stwora (bo ten był pierwszy na liście), przy Cuombajj Witches
obracał 1 obrażenie w siebie, a przy wyborze koloru ochrony wybierał zawsze
biały, niezależnie od planszy.

**Przyczyna:** L50 (nowy typ efektu/akcji startuje bez wyceny) + L34/L40/M195/
M203 (warianty bez nazwy w `summarize` są nierozróżnialne w śladzie) + L117
(remis punktów bez danych w projekcji jest tak samo arbitralny jak brak
wyceny). Nowy typ decyzji `resolve_*` dodany w silniku nie dostał
odpowiadającego mu `case` w kontrolerze — a że w silniku kolejność
kandydatów NIE JEST posortowana po wartości (oferta w kolejności
naturalnej: gracz→stworzy wroga→itp.), pierwsza oferta to często NAJGORSZA
opcja z perspektywy botu.

**Reguła:** Dodając NOWY typ komendy w silniku (command family `resolve_*`),
trzeba JEDNOCZEŚNIE: (1) dodać case w `scoreCommand` z prawidłową wyceną
(nie zostawiać domyślnego 0); (2) dodać nazwę wariantu w `summarize()`,
żeby ślad decyzyjny rozróżniał opcje; (3) dodać `tieProjection` dla
audytu remisów. Test `?`. Audyt remisów (`node tools/bot-tie-audit.mjs`)
jest strażnikiem klasy "decyzja bez wyceny": każdy nowy typ w kolumnie
"bez-danych" to albo brak wyceny, albo brak projekcji.

**Strażnik:** `node tools/bot-tie-audit.mjs --gate=<kind>` (exit code 0 gdy
brak "rozróżnialnych" remisów = nie ma groźnych decyzji z różnymi danymi
ale tym samym wynikiem).
