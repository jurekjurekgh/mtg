# Lekcje projektowe (trwały rejestr)

Ten plik gromadzi **powtarzalne wnioski z pracy nad projektem** — rzeczy, które
kolejne sesje powinny wiedzieć, zanim popełnią ten sam błąd po raz trzeci.

**Czym różni się od innych dokumentów:**

| Dokument | Zakres | Trwałość |
|---|---|---|
| `docs/setup/HANDOFF_*.md` | stan JEDNEJ sesji: co zrobiono, co dalej | jednorazowy, traci aktualność |
| `docs/plans/PLAN_*.md` | roadmapa JEDNEGO zadania | jednorazowy |
| `docs/PROJECT_STATE.md` | bieżący stan projektu | żywy, ale opisuje „teraz" |
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
(Strażnik „addObject rzuca na nieznane pole" byłby ładniejszy, ale dziś
wywraca ~40 plików testów, które przekazują pola ignorowane — to zadanie
na osobną sesję sprzątającą.)

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
