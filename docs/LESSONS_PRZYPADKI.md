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

## L62 (2026-08-25) — przypadek

**Objaw (M205):** kolektor wpisów logu w Żywym Testerze („odpytuj nowe linie
`#log` po indeksie" — wg handoffu) znajdował 0 wpisów, choć sesja je
generowała i `session.log` je miał.

**Przyczyna:** `render.js` rysuje log od NAJNOWSZEGO
(`[...session.log].reverse()`), więc nowe wpisy dokładają się na POCZĄTKU
listy DOM; pętla `for (i = widzianeDotąd; i < entries.length; i++)` czytała
najstarsze jako „nowe". Poprawnie: `entries.slice(0, nowe).reverse()`.

**Wariant z tej samej sesji:** `--out katalog/plik.txt` do nieistniejącego
katalogu wywracał zapis na ENOENT dopiero PO ~40-sekundowym przebiegu — cały
transkrypt przepadał. Narzędzie waliduje miejsce zapisu ZANIM zacznie mierzyć
(L33).

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

## L9 (2026-08-14) — przypadek

**Objaw (dwukrotny):** (a) handoff twierdził, że pięć fixów przepadło z
workspace — bo nie zostały wypchnięte; (b) sandbox odtworzył workspace ze
świeżego klona w środku pracy i commit wylądował na `main`.

**Przyczyna:** nowa sesja Areny widzi wyłącznie `main` na GitHubie i treść
pierwszego promptu (ADR 0013). Środowisko może zresetować workspace w trakcie
sesji (reflog: `clone: from …`).

**Procedury:** [docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md) §1–2.

## L10 (2026-08-14) — przypadek

**Objaw:** właściciel zgłosił, że PR od 30 minut nie ma opcji scalania ani
informacji o CI. Odruch: szukać błędu w workflow albo w ochronie gałęzi.

**Diagnoza (4 zapytania):** (1) `gh pr view --json state,mergeable,
mergeStateStatus,statusCheckRollup` → `MERGEABLE`, `CLEAN`, check `test` =
`SUCCESS`; (2) `git ls-remote origin <gałąź>` vs `head_sha` runu CI → ten sam
commit; (3) `gh api repos/…/rules/branches/main` → reguły, `reviewThreads.
totalCount = 0`; (4) `githubstatus.com/api/v2/summary.json` → brak incydentów.

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

## L22 (2026-08-16) — przypadek

**Objaw:** po zaznaczeniu ptaszka „nie przerywaj auto-passu" kolejne tapnięcie
gracza kończyło się „Ruch odrzucony: illegal_cast: Zagranie poza main phase" /
„not_priority" (3 przypadki w macierzy M104; przy `--tick-rate 0` żadnego).
Ruchy bota z tego momentu nie trafiały do modala „Rozgrywka".

**Przyczyna:** `toggleIgnoredOption` renderował panel, a DOPIERO POTEM wołał
`session.recheckAutoPass()`, które przewija grę (auto-pass, tura bota). Po
przewinięciu nie było renderu, więc na ekranie został panel z MINIONEGO okna —
z komendami sprzed przewinięcia.

## L23 (2026-08-16) — przypadek

**Objaw:** w katalogu siedziały trzy błędy kosztów: „{B}{B}" i „{R}" zapisane
jako sama liczba many (zdolność opłacalna dowolnym kolorem) oraz {2}{U}
zapisane jako `manaCost: 2` (karta o manę tańsza). Testy kart sprawdzają
SKUTEK zdolności, nie to, czy dało się ją opłacić złym kolorem.

**Przyczyna:** koszt żyje w dwóch reprezentacjach (`MANA_COSTS[id]` jako string
Oracle i `manaCost`/`cost.colors` jako dane silnika) bez bramki między nimi.

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
