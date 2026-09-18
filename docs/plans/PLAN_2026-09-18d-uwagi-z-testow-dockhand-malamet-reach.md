# Plan sesji 2026-09-18d — uwagi właściciela z testów: C/C1/C2 (Merchant's Dockhand), D (Malamet Battle Glyph w Rozgrywce), E (atak latacza w reach)

> Sesja na gałęzi `arena/01a0b60e-mtg`, PR #129 (kontynuacja — 1 sesja = 1 PR).
> Poprzednia tura (A/B/B1) domknięta i zpushowana (`5b63663`); bramy:
> `npm test` 5802/5802, `npm run test:all` 5812/5812, build 64 moduły/3834,8 kB.

## Zlecenie właściciela (cytaty, 2026-09-19)

- **C.** Merchant's Dockhand — „{3}{U}, {T}, Tap X untapped artifacts you
  control: Look at the top X cards of your library. Put one of them into your
  hand and the rest on the bottom of your library in any order.”
  - **C1.** „Nie miałem wyboru ile X chcę tapnąć — aplikacja sama uznała, że
    skoro mam jeden inny artefakt, to chcę go tapnąć. A przecież mogłem tapnąć
    X=0. To jawny błąd. Przypuszczam też, że gdybym miał więcej artefaktów to
    też sam by zdecydował kogo tapować.”
  - **C2.** „Gdy tapnąłem 1 artefakt to oznacza, że odsłaniam 1 kartę i nie ma
    żadnego wyboru — tą jedną biorę do ręki. […] przy 1 karcie automatycznie
    powinien sam ją brać. Przy X>1 powinienem dostać normalny modal wyboru.”
- **D.** Malamet Battle Glyph — „To miało być naprawione w poprzedniej sesji
  bo już to zgłaszałem, ale widzę, że dalej nie jest. Efekty użycia tej karty
  nie pokazują się w panelu Rozgrywka. Informacje są już w logu […], ale
  w panelu Rozgrywka dalej tego nie ma.”
- **E.** „Bot atakuje mnie kreaturą 2/2 z lataniem, podczas gdy mam na stole
  kreaturę 2/4 z „reach” nadanym przez aurę. To bez sensu bo jego kreatura
  zginie nie robiąc mi żadnej krzywdy. Scoring do naprawy.”

## Decyzja właściciela (WIĄŻĄCA, 2026-09-19)

> „Tylko nie próbuj tego błędy C naprawiać dając mi wszystkie enumerowane
> opcje!!!! Czytałeś LESSON o tym jak robić modale wyboru. NIGDY ENUMERACJI
> W POSTACI WSZYSTKICH KOMBINACJI. To KARDYNALNY błąd. Robisz to uniwersalnym
> modalem wyboru czyli żadnej enumeracji. W tym przypadku najpierw wybieram
> ile to X +-. Potem na tej podstawie dostaję listę do zaznaczenia X
> artefaktów z listy (wszystkich artefaktów gracza), klikam w zatwierdź.”

Czyli: JEDNA opcja aktywacji w panelu → uniwersalny modal (stepper X „+/−”
w zakresie 0..N, potem lista z ptaszkami: nietapnięte artefakty gracza,
wymagane dokładnie X zaznaczeń) → „Zatwierdź”. Bez enumeracji wariantów
X=1..N i bez odgórnego `slice(0, x)` (L19/L144, lekcje o kreatorach: L126,
L135; wzorzec: kreator załogi crew — `openCrewWizard`, A2/2026-09-12:
„oferta to default silnika, nie rozkaz — człowiek wybiera w kreatorze”).

## Rozpoznanie (zmierzone 2026-09-19, nie z pamięci)

### C1/C2 — Merchant's Dockhand (`merchants-dockhand`, AER, artId 12)

- Koszt w danych: `{ mana: 4, colors: ['U'], tap: true, tapXArtifacts: true }`;
  efekt `look_top_put_one_hand_rest_bottom`, `amount: 'x'`.
- **Oferta** (abilities.js, gałąź M177/E): `for x = 1..pool.length` → warianty
  z `tapArtifactIds: pool.slice(0, x)` — X=0 NIE istnieje (walidacja
  `performActivation` wręcz rzuca na pustą listę), a artefakty dobiera SAM
  (prefiks porządku pola bitwy). Jeden artefakt = jeden wariant = sesja
  przewija okno bez pytania (objaw C1 dokładnie taki, jak opisany).
- **Rozstrzygnięcie** (effects.js): `pendingLookTopN` + modal
  `resolve_look_top_choice` nawet przy JEDNEJ karcie (objaw C2); przy X=0
  efekt wcześnie zwraca (pusta biblioteka oglądania) — po dołożeniu X=0
  do oferty aktywacja X=0 jest legalna i jałowa (CR: X może być 0).
- Konsumenci kształtu komendy (L135): silnik (oferta+walidacja), kreator UI
  (main.js `play` → wzorzec `crewPlanFor`/`openCrewWizard` + `picker.js`),
  sterownik testera (actions.mjs — klikanie kreatorów), wycena bota
  (activate_ability: efekt `look_top_put_one_hand_rest_bottom`), etykiety
  (render.js NON_MANA_COST_LABELS już ma `tapXArtifacts`; etykieta wariantu
  z xValue — render.js ~2217), noop-probe (już czyta `tapArtifactIds`).

### D — Malamet Battle Glyph (`malamet-battle-glyph`, LCI)

- Zgłoszenie poprzedniej sesji (HANDOFF_2026-09-18, poz. B) miało root cause
  w CRASHU renderu (M386: `hover.attach` w `renderEnergyPanel` przerywał
  `showBotMoves`) — naprawa SCALONA w PR #128 (`e0ad776`, jest na main).
- **Pomiar bieżący (2026-09-19): efektów walki NIE gubi żadna badana ścieżka.**
  - Headless (`createSession`): rzut człowieka z `pauseOnBotMoves: true` —
    bufor modala niesie komplet: `counter_added` (+1/+1, gdy cel wszedł w tej
    turze), oba `damage_dealt` (CR 701.12 — wzajemne obrażenia),
    `spell_resolved`, oba `creature_destroyed`; to samo w przebiegu tur
    (`turnHistoryTextAll`) i przy rzucie BOTA.
  - Żywy Tester (dist): partie ixalan|ravnica — transkrypt pokazuje w modalu
    „Rozgrywka” linie „X zadaje N obrażeń (Y)”, „Z zostaje rozstrzygnięty”,
    „Y ginie” zaraz po „Rzucasz Malamet Battle Glyph → cel: …”.
- Wniosek: zachowanie zgłoszone przez właściciela jest NIEODTWORZALNE na
  bieżącym drzewie; prawdopodobna przyczyna obserwacji to stary build/cache
  albo zapis partii wznowiony po odświeżeniu (bufor modala jest ulotny —
  po restarcie sesji modal pokazuje tylko ruchy PO wznowieniu, a log jest
  odtwarzany z replayu — dokładnie objaw „jest w logu, nie ma w Rozgrywce”).
- Działanie: pin regresyjny obu powierzchni (modal + przebieg tur) dla rzutu
  człowieka i bota, z licznikiem i bez — zielony na starcie (strażnik na
  przyszłość) + uczciwy raport z dowodami i prośbą o świeży re-test.

### E — atak latacza w reach z aury

- Widok niesie reach z załączników: `effectiveKeywords` = własne + granty
  EOT + `attachmentBonuses` (bestow/aura/equipment) + statyki warunkowe
  + anthemy (permanents.js); pomiar: bestow Leafcrown Dryad na 2/2 →
  `view.keywords: ["reach"]` u przeciwnika.
- Scoring czyta reach w każdym istotnym miejscu: `attackerCanBeBlocked`
  (flying wymaga flying/reach blokera), gałąź chump (−10, jałowy — premia
  wyścigu POMIJANA, M202/H), premia ewazji tylko gdy żaden bloker nie ma
  flying/reach. Pomiar minimalny: 2/2 flying vs 4/4 z reach (bestow) →
  bot ODMAWIA (attack[flyer] = −10 < pass).
- Fuzz: 30 partii heuristic-vs-heuristic (11 532 kroków, 5 par talii, w tym
  wiedzmin-bg z Leafcrown Dryad) — ZERO ataków latacza ginącego o blokera
  z reach/flying.
- Wniosek: mechanika jest pokryta; pin regresyjny (3 źródła reach: bestow,
  grant EOT, własny keyword) jako strażnik + raport. Jeśli właściciel
  odtworzy objaw — potrzebny seed/stan partii.

## Etapy

- [x] E0. Rozpoznanie + ten plan (commit i push PRZED kodowaniem — ADR 0020 A/C).
- [ ] E1 (C2). RED: przy jednej odsłanianej karcie sesja/silnik NIE kolejkuje
  modala — karta idzie do ręki automatycznie (L144: decyzja z jedną opcją to
  nie decyzja); dotyczy obu wariantów `look_top_put_one_hand_*` (rest_bottom
  z Dockhand i rest_grave). Fix w effects.js. GREEN + mutacja. Commit + push.
- [ ] E2 (C1, silnik). Oferta zostaje wariantowa dla bota/testera (jak
  warianty X czarów — liniowa, NIE kombinatoryczna; zakazana enumeracja to
  wszystkie podzbiory artefaktów), ale OD X=0 (`tapArtifactIds: []`);
  walidacja: pusta lista legalna TYLKO dla X=0. Bramki zielone bez zmian
  u konsumentów (kształt komendy przyrostowy).
- [ ] E3 (C1, bot). Wycena `look_top_put_one_hand_rest_bottom` w
  activate_ability (dziś BRAK — L131: bez wyceny bot brałby pierwszy
  wariant): X=0 mocno ujemna (4 many za nic), X>0: karta do ręki + opcjonalność
  wyboru − koszt tapowanych artefaktów. Mutacja + pin.
- [ ] E4 (C1, UI + tester). Uniwersalny modal wyboru (picker.js, wzorzec
  kreatora załogi): akcja „Aktywuj: <karta>” JEDNA (warianty tapXArtifacts
  scalone), po kliknięciu stepper X (0..N) + lista nietapniętych artefaktów
  gracza z ptaszkami (dokładnie X zaznaczeń) + „Zatwierdź” → komenda
  z wybranym xValue/tapArtifactIds. Sterownik testera klika nowy kreator
  (L135: nowy kształt = obsługa u każdego konsumenta).
- [ ] E5 (D). Pin regresyjny: counter/damage/death z fight w buforze modala
  i w przebiegu tur (rzut człowieka i bota). Zielony na starcie = strażnik.
- [ ] E6 (E). Pin regresyjny: bot nie atakuje lataczem w blokera z reach
  (bestow / grant EOT / własny), gdy atak jest jałowy. Zielony na starcie.
- [ ] E7. Bramy (`npm test`, build), pętla Żywym Testerem (talia z Dockhand
  — kaladesh), domknięcie: plan [x], handoff 2026-09-18d (aneks do 18c),
  PROJECT_HISTORY, README, PATCH opisu PR #129, blok przekazania.

## Ryzyka i pułapki

- **Kształt komendy (L135):** zmiana oferty `tapXArtifacts` dotyka 5 warstw —
  commit dopiero, gdy wszystkie zielone (nie commitować połowy).
- **Golden-master:** warianty Dockhand mogą wejść do śladu partii fixture —
  regeneracja DOPIERO po E2–E4 z atrybucją (L124).
- **Anty-over-fix C2:** auto-rozstrzyganie TYLKO przy dokładnie jednej
  karcie; 0 kart = pusty efekt (bez modala), ≥2 = modal jak dotąd.
  `allowDecline`-owe „you may” (Satyr Wayfinder) NIE są tą rodziną.
- Mutacje zawsze z kopii `/tmp` (L136), przywracanie kopią, nie `git checkout`.
- D/E: NIE wymyślamy fixów na siłę dla nieodtwarzalnych objawów — piny
  regresyjne + raport z pomiarami (L142: prowieniencja to fakty).

## Kryterium ukończenia całości

`npm run test:all` zielone, build zielony, transkrypty testera bez zgłoszeń
klas C/D/E, wszystkie nowe piny zweryfikowane mutacją (L13), PR #129
zaktualizowany kumulatywnie, modal Dockhand: X=0 osiągalny, wybór artefaktów
ręczny, 1 karta brana automatycznie.
