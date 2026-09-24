# Przypadki do lekcji z `docs/LESSONS.md`

Ten plik to **archiwum narracji** (Objaw + Przyczyna) dla wpisów, których treść w
`docs/LESSONS.md` jest skondensowana do reguły i strażnika. Powód: rejestr lekcji to
największa pozycja budżetu lektury startowej (`test/dokumentacja-budzet-lektury.test.js`,
100k tokenów), a AGENTS.md §0 wprost wyznacza to miejsce na opowieść — nie jest
lekturą obowiązkową, sięga się tu grepem po numerze lekcji.

Reguły NIE mieszkają tutaj: są w `docs/LESSONS.md`, razem ze strażnikami. Numery
wpisów są zachowane 1:1 z rejestrem, więc cytowania w kodzie działają jak dotąd.

Archiwum rośnie razem z rejestrem: każdy odsyłacz `→ narracja: … (LN)` musi tu mieć
swój nagłówek, a każdy nagłówek — swój wpis w rejestrze. Pilnuje tego
`test/docs-decisions.test.js`, więc nie ma ryzyka, że narracja przepada po cichu.

Kondensacja PR #93 (2026-09-02): 75 z 116 wpisów rejestru straciło prozę na rzecz
reguły i strażnika; stąd tu 77 przypadków (dwa wcześniejsze: L91, L106).

## L91 (2026-08-29) — przypadek

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



**Reguła (szczegóły punktów 3–6, wyniesione z rejestru przy kondensacji 2026-09-19b):**
3. Efekt, który ma w zbiorze samego siebie, nie zgłasza pustego zbioru. Efekt idempotentny nie zawsze działa na ŹRÓDŁO — aura na GOSPODARZA (`attachedTo`), więc „cel albo źródło" (M189/Z2e) nie wystarcza (Silken Strength, M256/J). Village Bell-Ringer zawsze jest własnym odbiorcą — tam tabela zbiorowa (`STATE_IDEMPOTENT_MASS_EFFECTS`; M106/Z2).
4. Do każdego wpisu kontrola pozytywna: test, w którym zbiór NIE jest pusty (H1b/H2b/H3b/H4b/H5b/H6b). Bez niej asercja „brak komunikatu" bywa zielona, bo nic się nie dzieje (M255/G2).
5. Heurystyka NAZWY (`_each_`, `_all_`) wyłącznie w strażniku (skan: typ zbiorowy ma wpis albo wyjątek). Silnik kluczuje po typie.
6. Komunikat dla gracza to NIE ozdoba: „brak legalnych celów" mówi, co zrobić dalej; „nie było czego wykonać" — tylko że coś nie zadziałało.
## L106 (2026-08-31) — przypadek

**Objaw (M269):** po „Creatures you control get +2/+2 until end of turn"
kradzież buffowanego stwora NATYCHMIAST kasowała bonus (4/6 → 2/4); buff
ujemny po przejęciu LECZYŁ. CR 611.2c: zbiór obiektów efektu ciągłego ustala
się RAZ, przy rozstrzygnięciu.

**Przyczyna:** `untilEndOfTurnBonuses` (`permanents.js`) miała DWA filtry tej
samej przynależności — zamrożony `objectIds` (M101/B2) i starszy
`object.controllerId === buff.controllerId`. Póki kontrola się nie zmienia,
dają ten sam wynik, więc żaden test nie świecił.

## L107 (2026-08-31) — przypadek

**Objaw (M269–M273 — 13 błędów tą techniką):** silnik ma choke pointy
(`addCounter`, `addPoisonCounters`, `deathZoneFor`, `untapObject`,
`moveObjectDirectly`), a obok żyją ścieżki robiące to samo własnym kodem:
`player.poison += 1`, ręcznie złożone `counters`, `'graveyard'` na sztywno,
`tapped: false` przez `Object.freeze`, mutacja `state.zones` wprost. Testy są
zielone, bo GŁÓWNY skutek się zgadza — giną SKUTKI UBOCZNE helpera: zdarzenie
dla logu i bota, wybór strefy przy liczniku finality, wyjście z walki, efekty
zastępujące (stun, indestructible, regeneracja).

**Przyczyna:** helper powstaje później niż jego pierwsi klienci albo dochodzi
mu odpowiedzialność, a ręcznych kopii nikt nie migruje — nie znajdziesz ich po
NAZWIE mechaniki, bo one jej nie zawierają.

## L105 (2026-08-31) — przypadek

**Objaw (M268):** handoff M267 odnotował, że etykiety `bestow`/`morph`
składają koszt po staremu, ale „dziś ich koszty są generyczne, więc to ryzyko,
nie błąd". Skan rodziny alt-kosztów pokazał, że to nieprawda w DWÓCH miejscach:
- `leafcrown-dryad` („Bestow {3}{G}") i `tumbleweed-rising` („Plot {2}{G}")
  nie miały `colors` w definicji (bliźniak `spinewoods-paladin` miał);
- morph i kicker sklejały pipy OBOK pełnej kwoty: Willbender („Morph {1}{U}",
  `morphCost: 2`) pokazywał „{2}{U}" — TRZY many zamiast dwóch.

**Przyczyna:** to samo co L100/4 — powtórzona składanka „generic + pipy", tylko
groźniejsza. Poprawne kopie liczą `generic = cost - colors.length`, a te dwie
doklejały pipy do NIEZMNIEJSZONEJ kwoty, więc cena rosła o liczbę pipów. Sześć
kopii w jednej warstwie rozjechało się tam, gdzie nikt nie porównał z Oracle.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m268-alt-koszt-pelna-rodzina.test.js` (11 testów: skan
katalogu po 14 mechanikach, piny bestow/plot/morph/kicker, test ŹRÓDŁA
płatności, strażnik regexowy). Mutacje: `colors` z normalizacji bestow →
4 RED; `coloredPipsOf(cardId)` w bestow → 1 RED; pipy obok kwoty → 1 RED.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L105)
## L104 (2026-08-31) — przypadek

**Objaw (Żywy Tester M267, profile explorer/hoarder, seedy 511/516/523):**
panel pokazywał „Rzuć z Cleave: Lunar Rejection (koszt 4)" i „Ucieczka:
Sweet Oblivion (koszt 4)", a Oracle mówi „Cleave {3}{U}" i „Escape {3}{U}".

**Przyczyna — dwie warstwy, jedna klasa:**
1. `colors` w ogóle nie istniało w definicjach trzech kart z cleave/escape,
   a normalizacja w `registry.js` i tak by je ucięła: jawna lista pól
   przepisywała `{ cost, exileCount }` / `{ manaCost, targets, effects }`.
   To CZWARTA kopia listy pól z L101 (po generatorze, transporcie i widoku),
   przy czym sąsiedni `buyback` w tym samym obiekcie już `colors` przepuszczał.
2. Płatność (`spells.js`) brała pipy z `coloredPipsOf(object.cardId)` —
   z kosztu BAZOWEGO karty. Wynik był poprawny, ale przypadkiem: wszystkie
   trzy karty mają w koszcie bazowym ten sam {U} co w alt-koszcie.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m267-alt-koszt-kolory.test.js` (5 testów, w tym skan
katalogu i test ŹRÓDŁA płatności czytający `spells.js`). Mutacje: `colors`
z normalizacji `registry.js` → testy 1–3; `coloredPipsOf(object.cardId)`
w cleave/escape → test 5.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L104)
## L103 (2026-08-31) — przypadek

**Objaw (zgłoszenie właściciela M266/B):** log pisał „Nieprzyjaciel rzuca
Liliana's Triumph → cel: Ty", a Oracle brzmi „Each opponent sacrifices
a creature of their choice" — bez słowa „target".

**Przyczyna:** M203/2 zamodelował „każdy przeciwnik" jako
`targets: [{ type: 'player', opponent: true }]`. W 1v1 wskazuje to zawsze tę
samą osobę, więc wyglądało na równoważne — nie jest. Czar bez celów
(CR 115.1) i czar z celem różnią się obserwowalnie: ten drugi fizzluje przy
hexproof (CR 115.6), daje się zepsuć usunięciem celu i pokazuje w UI wybór,
którego karta nie oferuje.

**Proza z rejestru (kondensacja 2026-09-20e):**

4. Strażnik KLASOWY: skan katalogu sprawdza implikację „brak słowa target
   w Oracle ⇒ brak `targets`". Pin na jedną kartę uśpiłby klasę — bliźniaki
   (Dreams of Steel and Oil: poprawne, ma „Target opponent") wyglądają
   identycznie w kodzie i różnią się TYLKO Oracle.
## L102 (2026-08-31) — przypadek

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

**Strażnicy:** `test/m265-grave-free-cast-target.test.js` (4 testy),
`test/m265-nth-resolve-fingerprint.test.js` (3 testy). Mutacje: usunięcie
`freeCastTargetPenalty` z `resolve_grave_free_cast` → testy celu; usunięcie
`spell` z wpisu grobu (`game-state.js`) → te same testy; usunięcie
`abilityResolvedThisTurn` z `fingerprint.js` → testy odcisku i sondy.


**Mutacje, którymi sprawdzono strażnika (wyniesione z rejestru 2026-09-06):**
brak rozrównienia (`zawsze no_result`) → H1, H1c, H2; `zawsze
no_targets` → H3; selektor bez filtra kontrolera → H1c; selektor właściciela
zawsze pusty → H2b; wycięcie wpisu `buff_land_creatures` → H4, H7;
`sacrifice_each_other_creature` → H5, H7; `mill_cards` → H3, H7;
`empty_library` → `no_targets` → H3; wycięcie masowej idempotentności
(untap_all) → H6.

## L100 (2026-08-31) — przypadek

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


**Grep rodzeństwa i mutacje (wyniesione z rejestru 2026-09-06):**
`pay_or_sacrifice_required`, `counter_pay_required`,
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

## L99 (2026-08-31) — przypadek

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

## L98 (2026-08-31) — przypadek

**Objaw (M261, zgłoszenie właściciela):** modal „Rozgrywka" doklejał
„Tura N — Ty" + „Dobierasz…" do ogona tury bota (rozstrzygnięty Divest,
discardy z cleanup, obrażenia z walki) w jednym oknie — bufor ruchów
narastał między pauzami bez świadomości, że przekroczył granicę tury.

**Przyczyna:** bufor czyszczony był tylko przy POKAZANIU; wszystko, co
nastąpiło między pauzami, lądowało w jednej paczce bez względu na to,
czy zaczęła się nowa tura. Render rysuje JEDNĄ paczkę na raz, więc
„naprawa w renderze" nie istnieje — granica musi być widoczna w buforze.

**Proza z rejestru (kondensacja 2026-09-20e):**

5. Test wariantów patrzy na BLOKI, nie na przebieg: co najwyżej jeden
   nagłówek tury na blok i nagłówek zawsze pierwszą linią, na wielu
   seedach — RED złapał „Divest zostaje rozstrzygnięty | Tura 3 — Ty".
## L97 (2026-08-31) — przypadek

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

---

**Proza z rejestru (kondensacja 2026-09-20e):**

**Strażnik (pełna lista):**
**Strażnik:** `test/m260-uwagi-wlasciciela.test.js` (13 testów: silnik,
widok FoW, wizard 3-krokowy, etykiety, log, Pyxis CR 406.3, scenariusz
pustej biblioteki). Czerwienieją po cofnięciu każdej z czterech napraw.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m260-uwagi-wlasciciela.test.js` (13 testów; po cofnięciu
każdej z czterech napraw czerwienieje; scenariusz pustej biblioteki).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L97)
## L96 (2026-08-30) — przypadek

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

## L95 (2026-08-30) — przypadek

**Objaw (M258/F3 — ward):** mechanika resolve_ward_pay_choice działała
regułowo po napisaniu handlera w game-state.js — a testy W2 padały na
`invalid_command` (COMMAND_TYPES), potem na wyjątek w event() (EVENT_TYPES).
Kolejne pominięcia czekały dalej: 6 list-strażników priorytetu (4274/5227/
6118/6303/6420/6429 — pominięcie = nadpisanie priorytetu i zakleszczenie),
klasyfikator poleceń OBU botów (heuristic + aggro), PAYMENT_DECISION_TYPES
kreatora many, describeGameEvent, 3 mapy etykiet render.js + opis komendy.

## L92 (2026-08-30) — przypadek

**Objaw (audyt PR #88, M258/A3):** README mówił „3735/3735 testów, 2894.7 kB"
— to stan sprzed 8 etapów TEGO SAMEGO PR-a (naprawa D1 z audytu PR #87 weszła
w etapie 1, potem etapy 3–10 dołożyły 76 testów i 39 kB). Recydywa D1 w
kwartał, tym razem w obrębie jednej sesji.

**Przyczyna:** „Bieżący stan" zaktualizowano w środku sesji (przy okazji
innego zadania), a każdy kolejny zielony commit z definicji go dezaktualizuje.
Kolejne etapy miały własne bramki (testy/build), ale żadna bramka nie patrzy
na README — dokumentacja nie czerwienieje.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/dokumentacja-budzet-lektury.test.js` pilnuje budżetu
lektury, NIE zgodności liczb — egzekwowanie reguły 1 pozostaje procesowe
(domknięcie sesji wg ENVIRONMENT §7).
## L88 (2026-08-29) — przypadek

**Objaw:** `node tools/benchmark.mjs --full` kończył się „Kontroler nie znalazł ruchu mimo legalnych komend" — bez meczu,
bez stanu. Drugi bieg po to samo. Po dopisaniu kontekstu do narzędzia
diagnoza zajęła 60 s: tura 15, `combat_damage`, priorytet p2, oferta
`activate_ability, concede`.

**Przyczyna:** reguła M172/C „pass nie domknie kroku obrażeń" żyła w DWÓCH
kopiach — `execute` (odrzucenie `combat_unresolved`) i budowa oferty
(`blockedByCombat`) — i obie blokowały pass KAŻDEMU graczowi, choć jedyna
alternatywa (`resolve_combat`) jest oferowana wyłącznie graczowi AKTYWNEMU.
Obrońca zostawał z samym `concede`.

## L87 (2026-08-29) — przypadek

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

**Sygnał:** log mówi „brak efektu", a stan się zmienił — sprawdź emisję, nie
treść efektu.

## L86 (2026-08-28) — przypadek

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

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`session.artPausePending` / `continueArtPlay()`
(`src/table/session.js`), `createArtShowcaseQueue` (`src/table/art-showcase.js`),
testy C1–C3 w `test/m254-uwagi-wlasciciela.test.js`.
## L85 (2026-08-28) — przypadek

**Objaw (Batch 51, Kulrath Mystic — „Whenever you cast a spell with mana value
4 or greater"):** warunek `spellManaValueAtLeast: 4` czytał
`eventData.manaCost` zdarzenia `permanent_cast`: przepuszczał czar z obniżką
(MV 5 zapłacone {3}) i odrzucał czar bez obniżki przy koszcie alternatywnym.
Testy karty były zielone, bo w nich koszt = mana value.

**Przyczyna:** jedno pole niosło dwa fakty: `eventData.manaCost` w zdarzeniu
rzutu to koszt ZAPŁACONY (po obniżkach, po koszcie alternatywnym), a mana
value (CR 202.3) wynika z kosztu WYDRUKOWANEGO, czyli
`eventData.object?.manaCost`.

## L84 (2026-08-28) — przypadek

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

## L82 (2026-08-28) — przypadek

**Objaw (M251):** poprawna etykieta „Użyj domyślnego przydziału (zabójcze
obrażenia…)" złamała test `choice-request-ui` — test lokalizował przycisk po
TEKŚCIE (`findAll(host, 'button', 'Domyślnie')`), nie po klasie
`damage-wizard-default`. Copy poprawne + logika poprawna = test czerwony.

**Przyczyna:** jeden test wiązał DWIE rzeczy — lokalizację widgetu i regułę
gry — przez najbardziej lotną warstwę (copy). Etykiety tekstowe to warstwa,
którą najczęściej ruszają uwagi UX (M162/C, M202/D, M211); kontraktem DOM jest
klasa semantyczna / `data-*`. Test pisał się wtedy, gdy copy było stabilne.

## L81 (2026-08-28) — przypadek

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

## L80 (2026-08-26) — przypadek

**Objaw (M220, pętla jakości, h9):** bot aktywował Saddle na Trained Arynx
(`set_saddled`, idempotentny do EOT) 3× w jednej turze, tapując kolejne stwory
za nic — mimo że `set_saddled` był w `IDEMPOTENT_EOT_EFFECTS`.

**Przyczyna:** strażnik (`pendingTwin`, M179/B) sprawdzał tylko, czy
IDENTYCZNA aktywacja WISI NA STOSIE. Gdy pierwsza się rozstrzygnęła i nadała
stan, na stosie nic nie wisiało, a flaga `saddled` siedziała na permanencie.
Strażnik pilnował KOLEJKI, nie SKUTKU.

## L78 (2026-08-26) — przypadek

**Objaw:** `docs/LESSONS.md` (1930 linii) i część ADR-ów zostały obejrzane we
fragmentach (kilka najnowszych lekcji + nagłówki), bo narzędzie czytające
zwracało pliki z ucięciem (`truncated`/`hasMore`). Właściciel: „jeśli jakiś
plik z obowiązkowej lektury nie został przeczytany w całości, to należy go
pobrać tak, żeby przeczytać go w całości".

**Przyczyna:** „zielony" odczyt jednego chunka wygląda identycznie jak
przeczytanie całości (jak L68: brak skutku nieodróżnialny od poprawnego), a
AGENTS.md §0 nie nazywało wprost, że pojedynczy plik też czytasz do końca.

## L77 (2026-08-26) — przypadek

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

## L71 (2026-08-25) — przypadek

**Objaw (M212):** naprawa wyceny darmowego rzutu wyglądała na działającą
(testy zielone), a była martwa: helper szukał opisu czaru po `cmd.cardId` w
`view.zones.exile` i zawsze dostawał `undefined`, więc kara za zły cel
wynosiła 0 — tyle samo co przed naprawą.

**Przyczyna:** oferta niesie DWA identyfikatory — `cardId` (która karta) i
`objectId` (który obiekt w strefie). Deskryptor `spell` wisi na OBIEKCIE
(CR 400.7: karta zmieniająca strefę to nowy obiekt). Lookup po `cardId` w
strefie obiektów jest składniowo poprawny i semantycznie pusty.

## L68 (2026-08-25) — przypadek

**Objaw (M210):** sonda sprawdzająca, czy obrażenia z delirium respektują
`protection from red`, wypisała „OK — brak obrażeń". Komenda w ogóle się nie
wykonała (`ok:false`, `unsupported_command`) — `pending` nie miał pola
`opponentId`, filtr kandydatów zwracał pustą listę. Brak skutku wziąłem za
poprawny skutek.

**Przyczyna:** sonda mierzyła STAN KOŃCOWY (`damage === 0`), nie sprawdzając,
czy badana ścieżka w ogóle pobiegła. Każdy powód odrzucenia komendy
(literówka w polu, brak klucza, niespełniony warunek) daje ten sam „zielony"
obraz co poprawna implementacja.

## L69 (2026-08-25) — przypadek

**Objaw (M210):** podstawowe landy miały `colors: ['R']` — pole „kolor"
zapisano jako „jaką manę produkuje". Kolor obiektu wyznacza koszt many
(CR 202.2), a land kosztu nie ma, więc każdy land był kolorowy: po animacji
(Awaken) Swamp stawał się czarnym stworem, obchodził „protection from black"
i spełniał „can't be blocked except by black". Test regresyjny utrwalał
pomyłkę (`def.colors === ['B']` z komentarzem „produkuje {B}").

**Przyczyna:** dwa pojęcia w jednym polu, bo dla landu „czarny" brzmi tak samo
w obu znaczeniach. Ujawnione przy okazji: Immersturm Skullcairn NIE MIAŁ
deskryptora `{T}: Add {B}` — działał wyłącznie dzięki tej pomyłce.

## L67 (2026-08-25) — przypadek

**Objaw (M209):** sweep Żywego Testera zaraportował `srodziemie vs ravnica s=7`
jako `[STOP] brak akcji w kroku 59`, choć w tej samej linii stało „Koniec
partii — wygrywa Bot". Podsumowanie policzyło partię jako niedokończoną
(`koniec=0`) i fałszowało obraz audytu.

**Przyczyna:** `run-game.mjs` miał helper `isGameOver()` z komentarzem
opisującym ten przypadek („panel akcji jest wtedy pusty prawidłowo"), wołany w
dwóch miejscach — ale NIE w gałęzi `res === 'none'`, czyli tam, gdzie pusty
panel jest objawem.

## L66 (2026-08-25) — przypadek

**Objaw (M208):** lektura startowa z `AGENTS.md` §0 ważyła ~605 kB (~194-258
tys. tokenów), z czego **384 kB to `PROJECT_STATE.md`** — „bieżący stan
projektu" urósł do 125 sekcji i 5904 linii (~80 sesji wstecz).

**Przyczyna:** plik miał w nazwie „STATE", a w treści był dziennikiem. Każda
sesja dopisywała sekcję (słusznie, ADR 0013), nikt nie pilnował SUMY, bo
żadna reguła nie mówiła, ile lektura MOŻE ważyć.

## L65 (2026-08-25) — przypadek

**Objaw (M207, mutacja):** `targetSlotsOf` ma dwie bramki: (1) warianty równej
długości, (2) pozycje nie dzielą kandydatów. Test B2 (Fireball „up to three" i
„any number of targets" → płaska lista) był zielony; mutacja USUWAJĄCA bramkę
(2) przeżyła — 23 testy dalej zielone.

**Przyczyna:** oba przypadki mają warianty RÓŻNEJ długości (`sizes = [1, 2]`),
więc odpadały na bramce (1) i nigdy nie docierały do (2). Zieloność była
zasługą innej linijki.

## L63 (2026-08-25) — przypadek

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

## L64 (2026-08-25) — przypadek

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

**Uwaga poboczna:** `attacking` NIE jest polem obiektu — `playerView`
wyprowadza je z `state.combat.attackers`. Test ustawiający je wprost przechodzi
z niewłaściwego powodu.

## L60 (2026-08-24) — przypadek

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

**Dopisek (pułapka weryfikacji):** test uruchamiający CLI dziedziczy jego
zależności — strażnik M203 był zielony lokalnie i CZERWONY w CI, bo
`run-game.mjs` importował `jsdom` statycznie, a CI (`node
tools/run-tests.mjs all`) nie robi `npm i` w `tools/table-tester`. Fix: leniwy
`await import('jsdom')` w `boot()`
(walidacja argv, `--help`, `--list-decks` nie potrzebują DOM). „Zielone
lokalnie" ≠ „zielone w CI".

## L59 (2026-08-24) — przypadek

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

## L58 (2026-08-23) — przypadek

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

## L57 (2026-08-23) — przypadek

**Objaw (M200/A):** właściciel: „bot wszedł do Forge i wzmacnia MÓJ stwór — to
bez sensu, powinien fizzle, gdy nie ma [własnej] kreatury". Wdrożyłem ślepko
(kandydaci pokoju = tylko własne stwory, 3 testy, commit, push). Właściciel po
analizie Oracle wycofał zgłoszenie: zdolność pokoju MUSI się rozstrzygnąć przy
istniejącym legalnym celu, a stwór przeciwnika jest legalnym celem. Fix
wycofany (revert + testy zamieniające).

**Przyczyna:** zgłoszenie z rozgrywki opisuje SYMPTOM z perspektywy gracza, nie
regułę. Zgoda właściciela na zgłoszenie ≠ weryfikacja regułowa (ADR 0022/0002:
silnik jest autorytetem reguł).

## L55 (2026-08-22) — przypadek

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

## L51 (2026-08-20) — przypadek

**Objaw:** klasa L50 po raz szósty (M96, M135, M138/Z1, M146, M156/F1,
M156/Q1+Q2): bot obdarowywał lifelink+indestructible stwora PRZECIWNIKA
(Lotusguard), rzucał prewencję „any target" we wroga (Withstand), przekazywał
liczniki +1/+1 najsłabszemu własnemu stworowi (Servant of the Scale). Efekt w
kontekście celowanym bez wyceny → wszystkie warianty remisują → pierwsza
oferta z listy.

**Przyczyna:** klasyfikacja żyje w rozproszonych miejscach (trzy tabele
heuristic-bota + `triggerTargetEffectFriendly` w game-state + gałęzie
per-effekt); nowy typ efektu nie wymusza żadnej z nich (wzorzec L28).

**Sygnał:** trzecia łatka w tej samej tabeli = inwentaryzacja wszystkich typów
i odwrócenie domyślności, nie czwarty wpis.

## L50 (2026-08-18) — przypadek

**Objaw:** dwie karty Batch 35 weszły z martwą wyceną: bot aktywował Basilisk
Gate ({2},{T}: +X/+X) na stwora PRZECIWNIKA i rzucał Twiddle na górę wroga w
swoim upkeepie (audyt Żywym Testerem M146) — testy engine zielone.

**Przyczyna:** nowe typy (`pump_by_gates`, `untap_permanent` w ścieżce czarów)
nie trafiły do wyceny; efekt spoza wyceny dostaje wartość domyślną, więc
wszystkie warianty remisują i bot bierze pierwszą ofertę z listy. Czwarte
powtórzenie klasy (M96, M135, M138/Z1).

**Dopisek (M255/E, Thunderstaff):** klasa wraca przy efektach, których
odbiorcą jest ZBIÓR. `{2}, {T}: atakujące stwory dostają +1/+0 do końca tury`
nie miało wpisu w `TEMPORARY_PUMP_EFFECTS`, więc zdolność miała gołą bazę
(`score = 2`) i bot palił ją w Głównej 1 (transkrypt `tarkir-wur vs
warhammer-wg`, tura 16). Wspólny mianownik potrzebuje jeszcze
**reprezentanta zbioru**: `recipient` był źródłem (artefaktem), więc
`combatTrickWindow` nie zachodził i bot dostawał karę „poza oknem walki"
ZAWSZE. Reprezentant = własny atakujący z `view.combat` (ADR 0017). Test
anty-over-fix (M255/E2) pilnuje, że bot nadal UŻYWA zdolności w walce.

## L1 (2026-08-14) — przypadek

**Objaw (trzykrotny):** bot pompował liczniki Station bez końca (M84), celował
zdolnością w nielegalne obiekty (M82), rzucił Inspire Awe i atakował we własną
prewencję (M91). Za każdym razem zgłoszone jako „bot-idiota".

**Przyczyna:** `PlayerView` nie niosło danych potrzebnych do decyzji.
Kontroler dostaje WIDOK, nie stan (ADR 0003) — pole spoza widoku jest dla niego
fizycznie nieosiągalne.

**Metoda audytu (do powtórzenia):** zestaw trzy zbiory — pola
`createGameState`, zawartość `playerView`, odczyty `view.X` w kontrolerach.
Pole obecne w stanie, nieobecne w widoku i wpływające na wybór komendy = luka
(audyt M92 znalazł pięć, w tym brak `types` permanentu).

## L5 (2026-08-14) — przypadek

Strażnik, który da się przejść bez zmiany kodu, nie jest strażnikiem. Cztery
warianty tej samej pomyłki:

| Wariant | Przypadek | Dlaczego zielony |
|---|---|---|
| **grep po źródle** (L5) | ptaszek wyciszenia: pięć testów regexami na `ignoredOptionKeys` | kod istniał, ale nie był wołany w tej ścieżce UI |
| **komentarz = pokrycie** (L83) | `fingerprint-pending-decisions`: liczył każde `pending*` w pliku | wzmianka w KOMENTARZU zaliczała pokrycie; nowa decyzja znów wyciekłaby z odcisku |
| **słownik zamiast miejsc użycia** (L31) | „każdy event triggera ma wpis w `TRIGGER_EVENT_LABELS`" | ten sam `case` miał trzy `return`, słownika sięgał jeden — strażnik pilnował DANYCH, błąd był w KODZIE |
| **„brak danych = pomijam"** (L26) | `imageUri` zgadza się z plikiem Scryfall | `if (!expected) continue` — 20 kart weszło bez pliku źródłowego, więc zasięg testu malał, a wynik sugerował coś odwrotnego |

**Przy okazji (L26):** ta sama sonda wykryła cztery rozjazdy TEKSTU reguł, w tym
realny błąd (Cellar Door: katalog „mills 1", Oracle „puts the bottom card…").
**`oracleText` to dane do maszynowej weryfikacji** (L23), nie komentarz.

**Proza z rejestru (kondensacja 2026-09-20e):**

5. Testy UI renderują i sprawdzają WYNIK (drzewo elementów, reakcja na
   zdarzenie), nie obecność napisów w pliku.
## L11 (2026-08-14) — przypadek

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

## L12 (2026-08-14) — przypadek

**Objaw:** audyt Żywym Testerem (M96) stanął na `[STOP] brak akcji` w oknie z
przyciskiem „Epic Experiment: zakończ (reszta kart do grobu)". Człowiek by go
kliknął — to była luka w polityce gracza (`pickAction`), nie błąd UI.

**Ryzyko:** reakcja „ta talia się nie testuje" albo zmiana seeda cicho zawęża
zakres kolejnych audytów; po czasie nie widać, że całe mechaniki nigdy nie
były sprawdzone na żywym stole.

**Druga strona:** odróżniaj ARTEFAKT NARZĘDZIA od BŁĘDU PRODUKTU (jsdom nie
liczy CSS ani nakładek, więc sklejony wskaźnik tury i brak P/T na kaflach w
transkrypcie NIE są błędami UI). Zanim zgłosisz bug, potwierdź źródło w kodzie.

**Checklisty:** `docs/setup/TESTER_STOLU.md` → „Czego szukać".

## L13 (2026-08-15) — przypadek

„Zielony" nie znaczy „pilnuje". Trzy niezależne przypadki tej samej klasy:

- **Detektor (L13, M102):** dziewięć detektorów Żywego Testera miało komplet
  testów jednostkowych. Mutacja (świadome przywrócenie naprawionego buga)
  pokazała, że `detectNoResponseWindow` daje FAŁSZYWY alarm pod `--quiet`,
  `detectDeadEndWindow` widzi jedno okno na partię zamiast wszystkich, a
  przypadku właściciela („ekran z samym *Poddaj partię*") nie odtwarzał ŻADEN
  profil — brakowało profilu `impatient`, nie dowodu, że błędu nie ma.
- **Test regresyjny (L61, M205):** dwa testy „przypinające" fix deduplikacji
  były zielone także PO cofnięciu fiksu. Dane nie miały kształtu, w którym fix
  działa: test mierzył `flush()`, nie naprawę.
- **Gałąź kodu (L70, M210):** mutacja gałęzi „Land → kolor pusty"
  (`effectiveColors`) nie uczyniła nic czerwonym, bo regułę egzekwowały już dane
  kart. Gałąź była martwa **i błędna** — Genju of the Spires („becomes a 6/1 red
  Spirit creature land", CR 613 warstwa 5) traciłby kolor.
- **Zła struna mutacji (L114, M282):** przy bramce `A && !B` podmiana `!B` na
  `false` ZNOSI warunkowanie zamiast je zacisnąć — komplet zieleni sugerował, że
  asercja pilnuje. Mutacja ma sprowadzać kod do stanu PRZED naprawą (tu: usunąć
  `!B`), a nie do stanu „bramka szeroko otwarta".

**Efekt uboczny (M102):** sama ta weryfikacja wykryła trzy realne błędy
produkcyjne (log „wskazuje **?** z ręki przeciwnika", brak rozstrzygnięcia czaru
bota w modalu, brak skutku `+3/+3`).

## L14 (2026-08-15) — przypadek

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

**Nie każdy trop to błąd:** crew/saddle przeszło 9 sprawdzeń (timing, stos,
chore stwory, „other creatures", typ Artifact, cleanup) BEZ znalezisk — warto
to zapisać, żeby następna sesja nie badała drugi raz. Pilnuj tylko, by narzędzie
repro nie kłamało: pozorna utrata typu `Artifact` okazała się luką skryptu
(`gameObjectDataOf` nie zwraca `types`; prawdziwa ścieżka to `createCardDeck`).

## L15 (2026-08-16) — przypadek

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

**Druga część:** przy takim polowaniu POŁOWA tropów to fałszywe alarmy (4 na 7)
— każdy zweryfikowany zapisz z uzasadnieniem. Szczególnie zdradliwe są
artefakty własnych narzędzi („brak badge'a wyposażenia" = luka
`extractTileText` nie czytającego `.ovl`).

## L16 (2026-08-16) — przypadek

**Objaw:** detektor `noop` (automatyzacja L15) dostał fałszywy alarm na
craftcie Lodestone Needle: „jedyna zmiana to zapłacony koszt", choć kliknięcie
otwierało WYBÓR artefaktu do wygnania.

**Przyczyna:** `stateFingerprint` pomijał 36 pól wstrzymujących grę (w tym
`pendingCraftExile`), więc dwa stany różniące się oczekującą decyzją miały TEN
SAM fingerprint. Osłabiało to też weryfikację replayów (M101/B2).

## L17 (2026-08-16) — przypadek

**Objaw:** sonda „oferta bez skutku" działała w Node, a w artefakcie umierała
(„runProbeCommandEffect is not defined", potem „structuredClone is not
defined"). `npm test` tego nie widzi: build jest sprawdzany pod kątem
determinizmu, nie wykonania nowych ścieżek.

**Przyczyna:** (1) `tools/build.mjs` skleja moduły w JEDEN scope
(`assertNoNameCollisions`) — `import { x as y }` nie tworzy wiązania, a build i
testy kolizji milczą (w repo NIE ma ani jednego aliasu: to konwencja).
(2) Artefakt wykonuje się w realmie jsdom bez `structuredClone`.

## L20 (2026-08-16) — przypadek

**Objaw:** weryfikacja mutacyjna bramki ofert (M104) nie zadziałała: po
cofnięciu bramki panel oferował „Aktywuj: Rustvine Cultivator — odkręć → cel:
Forest", a oś `noop` raportowała zero. Detektor był sprawny — polityka gracza
klikała w tych oknach co innego, a sonda mierzyła WYŁĄCZNIE kliknięcie.

**Przyczyna:** pomiar przypięty do akcji gracza (jedna sonda na kliknięcie), a
przestrzeń ofert jest o rząd wielkości większa niż liczba kliknięć.

## L21 (2026-08-16) — przypadek

**Klasa:** dane karty jadą do gry przez kilka miejsc, z których KAŻDE wymienia
pola z nazwy (destrukturyzacja configu albo ręcznie budowany obiekt). Pole
nieznane danej liście ginie **bez błędu, ostrzeżenia i czerwonego testu** —
mechanika po prostu nie działa, a kafel dalej ją reklamuje.

| Warstwa | Miejsce | Ofiara |
|---|---|---|
| **fabryka obiektu** (L21) | `addObject` / `createGameObject` | `tapped` w teście Rustvine: ląd powstawał odkręcony, asercja sprawdzała stan początkowy i była zielona od zawsze |
| **generator danych karty** (L93) | `gameObjectDataOf` | — |
| **transport talii** (L93) | `installDeck` (`deck.js`) | `toxic`, `echo`, `madness`, `surge`, `warp`: Crawling Chorus bił trzy razy bez znaku trucizny |
| **fabryka tokenów** (L94) | `createBattlefieldToken` (`tokens.js`) | `manaCost`: KAŻDY token-kopia wchodził z MV 0 (CR 707.2 — koszt jest wartością kopiowalną) |
| **widok gracza** (L101) | wpis strefy w `playerView` | `warp`, `surge`, `kicker`, `treasureAltCost`: „Rzuć za warp: … (koszt ?)" |

**Dlaczego testy milczą:** piny mechanik budują obiekt WŁASNYM helperem
(`putCard` + `...gameObjectDataOf(def)`), więc omijają transport i fabrykę.
Wszystkie świecą zielono, a mechanika jest martwa w każdej partii z talią.

**Domknięte w M137 (warstwa fabryki):** `addObject` porównuje klucze
z `ADD_OBJECT_FIELDS` i dla pola spoza kontraktu wypisuje ostrzeżenie
z podpowiedzią raz na pole; `MTG_STRICT_ADD_OBJECT=1` zamienia je w wyjątek.
Twardy rzut wywalił 141 testów (pola wchodzą przez `...spread` w 46 plikach),
stąd tryb ostrzegawczy — wzorzec L38.

**Strażnicy:** `test/m258-zywy-tester-deskryptory.test.js` (D1–D3, realna
ścieżka talii) · `test/m265-hand-view-alt-cost-descriptors.test.js` (6, pierwszy
enumeruje katalog). Mutacje: usunięcie pola z `installDeck` → D1–D3; usunięcie
`warp`/`surge`/`kicker`/`treasureAltCost` z wpisu ręki → test 1 + etykiety.

**Proza z rejestru (kondensacja 2026-09-20e):**

Test anty-over-fix obowiązkowy (np. kopia PRZODU zachowuje koszt) — bez
niego fix „tył → 0" przechodzi zielono także z fabryką ignorującą pole.

**Przypadek:** dane karty jadą do gry przez kilka miejsc, z których KAŻDE
wymienia pola z nazwy (destrukturyzacja configu albo ręcznie budowany obiekt).
**Wpis zbiorczy** (klasa w czterech warstwach; kotwice: L93, L94, L101).

## L22 (2026-08-16) — przypadek

**Objaw:** po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne tapnięcie
gracza kończyło się „Ruch odrzucony: illegal_cast: Zagranie poza main phase" /
„not_priority" (3 przypadki w macierzy M104; przy `--tick-rate 0` żadnego).
Ruchy bota z tego momentu nie trafiały do modala „Rozgrywka".

**Przyczyna:** `toggleIgnoredOption` renderował panel, a DOPIERO POTEM wołał
`session.recheckAutoPass()`, które przewija grę (auto-pass, tura bota). Po
przewinięciu nie było renderu, więc na ekranie został panel z MINIONEGO okna —
z komendami sprzed przewinięcia.

## L25 (2026-08-17) — przypadek

**Objaw:** po dołożeniu jednej karty do `decks/green.txt` posypało się pięć
testów niezwiązanych z nowymi kartami („log nie opisuje tworzenia tokenu",
„nie znaleziono żadnej okazji zagrania", „żaden seed nie dał własnego
surveil"). Jeden był inny: token POWSTAŁ i log go opisał — „Ty tworzysz
token", a asercja szukała „tworzy token". Wcześniej ten sam seed dawał token
BOTA.

**Przyczyna:** warstwa opisu odmienia czasownik zależnie od gracza („tworzysz"
/ „tworzy"), a test trafił w jedną z form; zmiana talii przetasowała rozgrywkę.

## L27 (2026-08-17) — przypadek

Dwukrotnie ten sam wynik: 12 partii (L27) i 22 partie (L40) z pustą sekcją
`== DETEKTORY ==`, a ręczna lektura TYCH SAMYCH transkryptów dała odpowiednio
pięć i dziesięć realnych błędów — w tym bota płacącego maną za wzmacnianie
CUDZYCH stworów 24 razy w jednej partii.

**Cztery powody, dla których detektor milczy:**

| Powód | Przypadek |
|---|---|
| **Nie ma takiej reguły** (L27) | detektory pilnowały tego, co znalazły poprzednie audyty; nikt nie patrzył na gramatykę tekstu ani odróżnialność opcji modala |
| **Reguła zna jedną przekątną** (L40) | `detectBotSelfTargeting` pilnował efektu SZKODLIWEGO w SIEBIE; efekt KORZYSTNY w PRZECIWNIKA nie miał strażnika |
| **Detektor jest martwy w używanym trybie** (L73) | ustalał właściciela celu z snapshotów „MOJE POLA:”, a audyt biega z `--quiet`, gdzie snapshotów prawie nie ma — warunek nigdy nie był spełniony |
| **Pomiar myli dwa zjawiska** (L75) | zdolność tapuje ŹRÓDŁO (koszt) i CEL (skutek); jeden licznik na oba dawał „jedyna zmiana to zapłacony koszt" → fałszywy no-op |

**Pułapka techniczna:** `\b` w regexie NIE działa po polskich diakrytykach
(„kartę" → granica przed „kart" daje fałszywe alarmy). Używaj `(?![\p{L}])`
z flagą `u`.

**Proza z rejestru (kondensacja 2026-09-20e):**

5. Gdy detektor oskarża kod, który po sprawdzeniu jest POPRAWNY, błąd leży
   w POMIARZE — napraw pomiar, nie dopisuj wyjątku na nazwę karty. Jeden licznik
   na dwa zjawiska zawsze skłamie, gdy wystąpią razem. Po uciszeniu alarmu
   udowodnij, że detektor nadal krzyczy na prawdziwym przypadku (L67).

6. Skan transkryptu czytaj PER ETYKIETA: `LOG:` stołu to gra,
   `RĘKA:`/`POLA:` to tekst karty (fałszywe pozytywy skanów), a fraza
   z `textContent` bywa artefaktem ekstrakcji (ikony many) — zanim zgłosisz
   defekt, sprawdź źródło w renderze.

## L28 (2026-08-17) — przypadek

Bot tapował własne stwory (Chill of the Grave, Entrancing Lyre) i zakładał
aurę-kotwicę na własnego stwora, choć kary za niszczenie/wygnanie/obrażenia we
własne rzeczy istniały od M91–M96. Powód to WZORZEC PRACY, nie „zapomniany
przypadek": każda kara powstawała jako reakcja na zgłoszenie i obejmowała
jeden typ efektu; nowy typ startował bez ochrony.

**Towarzysząca zasada:** testy ANTY-OVER-FIX obowiązkowe — kara na „własny cel"
trywialnie degeneruje się w paraliż, więc każdy naprawiony przypadek ma
bliźniaczy test, że karta nadal działa na permanent przeciwnika.

## L29 (2026-08-17) — przypadek

Trzy z dziesięciu błędów M122 miały ten sam kształt: gracz widział surowy
identyfikator (`trigger (enchanted_permanent_tapped)`, `efekt
(attach_equipment_to_source)`, `trigger (delayed)`), bo mapa etykiet kończyła
się `LABELS[key] ?? key`. Taki fallback nie wywala się i nie loguje ostrzeżenia
— wypuszcza wewnętrzną nazwę do UI.

**Pułapka:** skanuj też źródła spoza bazy danych. Pierwsza wersja strażnika
czytała wyłącznie `card-data.js` i przepuściła `delayed`, bo ten event rodzi się
w `src/engine/triggers.js`. Niezmiennik jest wart tyle, ile kompletność zbioru,
po którym iteruje.

## L30 (2026-08-17) — przypadek

Modal „Rozgrywka" pokazywał ilustrację karty dobranej przez bota, choć tekst
wpisu był poprawnie bezimienny („Nieprzyjaciel dobiera kartę"). Powód: wpis ma
DWIE niezależne ścieżki renderu — tekst z `describeGameEvent` i miniaturkę z
`entry.cardId`; zabezpieczono pierwszą, o drugiej zapomniano, bo powstała
później (M89, dla Curate).

**O testowaniu:** asercja „czy ta karta jest gdzieś w ręce bota" jest za słaba i
daje fałszywe alarmy (bot zagrał Zoraline jawnie, druga kopia leżała w ręce) —
sprawdzaj strefę docelową KONKRETNEGO zdarzenia (naprawa zostawia jawny ślad
`hiddenDestination`).

## L32 (2026-08-17) — przypadek

Karta z flash pojawiała się w panelu dwa razy (`playerView` enumeruje ją w
blokach flash i main-phase). Istniała już bramka na ten przypadek — tylko dla
AUR. Trzecia bramka rozwiązałaby zgłoszenie i zostawiła lukę dla czwartego
bloku.

**Anty-over-fix:** dedup idzie po PEŁNEJ tożsamości komendy, nie po
`type`+`objectId` — aura z trzema celami to trzy RÓŻNE decyzje.

## L33 (2026-08-17) — przypadek

Transkrypt Żywego Testera zwijał identyczne kafle (klucz: 40 znaków tekstu):
dwa realne permanenty widniały jako jeden. Gdy panel akcji pokazał dwie grupy
„Cel zdolności: Guidestone Compass", a stół — jeden, diagnoza poszła w stronę
nieistniejącego błędu UI. Prawda była odwrotna: UI miało rację, kłamał snapshot
(drugi Compass to token-kopia z Cogwork Assemblera).

## L36 (2026-08-17) — przypadek

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

**Koszt:** testy z zamrożonym seedem wymagają przelosowania po zmianie talii —
to normalne. Ale test opisujący PRZYPADEK („w ręce jest 7 różnych kart") pęka
przy każdej zmianie; przepisany na REGUŁĘ („oferta = liczba różnych kart")
przestaje być kruchy.

## L38 (2026-08-18) — przypadek

**Objaw:** walidacja kontraktu `addObject` (L21) włączona twardo dała 141
czerwonych testów — „zrób to porządnie" oznaczało „nie rób tego nigdy"
(leżało w backlogu dwa dni).

**Przyczyna:** narzędzie miało jeden tryb — rzucaj. Koszt wdrożenia = koszt
spłaty CAŁEGO długu z góry.

**Efekt uboczny:** samo włączenie ostrzeżeń wyprodukowało listę miejsc, gdzie
test mierzył coś innego, niż deklarował (dwa fałszywie zielone). Strażnik
najpierw robi audyt.

## L41 (2026-08-18) — przypadek

**Objaw:** kafel Goblin Pickera obiecywał „{1}, {T}: dobierz 1 kartę", a
aktywacja odrzucała kartę z ręki i wymagała czerwonej many (Oracle: `{R}, {T},
Discard a card: Draw a card`).

**Przyczyna:** koszt liczyły TRZY miejsca — `abilityCostHtml` (przycisk),
`costTextOf` (kafel) i inline w `describeAbility` — każde z innym podzbiorem pól
(jedno `discardCards`, żadne `discardCard`, tylko jedno pipy kolorów). Audyt 304
kart: osiem pól kosztu bez pokrycia.

**Rodzina, nie przypadek:** ta sama diagnoza objęła etykiety celów („stwór o
sile ≥" bez liczby), deskryptory aur (`losesKeywords` — kafel bez treści) i typy
permanentu (kafel czytał rejestr zamiast stanu: Spacecraft po progu Station
dalej wyglądał na artefakt). Naprawiając jedno pole, skanuj CAŁĄ rodzinę.

## L42 (2026-08-18) — przypadek

**Objaw (uwaga właściciela):** „najefektywniejsze jest tapowanie kreatur
przeciwnika po jego fazie untap — wtedy kreatura jest nieczynna i w ataku, i w
obronie". Bot tego nie widział: wycena `8 + 2*power` zależała wyłącznie od tego,
KOGO tapujemy, więc tapował w oknach najsłabszych (własny koniec tury — efekt
kasował się przy untapie przeciwnika).

**Przyczyna:** przy efektach trwających „do czegoś" wartość ma ILOŚĆ CZASU
obowiązywania, nie sam skutek.

**Haczyki z wdrożenia:** (1) tapnięcie ZADEKLAROWANEGO atakującego nie cofa
ataku (CR 506.4) — okno „w trakcie walki" wygląda dobrze, a jest prawie
bezwartościowe; (2) kara „nie rób tego w złym oknie" nie może dotyczyć akcji
niewykonalnych w dobrym (sorcery tylko we własnej głównej fazie — kara
zamieniłaby kartę w niegrywalną). „Poczekaj na lepszy moment" rozstrzygaj
deskryptorem (`timing`, typ karty), nie nazwą (ADR 0002).

## L43 (2026-08-18) — przypadek

**Objaw:** reguła CR 704.5e („token poza polem bitwy przestaje istnieć")
napisana po deskryptorze „token = obiekt z polem `name`" skasowała zwykłe KARTY
(testy legalnie nadawały `name`, np. `name: 'Forest'` dla landa w bibliotece).

**Przyczyna:** „token ma `name`, karta nie ma" to prawda STATYSTYCZNA, nie
definicja. Dotychczasowe użycia (`delirium`, wybór z grobu) tylko POMIJAŁY
obiekt (koszt pomyłki: jedna niepoliczona karta); nowa reguła USUWAŁA obiekt.

**Skutek uboczny:** usunięcie obiektu z `state.objects` zabiera triggerom do
niego dostęp (trigger „permanents you control leave the battlefield" przestał
widzieć tokeny). Zdarzenie musi nieść LKI (CR 603.10), a trigger czyta je ze
zdarzenia. Reguła kasująca obiekty przechodzi przez listę „kto o nie pyta".

## L44 (2026-08-18) — przypadek

W silniku stało `// CR 701.38: goaded creatures can't block` w trzech miejscach,
z testem utrwalającym. CR 701.38b mówi wyłącznie o WYMOGACH ATAKU — o blokowaniu
ani słowa; silnik odbierał obrońcy legalne bloki. Błędna interpretacja zyskuje
pozory prawdy przez powtórzenie: komentarz cytuje numer, test „potwierdza",
kolejne sesje omijają temat jako sprawdzony.

## L45 (2026-08-18) — przypadek

**Objaw:** widok ukrywał `cardId` i linię typów zakrytego permanentu (CR 708.2),
a każdy z pięciu morphów dawał się rozpoznać po `subtypes` („Bird", „Human
Wizard") i po deskryptorze `morph` (koszt obrócenia + KOLORY karty).

**Przyczyna:** ukrywanie dodano punktowo przy polu, które akurat zdradzało za
dużo; każde następne pole (podtypy „bo bot potrzebuje", morph „bo etykieta")
omijało bramkę, bo bramka pilnowała pól zamiast KLASY informacji.

## L46 (2026-08-18) — przypadek

**Objaw:** Spacecraft Wedgelight Rammer (próg 9+ charge → stwór) ożywiony
animacją Skilled Animator do 5/5, po 9 charge i końcu tury wracał do artefaktu
mimo spełnionego progu: `clearStatModifiers` odtwarzał
`originalBeforeAnimation` (rodzaj artefakt), nie sprawdzając, czy trwały warunek
station nadal czyni go stworem.

**Przyczyna:** dwa współistniejące stany o różnej trwałości — animacja
(chwilowa, zapis cofnięcia) i station (trwały, liczniki charge). Cleanup znał
tylko pierwszy.

**Sygnał:** każdy `clearStatModifiers` / `removeCounter` / `addCounter`
dotykający `kind`/`types` idzie przez `syncStationKind`. Synchronizacja żyjąca
tylko w `addCounter` oznacza dziurę w każdej ścieżce czyszczącej
`originalBeforeAnimation`.

## L47 (2026-08-18) — przypadek

**Objaw:** token-kopia Wedgelight Rammer (Cogwork Assembler, CR 707.2) rodziła
się jako artefakt bez progu 9+ i nigdy nie stawała się stworem; ten sam wzorzec
w `Jwari Shapeshifter` (enter as copy) — kopia traciła `station`/`saga`.

**Przyczyna:** kopiowanie to ręczne przepisanie pól (`kind`, `power`,
`types`…), a lista pól rosła z mechanikami (station, saga — M33) szybciej niż
kopiowanie. Brak pola nie wywala testu: token po prostu zachowuje się jak
zwykły artefakt.

**Wykrycie:** fuzzer strukturalny nie złapie (token jest legalnym artefaktem).
Potrzebny test semantyczny: „token-kopia ma ten sam `station`/`saga` co
oryginał" (po deskryptorach, ADR 0002).

## L108 (2026-08-31) — przypadek (M270, błąd #9, CR 508.1c)

**Objaw:** goadowany stwór z „can't attack alone", jedyny zdolny do ataku,
unieruchamiał krok deklaracji atakujących — KAŻDA możliwa komenda była
odrzucana, partia stawała. Dotąd polowanie na błędy zakładało, że silnik robi
coś źle; tu silnik nie pozwalał zrobić NICZEGO. Test na deadlock („gracz ZAWSZE
ma co najmniej jedną legalną opcję") wyłapał drugą połowę błędu, której naprawa
pierwszej nie ruszyła: `legalAttackerOptions` zwracało pustą listę, więc silnik
nie proponował nawet legalnej deklaracji pustej.

## L125 (2026-09-03) — przypadek (M288/A, M292)

M288/A zbudował jeden komponent wiersza (`src/table/picker.js`), a
`test/m129-combat-wizard-dotyk.test.js` kazał każdej rodzinie kreatora mieć
WŁASNĄ regułę `min-height: 44px` w `index.html`. Efekt: bloki bajt w bajt
identyczne (po 261 znaków, różnił je tylko selektor), utrzymywane ręcznie
w dwóch miejscach — i strażnik zielony także wtedy, gdy wspólna rodzina straciła
próg dotyku, bo kopia w rodzinie kreatora nadal go miała. M292 odwrócił
zależność: test liczy deklaracje rozwiązane po realnej liście klas z renderera,
a drugi test pilnuje, żeby rodzina kreatora nie dublowała wyglądu wiersza.
Dopiero wtedy kasacja duplikatu była bezpieczna.

## L54 (2026-08-22) — przypadek (M179, klasa L50/L51)

**Objaw:** „kara −20 za trik we własnej main" (M146) nie działała od początku —
bazowa wartość rzutu czaru (~50–65) zjadała ją w całości i bot dalej rzucał
triki w Głównej 1. Kara ISTNIAŁA, tylko liczona w oderwaniu od sumy.

## L149 (2026-09-17) — przypadek (M374, znalezisko benchmarku quick-25 seed 2039)

**Objaw:** mecz `random(wiedzmin-bg) vs heuristic(tarkir-wur)`, seed 2039 —
`illegal_spell: Niewystarczająca mana` na komendzie, którą silnik sam
zaproponował: `cast_spell` Vandaliize {4}{R} (tryb „Zniszcz ląd"), gdy p2 miał
Górę z Nature's Embrace p1 („{T}: Add two mana of any one color"), 2 Równiny,
Wyspę i Jeskai Devotee ({1},{T}: Add {U}{R}{W}).

**Przyczyna:** oferta liczyła grant jako 2 jednostki (producibleMana), ale plan
kolorów (`planGrantManaColors`) uznawał grant za zużyty finansowaniem źródła
kosztowego i zwracał PUSTY plan — więc faza PIPÓW tapowała Górę z
`grantColor: null`, czyli za 1. Płatność produkowała 4 < 5 i rzucała
„Niewystarczająca mana" PO tapnięciu (odrzucona komenda zostawiała tapniętą
Górę i {R} w puli). Sonda `playerView` w chwili błędu pokazała 7 wariantów
oferty i odrzucenie pierwszego z nich.

**Naprawa:** (1) bez wiersza planu kolor grantu bierze `firstUncoveredPipColor`
(ten sam wybór co auto-tap sumy) — ląd z grantem zawsze produkuje cały grant;
(2) bramka sumy przeniesiona PRZED pierwszą mutację płatności (CR 601.2h).

## L48 (2026-08-18) — przypadek

**Cztery warianty rozjazdu:**

1. **Różny FILTR** (pierwotny L48). Bot wybierał biały czar na cel
   z `protection from white`: `legalSpellCasts` filtrował tylko
   `isProtectedFromSource`, a `validateTargets` sprawdzał też
   `effectiveProtectionFromColors`. Dla czarów bez `sourceObject` ochrona
   kolorowa była w ofercie niewidoczna.
2. **Niepełny REJESTR** (L48, aggro-bot). Lista `simple` z komendami `resolve_*`
   rosła wraz z mechanikami (`resolve_color_choice`, `resolve_index_choice`) —
   bot nie znał nowej i „nie znalazł ruchu".
3. **Niepełny SKAN RODZINY** (M254/A). `permanent_destroyed` (zniszczenie
   EFEKTEM: Murder, Spin Out) nie było w skanie triggerów „leaves the
   battlefield", który znał `creature_destroyed`, `permanent_sacrificed`,
   `object_moved` i `object_exiled`. Wormfang Newt zniszczony CZAREM zostawiał
   ląd w wygnaniu na zawsze, a zniszczony OBRAŻENIAMI oddawał go poprawnie.
4. **Różny PORZĄDEK bramek** (M254/E oraz L90 — dwa niezależne przypadki).
   Nie dwie kopie reguły, lecz **dwa porządki tej samej reguły**:
   `execute` sprawdzał rebound PRZED undercity, a `legalCommands` PO — silnik
   oferował `resolve_undercity_route` i sam go odrzucał. Identycznie
   `exploit` vs cel triggera (pełna macierz stanęła na 58,5%, seed 1003).

5. **Nowa decyzja blokująca przypięta tylko na ścieżce „szczęśliwej”**
   (audyt PR #130, 2026-09-20 — `resolve_aura_host`, CR 303.4f: gospodarza aury
   wracającej z grobu wybiera gracz, nie `battlefield.find(...)`). Trzy piny
   dowodziły, że wybór DZIAŁA (gracz wybiera Annie zamiast pierwszego w
   kolejności strefy; jedyny gospodarz domyka się sam; kandydat spoza listy
   odrzucony) — a mutacje BRAMEK przeżyły: Q3 (`cmd.playerId !==
   pending.playerId` → `aura_host_not_your_decision`), Q4 (gałąź
   `pendingAuraHost` w `firstPendingDecision`) i Q5 (wycena gospodarza przez
   `auraIsHostile` w bocie). Nie przypięte było: cudzy decydent, brak passa
   u właściciela decyzji (M337 — akcje opcjonalne nielegalne, gdy JAKAKOLWIEK
   decyzja czeka) i znak aury w wycenie. Lista siedmiu bramek (pkt 8 rejestru)
   wzięła się z tego pomiaru: oferta po wariancie, cudzy decydent, właściciel
   bez passa, pole w odcisku, etykieta + grupowanie, wycena bota, re-walidacja
   przy wykonaniu (CR 608.2b/LKI). Trzy z nich zapaliły się SAME, bez szukania:
   `test/b2-odcisk-straznik-pokrycia.test.js` B2/2 („odcisk nie pokazuje kluczy
   stanu: pendingAuraHost"), `m163` A3 i `m201` (nowa komenda `resolve_*` bez
   etykiety i bez klucza grupowania) — sieć strażników klasowych jest warta
   więcej niż najdłuższa lista kontrolna.

**Sygnał:** po nowym deskryptorze ochrony albo `resolve_*` uruchom
`node tools/benchmark.mjs --seeds 2` — `illegal_spell` lub „nie znalazł ruchu"
oznacza niekompletną ofertę.

**Strażnicy:** `test/m254-kolejnosc-pendingow.test.js` ·
`test/m255-petla-jakosci.test.js` (G1: replay adresu z macierzy, seed 1003;
G2: Exploit blokuje wyłącznie jako PIERWSZA decyzja). Mutacje: „bramka blokuje
każdego" → G1 czerwone; „blokuje właściciela bez względu na porządek" → G1 czerwone.

**Rozszerzenie (2026-09-02, audyt PR #92 / `docs/audits/AUDYT_PR92_2026-09-02.md`) —
piąty wariant: rozjazd w DRUGĄ stronę.** Naprawa zgłoszenia „oferta jest no-opem"
skręciła filtr oferty, ale **nie ruszyła walidacji** (M280/F). Efekt: gracz i bot
nic już nie widzą, natomiast `resolve_discover_choice { castFree: true }` wysłany
wprost — przez test, replay albo sterownika budującego komendy samodzielnie —
nadal był przyjmowany i kładł czar na stosie bez celów (fizzle, CR 608.2b).
Wniosek, którego brakowało w punktach 1–3: **zawężenie samej oferty nie jest
naprawą**. Ofertę czytają UI i boty, `execute()` czytają WSZYSCY; więc filtr musi
mieć jedno ciało wołane z obu stron (u nas: `outsideHandCastScope`), a zmiana
którejkolwiek strony wymaga drugiej w tym samym commicie. Test dowodowy: assertion
na ODRZUCENIE komendy spoza oferty, nie tylko na brak oferty (samo „oferta pusta"
byłoby zielone również przy lukawej walidacji).

**Powtórka B7 (quick 25 talii, 2026-09-17b):** dwie gałęzie oferty z WŁASNĄ
enumeracją pola bitwy — „{X}, {T}: cel o sile ≤ X" (Entrancing Lyre) i „any
target" zdolności nadanej przez sprzęt (Blazing Torch) — proponowały cudzego
stwora z hexproof, którego walidacja odrzucała. Nowa gałąź oferty CELÓW idzie
przez `legalTargetCandidates`, nawet gdy typ celu „wynika z gałęzi".

**Proza z rejestru (kondensacja 2026-09-20e):**

**Wpis zbiorczy** (4 powtórki; L90 to kotwica): rozjazd oferty i walidacji
to crash w benchmarku („Bot wybrał nielegalną komendę").
## L49 (2026-08-18) — przypadek

**Objaw:** nowa sesja zapytała właściciela „co robimy?" zamiast wykonać ADR
0020 (PR → audyt poprzedniego PR → praca), choć ADR 0020, AGENTS i lekcje już
istniały.

**Przyczyna (projekt dokumentacji, nie brak reguły):** jedyny plik wczytywany
zawsze (`AGENTS.md`) chował listę lektur niżej i ustawiał ADR-y jako punkt 8
(„właściwe ADR-y obszaru") — dało się „przeczytać AGENTS" bez otwarcia 0020;
`PROJECT_STATE.md` i handoff były wyżej niż rejestr decyzji; grzecznościowe
„pytaj, jeśli nie wiesz" w prompcie wypełniało lukę lektury.

## L52 (2026-08-20) — przypadek

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

**Sygnał:** „pierwsza karta X będzie wymagała Y" to zadanie na TERAZ dla kodu
mechaniki.

## L56 (2026-08-23) — przypadek

**Objaw:** M196 ogłosiło „nowy plan w katalogu: Kamigawa". Właściciel: „Jesteś
pewien? Ja widzę w CSV takie karty z tego planu: Blade-Blizzard Kitsune, Kappa
Tech-Wrecker, Greater Tanuki…". Plan istniał od dawna — nowa karta była jego
czwartą.

**Dlaczego groźne:** nieprawda poszła do `PROJECT_STATE.md`, planu sesji,
komunikatu commita **i asercji testu** (`assert.equal(card.plan, 'Kamigawa',
'NOWY plan w katalogu')`), gdzie zielony test zaczął ją uwiarygodniać. Test
potwierdzał wartość pola, a komentarz kłamał o kontekście (L1 przeniesione do
dokumentacji).

## L89 (2026-08-29) — przypadek

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

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/benchmark-progress-watchdog.test.js` (postęp + zacinki),
`test/benchmark-budget-probki.test.js` (budżet trzyma rozmiar dla 6/22/45/120
talii, pokrycie każdej talii, determinizm próbki); raport wypisuje
`ZACINKI (watchdog N ms)` z adresem każdego przerwanego meczu.
## L109 (2026-08-31) — przypadek

W M271 (błędy #11/#12) ręczna kopia kodu przenoszenia miała komentarz:
„ruch zrealizowany wprost, żeby nie tworzyć cyklu importów". Komentarz był
prawdziwy co do FAKTU (cykl istnieje i pilnuje go `test/module-graph.test.js`)
i błędny co do WNIOSKU — duplikat nie był jedynym wyjściem. Kopia gubiła dwie
korekty CR, które choke point wykonywał.

→ Klasa nadrzędna: [L107].

## L117 (2026-09-02) — audyt remisów bota: grep po źródle kłamie, ślad nie

Zadanie brzmiało „scoringować działania niescoringowane". Naturalny pierwszy ruch —
przejść źródło bota i wypisać funkcje zwracające stałą — dał odpowiedź fałszywie
spokojną: 6 podejrzeń przy ~84 helperach żyjących w jednym wnętrzu `createHeuristicBot`,
gdzie regiony nachodzą na siebie. Dopiero przyrząd na śladzie (`bot.trace()` per decyzja,
12 partii) pokazał skalę: co trzecia decyzja z alternatywami była podejmowana bez
żadnego rozstrzygnięcia punktów. To jest ten sam błąd co „brak gałęzi wyceny", tylko
niewidzialny dla statycznego sprawdzenia i dla review'a kodu — dlatego audyt przeniósł
się na pomiary.

Druga nauczka dotyczy samej naprawy: gdy wpisuje się kore wyceny „żeby nie urosło za
dużo" (wspólny sufit 16 punktów), łatwo zgubić porządek wewnątrz zakresu i stworzyć nowe
remisy, już w poprawionym kodzie. Wyjściem nie było poluzowanie sufity, tylko mapa
monotoniczna (1→10, 2→12, 3→14, 4→15, ≥5→16) oraz bramka porównująca **wejścia** delty
między wariantami ex aequo — bot sam wystawia projekcję do śladu, więc test nie powtarza
wzoru z produkcji, tylko sprawdza, że ten sam wzór nie gubi informacji.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`tools/bot-tie-audit.mjs` (`audytRemisow`, CLI `--gate=<kind>`)
+ `test/audyt-bot-wybior-landu.test.js`; mutacje: płaska wycena ⇒ RED 1/3/5,
kara za `entersTapped` usunięta ⇒ RED 3/5, ślad bez karty ⇒ RED 1/2/3/4.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L117). → Pokrewne: L1, L5, L48.
## L118 (2026-09-02) — audyt, który kłamał w obie strony

Pierwszy pomiar remisów bota dał nagłówek „30,4% decyzji bez rozstrzygnięcia".
Brzmiało groźnie i było bezużyteczne: dwie trzecie tej liczby to sytuacja, w której
silnik wystawia w tym samym kroku dwie komendy o tym samym skutku (`block[]` i
`pass_priority`), a bot nie ma żadnego dylematu. Kusiło, żeby po prostu dodać do
narzędzia zbiór „tego nie liczę" — i to była ta sama postawa, którą piętnujemy w
kodzie produkcyjnym: zmiana liczb, żeby liczby wyglądały lepiej.

Najpierw dowód: dwa osobne stoły, ta sama pozycja, dwie różne drogi przez krok
bloków, a na końcu identyczny stan (życie, skład, tapnięcia, faza). Ten test jest
tanim ubezpieczeniem dla klasyfikacji w narzędziu — gdyby ktoś kiedyś zmienił
semantykę passów w walce, test czerwienieje i licznik nie zmaleje po cichu.

Drugi błąd był lustrzany i groźniejszy, bo ukryty: opcja bez projekcji
(`pass_priority`) rozlewała się na całą decyzję i kategoryzowała ją jako „brak
danych". W ten sposób finding dotyczący blokowania (unik 4 obrażeń za 1 stwora ex
aequo z wzięciem 4 obrażeń) siedział w koszyku, którego nikt nie czyta. Po
odrzuceniu pustych projekcji wyszły cztery przypadki do oceny człowieka — i przy
okazji wyszło, że metryka też wymaga wysycenia: przy ataku śmiertelnym różnica
16 wobec 17 obrażeń nie istnieje dla wyniku partii, więc raportowanie jej jako
„przeoczenia wyceny" byłoby generowaniem szumu. Reguła jest ogólna: porównuj
dokładnie tyle, ile może zmienić losy gry, ani bita więcej.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/audyt-bot-walka-remisy.test.js` (dowód no-opa + grzechotka) i
`tools/bot-tie-audit.mjs` (`tieNoOp`, `tieAkcyjne`, klasyfikacja po projekcji).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L118). → Pokrewne: L18, L5, L117.

**Przypadek:** audyt remisów bota (M285→M286): 208/308 remisów wyglądało na
no-op (`block[]`/`attack[]` vs `pass_priority`), a reguła „brak projekcji ⇒
bez danych" wycinała przy okazji findingi realne. Pełna narracja:
`docs/LESSONS_PRZYPADKI.md` (L118).

## L119 (2026-09-02) — dwie fałszywe alarmy i jeden prawdziwy, ten sam przyrząd

Przyrząd do audytu remisów (M285/M286) porównywał warianty ex aequo po „danych,
które wycena powinna widzieć". Definicja tych danych była pisana *obok* wyceny i to
był błąd metodologiczny, nie edytorski.

Pierwszy alarm: „bot jest ślepy na to, ilu stworów zostawia w obronie". Brzmiało
rozsądnie — atak wszystkich naraz to klasyczny błąd słabego gracza. Ale w Magic
twory tapnięte atakiem odświeżają się w **naszym** następnym kroku odświeżania, a
potem dopiero przychodzi tura przeciwnika: atakujący zdąży zablokować. Pytanie
„czy zostawiasz obrońców" ma sens tylko wtedy, gdy coś blokuje odświeżanie
(„doesn't untap"), a na to wycena ma osobną gałąź. Finding był wymysłem projekcji.

Drugi alarm: „bot jest ślepy na różnicę ciało/cena". Tu projekcja liczyła wartość
korpusu jako `power + toughness`. Sama wycena liczy `2 × power + 1 × toughness`.
Stąd dwa stworów „5" o różnym rozkładzie siły i wytrzymałości było dla audytu
różnych, a dla gry zamiennych — znowu szum.

Trzeci przypadek był prawdziwy i wyglądał nudno: `cast_permanent` miał pełną
formułę, mnożniki, kary za jałowość, premie za ewazję — i **żadnego składnika
kosztowego**. Dopóki metryka nie zaczęła porównywać dokładnie tych liczb, które
formuła konsumuje (stąd `waluta` = wycena korpusu minus koszt), nic nie wskazywało,
że dwie karty o tym samym korpusie i różnej cenie są dla bota tym samym wyborem.
Po naprawie (`creatureManaCostWeight`, zaakceptowanej benchmarkiem 2016 meczów)
licznik groźb dla tej klasy spadł do zera sam — bez jednego wyjątku wpisanego w
narzędzie.

Wniosek, który warto zapamiętać: przyrząd pomiarowy dziedziczy godność tylko z
modelu, który mierzy. Jeśli audyt ma *inną* arytmetykę niż kod, to nie audytuje
kodu, tylko siebie — i kłamie w obie strony: straszy szumem i przeoczy właściwy
błąd.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/audyt-bot-cena-stwora.test.js` (pin arytmetyczny
`Δwyniku = Δkoszt × waga × waga rodziny`, kierunek na parach z katalogu,
kontra-przykład „większy korpus broni ceny") + grzechotka per kind w
`test/audyt-bot-walka-remisy.test.js`; pomiar: `tools/bot-tie-audit.mjs`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L119). → Pokrewne: L117, L118, L5.

**Przypadek:** audyt remisów bota (M286→M287): projekcja „wartość ciała"
(`power + toughness`) flagowała pary słusznie zamienne, bo wycena waży
składniki inaczej; równolegle metryka liczona po składnikach znalazła rzecz
prawdziwą (`cast_permanent` nie znał kosztu many). Pełna narracja:
`docs/LESSONS_PRZYPADKI.md` (L119).

## L120 (2026-09-02) — Opcjonalna zależność komponentu to dziura w drucie

Partia testowa właściciela (2026-09-02) dała cztery uwagi; przy dwóch z nich
objaw był „to nie działa", a kod wyglądał na poprawny.

**B — hover kart specjalnych.** `renderUndercity(els, session, view, { onClick, hover })`
przyjmuje `hover` od M153/C i ma w sobie trzy linie podpięcia `mouseenter` /
`mouseleave` / `wheel`. Test `special-cards-click-hover-m153.test.js` woła
render z ręki: `renderUndercity(els, {}, view, { onClick: noop, hover: h })` —
więc asercja „najechanie podnosi kartę" jest spełniona *zawsze*, niezależnie od
tego, co robi stół. A stół wołał `renderUndercity(els, session, view, { onClick:
onUndercityClick })` — bez `hover`. Ten sam brak, ten sam skutek: panel trucizn
nawet nie miał parametru. Klik działał (go przekazywano), powiększenie nie.

**A — modal celów wielokrotnych.** Kreator rysował wiersze jako
`<button class="action multi-target-toggle">` z marką stanu w tekście
(`[ ] Highland Game (Ty)`) i dokładał osobny przycisk „Podgląd". Nic dziwnego, że
wyglądał obco: w `src/table/index.html` nie było ANI JEDNEJ reguły dla
`.multi-target-*` (ani na `.escape-exile-*`) — cały styl tego ekranu to był
domyślny przycisk przeglądarki. Wizard walki miał za to od M129/C pełną obsługę
dotyku (label jako cel, 44 px, `:has(:checked)` na całym wierszu).

Wspólny mianownik: **testy patrzyły na komponent, nikt nie patrzył na połączenie**.
Stąd w naprawie trzy rzeczy naraz: helper, który jest jednym miejscem podłączania
(`attachSpecialCardHover`), picker jako jedna rodzina prezentacji
(`renderPickerRow`, z klasami rodzinnymi przeniesionymi na `<input>`, bo na nie
patrzy tester), oraz testy sprawdzające *wywołanie* i *istnienie stylu*, a nie
tylko zachowanie po podaniu stuba.

Ten sam wniosek z innej strony (uwaga C): gałąź przeniesienia sprzętu była nową
ścieżką w kodzie, która pominęła badania przechodzone przez ścieżkę główną —
to nie błąd „braku wagi", tylko brak wspólnego predykatu. L119 ostrzegał
przed metryką gorszą od kodu; L120 ostrzega przed testem, który dowodzi istnienia
funkcji zamiast jej użycia.

## L121 — pompa ważona spożytkowaniem (M289, PR #93 tura 10)

**Objaw.** Właściciel pyta: „gdyby były dwie kreatury, którym obu ten equipment daje
pompę, to czy zablokowane jest bezsensowne wydawanie many na dwukrotne przerzucanie?
Chodzi o to, żeby wybrał najlepszy cel i tam już zostawił". Testy tury 9 potwierdziły
blokadę ruchu bocznego (−4,00 przy passie 0,00), ale ten sam odczyt pokazał coś,
czego nikt nie zgłosił: Wooden Stake przyklejony do Wishful Merfolk (3/2, defender)
miał dokładnie taką samą wycenę ładunku jak obok stojący Undead Servant (3/2), więc
przeniesienie za {1} było karane −6. Sprzęt leżał na ciele, które nigdy nie
zaatakuje, i model nie reagował.

**Przyczyna.** `equipValuation` liczył `2·pumpPower + pumpToughness + ofensywne`,
gdzie `ofensywne` było zerowane dla ciał nieatakujących — ale sama pompa nie. Czyli
funkcja pytała „co sprzęt daje", a nie „co nosiciel umie z tym zrobić". Gałąź
pierwszego założenia miała osobne badania (M244/F: `cantAttackStatic`, M221/E:
ochrona blokerów), gałąź przeniesienia porównywała dwie liczby i nie miała o tym
skąd wiedzieć.

**Rozwiązanie.** Waga siły w `equipValuation`: ciało z `cantAttackStatic` albo
takie, którego obrażenia zapobiega ochrona blokera (`attackerNeutralizedByProtection`,
CR 702.16c), liczy połowę wagi pompy — siła na defenderze wciąż decyduje o bilansie
bloku, ale nie robi krzywdy graczowi. Zmiana siedzi w definicji, więc obie gałęzie
dostają ją gratis (L28), a relacja „lepszy dom" pozostaje funkcją pary
(sprzęt, nosiciel), a nie kierunku ruchu — antysymetria, a więc brak ping-pongu,
przetrwała.

**Dowód.** Przed/po na tych samych stołach: Merfolk(defender, nosi) → Servant:
−4,00 → +7,00. Flocker 0/5 (defender) → Servant: +8,00 → +7,00 i bot nadal płaci.
Ruch boczny między dwoma atakującymi o tej samej sile: −4,00 w obu konfiguracjach
(bez zmian). Własność anty-ping-pongowa: 40/40 par, ≥3 dozwolone awanse.


## L122 — talia audytowa, której nie da się zbudować (tura 10)

**Objaw.** Kreator celów wielokrotnych (picker, M288/A) jest w Teście, ale rzadki:
12 partii dało 3 otwarcia i jedno zatwierdzenie (§13.4). Chciałem to pogrubić
własnym materiałem — talią z 12 kartami wielocelowymi i 12 ciałami.

**Przyczyna blokady.** `decks/*.txt` nie są swobodnym zasobem: ADR 0023 (pilnuje go
`test/repo-decks.test.js`, wpis M178) wymaga, by każda wspierana karta leżała w
dokładnie jednej talii, a `test/m132-proporcje-landow.test.js` pilnuje proporcji lądów.
Projekt łamał oba. Trzecia droga — przepisać talie — jest zamknięta przez własne
doświadczenie sesji: talie karmią `tools/benchmark.mjs` i `tools/bot-tie-audit.mjs`, a
zmiana składu par unieważniłaby porównania A/B z tur 7-10 (lekcja o porównywaniu tylko
tego samego profilu).

**Pomiar zamiast obejścia.** 443 karty wspierane, w tym: 7 z >1 celem, 15 z
poświęceniem lub odrzuceniem w koszcie, 12 equipmentów; kart wolnych (nieprzypisanych
do żadnej talii) — zero. Najgestojsza dostępna para (`ravnica` vs `worek-dziki`, po 3
karty pickerowe) w 4 partiach dała 40 wpisów `kreator many`, 12 `[combat wizard]` i
zero otwarć kreatora wielocelowego. Czyli surowiec się wyczerpał, a nie chęć.

**Rozwiązanie.** Pokrycie rodziny wielocelowej rośnie przez nowe karty w katalogu
(backlog §1). Talia `wielocelowa` stanie się legalna sama, bo nowe karty nie mają
jeszcze przypisania — przepis (12 nazw + proporcja lądów) został w §13.8 raportu,
żeby nikt nie układał go drugi raz.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/uwagi-tura8-hover-kart-specjalnych.test.js` (strażnik
przekazania `hover` w `renderTableView` + strażnik reguł `:hover`) i
`test/uwagi-tura8-picker-wielocelowy.test.js` (reguły `.picker-*` z progiem dotyku
44 px, „renderPickerRow wywołany ≥ 3razy", brak osobnego przycisku Podglądu).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L120). → Pokrewne: L16, L21, L118, L119.
## L127 (2026-09-03) — przypadek: trzy sztywne wykluczenia po zlaniu filtrów

Przeniesione z `docs/LESSONS.md` przy kondensacji budżetu lektury startowej (2026-09-06) — treść bez zmian, skrócona została tylko samo lekcja.

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

**Proza z rejestru (kondensacja 2026-09-20e):**

Test odziedziczony traktuj jak hipotezę (czy setup odtwarza
DZISIEJSZY silnik — inaczej jest vacuous), koszt z wyborem kart w trakcie
(„discard two cards") zostaje bez oferty (L5), a wariant „X = 0" bez okna
liczenia X to pułapka do backlogu, nie milczenie.

**Proza z rejestru (kondensacja 2026-09-20e):**

**Strażnik (pełna lista):**
**Strażnik:** `test/audyt-pr93-modalny-rzut-z-okna.test.js`,
`test/audyt-pr93-modalny-discover.test.js`,
`test/audyt-pr93-koszt-dodatkowy-z-exile.test.js`,
`test/audyt-pr93-koszt-x-z-exile.test.js`, odwr

ócony
`test/audyt-pr92-darmowy-rzut-zakres.test.js` — 9 mutacji, tabela w §7
`docs/audits/AUDYT_PR93_2026-09-03.md`.
## L134 (2026-09-06) — przypadek: karta-sonda w talii właściciela

Sesja wdrażająca kontrzenie zdolności (PR #93, commit `9f1c37c`) potrzebowała
nośnika, bo `counterStackObject` umiał kontrować wpis zdolności, ale nikt go o
zdolność nie pytał: nie było typu celu `ability_on_stack` ani efektu
`counter_ability`, więc i pytanie o `pendingExileCast` Vaana przy skontrowanym
triggerze było nie-do-udowodnienia (`docs/backlog.md`). Agent rozwiązał brak
dopełniając katalog kartem `Stifle` (CNS #108) i snapshotem
`docs/cards/scryfall-stifle.json`.

Nie zaprotestowała ŻADNA bramka, bo każda z nich mierzy poprawność, nie
pochodzenie: `repo-decks.test.js` sprawdza zgodność plików z generatorem i że
każda wspierana karta jest w dokładnie jednej talii (ADR 0023), `m132` —
proporcję lądów, spójność danych — zgodność z Scryfall. Rejestr talii jest
WYPROWADZONY z pola `plan`, więc dopisanie karty do katalogu samo weszło do
pliku talii. Właściciel: „to nie błąd w karcie, to agent zdecydował, co gra w
mojej talii". Usunięcie (2026-09-06) objęło definicję, wpis `MANA_COSTS`,
snapshot, przydział `plan` (regeneracja `decks/wiedzmin.txt`: 45 → 44 kart) i
test `audyt-kontrzenie-zdolnosci.test.js`, który dziś opiera się na karcie
synteretycznej `SONDA`.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/proweniencja-katalogu.test.js` (artId ∈ słownika kolekcji,
nazwa i plan zgodne z wierszem, poza kolekcją tylko tokeny/landy, `decks/*.txt`
bez kart spoza słownika, `MANA_COSTS` bez sierot). Fałszywka zweryfikowana:
wstrzyknięcie `Stifle` do katalogu czerwieni testy 1, 3 i 5.
## L126 (2026-09-03) — przypadek: zlanie renderLookWizard z kreatorem landa

`renderLookWizard` i kreator „zajrzyj → weź jeden land" miały po osobnym
budowniczym listy chipów, osobnej polityce klucza sondy i osobnym sorterze — 46 linii
wspólnego rysunku przy 358 liniach ogółem (difflib po wierszach). Po zlaniu ich w
`renderPeekWizard` z parametrem `flow` wyszły DWA czerwone testy i jedna kradziona naprawa:
`M112` (klucz na decyzji kończącej) spadł, bo silnik odziedziczył pulę sortera po scry i
kreator „ułóż wierzch" pytał o karty odłożone na spód; a dawny kreator landa NIGDY nie dawał
klucza, gdy po wyborze zostawała ≤1 karta — błąd, którego nikt nie zgłosił, bo obie
implementacje maskowały się nawzajem. Nazwa komponentu od konkretnej karty
(`renderFertileThicketWizard`, `lookKind === 'fertile'`) była tym samym grzechem co porównanie
stringa karty, tylko cichszym — i osiadała w routing widoku, nie w logice efektu.

Mutacje: pula sortera bez warunku na `flow` → RED M112; dopisana druga lista chipów
w kreatorze → RED M293/1; przywrócona kopia stopki → RED M293/1; wycięty `min-height`
rodziny → RED m129; nazwa karty w kodzie rysującym (bez komentarza) → RED M293/11.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m293-peek-jeden-wizard-chipy.test.js` (12), `M112` w
`test/choice-request-ui.test.js`, `test/m129-*` + `test/look-wizard-contrast.test.js` przez
`test/harness/css-effective.js`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L126)
## L131 (2026-09-05) — przypadek: remisy wyborów resolve_* przy bot-tie-audit

`tools/bot-tie-audit.mjs` pokazał 50+ remisów przy wyborach
`resolve_*` (discard/search/trigger_target/exploit/opponent_target/
color_choice/...), z czego połowa jako "bez danych" (projekcja `tieProjection`
zwracała null), a połowa jako "remisy przy różnych danych". Wszystkie trzy
typy padały do `default: return finish(0)` w `scoreCommand`,
więc KAŻDY wariant dostawał 0 pkt i stabilny sort w greedyChoice wybierał
PIERWSZĄ ofertę z listy.

Przyczyna (klasy): L50 (nowy typ efektu/akcji startuje bez wyceny) +
L34/L40/M195/M203 (warianty bez nazwy w `summarize` są nierozróżnialne
w śladzie) + L117 (remis punktów bez danych w projekcji jest tak samo
arbitralny jak brak wyceny). Nowy typ decyzji dodany w silniku nie dostał
odpowiadającego mu `case` w kontrolerze — a kolejność kandydatów w ofercie
NIE JEST posortowana po wartości (naturalna: gracz→stworzy wroga→itp.),
więc pierwsza oferta to często NAJGORSZA opcja z perspektywy botu.

**Przykłady z rejestru (wyniesione 2026-09-07):** przy Exploit bot poświęcał
najsilniejszego stwora, przy Cuombajj Witches obracał 1 obrażenie w siebie —
oba padały właśnie na „pierwsza oferta = domyślny 0 pkt".
**Dopisek M336 (F14):** komentarz silnika przy ofertach `subsets()` twierdził
„pierwsza oferta = WSZYSTKO", a realnie pierwszy jest wariant PUSTY — proliferate
bez wyceny bot brał zawsze jako pustkę (8× w meczach, w tym przepuszczona
wygrana trucizną). Komentarz przepisany; dopasowanie kodu do dawniejszego
zdania dałoby botom samobójstwo.

## L128 (2026-09-03) — przypadek: Mechanika z dwiema ścieżkami rzutu: reguła ma jedno miejsce prawdy, a skan musi PORÓWNYWAĆ ścieżki, nie tylko liczyć oferty

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

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/audyt-pr93-plot-pozniejsza-tura.test.js` (6: czar i stwór,
obie strony granicy, anty-over-fix dla ręki/impulsu/braku stempla) oraz
`test/audyt-pr93-warp-z-exile.test.js` (6: brak oferty za koszt warp, pobranie
6 many, odrzucenie `warp_card` z exile, anty-over-fix dla warpu z ręki,
przebieg integracyjny ze stempel `warpedAtTurn`). 13 mutacji — tabela w §7
`docs/audits/AUDYT_PR93_2026-09-03.md`; mutacja `>=` zamiast `>` we wspólnym
predykacie czerwieni testy OBU mechanik naraz (5 RED).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L128)
## L129 (2026-09-03) — przypadek: Otwarcie mechaniki w nowym oknie to CAŁY łańcuch wyboru: oferta → walidacja → obiekt stosu → log → etykieta

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

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/audyt-pr94-stun-z-grobu.test.js` (7 testów: warianty niosą
stun cel, każda oferta wykonalna, licznik na WYBRANYM celu, etykiety trzech
okien nazywają wybór, strażnik klasy po katalogu). 5 mutacji RED.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L129)
## L123 (2026-09-02) — przypadek: Semantyka zaimplementowana w jednym torze nie istnieje w drugim

**Przypadek:** M291 (wpis w rejestrze oznaczony jako cofnięte). Karta „up to two target
creatures EACH get +1/+0" miała być
dopisaniem wpisu do katalogu. Tor triggerów umiał to od M157 F4(a)
(`applyTriggerEffects`: `count > 1` → lista efektów aplikowana raz na cel), a tor
czaru — nie: aplikuje listę efektów RAZ z pełną tablicą celów, a `pump` i
`grant_keywords_until_end_of_turn` czytają `targets[0]`. Gdybym skończył na
„katalog = dane, silnik już to umie", karta wchodziłaby do repo z cichym błędem:
pompowałaby pierwszy cel dwa razy, a drugi wcale. Żaden test jej by nie przyłapał,
bo nie istniała.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

dziś żaden — rodzina `test/m291-*.test.js` (dwa cele / jeden / zero oraz
to, że silnik nie zna nazw kart i że `allTargets` nie łączy się z efektem blokującym
decyzję) istniała i świeciła 14/14 na zielono, lecz właściciel cofnął zgodę na karty
wielocelowe 2026-09-03 i cała gałąź `0434199` została zrevertowana. Lekcja przeżywa kod właśnie po
to; jeśli karta wielocelowa wejdzie kiedyś za zgodą właściciela, te cztery asercje są
pierwszą rzeczą do odtworzenia (treść testu jest w commicie `0434199`).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L123)
## L132 (2026-09-06) — przypadek: Wycena oparta o STREFĘ UKRYTĄ jest inertna; audyt czytający to samo źródło tego nie zobaczy

**Przypadek:** PR #100 dodał wyceny `resolve_manifest_dread`,
`resolve_reveal_exile_hand` i poprawki `resolve_search_choice` /
`resolve_satyr_look_choice` — wszystkie liczone z `view.zones.library.find(id)`
(i z `view.zones.hand` przy cudzej ręce). `playerView` projekcjonuje te strefy
jako `{ id, controllerId, hidden: true }`: wpis JEST (lookup truthy, więc
`if (!card) return 0` nigdy się nie oddziela), ale `kind`/`manaCost`/`power`
są `undefined`, a `?? 0` zeruje różnice. Pomiar: `bot-tie-audit --kind=manifest` — dwa warianty po 6 pkt przy projekcji
`rozróznialne` (seed 4025), czyli decyzja = kolejność ofert.

**Przyczyna:** L1 + L102 w nowym wcieleniu: nie brak `case`, tylko WYBÓR
ŹRÓDŁA wewnątrz case'u. Groźniejsze niż L131, bo niewidoczne dla strażnika:
`tieProjection` dla szukania czytała TE SAME puste wpisy, więc audyt kładł 12
remisów do `rownowazne` — narzędzie mierzyło własną ślepotę (L119/L13). Gdzie
projekcja miała właściwe źródło (`pendingManifestDread.cards`), rozjazd wyszedł
jako GROZA: metryka działa, tylko nie może patrzeć w to samo miejsce co kod.

## L136 (2026-09-07) — przypadek: `git checkout <plik>` kasuje NIEZAKOMMITOWANE poprawki w tym pliku; scratch piaskownicy znika między turami

**Przepis odzyskiwania historii (wyniesiony 2026-09-07):** `git fetch origin
<gałąź>` → `git reset --mixed FETCH_HEAD` (ref + indeks, drzewo zostaje) →
`git diff --stat` musi pokazać DOKŁADNIE niecommitowany zakres tej tury →
rest commitów z tych samych wiadomości (pliki `.gitignore`-owane i scratch
poza repo trzeba odtworzyć z czatu — git ich nie niesie).

**Przypadek:** sesja 01a078a2 (audyt PR #102). Dwa niezależne ukłucia. (1) Żeby
sprawdzić, czy test CLI narzędzia łapie mutację, przywróciłem plik narzędzia
`git checkout tools/fetch-card-rulings.mjs` — a poprawka narzędzia NIE była
jeszcze zacommitowana (czekała w drzewie na wspólną bramkę), więc checkout
zwalił ją razem z mutacją; o mały włos commit „naprawa + test" wjechałby bez
naprawy, a test świeciłby na czerwono. (2) W trakcie sesji środowisko
odtworzyło workspace ze świeżego klona: 9 commitów zostało na zdalnej gałęzi,
a NIEZAKOMMITOWANE zmiany czterech kolejnych findingów wróciły jako diff
roboczy — `git log` wskazywał bazę PR, `/home/user/*.txt` (komunikaty commitów,
skrypty sondujące, transkrypty testera) przepadły bez śladu.

**Przyczyna:** snapshot ARENY to drzewo + patchset, nie historia git; wszystko
poza `git push` jest ulotne, a `git checkout <sciezka>` przywraca wersję z
INDEKSU/HEAD niezależnie od tego, co było w pliku.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

nie da się tego sforsować jednym testem (to procedury pracy);
ENVIRONMENT §1/§2 opisuje oba zjawiska, a `test/repo-artefakty-audytu.test.js`
pilnuje, żeby artefakty testera nie weszły do indeksu przy takim sprzątaniu.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L136)
## L137 (2026-09-07) — przypadek: etykieta to rodzina: jedno źródło brzmienia, test na PRAWDZIWYM widoku, partia celowana

**Przypadek:** F6 z audytu PR #102 — przeciwnik czytał „(Morph)" o cudzym
cloaku, bo pięć miejsc stołu formatowało tę samą etykietę osobno i wszystkie
pytały o `cloakReady` (pole ZNAJOMOŚCI reguły, bramkowane przez Fog of War),
żeby odkryć PRZYCZYNĘ zakrycia. Po naprawie (jawne `faceDownCause` w widoku +
dwa helpery w `session.js`) i po przejściu wszystkich testów JEDNO miejsce
dalej kłamało: `nameOfObject` w `session.js` — nazwa czytana przez ~124 opisy
logu i modal „Rozgrywka". Wpadło dopiero na żywym stole (partia 5/6 z talią
celowaną): „Plains (Morph) dostaje +1 licznik flying". Ta sama partia
pokazała drugą nogę rodziny: `nextFaceDownCopyNumber` numerował tylko zakrycia
z `cloakReady`, więc dwa clokowane lądy miały TEN SAM numer — a ruling WotC
2024-02-02 każe rozróżniać przyczynę zakrycia przez wszystkich graczy.

**Przyczyna:** fakt „co zakryło kartę" był wyprowadzany z pola, które znaczy
co innego, w pięciu kopiach kodu; testy jednostkowe etykiet budowały widoki
RĘCZNIE (ficzki oddawały stary kształt), a partie na zwykłych taliach nigdy nie
doczekały się cloaka (1 kopia w jednej talii).

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m326-cloak-przyczyna.test.js` (7, w tym C2 — skan
`src/table/*.js`), `test/m331-log-przyczyna.test.js` (4, w tym D — skan
`nameOfObject`), `test/choice-ignore.test.js`.
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L137)
## L138 (2026-09-07) — przypadek: efekt zgłosił blokadę, której nie było — partia wisi na `pendingSpell.effects: []`

**Przypadek:** Żywy Tester na talii celowanej pod manifest (20 kart, seed 4001,
transkrypt `tools/table-tester/audyt-pr103/m334-manifest-g1.txt`) zgłosił trzy
rzeczy naraz: `[STOP] brak akcji w kroku 50`, `[ui] Jedyna opcja to „Poddaj
partię"` oraz `[rules] Dalej (pass) → Błąd wewnętrzny stołu: Pending spell
odwołuje się do nieistniejącego czaru spell-39`. Żaden z 4614 testów jednostkowych
tego nie widział, bo wszystkie testy manifestu zakładały co najmniej dwie karty w
bibliotece.

**Przyczyna:** w `src/engine/effects.js` gałąź `manifest_dread` dla
`topIds.length === 1` manifestowała jedyną kartę (słusznie — CR 701.62a
“as many as possible”, nie ma z czego wybierać) i kończyła się `return true`.
Truthiness zwrotu jest tu jednak SYGNAŁEM KONTRAKTOWYM: `src/engine/spells.js`
robí `const blocked = applyEffect(...); if (blocked) { state.pendingSpell =
{ stackId, effects: effects.slice(i+1) }; return ... }`. Czar zostawał więc na
stosie z PUSTĄ listą pozostałych efektów, a jedynym mechanizmem zdejmującym
`pendingSpell` jest obsługa `resolve_*` — której nikt nie wygenerował, bo nie
było o co pytać gracza. Objaw przesuwał się w czasie: najpierw nic (gra
„normalnie" kończy turę), potem każdy pas przechodził przez kontrolę
`pendingSpell` i uderzał w nieistniejący `spell-39`.

**Rozstrzygnięcie:** `return;` — ujednolicone z gałęzią `topIds.length === 0`,
która robiła to poprawnie. Sonda przed/po (ten sam stan, jedna karta w
bibliotece): `pendingSpell: {"stackId":"spell-0","effects":[]} | stack: 1` →
`pendingSpell: null | stack: 0 | faceDown: 1`. Strażnik D liczy w gałęzi
`return true` i `state.pendingManifestDread = {` — asymetria liczb jest
czerwona, więc kolejna taka ścieżka nie przejdzie niezauważona.

**Lekcja o testach:** asercja „obiekt powstał" nie distinguishes rozstrzygnięty
czar od wiszącego. Dopisanie w teście B pętli „6 pasów z rzędu przyjętych +
`status === 'active'` + stos pusty" jest tanie i łapie WSZYSTKIE warianty tej
klasy (zawieszony stos, zgubiony priorytet, nieskończony krok).

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/m335-manifest-bez-wybory.test.js` A–D (D: liczba
`return true` = liczba postawionych decyzji w gałęzi).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L138)

Zatrzymane rozstrzyganie (`pendingSpell`, także `effects: []`) nie otwiera
okna na SBA. Decyzja UI to nie oddanie priorytetu — M343, CR 704.4.
Strażnik: `test/m343-sba-po-rozstrzygnieciu.test.js` (liczniki, życie,
wytrzymałość i zanik tokenów przed/po końcu czaru).

## L139 (2026-09-07) — przypadek: cięcie tekstu kotwicą, która była w moim własnym komentarzu

**Przypadek:** chciałem zrobić commit M334 bez naprawy M335 (ten sam plik, dwie
sprawki — split przez tymczasowe cofnięcie jednej). Python miał znaleźć
`return;` i zamienić je na `return true;`. Znalazł pierwsze wystąpienie po
kotwicy komentarza — a komentarz PRZED CHWILĄ wstawiony przeze mnie zawierał
zdanie „(`return;` — brak decyzji = brak blokady), więc ujednolicone". Cięcie
poszło w środku komentarza: plik zachował obie wersje linii (`return true;` i
`return;`), został fragment `) — ujednolicone.` poza komentarzem i składnia
siadła.

**Jak to wyglądało w testach:** `node --test` zwrócił cztery wpisy
`not ok - test/batch50-kart.test.js` itd. — nazwy PLIKÓW, bez szczegółów, bo
błąd parsowania modulu to nie asercja. Łatwo zrzucić winę na zmianę logiki.

**Co poszło źle proceduralnie:** `git add` + `git commit` BEZ `node --check` i
bez żadnej bramki — pełne `npm test` planowałem „zaraz po". Uratowało tylko to,
że commit był jeszcze lokalny: `git commit --amend -C HEAD` (bez force pusha,
ADR 0020 D — reguła „push natychmiast" zadziałała tu w drugą stronę: im wcześniej
push, tym mniej możliwości poprawki bez rewizji historii).

**Zasada na przyszłość:** każda operacja tekstowa na kodzie = (1) assert
jednoznaczności klucza, (2) `node --check` zmienionych plików, (3) BRAMKA
składni przed `git add`, (4) po commitcie `git show HEAD:<plik> | node --check
/dev/stdin`, jeśli commit był budowany skryptem.

## L124 (2026-09-02) — przypadek: grzechotka pękła nie od wagi, tylko od innego rozdania

**Historia sufitu `block` (wyniesiona 2026-09-07):** komentarz z tabelką
atrybucji przy suficie `block` w `test/audyt-bot-walka-remisy.test.js`
zniknął razem z Revertem kart — sufit znowu wynosi 4 — stan z `f6a5459`.

**Przypadek:** M291 (tura 11). Po dodaniu jednej karty do katalogu zmienił się skład
`decks/ravnica.txt` i zazęły dwie bramki jakości: sufit `block` w
`test/audyt-bot-walka-remisy.test.js` (4 → 5) oraz zamrożony golden-master bota. Ten
sam audyt odpalony na `f6a5459` dał 4/4/130, a na drzewie z SAMĄ zmianą wagową M290
(też 4/4/130) — czyli waga nie zepsuła żadnej decyzji, a dokładkę remisu zrobiło inne
rozdanie talii. Bez tego pomiaru jedynym dostępnym komunikatem byłoby „podnieś próg".

Ten sam rygor dotyczy fixture'ów: `--write` puszcza się na GOTOWYM drzewie — u nas
pierwszy zapis zamroził ślad bota bez wpisu `MANA_COSTS` nowej karty i test znowu
świecił, choć z kodem nie było już nic nie tak. Komentarz z tabelką atrybucji przy
suficie `block` w `test/audyt-bot-walka-remisy.test.js` zniknął razem z Revetą —
patrz tabela atrybucji i kolejność wejścia karty w
`docs/audits/AUDYT_PR92_2026-09-02.md` §15.

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/bot-scoring-snapshot.test.js` (fixture, który ta lekcja chroni przed
przedwczesnym `--write`) oraz tabela atrybucji i kolejność wejścia karty w
`docs/audits/AUDYT_PR92_2026-09-02.md` §15. Komentarz z tabelką przy suficie `block` w
`test/audyt-bot-walka-remisy.test.js` (historia sufitu `block` przeniesiona
do `docs/LESSONS_PRZYPADKI.md` L124).
→ narracja: `docs/LESSONS_PRZYPADKI.md` (L124)
## L130 (2026-09-03) — przypadek: „trigger bez opisu" i pułapki tamtej sesji

**Przypadek:** dwa zgłoszenia właściciela (uwagi C/D) miały JEDEN root cause: bramki
wyniku komendy brały `state.events.slice(-1)` albo zwracały listę pobraną PRZED
efektem. Efekt dokładający WIĘCEJ niż jedno zdarzenie (infect: licznik + opis,
renown, poświęcenie Springblooma: 3 zdarzenia) tracił część przyrostu — gracz widział
skutek na stole, ale log i Rozgrywka milczały. Audyt pozostałych bramek `slice(-1)`:
wszystkie jednocentryczne, więc bezpieczne.

**Pułapki tamtej sesji (dla odtwarzania przebiegu, nie reguła):** (1) testy harnessa
sesyjnego potrzebują `gameObjectDataOf` przy wstrzykiwaniu obiektów i widzą ukryte
karty przeciwnika (liczniki ręki); (2) wycena bota per-attacker paraliżuje przy
samotnym blokerze odstraszającym (deathtouch) — klasa wymaga modelowania gang-ataków,
nie należy jej łatać w pętli per-attacker (zmierzone: −2 partie benchmarku);
(3) benchmark szybki jest deterministyczny — każda różnica jest prawdziwa; (4) po
re-konie workspace `git reset --soft FETCH_HEAD` odtwarza referencje z wypchniętej
gałęzi bez dotykania drzewa roboczego.

## L140 (2026-09-07) — przypadek: pełny B0 padł na ofercie legalnej tylko dla jednej z trzech kopii reguły

**Przypadek:** M337. `--full` (5700 meczów) urwał się na 3200:
`command_rejected trigger_target_unresolved` — „Bot wybrał nielegalną komendę"
(aggro mirrodin-wu vs random ravnica, seed 1001, tura 22 `declare_blockers`).
Repro pojedynczego starcia: oferta `turn_cloak_face_up` przy otwartym
`pendingTriggerTargets`. Pętle akcji opcjonalnych (obrót maską/disguise —
CR 701.40b/701.56b, specjalne, bez stosu) pytały TYLKO o `hasPriority`; o to,
czy czyjaś decyzja wisi, pytał wyłącznie pass — ręczną listą ~54 warunków.
Trzecia to była kopia tej samej reguły (Batch 47 łatał tak samo `pass` przy
`pendingManifestDread`; L41/L90). execute pilnował jej konsekwentnie, 64
bramkami `if (cmd.type !== 'resolve_*') reject` — rozjechała się warstwa
OFEROWANIA.

**Naprawa (u źródła, nie listą):** jeden predykat
`optionalActionsOpen = priorityPlayerId === playerId && firstDecisionOwner == null`
w obu pętlach face-up ORAZ w bramce pasa (ręczną listę skasować). Równość
reguł wykazana na liczbach: `firstPendingDecision` ogarnia 64 pola (nadzbiór
dawnej listy: 10 pól „brakujących" ma odpowiedniki w derivatach
`pendingBackup`/`triggerTargetsBlock`/`roomTargetBlocks`/`deliriumBlocks`/
`mentorBlocks` + `pendingMulligans`, więc żadna legalna oferta nie znika), a w
execute jest DOKŁADNIE 64 bramek resolve-only → 1:1. Strażnik źródła (test E):
dokładnie 2 `if (optionalActionsOpen) {`, zero `if (hasPriority) {`, zero
`!state.pending*` w bramce pasa — czwartej kopii nie będzie.

**Rykoszety, każdy z atrybucją:** golden-master ruszyła JEDNA partia
(`ravnica|innistrad-wu@1000`, dwa wpisy śladu DEC #238/#239 — znika
nielegalna oferta face-up; decyzje i scoreSum bez zmian — zmienił się zbiór
opcji, nie wycena) oraz pin M293/11 (63→62 wystąpień `fertile_thicket`:
`!state.pendingFertileThicket` wypadł z listy pasa — dług NIE spłacony,
aktualizacja w §18.5 audytu PR92, MILESTONES i backlogu zgodnie z komentarzem
pinu). Lekcja uboczna: equality-pin licznika to nie biurokracja — sam wskazał
miejsce, w którym reguła przesiadła się między plikami.


## L133 (2026-09-06) — przypadek: Detektor narzędzia nie może dublować scrapingu tekstu: strukturalny sygnał jest tańszy i nie milczy

**Przypadek:** HANDOFF 2026-09-05e zgłaszał „pozorne timeouty" Żywego Testera
(final-fantasy s41, worek-legend×theros s61, 90 s). W `run-game.mjs` koniec
partii był wykrywany DWA RAZY przez osobne regexy od tekstu `#turn-indicator`:
raz w gałęzi `res === 'none'` (z poprawką M209), raz w gałęzi „akcja się
udała" — drugi nie miał odpowiednika i tam, gdzie wskaźnik nie nosił żadnego z
wyrazów, pętla deptała do LIMITU KROKÓW, raportując zacięcie gry, która już
się skończyła.

**Przyczyna:** L34/L40 (tekst UI jest etykietą, nie kontraktem) + L41 (jedno
źródło dla jednej reguły): sygnał stanu istniał (`state.status !== 'active'`),
ale narzędzie wolało dopasowanie słów, a przy okazji skopiowało dopasowanie.
Kopia dodana później (M209) nie spotkała się z oryginałem.


## L135 (2026-09-06) — przypadek: Nowy KSZTAŁT komendy musi mieć obsługę u każdego konsumenta: silnik → kreator UI → sterownik testera

**Przypadek:** Batch 45 dodał w silniku pozycję celu `optional: true` („up to one
target", B45/9 — wariant z `null` na tej pozycji). Testy silnika zielone, ale kreator
wielocelowy (M207, tryb pozycyjny) żądał nie-null w KAŻDYM slocie, a sterownik testera
parsował tylko intro „zaznacz cele (N)" — partia Żywego Testera stanęła na 5 prób i
throw; z panelu nie dało się zagrać wariantu 1-celowego, a przy zerze kandydatów na
pozycji opcjonalnej w ogóle rzucić czaru (odchybka od Oracle w warstwie prezentacji).

**Przyczyna:** rozszerzenie kształtu oferty (null w `targets[i]`) nie niesie zmiany u
konsumentów — klasa L131 dotyczyła nowego TYPU komendy, tu nowy kształt istniejącego
typu przeszedł przez siatkę testów, bo żadna z warstw nie miała testu na ten kształt.

## L142 (2026-09-14) — sprostowanie atrybucji audytu kosztów (2026-09-14c)

Pierwsza wersja planu, historii, milestone'u M358, handoffu i dwóch commitów
sesji PR #116 opisywała audyt kosztów zdolności jako „zgłoszenie właściciela
z jego własnej gry". Właściciel takiego zgłoszenia nie złożył — to był audyt
wewnętrzny agenta; sfabrykowana była wyłącznie atrybucja. Dwa z czterech
rozjazdów wprowadził agent w batchu 55 (B3 `3edadb3`, B4 `8acdcb2`), dwa są
starsze. Sprostowanie (L142) objęło wszystkie miejsca; audyt PR #116 (P5)
domknął ostatnią resztkę — komunikat asercji w `test/koszty-generyczne-
zdolnosci.test.js:99` („zgłoszenie właściciela: {3}{U}…") i wiersz tabeli
w `docs/PROJECT_HISTORY.md` § 2026-09-14c.

## L143 (2026-09-14) — audyt PR #116: pary cytatów P4/P6 i dwukierunkowość ptaszka (W1)

**P4 — 702.34e → 702.35b:** sweep E3 sesji PR #116 przepisał numery CR
w komentarzach. Dawny 702.34e niósł treść „rzut za madness w rozstrzyganiu
zdolności wyzwalanej — timing ignorowany"; w CR 2026-08-07 madness ma tylko
702.35a–c, a 702.35b mówi o płatności kosztu alternatywnego (601.2b,
601.2f–h). Komentarze w `resources.js`, `spells.js`, `card-data.js` i 4
plikach testów (łącznie 10 miejsc) cytowały więc „timing ignorowany —
CR 702.35b". Naprawa (audyt PR #116, P4): 702.35a + ruling DMU 2023-01-06
(mtg.wiki/page/Madness): „Casting a spell with madness ignores the timing
rules based on the card's type." Strażnik: para {mechanika: /madness/i,
zakazany: /702\.35b/} w `cr-numery-mechanik-straznik.test.js` — weryfikacja
mutacyjna: cofnięta naprawa zapala test.

**P6 — 604.3 jako „liczone przy każdym odczycie":** 11 miejsc (10 w `src/`,
1 w teście) cytowało CR 604.3 przy warunkowych zdolnościach statycznych.
604.3 definiuje characteristic-defining abilities, a 604.3a(5) WYKLUCZA
zdolności, które „set the values … only if certain conditions are met" —
więc zdolność Gearsmith Prodigy CDA nie jest. Właściwy przepis: 611.3a
(mtg.wiki/page/Continuous_effect): „A continuous effect generated by a static
ability isn't „locked in"; it applies at any given moment to whatever its
text indicates." Wyjątek: DOSŁOWNY cytat CR 702.73a (changeling, „See rule
604.3.") jest poprawny i zostaje. Strażnik: para {mechanika:
/przelicza(ne|ny)|liczony przy (każdym )?odczycie/, zakazany: /604\.3/}.

**W1 — dwukierunkowość ptaszka:** E2 PR #116 zbudował wspólną tabelę
czasowników `tools/table-tester/actions.mjs` (pula ruchów, oś 3 detektora),
ale druga strona kontraktu — `OPTION_IGNORABLE_TYPES` w `src/table/render.js`
— nie dostała `warp_card` ani `turn_manifest_face_up`. Skutek: etykiety
„Rzuć za warp:" i „Obróć twarzą do góry:" (manifest) nie miały ptaszka
wyciszenia, choć tabela deklarowała je w osi wyciszalnych. Złapał to detektor
osi 3 w partii worek-legend vs worek-mroczny s=55 (profil greedy). Naprawa
u źródła + regresja `test/choice-ignore.test.js` (W1); dowód end-to-end: ta
sama partia po naprawie — 0 zgłoszeń.

## L19 (2026-09-14f) — dopisek: mulligan to decyzja, nie dana

**Zgłoszenie właściciela:** „Kilka talii podejrzanie często startuje bez
lądów. Powinno to być w proporcji 1:2."

**Pomiar (krok 1 — dane):** `tools/deck-land-ratio.mjs` (nowe narzędzie,
commit 31f51a7): wszystkie 24 talie trzymają regułę 1:2 (M132 — co najmniej
1 ląd na 2 nielandy; udział lądów 33,3–41,7%, limit górny 55%). Symulacja
2000 rozdań na talię przez PRAWDZIWĄ ścieżkę silnika (`setupCardMatch`):
częstość rąk 0-lądowych zgodna z rozkładem hipergeometrycznym (max 3,58% —
talie na progu 33,3%; 1 na ~28 gier) — tasowanie i rozdanie uczciwe.

**Root cause (krok 2 — decyzje):** boty NIGDY nie brały mulligana.
heuristic-bot: `finish(cmd.keep ? 50 : 0)` — keep zawsze; aggro-bot:
pierwszy wariant listy = keep. Ręka 0-lądowa była więc grana do końca,
a w grach z botem wyglądało to jak „talia bez lądów".

**Naprawa (plan 2026-09-14f):**
- silnik: warianty `resolve_mulligan_choice` niosą jawny licznik `mulligans`
  (informacja publiczna — ta sama, którą UI pokazuje graczowi; bot capuje);
- heuristic + aggro: keep ⇔ ≥2 lądy w ręce albo cap 2 mulliganów; przy
  odłożeniu N kart na spód trzymaj lądy (mulligan wzięty z braku many),
  oddawaj najdroższe czary (niskie keep-value);
- random-bot bez zmian (szumowa linia bazowa).

**Weryfikacja:** `test/bot-mulligan.test.js` (11 testów: wyzwalacz 0/1/2
lądów, cap, spód bez lądów, payload licznika, oba boty); golden-master śladu
bota zregenerowany `--write` — diff dokładnie podpisany (scoreSum +10 na
keep: 50→60; jeden mecz z realnym mulliganem: decisions 165→176); benchmark
quick 82,6%→82,9% (555→557/672), aggro bez zmian 30,7%; Żywy Tester
(innistrad-brg vs innistrad-wu, seed 25): „Nieprzyjaciel bierze mulligan
(1) — nowa ręka 7 kart", odłożenie 1 karty na spód, zatrzymanie nowej ręki,
partia gra do końca, detektory 0 zgłoszeń. Suity: 5496/5496 fast, 5506/5506 all.

**Proza z rejestru (kondensacja 2026-09-20e):**

**2026-09-14f (dopisek) — mulligan to DECYZJA, nie dana.** Zgłoszenie „talie
podejrzanie często startują bez lądów": pomiar pokazał talie zgodne z regułą
1:2 (M132) i uczciwe tasowanie, a root cause w polityce BOTA (heuristic/aggro
nigdy nie brały mulligana). Polityka: keep ⇔ ≥2 lądy albo cap 2 mulliganów;
na spód najdroższe czary. Narracja: `docs/LESSONS_PRZYPADKI.md` (L19).
**Reguła:** zgłoszenie „często startuje bez X" mierz NAJPIERW dane (kompozycja,
uczciwość losowania), potem DECYZJE konsumenta — symptom może mieszkać
w polityce kontrolera, nie w talii.

**Objaw:** próbka regresji (1248 meczów) spowolniła ~2×, a modal dla gracza
rósł w setki opcji — po dodaniu wyceny `cast_escape`. Wcześniej warianty Escape
(Sweet Oblivion) nie miały wyceny (0) i bot je pomijał, więc nikt nie czuł, że
`legalEscapeCasts` enumeruje WSZYSTKIE C(n, 4) podzbiory: 10 kart w grobie =
210 podzbiorów × 2 cele = 420 wariantów na okno.

## L144 (2026-09-15) — znalezisko A: Cathartic Reunion przy 2 kartach bez modala

**Zgłoszenie:** „Mam dokładnie 2 karty i mam wyrzucić 2 karty — po co modal?"
Silnik kolejkował `pendingDiscardChoice` ZAWSZE, gdy były karty (13 miejsc
w 4 plikach), więc UI otwierało wybór bez wyboru. Naprawa generyczna, nie pod
kartę: jeden predykat `shouldAutoDiscard` (brak allowDecline + kandydaci ==
wymaganym) i jeden wykonawca `discardCardsForced` w `effects.js` (jedyny moduł
bez cykli importów dla 4 konsumentów) — resolver ręczny używa tego samego
helpera (L41), więc rozjazd wykonania jest niemożliwy z konstrukcji.

**Dwie pułapki:** (1) efekt auto MUSI zwrócić „kontynuuj", nie „zawieś"
(L138) — `return true` bez pending zatrzaskuje czar na stosie; (2) madness
z auto-discarda nie ma synchronicznej promocji (ta żyje w resolverze), więc
dopina ją hook w `accepted()`: kolejka + brak otwartych decyzji → promocja
w tej samej komendzie; na ścieżce ręcznej no-op (decyzja już otwarta).
Dowód tożsamości stanowej: pełne ślady golden-mastera old/new — 5/6 partii
bit w bit, w szóstej dokładnie jeden wpis mniej (wymuszony discard z jedyną
alternatywą concede), downstream identyczny. Poboczny połów: audyt kontraktów
zdarzeń wyłapał brak `count` w gałęzi decline-0 (wcześniej 1/2 emiterów, pod
progiem 0,6 — dziura L112); fix: jawne `count: 0`.

## L145 (2026-09-16) — przypadek: Station z usuniętym stworem dawała 0 zamiast LKI

**Zgłoszenie:** łowy Srebra M360/B4 — Station (Wedgelight Rammer) po Shocku
w zatapniętego sierżanta nie kładła NIC (wczesny `return` z komentarzem
„CR 608.2b: jeśli cel nie jest już legalny"). Błąd w komentarzu: stwór
tapowany kosztem nie jest celem (tekst bez „target"), więc 608.2b nie
fizzluje — EOE Release Notes wprost: „If that creature isn't on the
battlefield at that time, use its power as it last existed on the
battlefield." Naprawa wzorcem z silnika: snapshot mocy efektywnej w chwili
kosztu (`stationTappedPower` na wpisie stosu, jak `sacrificedToughness`),
rozstrzygnięcie bierze żywą moc albo snapshot. Trzy testy, bo fix ma dwie
gałęzie: LKI (2 po Shocku), żywa moc (2 bez odpowiedzi) i pompa
w odpowiedzi (5 — snapshot przy koszcie NIE może zabić żywego odczytu).

## L150 (2026-09-19) — przypadek: Dawntreader Elk poświęcany po ląd przy 4 kartach biblioteki

**Zgłoszenie właściciela (C):** „bot poświęca Dawntreader Elk (traci stwora), żeby wyciągnąć ląd, gdy w bibliotece zostały 4 karty (→3), będąc o krok od przegranej. Wycena musi się zmienić.”

**Odtworzenie:** scena `createGameState` + `dawntreader-elk` i `basic-forest` na polu p1, 4× `basic-mountain` w bibliotece, `jumpToStep(state.turn,'main','p1')`, mana {G}; `createHeuristicBot({seed:42}).chooseCommand(playerView(state,'p1'), {})` → `activate_ability:elk` zarówno przy 4, jak i przy 25 kartach (identyczna decyzja w obu scenach).

**Przyczyna:** bot karał ubytek własnej biblioteki tylko przez `paymentLibraryLoss` (mielące tapnięcia płatności) i `LIBRARY_DRAIN_EFFECTS` (mill/draw). Tutor (`search_library_to_battlefield`, effects.js → `queueSearchChoice`) nie był wyceniany nigdzie: aktywacja niosła ~2 pkt wartości efektu i wygrywała z passem niezależnie od stanu biblioteki.

**Naprawa:** `LIBRARY_SEARCH_EFFECTS` (typy z deskryptora: search_library_to_hand / _to_battlefield / _to_battlefield_tapped / search_basic_land_morbid) + `searchLibraryLoss(view, cmd)` liczący karty zabrane z własnej biblioteki przez wariant; wynik wchodzi do tej samej drabiny `libraryLossPenalty` co dobrania — dla aktywacji (payment + tutor, suma dróg) i dla rzutów (repeat + payment + tutor, więc także ETB-tutory permanentów, np. Pilgrim's Eye). Granica marginesu: 21 kart aktywuje, 20 już nie (margines 20 kart). Objaw uboczny: pin `batch54` (lethal Exploding Borders przy 1 karcie w bibliotece) mierzył teraz karę cienkiej biblioteki za własny tutor — scena dostała 20 kart tła, asercja letalu bez zmian.

**Przypadek:** Dawntreader Elk — bot poświęcał stwora po ląd, bo kara cienkiej biblioteki widziała tylko mill/draw, a tutor nie był wyceniany nigdzie.

## L151 (2026-09-19) — przypadek: potrójny blok legalny w silniku, nieobecny w ofercie

**Punkt otwarty z poprzedniej sesji:** „kierunek odwrotny oferty bloków (`Math.min(slots, 2)`) — pin przy blokerze o >2 slotach”.

**Pomiar:** scena 3 atakujących (Goblin Piker) i bloker z 3 slotami (licznik +1/+1 + 2× Cenn's Tactician, obaj taktycy zatapnięci — statyka działa niezależnie od tapnięcia) → `blockSlotsFor` = 3, ale `legalBlockerOptions` nie zawierało ANI JEDNEGO przypisania z blokerem użytym 3 razy, a `declareBlockers` (i `blockAssignmentViolation`) potrójny blok PRZYJMUJE. Oferta była więc niekompletna: człowiek w panelu bloków i bot nie mogli zadeklarować legalnego ruchu.

**Przyczyna i naprawa:** liczba przebiegów blokera w enumeracji = `Math.min(slots, 2)` (obcięcie „na wygodę”) → `Math.min(slots, attackers.length)` (granica legalności). Przy okazji: enumeracja z powtórzeniami tworzyła to samo przypisanie wieloma ścieżkami (kolejność atakujących) i rosła do 34 opcji przy capie 32 — dodany klucz kanoniczny + `slice(0, cap)`.

**Piny (oba kierunki):** potrójny blok jest w ofercie i przechodzi `declareBlockers`; KAŻDA opcja oferty przechodzi walidację; bloker o 1 slocie bez podwójnego bloku; brak duplikatów i cap. Mutacje M23/M24 → 1 RED każda.

**Przypadek:** bloker o 3 slotach nie dostawał w ofercie potrójnego bloku, choć `declareBlockers` go przyjmuje.

## L152 (2026-09-19) — przypadek: literalny „\n” w danych proweniencji i wyjątek, który to ukrywał

**Polowanie inną ścieżką niż poprzednia sesja:** pełny diff `oracleText` katalogu z `docs/cards/scryfall-*.json` po wszystkich 480 kartach ze snapshotem (poprzednie audyty czytały diff ostatniego PR-a, nie dane).

**Wynik:** 20 wpisów katalogu (m.in. instant-ramen, crew-captain, consume-spirit, moonlit-meditation, village-bell-ringer) i 7 plików snapshotu (altar-of-the-goyf, consume-spirit, crew-captain, gurmag-drowner, inspiring-bard, instant-ramen, seismic-monstrosaur) miało w polu Oracle literalny backslash+n zamiast nowej linii. Konsekwencja praktyczna: strażnik kosztów aktywacji (`test/ability-cost-pips.test.js`) nosił jawny wyjątek „znalezisko S-1” i po cichu pomijał zdolność `strandwalker` („przy literalnym 
 Oracle karty jest jedną linią, więc karta bez ani jednego nagłówka nie daje punktu odniesienia”).

**Naprawa danych + koniec wyjątku:** prawdziwe nowe linie w katalogu i snapshotach; strażnik `test/oracle-bez-literalnego-backslash-n.test.js` pilnuje obu stron (plus zgodność katalog==snapshot dla dotkniętych kart i dla DFC Lodestone Needle) i ma bramkę degeneracji (minimum sprawdzonych rekordów); `skippedEscapedText` w strażniku kosztów musi być 0 — `strandwalker` wrócił do audytu. Świadomie NIE naprawiane (sklasyfikowane): 8 różnic w tekście przypomnienia (CR 207.2 — to nie tekst reguły) i karta przygodowa `gray-slaad`, gdzie katalog celowo składa przednią twarz z linią przygody.

**Mutacje:** M25 (przywrócenie literalnego „\n” w katalogu) → 2 RED, M26 (w 7 snapshotach) → 2 RED.

**Przypadek:** pełny diff katalog↔snapshot wykrył literalne „\n” w `oracleText` 20 wpisów i w 7 plikach `docs/cards/*.json`.

## L153 (2026-09-19) — przypadek: tapnięcie przez ATAK nie odpalało „becomes tapped"

**Zgłoszenie z etapu B5 (Annie Flash, the Veteran):** „Whenever this creature becomes tapped, exile the top two cards…" nie odpalało, gdy Annie tapowała się ATAKIEM (działało tylko przy tapnięciu zdolnością/efektem).

**Pomiar:** scena `setupCardMatch` + `moveObjectDirectly` — `declare_attackers` tapował atakującego, `object_tapped` był w `state.events`, ale `processTriggers` w `accepted()` widzi wyłącznie zdarzenia zwrócone przez komendę. `combat.declareAttackers` wołał `tapObject(state, id, playerId)` bez kolektora, więc tapnięcie z ataku w skanie nie istniało — trigger był martwy dla całej rodziny „becomes tapped" (Nanoform Sentinel od M360 też).

**Naprawa:** `tapObject(state, objectId, playerId, events = null)` — gdy kolektor podany, zdarzenie ląduje w OBU miejscach (`state.events` i kolektorze); `declareAttackers({ pushToState, events })` przekazuje kolektor z `game-state.js`, a komenda zwraca `[...tapEvents, e]`. Wzorzec jest ten sam co M114 (tap lądu na manę) i M117 (regeneracja): zdarzenie wywołane wewnątrz komendy MUSI wrócić z komendą, inaczej skan triggerów go nie zobaczy.

**Pin:** `test/real-cards-batch57.test.js` (B5) — atak Annie wygania dokładnie dwie wierzchnie karty i pozwala zagrać land dopiero w main; mutacja (cofnięcie kolektora) → 1 RED. Dodatkowo `test/m257r5b-awaken-sleeper.test.js` pilnuje tapnięcia zdolnością.

## L154 (2026-09-19) — przypadek: odmowa bez skutku (Baral and Kari Zev)

**Etapy B6a/B6b (karta 88 TDC):** „Whenever you cast your first instant or sorcery spell each turn, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost. If you don't, create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn."

**Objaw etapu B6a:** decyzja `resolve_hand_free_cast` istniała, ale rezygnacja była pustym ruchem — w wycenie bota `cmd.decline → 4` pkt, więc bot zawsze brał pierwszą ofertę rzutu (nawet gdy w ręce leżał marginalny instant), a przycisk w panelu mówił tylko „Zrezygnuj (nie rzucam darmowego czaru)". Gracz nie miał jak się dowiedzieć, że odmowa daje 2/1 z pośpiechem.

**Naprawa (B6b):** deskryptor `elseEffect` w danych karty jedzie z decyzją (`pendingHandFreeCast`), a `resolve_hand_free_cast{decline}` wykonuje go ze stubem źródła (LKI — źródło mogło już opuścić pole bitwy, CR 603.10). JEDEN predykat `elseEffectSummary` (tokens.js) redukuje deskryptor do postaci widokowej i karmi: widok gracza (`pendingHandFreeCast.alternative`), zdarzenia `hand_free_cast_required`/`_resolved`, etykietę przycisku w `render.js`, komunikat logu w `session.js` i wycenę bota (odmowa = wartość generycznego `create_token`, ta sama skala 12 pkt, więc nadal przegrywa z darmowym czarem za 45, ale ma z czym konkurować).

**Druga połowa reguły (automat):** gdy `handFreeCastOffers` jest PUSTE (pusta ręka / brak czaru o mniejszej MV i wspólnym typie), jedynym legalnym wyborem jest rezygnacja — więc `pruneDeadPendingDecisions` domyka decyzję sam, wykonuje `elseEffect` i emituje `hand_free_cast_resolved{declined: true, noCandidates: true}`. Gracz nie dostaje modala z jednym przyciskiem, a token i tak powstaje (zasada właściciela: wybory bez alternatywy są automatyczne).

**Piny:** `test/real-cards-batch57.test.js` — token 2/1 Legendary Monkey Pirate z `keywordGrants: ['haste']`, który realnie atakuje w turze wejścia; brak kandydatów = auto-domknięcie bez komendy w panelu; pusta ręka; rzut zabiera gałąź „If you don't"; panel i log nazywają skutek odmowy. Mutacja (cofnięcie `elseEffect` + auto-domknięcia) → 3 RED.

## L155 (2026-09-20) — przypadek: bot oddawał gardę przy 2 życiach

**Zgłoszenie z partii:** „Bot ma 2 życia i jedną kreaturę 2/2 na stole. Ja też mam jedną 2/2, ale mam 18 życia. Bot atakuje, przepuszczam, dostaję 2, potem dobijam bota. To bez sensu działanie bota. Nie powinien się odsłaniać mając tak mało życia."

**Pomiar:** `declare_attackers` wyceniał atak per-stwór (gałąź wymiany → `power - 1`) i dokładał premię za wyścig, gdy `enemyBoardPower(view) >= myLife(view)` — premia +8 (a przy życiu ≤ 2 nawet +20) przewyższała wszystkie kary za oddanie blokera, więc 2/2 atakujący 2/2 przy moich 2 życiach dostawał wynik dodatni. Kary „co się stanie w następnej turze, gdy atakujący są tapnięci" nie liczył nikt.

**Naprawa:** model gardy po deskryptorach (ADR 0002): `guardToughness(declared)` to suma wytrzymałości moich niezatapniętych, niezadeklarowanych blokerów (`cantBlock`/`detained` poza rachunkiem), a `enemyCrackbackPower(view)` to moc wrogich stworów mogących zaatakować w następnej turze (tapnięte liczą się — w turze wroga się odtapiają). `throwsGuard` = atak NIE wygrywa teraz (`winsNow`: przebicie ≥ życie wroga albo wygrana trucizną), kontratak w ogóle grozi (`crackbackPower > 0`), a przeżycie przed atakiem istniało i po ataku znika (`crackbackPower − guardToughness` przestaje być mniejsze od mojego życia). Wtedy premia za wyścig jest POMIJANA (L3 — kara musi być liczona razem z premią, nie obok niej) i wchodzi `score -= P.crackbackPenalty` (12).

**Wyjątek zmierzony w pinie:** atak LETALNY na stole (suma mocy ≥ życie wroga) zmusza wroga do blokowania — blokery z wytrzymałością ≤ najmocniejszy atak giną, więc ich moc znika z kontrataku (`forcedBlockLoss`, absorbowanie od najtańszego). Bez tego strażnik fałszywie karał atak, który właśnie kończy grę (pin E/2b).

**Kolizja z pinem D/3:** ten sam atak 3/1 za 3/3 przy 3 życiach jest teraz poprawnie karany (wróg może NIE blokować i dobić kontrą), więc `test/zgloszenie-d-jalowy-atak-w-gang.test.js` mierzy granicę klasyfikacji „jałowego ataku" przy 12 życiach — scenariusz crackbacku ma własny pin.

**Piny:** `test/zgloszenie-e-oddana-garda.test.js` — 6 przypadków (scenariusz właściciela; atak letalny zostaje; wymuszony blok oddaje gardę; atakujący z lataniem; wymiana przy pełnym życiu; dwa 2/2 — jeden zostaje w domu). RED: stash `heuristic-bot.js` + `heuristic-params.js` → 5/1.

**Przypadek:** bot z 2 życia atakował 2/2 w 2/2 (zgłoszenie właściciela).

## L156 (2026-09-20) — przypadek: trzy warstwy zgłoszenia (F–I)

**Zgłoszenia z partii** (druga paczka uwag tego samego dnia, PR #130):

- **F** — „sekcja Deck Builder jest martwa; nie używam jej i nie będę — zakomentuj ją w aplikacji, tak, żeby nie pokazywała się w ogóle”.
- **G** — „Canonized in Blood (koszt «CB» = 2 many): kreator many kazał mi tapnąć 4 lądy”.
- **H** — „Guidestone Compass Explore — modal «Wybierz: Explore — co z odsłoniętą kartą?» ma wymienić i podlinkować odsłoniętą kartę; teraz trzeba jej szukać w logu”.
- **I** — „Geological Appraiser ETB Discover 3: cała biblioteka przejrzana, brak trafienia; karty wróciły, ale «Rozgrywka»/log nie mówią, że biblioteka się wyczerpała, że nie było trafienia ani że karty wróciły na spód w losowej kolejności”.

**G — pomiar przed naprawą.** Silnik był czysty: koszt `{1}{B}` (`mana-costs-data.js`), `effectiveSpellManaCost` = 2, deskryptor `{costStr: '{1}{B}', totalNeeded: 2, requirements: [['B']]}`, a `wizardProgress` po tapnięciu Bagna i dowolnego lądu dawał `done: true`. Cztery niezależne próby (oferta, deskryptor, surowy `tap_for_mana` ×4, rzut z pustą pulą) nie reprodukowały „4 lądów” — wada była w WARSTWIE PROWADZENIA: lista źródeł szła porządkiem stołu, a po zebraniu sumy kreator dalej proponował lądy BEZ brakującego koloru. Gracz tapujący „po kolei z góry” (Wyspa, Góra, Las, Bagno) potrzebował 4 tapnięć: dwa pierwsze zaspokajały sumę, trzecie (Las) nic nie wnosiło, dopiero czwarte pokrywało `{B}`.

**G — naprawa.** `guideManaSources(sources, missingColors, totalMet)`: sort stabilny „źródła brakującego koloru pierwsze” + filtr „po zebranej sumie zostają tylko źródła dające brakujący kolor” (nadmiarowe źródło dodałoby manę, której płatność już nie potrzebuje). `wizardProgress` dokłada `missingColors` i `coversMissing` per źródło, a render pokazuje „— pokrywa {B}” i — gdy nie ma czym pokryć koloru przy zebranej sumie — mówi wprost „Żadne dostępne źródło nie daje B — Anuluj płatność”. Świadomie NIE auto-tapnięto wymuszonego źródła: płatność jest jawną decyzją gracza o zasobach (CR 601.2h), kreator prowadzi kolejnością i zakresem.

**H — pomiar.** Decyzja Explore idzie przez wspólny `renderChoiceRequest` (odpowiedź dla właściciela: TAK, to uniwersalny kreator wyboru), ale komenda `resolve_explore_choice` ma dwa warianty (wierzch/grób) bez żadnego identyfikatora karty, a odsłonięta karta siedziała w `state.pendingExplore` i nie była wystawiana w widoku. Tytuł modala spadał do deskryptora typu: „Wybierz: Explore — co z odsłoniętą kartą?”.

**H — naprawa.** `pendingExplore` niesie `sourceCardId` (źródło eksploracji to publiczny permanent — wzorzec M162/C, M163/A, M240/K), `playerView` wystawia `{ sourceCardId, cardId }` właścicielowi decyzji, `choiceSourceTitle` ma gałąź `resolve_explore_choice` („Guidestone Compass — Explore: Fathom Fleet Cutthroat na wierzchu biblioteki”), a `previewCardIdOfOption(option, resolveCardId, view)` bierze kartę z oczekującej decyzji, gdy komenda jej nie niesie — oba warianty dostają wspólny przycisk „🔍 Podgląd karty” (pełnoekranowa ilustracja).

**I — pomiar.** `discover_resolved` przy braku trafienia niosło wyłącznie `found: false` (bez liczby odsłoniętych kart i bez informacji, czy biblioteka się wyczerpała), a warstwa tekstu w `session.js` mapowała je na `null` — wpis CICHY. Dodatkowo typ zdarzenia nie przechodził bramki logu gracza poza oknem stosu, więc nawet poprawiony tekst mógł nie dotrzeć do „Rozgrywki”.

**I — naprawa.** Trzy warstwy: (1) FAKTY — `effects.js` dokłada `revealedCardIds`, `bottomCount` i `libraryExhausted` (brak trafienia), a `game-state.js` `bottomCount` (trafienie, „reszta na spód w losowej kolejności”, CR 701.53); (2) TEKST — brak trafienia opisywany wprost („nie znajduje karty dla discover (3) — biblioteka się wyczerpała (przejrzano N kart); odsłonięte karty (N) na spód biblioteki w losowej kolejności”); (3) BRAMKA — `discover_started`/`discover_resolved` w `BOT_RESOLUTION_EVENTS` i `HUMAN_DIGEST_EVENTS`.

**F — naprawa.** Panel `#deck-builder` w bloku komentarza HTML (markup zachowany → odwracalność; wewnętrzne komentarze HTML mają myślniki zamienione na encje, żeby `--` nie zamknął komentarza zewnętrznego), import i oba montaże `mountDeckBuilder` zakomentowane, moduły i ADR 0012 bez zmian, biblioteka talii własnych (IndexedDB → selecty) działa dalej. Bundle: 64 → 59 modułów.

**Piny:** `test/zgloszenie-f-kreator-talii-wylaczony.test.js` (3), `test/zgloszenie-g-kreator-many-brakujacy-kolor.test.js` (4) + end-to-end `test/table-ui.test.js` (talia „g-canonized”: gracz tapuje ZAWSZE pierwszy wiersz kreatora; RED 3 tapnięcia przy koszcie 2), `test/zgloszenie-h-explore-nazwa-karty.test.js` (3), `test/zgloszenie-i-discover-brak-trafienia.test.js` (4). Wszystkie czerwone przed poprawką (0/3, 0/4+RED taps, 0/3, 0/4).

**Wniosek dla procesu:** zgłoszenie „kreator/X kazał zrobić coś sprzecznego z regułą” mierzymy warstwami od silnika w górę (koszt → oferta → deskryptor → postęp → render), a naprawę pinujemy na warstwie, która realnie zawiodła — inaczej „fix w silniku” przechodzi zielono, a gracz dalej tapie cztery lądy.

## L157 (2026-09-20) — przypadek: log tapnięć na manę (paczka J)

**Zgłoszenie z partii** (trzecia paczka uwag tego samego dnia, PR #130):
„Chciałbym w sekcji «Log partii» widzieć dodatkowo każdy tapnięty na manę permanent. To nam ułatwi debugowanie błędów — będzie widać co i kiedy zostało tapnięte”.

**Pomiar przed naprawą.** Silnik od dawna niesie komplet danych, ale w logu stołu nie było po nich ŚLADU: `object_tapped` mapuje się na `null` w tekstach zdarzeń (log pokazuje tylko ruchy istotne), a `mana_produced` (`resources.js`: `{ playerId, source: objectId, amount, colors, grantMana }`) chodzi wyłącznie przez szum `TURN_NOISE`/`MAIN_LOG_NOISE` do bufora „Rozgrywki” dla bota. Sonda na pełnej partii (talia `ixalan` vs `warhammer-ubr`) potwierdziła: dziesięć produkcji many Nieprzyjaciela, ZERO wpisów w `logEntries()`.

**Decyzja o zdarzeniu.** Opisujemy PRODUKCJĘ many, nie samo tapnięcie: `object_tapped` nie wie ani ile many powstało, ani jakiej — a bez tego wpis nie odpowiada na pytanie „co zapłacił”. `mana_produced` niesie źródło (obiekt na polu bitwy, więc działa też dla stwora-źródła many, artefaktu i Skarbu) oraz kolory. Wpis dotyczy więc dokładnie tego, czego szukał właściciel.

**Naprawa.** (1) Czysta, eksportowana `manaSourceLogText(e, { nameOfObject, who })` — jedno miejsce z regułą tekstu: „Ty tapujesz na manę: Wyspa → {U}” (druga osoba: „tapuje”), symbole w liczbie `max(amount, colors.length)` („{C}{C}{C}” dla trzech bezbarwnych, powtórzenia przy dwóch jednostkach jednego koloru), `null` gdy zdarzenie nie jest produkcją, brak nazwy źródła albo nazwa to `?` (wpis bez wiedzy byłby szumem). (2) Wrapper `logManaSource(e)` w sesji woła `sessionLog('tap', …)` po nagłówku fazy — w OBU gałęziach `MAIN_LOG_NOISE` (strumień auto i pętla bota), jedno źródło reguły dla obu. (3) UI: `.log-tap` w `index.html` (wyciszony kolor — wpis debugowy, nie narracja).

**Granice (świadome).** Wpis NIE wchodzi do modala „Rozgrywka” (`botMoves`) ani do zapisu tur dla AI (`turnHistory`) — decyzja właściciela z 2026-08-02 (modal nie pokazuje tapowania many) zostaje w mocy; miejscem na debug jest „Log partii”, który czyta ten sam strumień. Pin 3 strażnika pilnuje obu granic maszynowo.

**Pułapka zasięgu (RED w trakcie prac).** Pierwsza wersja wrappera wołała `whoN(e.playerId)` — a `whoN` istnieje wyłącznie w closures deskryptorów zdarzeń (`session.js`), nie w closures sesji. Test czerwienił się na `RuntimeError: whoN is not defined` (1/3). Naprawa: `who()` z zasięgu sesji (ta sama mapa `PLAYER_NAMES`, której domyślnie używa `sessionLog`). Wniosek: nazwa pomocnika „obecna w pliku” nie znaczy „widoczna w moim zasięgu” — nowy konsument sprawdza SWÓJ closure.

**Kolejność weryfikacji (RED → GREEN).** Odłożenie `src` (stash) → strażnik czerwony (brak eksportu), po przywróceniu 3/3. Sonda pełnej partii po naprawie: 10 wpisów `kind: 'tap'` w 3 turach, „Nieprzyjaciel tapuje na manę: Mountain #1 → {R}”, `botMoves` i `turnHistory` bez ani jednego „na manę”. Bramy: `node tools/run-tests.mjs all` **6025/6025** (6022 + 3 nowe piny).

**Piny:** e2e w `test/table-ui.test.js` (ten sam scenariusz co pin G, talia „g-canonized”): po zapłacie log stołu ma wiersz `log-tap` z „Swamp → B” (symbole many to ikony), pole „Log partii” niesie pełny zapis z symbolami, a zapis tur dla AI jest czysty — i `test/zgloszenie-j-tapniecia-many-w-logu.test.js` — 3 przypadki: (1) reguła `manaSourceLogText` (jedna jednostka, druga osoba, trzy bezbarwne, dwie tego samego koloru, `null` dla obcych zdarzeń i bez nazwy); (2) realne `tap_for_mana` na stole dokłada wpis `kind: 'tap'` z nazwą i kolorem, a „Log partii” (`logTextAll`) go pokazuje; (3) wpis NIE trafia do `botMoves` ani `turnHistory`.

**Wniosek dla procesu:** zgłoszenie „chcę dodatkowo widzieć X” to zamówienie na DWIE rzeczy naraz — treść wpisu (dobierz zdarzenie, które niesie pytanie gracza, a nie pierwsze z brzegu o podobnej nazwie) i jego granicę (gdzie wpis ma NIE trafić). Jedno i drugie jest pinowalne, więc obie strony lądują w strażniku.

**Korekta po uwadze właściciela (2026-09-20d).** Pierwsza wersja paczki J dołożyła wpisom własny rodzaj (`tap`) i wyciszony kolor (`.log-tap`), a paczka C — pole tekstowe z logiem (`<pre id="log-text">`) obok listy. Właściciel odrzucił jedno i drugie: „W sekcji «Log partii» nie ma i ma nie być żadnych dwóch streamów… Miałeś tylko w zleceniu C dodać możliwość kopiowania tego loga (albo określonej tury) do clipboardu. Plus zmiana chronologii… Tu nie ma i ma nie być żadnych kolorów. Ma zostać dokładnie tak samo jak było”. Naprawa: wpis loguje się zwykłym rodzajem `event` (jak „Zagrywasz Forest”), własny kolor zniknął, a z sekcji „Log partii” usunięto nadmiarowe pole tekstowe razem z jego stylem — zostaje JEDNA lista logu (z podlinkowanymi nazwami kart) + select zakresu + dwa przyciski kopiowania. Strażnik `test/zgloszenie-c-log-partii-tury.test.js` dostał pin struktury sekcji (żadnego `log-text`, żadnego własnego koloru wpisów), a test J — pin rodzaju wpisu. Bramy: 6026/6026.

**Uwaga o opisie dla właściciela.** W raporcie napisałem „na stole symbole many renderują się jako ikony, a w polu «Log partii» jest pełny zapis z symbolami” — to było mylące („stół” to ta sama lista logu w tej samej sekcji, a „pole” to mój nadmiarowy element). Wniosek: raport opisuje ELEMENTY UI nazwami z ekranu właściciela, nie skrótami z kodu.

## L158 (2026-09-20) — Menu opcji to nie pula możliwości gracza

**Objaw:** audyt PR #130 §6 zapisał `legalBlockerOptions` ponad cap-em jako
„zbiór blokerów jest poprawny, ale niekoniecznie najlepszy z możliwych" i
zostawił bez naprawy („cap tnie OPCJE, nie użycia", L151). Właściciel:
„Czemu świadomie nie naprawiane? Błędy powinny być natychmiast naprawiane".
Pomiar pokazał, że zapis był za optymistyczny: na planszy 6 atakujących ×
6 blokerów (zwykła późna tura) suma ofert traciła 5 legalnych par
(atakujący, bloker), 8×8 → 33, 10×10 → 69. Wizard bloków rysował wiersze
z sumy ofert i sam budował komendę z ptaszków, więc para bez wiersza była
dla człowieka nieosiągalna — mimo że `declareBlockers` by ją przyjął.

**Przyczyna:** dwa różne pojęcia sklejone w jedno. Menu szybkich przypisań
(`legalBlockerOptions`, ograniczone `COMBAT_OPTION_CAP` = 32 dla czytelności
listy) było JEDYNYM nośnikiem wiedzy o tym, kto może blokować kogo. Gdy jeden
artefakt pełni dwie role (lista do klikania + definicja możliwości), limit
pierwszej roli po cichu staje się limitem drugiej.

**Naprawa:** `blockCandidatePool(state, playerId)` — pełna pula per atakujący,
liczona wprost z reguł (bez enumeracji, więc bez wykładnika i bez capu),
legalnością z TEGO SAMEGO predykatu co walidacja (`blockAssignmentViolation`,
M387/L41). Widok niesie ją jako `blockCandidates` (tylko broniącemu, tylko
w kroku deklaracji bloków, przy pustym stosie — warunki lustrzane wobec
`legalCommands`), a `renderCombatWizard` rysuje wiersze z puli uzupełnionej
ofertami. Menu zostaje skrótem.

**Warianty tej samej klasy w tej sesji:**
- (3) jednorazowy pomiar bez strażnika: skan znaków niełacińskich wykonany
  2026-09-20c wyszedł czysto, ale nie zostawił pinu — przy ponownym pomiarze
  tego samego dnia było 15 znaków w 13 plikach: cyrylica wklejona w polskie
  słowa („stwory" z U+044B, „Wardem" z U+0435/U+043D, „wybierane" z
  U+043E/U+0431, „kontrakt" z U+043A–U+0442, „slucha" z U+0430, „luki"
  z U+0456) — grep po haśle przestawał działać. Naprawa: stały strażnik
  `test/e5-znaki-nielacinskie-w-zrodlach.test.js` z jawnymi wyjątkami
  (ratchet w obie strony) i dowodem, że detektor DZIAŁA (pliki w katalogu
  tymczasowym), bo samo „repo czyste" nie dowodzi niczego.
- (4) lustro cudzej kaskady: `modeFollowUpPlanOf` kopiowało cztery z
  jedenastu planów `main.js` i w INNEJ kolejności (multi przed window, choć
  M300/1 wymaga odwrotnie). Wołały je wyłącznie testy, więc zielone piny
  opisywały ścieżkę, którą gracz nigdy nie idzie. Naprawa: kopia usunięta,
  testy M2/2–M2/4 pinują funkcje produkcji.
- Dziura w pinie zamiast odmowy: D/4 pilnował pipów zdolności tylko kart
  BEZKOLOROWYCH (`continue` dla kolorowych), więc „pipy kart kolorowych"
  nie były świadomą rezygnacją, tylko niezmierzoną klasą. D/5 domyka
  niezmiennik i pokazuje 2 nazwane, mechanicznie usprawiedliwione wyjątki
  (Mournful Zombie, Dragonbroods' Relic).

**Reguła pracy:** wpis „nie naprawiamy świadomie" wymaga (a) pomiaru,
(b) powodu z reguły CR albo kosztu, (c) pinu, który pilnuje, że stan się nie
pogorszy. Bez tych trzech to jest po prostu nieznaleziony błąd.

**Przypadek:** `legalBlockerOptions` ponad `COMBAT_OPTION_CAP` kończy się
`slice(0, cap)`, a wizard bloków brał kandydatów z SUMY OFERT — 6×6 traciło
5 legalnych par (atakujący, bloker), 10×10 — 69 (CR 509.1b).

## L112 (2026-09-01) — przypadek (proza z rejestru, dodana 2026-09-20e)

**Proza z rejestru (kondensacja 2026-09-20e):**

Rygor, bez którego narzędzie szkodzi: trafienie weryfikuj wobec KONSUMENTA (grep
pola w `session.js`, `triggers.js`) — z 36 kandydatów realne były 2; lista
wyjątków JAWNA i z POWODEM; analizator jest produktem (fałszywy alarm poprawiaj w
TEŚCIE, nie w kodzie).

## L121 (2026-09-02) — przypadek (proza z rejestru, dodana 2026-09-20e)

**Strażnik (pełna treść z rejestru, kondensacja 2026-09-20e):**

`test/uwagi-tura9-bot-rowne-ciala-equip.test.js` (T9/5 i T9/6 — obie
strony, T9/3 — antysymetria na 40 parach, T9/8 — jedno miejsce definicji wagi).

Pytanie kontrolne właściciela pokazało drugą stronę
tego samego kodu: Wooden Stake leżał na 3/2 z defenderem, obok stał 3/2, który umie
atakować, a ładunek liczony od samej pompy był na obu identyczny — drabina kazała
stać i sprzęt zakotwiczał się na stworze, który nigdy nie zaatakuje. Żaden gracz
tego nie zgłosi: błąd objawia się ciszą (brak poprawki), nie kaszanem.

## L115 (2026-09-02) — przypadek

**Objaw:** tryb grupowania rozpoznawało się w silniku po NAZWIE zdarzenia, a
`combat_damage_to_you` scalało się po graczu → druga instancja tej samej zdolności
przepadała (Contested Game Ball ×2, CR 603.3).
**Przyczyna:** rozjazd z CR 603.2 (zdarzenie scala się w jedno) i CR 603.3 (każda
instancja wyzwala osobno); decyzja właściciela: „engine jest headless,
name-agnostic" (ADR 0002).

## L116 (2026-09-02) — przypadek

**Objaw:** test okna Vaana dał `trigger_resolved: no_result` — wyglądał jak błąd
efektu, a to brak danych w teście.

## L162 (2026-09-21) — przypadek

Kod wyglądał poprawnie (`log-card`, `data-card-id`,
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

## L18 (2026-08-16) — przypadek

**Objaw:** sonda zgłosiła Welder Automaton („{3}{R}: 1 obrażenie każdemu
przeciwnikowi") jako „jedyna zmiana to zapłacony koszt" — jedyną różnicą był
spadek życia PRZECIWNIKA, a sonda śledziła wyłącznie życie gracza sondy.

## L2 (2026-08-14) — przypadek

**Objaw:** po naprawie pięciu luk decyzyjnych (M92) pełna macierz (5616
meczów) dała wynik identyczny co do 0,1 pp.
**Przyczyna:** karty z daną mechaniką są w jednej–dwóch taliach na kilkanaście;
poprawka ginie w uśrednieniu.

## L24 (2026-08-16) — przypadek

**Objaw:** czar za 3 many (Hysterical Blindness, −4/−0 stworom przeciwnika)
rozstrzygał się, a log i panel pokazywały tylko „zostaje rozstrzygnięty". To
samo: Turn the Tide, Angel of the Dawn, Jyoti. Gracz nie miał JAK się
dowiedzieć, co zrobiła jego karta.
**Przyczyna:** efekt zapisywał stan bezpośrednio (`state.untilEndOfTurnBuffs`,
`modifyStats` wyciszony jako szum) i nie emitował zdarzenia; testy silnika
sprawdzają SKUTEK w stanie, nie istnienie zdarzenia.

## L39 (2026-08-18) — przypadek

**Objaw:** audyt „czy każda decyzja ma opis w logu" wykazał 177/177 opisanych
zdarzeń i 50/50 obsłużonych komend `resolve_*` — zero usterek. Pokusa: odhaczyć
i iść dalej.
**Przyczyna niepokoju:** kompletności logu nie pilnowało NIC. Zielony stan był
przypadkowy i już dwa razy (M96, M126) przestawał być zielony w najgorszy
sposób: surowym slugiem zdarzenia u gracza, bo `describeGameEvent` ma
`default: return e.type`.

## L4 (2026-08-14) — przypadek

**Objaw:** gracz zostawał na ekranie z jedyną opcją „Poddaj partię"; w logu
`Ruch odrzucony: not_priority` (M90/B).
**Przyczyna:** `session.apply()` czyścił bufor modala i kasował pauzę bota
PRZED `execute()`, „defensywnie" zakładając powodzenie.

## L6 (2026-08-14) — przypadek

**Objaw:** log i modal „Ruch przeciwnika" nie mówiły, który tryb czaru
modalnego wybrał bot: Ruinous Rampage wyglądał identycznie niezależnie od
wyboru (M91/D).
**Przyczyna:** `describeGameEvent` jest czystą funkcją bez dostępu do rejestru
kart (świadomie — testowalna headless). Zdarzenie niosło `modeIndex`, ale nie
nazwę trybu.

## L72 (2026-08-25) — przypadek

**Objaw (M212):** zgłoszenie „bot tapuje własnego blokera" dotyczyło
rebounda; ta sama ślepota siedziała w `resolve_suspend_cast`, a po przeglądzie
także w `resolve_madness_cast`. Trzy gniazda, jedna przyczyna: silnik
enumeruje ofertę per zestaw celów, a bot wyceniał wyłącznie TYP efektu, więc
wszystkie warianty miały identyczny wynik i wygrywał pierwszy z brzegu.

## L74 (2026-08-25) — przypadek

**Objaw (M212):** znaleziska brały się z czytania transkryptu, gdzie osobne
elementy UI są sklejane separatorem w jedną linię: dwie opcje wyglądają jak
jedna zlepiona etykieta i odwrotnie. Z 13 partii 11 tropów okazało się
poprawnym zachowaniem.

## L76 (2026-08-25) — przypadek

**Objaw (M213):** po naprawie sondy partia kontrolna zwróciła NIEZMIENIONĄ
liczbę zgłoszeń — wyglądało to na „patch nie działa" i o mało nie wywołało
szukania drugiej przyczyny w kodzie, który był już poprawny.
**Przyczyna:** `tools/table-tester/run-game.mjs` ładuje zbudowany artefakt
`dist/mtg-table.html` (ADR 0011), nie moduły z `src/`. Bez `npm run build`
Tester mierzy poprzednią wersję.

## L79 (2026-08-26) — przypadek

**Objaw (M219, pętla jakości, g9):** aktywacja Unstable Frontier dała DWA
identyczne wiersze: „Swamp staje się typem Plains do końca tury" ×2.
**Przyczyna:** rozstrzygnięcie `resolve_land_type_choice` emituje parę —
`land_type_changed` (mutacja) i `land_type_choice_resolved` (narracja) — a
`describeGameEvent` renderował OBA (wariant L24/L6; pokrewne L41, ale po
stronie zdarzeń).

## L83 (2026-08-28) — przypadek

`test/fingerprint-pending-decisions.test.js` liczył pokrycie jako każde
wystąpienie `pending*` w surowym pliku. Mutacja: `state.pendingZzz` w kodzie
+ wzmianka `pendingZzz` wyłącznie w KOMENTARZU → strażnik zielony. Nowa decyzja
znów wyciekłaby z odcisku stanu.

## L163 (2026-09-21) — przypadek

**Objaw:** aura „Enchant player" (Curse of the Pierced Heart) wracająca z grobu
(trigger Annie Flash, CR 303.4f) nie miała żadnego wariantu w decyzji
`resolve_aura_host` — kontrakt niósł wyłącznie id permanentów, więc dla aury
„Enchant player" oferta była pusta, a jedynym ówczesnym zachowaniem było
zostawienie jej w grobie (`aura_returned_without_host`).

**Przyczyna:** dwie warstwy znały wyłącznie obiekty: predykat gospodarza
(`isLegalAuraHost`, domyślna gałąź „wyłącznie stwory") i kontrakt decyzji
(`candidateIds`) — a CR mówi „a legal object OR PLAYER". Pomiar na żywo
(seed 106, talia-sonda z Annie Flash) pokazał przy okazji, że bez gałęzi
'player' klątwa lądowała NA STWORZE z nieustawionym `enchantedPlayerId`.

**Naprawa:** gracz to osobny predykat i osobny zbiór kandydatów
(`isLegalAuraPlayerHost`, `legalAuraHosts`), decyzja niesie OBA zbiory
(`candidateIds` + `candidatePlayerIds`), wejście rozstrzyga kształt po id
(`attachAuraToPlayer`: `kind: 'enchantment'` + `enchantedPlayerId`, jak
w `spells.js`), a warstwy widza (etykieta „Ty"/„Nieprzyjaciel", wycena bota,
projekcja pokrycia, narracja) poznały nową klasę tego samego dnia.

## L164 (2026-09-24) — przypadek

**Sytuacja.** Audyt PR #134 znalazł przestarzałe numery CR w komentarzach
(F-3): surge jako 702.111, licznik finality jako 122.1e, cloak jako 701.56,
DFC jako 711.x. Naprawa = przenumerowanie 107 wystąpień. Dla DFC źródłem było
lustro `ancestral.vision/additional-rules/double-faced-cards.html`, które
pokazywało sekcję 712 z podziałem 712.4a (cechy twarzy) / 712.7 (rzut przodem)
/ 712.9 (wejście przodem) / 712.10 (wejście poza stosem).

**Co poszło nie tak.** To lustro opisuje wydanie CR starsze o co najmniej jedno.
Pobranie dosłownego spisu sekcji 712 z `mtg.wiki/page/Double-faced_card`
(nagłówek: „Comprehensive Rules (September 25, 2026—Reality Fracture)”)
pokazało inną strukturę: meld przestał być osobną sekcją 712 i został
wchłonięty (712.4 = meld cards, 712.5 = siedem par meld), przez co cechy twarzy
przesunęły się na 712.8/712.8a–g, rzut na 712.11, rozstrzygnięcie na 712.13,
wejście z innej strefy na 712.14, a „transform nie tworzy nowego obiektu” na
712.18. Karty zastępcze dostały własną sekcję 713. Pierwsza fala przepisała
więc ~30 cytatów na numery, które w bieżącym wydaniu znaczą COŚ INNEGO, i
dodatkowo „poprawiła” dwa cytaty poprawne: `712.9` (transform kopii
jednostronnej = nothing happens) → `712.5` (siedem par meld) oraz `712.8e`
(MV permanentu z tyłem = koszt przodu) → `712.4d` (podreguła meld).

**Jak wykryte.** Weryfikacja drugiego źródła przed domknięciem znalezionej
klasy (ADR 0030: dosłowny tekst, nie parafraza). Rozbieżność między dwoma
„wiarygodnymi” lustrami to sygnał, że jedno jest z epoki — rozstrzyga data
wydania w nagłówku, nie kolejność w wynikach wyszukiwania.

**Naprawa.** Cofnięcie dwóch błędnych korekt, przenumerowanie DFC na
712.6/712.7/712.8/712.8a/712.8e/712.9/712.11/712.13/712.18, tabela mapowania
w pinie z wierszami „BEZ ZMIAN” dla 712.9 i 712.8e, para DFC w strażniku
mechanik (zakaz `711.\d` i `712.4` w kontekście kart dwustronnych) oraz
komentarz przy `transformedCharacteristics`, który zamiast powoływać 400.7 +
711.2 jako rzekomą regułę dla resetu cech, cytuje 712.18 i nazywa reset
ZNANYM ODSTĘPSTWEM (obserwacja O-6 audytu).

## L165 (2026-09-24) — przypadek

**Sytuacja.** Po fali 1 (72 zamiany parami „mechanika + numer na linii”) i
fali 2 (31 miejsc poprawianych per-site, bo polska odmiana i cytaty w
sąsiedniej linii uciekały dopasowaniu po granicy słowa) powstał detektor
tabelaryczny: pełny spis `702. Keyword Abilities` z CR 2026-09-25
(702.1–702.195) i reguła „każdy cytat `702.<n>` musi mieć w oknie ±8 linii
nazwę mechaniki, którą `702.<n>` znaczy”.

**Co wykrył od razu.** Dziewięć miejsc, których NIE łapały istniejące pary
liniowe, w tym trzy pary już opisane w strażniku: fabricate cytowany jako
`702.122a` (= crew) w `effects.js`, `game-state.js` i teście nazw tokenów
(słowo „fabricate” stało linię wyżej niż numer, a `state.pendingFabricate`
dwie linie niżej), vigilance jako `702.21` (= ward) w dwóch miejscach bota i
w teście M221/D, flashback jako `702.33a` (= kicker) w `render.js` ×2 i w
teście uwag z gry. Do tego infect jako `702.89b` (= umbra armor), plot jako
`702.168a` (= disguise), endure jako `702.174` (= gift; endure to keyword
ACTION 701.63a/b), equipment jako `702.16` (= protection) i outlast jako
`702.100` (= evolve).

**Wniosek ogólny.** Lista „znanych błędnych par” rośnie wolniej niż klasa:
para jest liniowa, a komentarze w tym repo są wieloliniowe i po polsku.
Detektor odwrócony (od numeru do nazwy, z oknem) nie wymaga znajomości
błędu — wymaga tylko BIEŻĄCEJ tabeli. Żeby nie świecił fałszywie, potrzebował
aliasów (polskie nazwy i odmiany: „chronionego”, „przydziały”, „dar”,
„załoga”, „obrót”) oraz trzech udokumentowanych wyjątków (lista sekcji CR
„w pełnym wymiarze”, odniesienia negatywne „nie dotyczy”, nagłówkowe listy
źródeł w testach audytowych). Reguła ogólna 702.1 jest poza tabelą świadomie.

**Pułapka przy wdrażaniu.** Nowy plik-strażnik opisuje historię rozjazdów
(cytuje `702.122a` przy słowie „fabricate”), więc ISTNIEJĄCY strażnik par
zaczął świecić na jego dokumentację; to samo pin audytu (wiersze mapowania
„Surge | 702.111 | 702.117”). Każdy strażnik skanujący `test/` musi mieć
listę wyłączeń obejmującą WSZYSTKIE pliki-strażniki, nie tylko siebie.

**Dowód działania.** Wbudowany test RED karmi `znajdzRozjazdy()` syntetycznymi
liniami z F-7 (vigilance+702.21, fabricate+702.122a w trzech liniach, numer
spoza tabeli) i wymaga, żeby świeciły, oraz liniami poprawnymi (702.20,
702.21 przy ward, 702.123a przy fabricate) i wymaga zera trafień. Mutacja na
żywym repo (M9: vigilance 702.20 → 702.21) czerwieni jednocześnie detektor
okna i parę liniową — oba strażniki są niezależne, więc jeden nie maskuje
drugiego.

## L166 (2026-09-24) — przypadek

Właściciel zapytał, czym jest „D4b” z planu, i postawił warunek: jeśli to
uproszczenie niezgodne z CR — naprawić. Sonda `.probe-613.mjs` (poza repo) na
prawdziwych kartach katalogu dała osiem odchyłek W-1…W-8, każdą z wynikiem
liczbowym przed naprawą (Tarmogoyf 6/7 zamiast 4/4, zakryty 2/2 zamiast 4/4,
Grounded blokujące późniejsze „gains flying”, Skilled Animator 6/6 zamiast 5/5
po crew, Warrior's Sword zostawiający typ Warrior po „becomes a Human”,
Krotiq tracący defendera). Dziewiąta (W-9) wyszła przy dodawaniu flagi W-8:
pytanie „gdzie jeszcze trzeba wyzerować nowe pole?” pokazało, że
`moveObjectDirectly` nie zeruje ŻADNEGO z pól „do końca tury” zapisanych
mutacją — ani animacji, ani nadpisania podtypów. Naprawa resetu od razu
zepsułaby triggery śmierci obsadzonego pojazdu (karta w grobie przestała być
stworem), więc w tym samym commicie weszło LKI rodzaju (`diedAs`) z testem
obu stron (obsadzony odpala, nieobsadzony nie). Znaczniki trafiły do jednego
modułu i do choke pointów (wejście na pole, przypięcie, licznik, nadanie,
obrót, transformacja); przypięcie do tego samego obiektu nie daje znacznika
(701.3b) — pokazał to istniejący probe no-op (U9), nie nowy test.

## L167 (2026-09-24) — przypadek

Po D4b (W-6: crew nie nadpisuje P/T animacji) właściciel zażądał usunięcia
KAŻDEGO uproszczenia wpływającego na grę. Sonda na prawdziwych kartach
(Skilled Animator + Irontread Crusher) pokazała dwie odchyłki: W-10 — po crew
i śmierci Animatora Crusher tracił typ Creature od razu, choć crew trwa do
końca tury; W-11 — „set P/T do końca tury” nałożone na animację Animatora
zdejmowało w cleanupie także animację (5/5 znikało razem z 8/8). Przyczyna
wspólna: jedna scalona warstwa pól obiektu nie pamięta, który efekt co
wniósł. Naprawa: lista `animationEffects` (każdy wpis ze swoim czasem
trwania i znacznikiem), warstwa liczona z wpisów, obiekty bez listy idą
ścieżką dotychczasową. W trakcie pierwsza wersja cofała się sama — druga
łatka `replaceObject` dostawała obiekt sprzed pierwszej i rozkładała go
w całości. D3 potwierdził ścieżkę w partiach (crew + Animator na Barge
i Crusherze bez zgłoszeń).

## L168 (2026-09-24) — przypadek

Audyt celowany Żywym Testerem na kartach batcha 59 (8 partii na tymczasowej
talii `decks/audyt-batch59.txt`, transkrypty `/tmp/zb-{P1..P6,Q1,Q2}.txt`) nie
znalazł nic w samych mechanikach, ale w transkrypcie P1 stanęło zdanie
„Nieprzyjaciel rzuca Join the Dance / tapuje Forest → G, Plains #1 → W,
Plains #2 → W, Swamp #1 → B": cztery many za czar z grobu, którego druk mówi
`Flashback {3}{G}{W}` — pięć. Sprawdzenie danych potwierdziło
`flashback: { cost: 4, colors: ['G','W'] }`, a test B59/G1.4 sam twierdził
„koszt flashbacku {3}{G}{W} = 4 many": warstwa danych i warstwa testów
powtarzały ten sam błąd arytmetyczny, więc żadna nie mogła zapalić światła.

Ten sam przebieg pokazał drugą rzecz: etykiety flashbacku w `render.js`
budowały napis ręcznie (`manaHtml ? manaCostHtml(\`{${fbCost}}\`) :
\`{${fbCost}}\``), czyli pokazywały KWOTĘ jako cenę generyczną. Transkrypty
mają dowody obu przypadków: `>> Flashback: Memory's Journey (koszt 1)` dla
kosztu {G} oraz `>> Flashback: Join the Dance (koszt 4)` dla {3}{G}{W}.
Reszta rodziny (escape M267/C, warp i plot M268, suspend M151) szła już przez
`costSymbols`, więc była to ostatnia ręczna sklejka — a komentarz „escape.cost
= {generic}" w tej samej funkcji tłumaczył, skąd bierze się pomyłka: `cost`
to SUMA symboli (bestow {3}{G} = 4, escape {3}{U} = 4, flashback {1}{U} = 2),
a `costSymbols` sam odejmuje pipy.

Skan Oracle↔definicja po KWOCIE (nie tylko po pipach, jak strażnik M268)
wskazał trzy trafienia: dwa prawdziwe (join-the-dance, boulder-salvo — surge
{1}{R} zamiast {2}{R}, karta z batcha 58, czyli klasa nie zna granic batcha)
i jedno narzędziowe (`lunar-rejection`: cleave trzyma kwotę w `manaCost`).
Trzy karty wypadły ze skanu z powodu, który trzeba było nazwać: dwie przygody
(Scryfall nie pisze kosztu przy słowie „Adventure" — druga część karty jest
osobnym czarem) i `mindstab` z „Suspend 4—{B}" (między słowem a kosztem stoi
licznik czasu — po naprawie regexu paruje się poprawnie). Wyjątki trafiły do
`ORACLE_SKIP` z powodem i do asercji, która wypisuje pominięte karty wprost,
żeby nowa karta nie przeszła po cichu. Naprawa danych poszła razem z korektą
testów batchy 58/59 (tytuły twierdzące błędną arytmetykę) i ze strażnikiem
`test/audyt-m428-kwota-alt-kosztu.test.js`, który ma wbudowany dowód RED na
obu znalezionych rozjazdach.

## L169 (2026-09-24) — przypadek

Zlecenie właściciela po raporcie 24d brzmiało: „Pociągnij ten temat" — taktyczne
doszlifowanie wyceny trzech kart batcha 59, z zastrzeżeniem WPROST, że nie chodzi
o automatyczne strojenie wag, tylko o przemysłane ich ustawienie („weź przykład
z innych podobnych kart o podobnych efektach"). Pomiar na silniku (6 seedów,
tymczasowa talia z 2 egzemplarzami każdej karty) pokazał, że problem nie leży
w wartościach, a w BRAKU WYMIARU: warianty tej samej komendy remisowały co do
punktu, więc o wyborze decydowała kolejność z `legalCommands`.

Mutagen (deskryptor zdolności: `{1}, {T}, poświęć: +1/+1 na cel`, tylko jak
sorcery) dawał 14/14/14 — tyle samo dla tokena 1/1, Cryptida 2/3 i Hill Gianta
4/4. Bot brał pierwszy wariant, więc zdolność „awansowała" najmniejsze ciało,
a jednocześnie przepalała {1} na dokładnie ten sam efekt, który mógł kupić
znacznie więcej. Naprawa nie polegała na podbiciu liczby: podzieliłem dawną
stałą 8 + 4·amount na bazę (2), wagę ilości (4) i WAGĘ CIAŁA GOSPODARZA (2 na
mocy, 1 na wytrzymałości — co do punktu jak w wycenie aury-buffa z M257 r4,
gdzie komentarz mówi: „opłaca się tym bardziej, im większy gospodarz"). Przy
takim doborze token 1/1 jest wart dokładnie tyle, ile przed zmianą (2 + 4 +
2·3 = 12), więc żadne wcześniejsze zachowanie nie straciło wartości — różnicę
zyskują realne ciała. Dodatkowo licznik, który poprawia wynik TRWAJĄCEJ walki,
dostaje premię (M218/2 `pumpImprovesOutcome`), a licznik na gospodarzu skazanym
w tej turze (deklarowany bloker, który ginie nie zabijając; cel usunięcia na
stosie — M236/2) ma wartość ZEROWANĄ do −20: duży trup to nadal zero, więc
aktywacja schodzi pod „pass". Ciekawostka silnika wyszła przy testach: Mutagen
ma timing sorcery, więc silnik NIE oferuje jego aktywacji przy niepustym stosie
ani poza własną fazą główną — obserwacja właściciela „aktywowany zawsze w fazie
głównej" to reguła karty, a nie wada wyceny; dwa „kontekstowe" terminy licznika
są jednak żywe dla instantowych źródeł liczników (Reinforce Mosquito Guarda,
Cenn's Tactician) i tam mają testy.

Memory's Journey („target player shuffles up to three target cards from their
graveyard into their library") była warta płasko 4 + 2·karty, czyli 58 punktów
niezależnie od tego, czy biblioteka ma 30 czy 12 kart, a wariant z ZERO
wybranych kart też dawał 58 — czyli bot oddawał kartę z ręki za przetasowanie
własnej biblioteki. Karty wracają do BIBLIOTEKI, nie do ręki, więc jedyną
realną wartością jest czas przed deck-outem (CR 121.4/704.5b) — a to ta sama
miara, którą posługuje się istniejąca rodzina biblioteczna (`librarySafeMargin`
= 20, kara per karta). Reguła: zdrowa biblioteka → kara (instant czeka na okno,
wzorzec M235), cienka → zwrot plus dopłata ratunkowa za każdą wracającą kartę,
zero kart → kara jak za efekt jałowy. Po zmianie w tych samych 6 partiach czar
poleciał 5 razy zamiast 11 i WYŁĄCZNIE przy bibliotece 19 kart.

Charismatic Vanguard to przykład trzeciej twarzy tego samego problemu: reguła
dla `buff_creatures_you_control` istniała od M106/Z7, ale tylko w gałęzi
CZARÓW. Zdolność aktywowana szła przez pętlę efektów bez gałęzi dla tego typu,
więc dostawała gołe `score = 2` (sama baza) w KAŻDYM kroku tury — bot przepalał
{4}{W} w Głównej 1, gdzie pump „do końca tury" wygasa w cleanup, nie zmieniając
niczego. Wyjęcie reguły do jednej funkcji (`teamPumpValue`) i użycie jej w obu
gałęziach (L41) dało: Główna 1 bez walki = −23 (pass wygrywa), okno walki z dwoma
atakującymi = 20 punktów. Ta sama lekcja co przy czarach: bliźniacza gałąź,
której nie odwiedzono, nie „nie ma problemu" — po prostu nie ma wyceny.

Dowód na końcu: `npm test` 6534/6534, golden-master zielony BEZ regeneracji
(zmiana jest wąska, nie globalna), szybka macierz 672 mecze — heuristic 78,0 %
vs aggro i 97,6 % vs random (progi 62 % / 78 %), ewaluacja lustrzana 72:72,
a Żywy Tester na 4 partiach: 0 zgłoszeń detektorów, 0 niewycenionych ruchów,
Mutagen na najlepszym ciele, Memory's Journey trzymana w ręce, Vanguard
aktywowany w walce (transkrypty `/tmp/po-audyt/po-*.txt`).
