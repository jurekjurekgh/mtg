# PLAN 2026-09-10c — zgłoszenia właściciela A–F z testów przy stole (PR #113, arena/01a08d0e)

Właściciel zgłosił sześć znalezisk z gry. Ta sama sesja/gałąź/PR (ADR 0013/0020,
precedens PR #111: znaleziska właściciela A–D w tej samej sesji co pętla jakości).
Każde znalezisko: najpierw test RED, potem fix u źródła, potem weryfikacja
mutacyjna (L13), każdy zielony krok osobnym commitem (ADR 0020 C/D).

Uwaga: zrzuty ekranu ze zgłoszenia nie dotarły (puste placeholdery) — triaż
oparty na opisach tekstowych i na kodzie.

## Triaż (zmierzony w kodzie, nie zgadywany)

| # | Zgłoszenie | Przyczyna źródłowa (zmierzona) | Podstawa reguł | Typ fixu |
|---|---|---|---|---|
| **E1** | Zdolność Furious Forebear odpala się przy jego WŁASNEJ śmierci | `src/engine/triggers.js:2050-2059` — skan obiektów w grobie po zdarzeniu śmierci nie wyklucza karty, która właśnie umarła (ani współpoległych z tej samej partii SBA) | Oracle: „…**while this card is in your graveyard**…"; ruling WotC 2025-04-04: „If Furious Forebear dies at the same time as one or more creatures you control, its ability won't trigger" | silnik (reguły) |
| **B1** | „Rediscover the Way zyskuje: podwójne uderzenie" — Saga dostaje double strike zamiast stwora | `src/engine/effects.js:1034-1054` — efekt dokleja grant do SAGI i emituje `keyword_granted` z `objectId` sagi; grant ginie razem z poświęconą Sagą | Oracle III: „Whenever you cast a noncreature spell this turn, **target creature you control** gains double strike"; ruling WotC 2025-04-04: „…may trigger multiple times during the turn, **even though Rediscover the Way will likely no longer be on the battlefield**" | silnik (opóźniony trigger do `state.delayedTriggers`) |
| **B2** | Poświęcenie Sagi przed rozstrzygnięciem jej triggera | `src/engine/triggers.js:761-780` — poświęcenie jest w środku `fireSagaChapter`, więc zdarzenie `permanent_sacrificed` ląduje w logu PRZED `ability_resolved` | mtg.wiki/WotC (Saga): „the Saga's controller sacrifices it **as soon as its chapter ability has left the stack**, most likely by resolving or being countered. This state-based action doesn't use the stack" (CR 704.5s) | silnik (poświęcenie jako SBA po zejściu zdolności ze stosu) |
| **E2** | Pytanie o płatność bota („zapłacić {1}{W}?") trafia do logu „Rozgrywka" | `src/table/session.js` — `describeEvent` dla okna wyboru płatności nie jest filtrowany z głównego logu (bramka `MAIN_LOG_NOISE`/`noteBotMove`) | decyzja UI właściciela: decyzje bota należą do sekcji „Ruch bota" | warstwa pokazu |
| **E3** | `{1}{W}` w logu tekstem, nie ikonkami | `src/table/mana-icons.js:45` (`manaSymbolsHtml`) istnieje, ale ten wpis logu jest budowany surowym szablonem | spójność UI | warstwa pokazu |
| **A** | Auto-płatność tapuje Forest, choć nietapnięty Scorned Villager też daje {G} — brak kreatora many | `src/table/mana-wizard.js:466-471` — klucz deduplikacji wariantów to `kolory#ilość#kosztAktywacji`, BEZ rodzaju źródła; Forest i Scorned Villager (oba `{G}`, 1) to ten sam „kształt" → 1 wariant → `shouldOpenManaWizard` = false | decyzja właściciela + MtG: tapnięcie stwora ma koszt alternatywny (nie atakuje/nie blokuje), więc wybór jest realny | warstwa pokazu (oferta) |
| **F** | Curse of the Pierced Heart na przeciwniku bez badge'a „klątwa: Nieprzyjaciel" | DWA źródła (zmierzone sondą na stanie z klątwą): (1) `playerView` nie wysyła `enchantPlayer`/`enchantedPlayerId` — oba `undefined`, jedyne „aurowe" pole wpisu to `aura`; (2) brak jakiejkolwiek gałęzi badge'a dla aury na graczu w `buildFace` i `buildStateOverlay` (aura na stworach ma badge przez gospodarza, tu gospodarza-permanentu nie ma) | CR 303.4 („Enchant player") + ADR 0017 (skutek widoczny w grze musi być widoczny w widoku); cel aury to informacja jawna, nie FoW | widok + warstwa pokazu |
| **G** | Klątwa rzucona na WŁASNEGO gracza — właściciel: „to powinno mieć -1000 scoringu" (dopełnienie F) | Dwie przyczyny (zmierzone sondą + trace bota): (1) gałąź aury w `cast_permanent` szuka celu przez `objectOnBoard`, a celem klątwy jest GRACZ → `!target` → `auraNoTargetPenalty` dla OBU wariantów (`curse->wróg` = -45 i `curse->siebie` = -45, wybrane `pass_priority` — bot klątw nie rzucał wcale); (2) `auraIsHostile` znała tylko `applyTo: 'enchanted_controller'` + HOSTILE_PLAYER_EFFECTS, a klątwa niesie `damage_enchanted_player` bez `applyTo` → wyglądała jak buff | CR 303.4 („Enchant player") + decyzja właściciela (-1000) | bot (wycena) |
| **C** | Bot używa Exploit (Gurmag Drowner) przy 5 kartach w bibliotece i poświęca stwora z lataniem | wycena exploitu w `src/controllers/heuristic-bot.js` nie zna ani liczby kart w bibliotece, ani wartości poświęcanego stwora | Oracle: „look at the top four cards… put one into your hand and the rest into your graveyard" — mill 3 przy małej bibliotece = ryzyko przegranej | bot (wycena) |
| **D** | Bot atakuje 3/1 (Furious Forebear) w nietapnięte 4/4 i 4/5 przy 3 własnego życia | scoring ataku nie liczy pewnej straty atakującego bez obrażeń dla przeciwnika (trade-down) | zdrowy rozsądek rozgrywki (brak zmiany reguł) | bot (scoring) |

## Kolejność pracy (niezależne kroki, każdy z bramką)

1. **E1** — wykluczenie własnej śmierci (i współpoległych SBA) ze skanu triggerów
   w grobie; test: samotna śmierć i jednoczesna śmierć → brak triggera, śmierć
   INNEGO stwora przy Forebearze w grobie → trigger jest (anty-over-fix).
2. **B1 + B2** — rozdział III jako opóźniony trigger w rejestrze stanowym
   (przeżywa poświęcenie, cel = stwór pod kontrolą, może odpalić wiele razy
   w turze) + poświęcenie Sagi jako SBA po zejściu zdolności ze stosu.
   ZMIERZONE: `state.delayedTriggers` się do tego NIE nadaje — to rejestr
   opóźnień czasowych (powrót z exile w upkeep), konsumowany przez skan kroku
   end; dodano `state.turnAbilityGrants` (wpis: cardId, sourceId, controllerId,
   armedOnTurn, sourceLki, trigger, effect).
3. **E2 + E3** — decyzje płatności bota poza głównym logiem + symbole many.
4. **A** — rodzaj źródła w kluczu wariantów płatności (ląd vs zdolność).
5. **F** — badge klątwy na graczu.
6. **C** — wycena exploitu (biblioteka + wartość poświęcanego stwora).
7. **D** — scoring beznadziejnego ataku.
8. Domknięcie: `npm test`, `npm run build`, `npm run test:all`, Żywy Tester na
   świeżych seedach, handoff/historia/README, opis PR kumulatywnie.

## Ryzyka i pułapki

- E1: wykluczenie musi objąć też JEDNOCZESNE zgony (ruling WotC) — samo
  `source.id === died.id` nie wystarczy; współpolegli są w `simultaneousFellows`
  (obiekty PO zmianie strefy, czyli z nowymi id — tak samo jak `died`).
- B1: opóźniony trigger musi być w rejestrze stanowym, nie w `abilityGrants`
  obiektu, który za chwilę znika z pola bitwy (CR 400.7 — nowy obiekt w nowej
  strefie). ZMIERZONE po fakcie: sam rejestr nie wystarcza — wpis musi nieść
  LKI źródła, bo `pruneDeadPendingDecisions` → `triggerSourceZoneLegal`
  wymaga pola bitwy i bez LKI decyzja celu jest gaszona jako „ślepa".
- B2: przeprowadzka poświęcenia do SBA zmienia KOLEJNOŚĆ zdarzeń — pełny rdzeń
  + testy sag (Shiva/Cold Snap/Jill) przed commitem.
- A: zmiana progu kreatora potrafi dodać kliknięcia przy wielu źródłach tego
  samego rodzaju — klucz ma rozróżniać ląd/zdolność, NIE poszczególne obiekty.
- C/D: zmiana wyceny bota → próbka regresji `node tools/benchmark.mjs` (quick)
  i Żywy Tester; NIGDY pełne B0 bez komendy właściciela (ADR 0018).

## Podsumowanie wykonania

- **E1 — GOTOWE** (`a63a0dc`): skan triggerów w grobie wyklucza kartę, która
  właśnie umarła, oraz współpoległych z tej samej partii SBA. Strażnik 3 testy
  (własna śmierć → brak, jednoczesna → brak, Forebear w grobie + cudza śmierć →
  trigger jest). RED przed fixem: 2; mutacje: pełny revert → 2 RED, bez nogi
  „własna śmierć" → 2 RED, bez nogi „współpolegli" → 1 RED. `npm test`
  **5106/5106**.
- **A — GOTOWE** (`299c1b5`): klucz wariantu płatności w `countPaymentVariants`
  niesie rodzaj źródła, więc Forest i Scorned Villager (`{G}` z obu) to dwa
  kształty i kreator się otwiera. Strażnik 4 testy (w tym anty-over-fix: dwa
  lądy = jeden kształt; dwa źródła-zdolności o tym samym profilu = jeden kształt
  — świadoma granica). RED przed fixem: A/1; mutacja → 1 RED; rodzina kreatora
  (7 plików) 53/53. `npm test` **5110/5110**.
- **B1 + B2 — GOTOWE** (`fe37168`): rozdział III Sagi to OPÓŹNIONA zdolność
  w nowym rejestrze stanowym `state.turnAbilityGrants` (wpis niesie LKI źródła,
  CR 603.10; czyszczenie w `clearStatModifiers`), a poświęcenie Sagi to akcja
  stanowa `sacrificeFinishedSagas` (CR 714.4, na liście SBA jako 704.5s)
  wołana z `execute` PO przebiegu triggerów (CR 704.3; jak cleanup tokenów
  z 704.5d) z bramką „rozdział zszedł ze stosu" (stos LUB oczekująca decyzja
  celu rozdziału). Strażnik
  `test/zgloszenie-b-saga-rozdzial-i-poswiecenie.test.js` (8): B1/1 brak
  `keyword_granted` na Sadze; B1/2 decyzja celu i double strike na WYBRANYM
  stworze; B1/3 wiele odpaleń w turze (ruling WotC 2025-04-04); B2/1 brak
  poświęcenia póki rozdział na stosie; B2/2 poświęcenie PO `trigger_resolved`;
  B3 tekst logu; B4 licznik lore z proliferate (CR 714.2b) + anty-over-fix
  (2 z 3 liczników → brak poświęcenia). RED przed fixem: 3 × B1 + B2/2.
  Uwaga pomiarowa: asercja B2/2 musiała zostać przeniesiona z
  `saga_chapter_fired` na `trigger_resolved` — na tym pierwszym przechodziła
  także PRZED naprawą (zdarzenie jest pchane przed efektem rozdziału), czyli
  nie mierzyła tego, co widzi gracz w logu. Mutacje (L13): pełny revert →
  4 RED; bez LKI (stub z grobu) → 2 RED; skan rejestru wyłączony → 2 RED;
  stary `keyword_granted` dopisany → 1 RED; SBA bez bramki stosu → 4 RED;
  gałąź `counter_added(lore)` wyłączona → 1 RED (B4); poświęcenie z powrotem
  w zwykłym przebiegu SBA (przed triggerami) → 1 RED (B4). Bramki:
  `npm test` **5118/5118**, `npm run build` 61 modułów / 3473.9 kB.
- **Skutek B2 wymuszony regułami** (nie opcjonalny, w tym samym commicie):
  skoro poświęcenie jest akcją stanową, licznik lore dołożony DOWOLNĄ drogą
  musi odpalać rozdział (CR 714.2b) — inaczej Saga dobita proliferatem
  (CR 701.27) byłaby poświęcona bez rozstrzygnięcia rozdziału. Jeden helper
  `queueSagaChaptersForLore` liczy przekroczone progi dla wejścia (714.3a),
  akcji turowej (714.3c) i zdarzenia `counter_added`. Zaktualizowane testy
  istniejące: `m272-saga-poswiecenie-strefa` (sterownik robi przebieg akcji
  stanowych — poświęcenie nie jest już częścią rozstrzygania rozdziału) oraz
  `batch46/10b` (asercja `saga.abilityGrants` przypinała dokładnie ten błąd;
  teraz sprawdza rejestr i brak grantu na Sadze). Rodzina sag + proliferate
  (299 testów) zielona.
- **Uwaga o środowisku (2026-09-11, powtarza się co turę)**: workspace jest
  re-klonowany na `f7e4d11` przy każdym starcie tury (`git reflog`: clone +
  checkout -b), więc lokalna gałąź NIE ma commitów tej sesji, a cała praca
  leży w drzewie jako niezatwierdzone zmiany; zdalny head jest poprawny.
  Rytuał przed commitem: `git fetch origin arena/01a08d0e-mtg` →
  `git reset <zdalny head>` (mixed, bez dotykania drzewa) → `git status`
  musi pokazać WYŁĄCZNIE pliki bieżącej zmiany (brak dryfu). Tak przywrócone
  `8172cf3` (segment B) i `9403798` (segment E2/E3). Uwaga ta sama dla
  `tools/table-tester`: `node_modules` nie przetrwa tury, więc `npm i` przed
  każdym przebiegiem Żywego Testera.
- **E2 + E3 — GOTOWE** (`e6d3a5b`): prompt decyzji BOTA (`…_required`, np.
  `optional_pay_required` z Furious Forebear) nie wchodzi do głównego logu
  gracza — nowy czysty predykat `isBotDecisionPrompt` (klasa zdarzeń +
  decydent, bez nazw kart) stoi przy OBU pisarzach logu (`streamAutoEvents`
  i `apply`), a `noteBotMove` przyjmuje decyzję bota także wtedy, gdy wywołała
  ją komenda człowieka (bez tego informacja by zniknęła). E3: symbole many
  w wierszu logu i we wpisie modalu idą przez `appendTextWithManaIcons`
  (jedno źródło: `manaSymbolsHtml`); wpisy bez symboli zostają na starej
  ścieżce DOM. Strażnik
  `test/zgloszenie-e2-e3-decyzje-bota-i-symbole-many.test.js` (6): E2/1 prompt
  bota poza logiem + obecny w sekcji ruchu bota, E2/2 anty-over-fix (własna
  decyzja gracza zostaje), E2/3 predykat, E3/1 ikony w logu, E3/2 ikony
  w modalu, E3/3 anty-over-fix (tekst bez symboli bez zmian). RED przed fixem:
  E2/1, E3/1, E3/2. Mutacje: bramka w `streamAutoEvents` cofnięta → 1 RED;
  log bez ikon → 1 RED; modal bez ikon → 1 RED; predykat rozszerzony na
  `_resolved` (over-fix) → 1 RED; **bramka w `apply` → 0 RED** (uczciwa luka:
  prompt Forebeara wchodzi przez okno decyzyjne bota, a żadna karta katalogu
  nie produkuje dziś promptu bota w strumieniu komendy człowieka — ward nie ma
  karty; bramka jest pokryta tylko testem jednostkowym predykatu).
  Zaktualizowany `audit-pr44-fixes` B1: asercja „decyzje człowieka nie
  trafiają do botMoves" była typowa i łapała decyzję BOTA przy limicie ręki —
  teraz mierzy decydenta (konwencja M82 z `session-autopass`). Bramki:
  rodzina UI/sesji (210 plików) 1806/1806, `npm test` **5124/5124**,
  `npm run build` 61 modułów / 3477.2 kB, Żywy Tester 3 partie (4010–4012)
  detektory 0 i zero promptów bota w głównym logu (w tych partiach nie było
  promptu płatności, więc ikony `{1}{W}` są pokryte testami, nie
  transkryptem).
- **F — GOTOWE** (`baaba03`): widok pola bitwy niesie `enchantPlayer`
  i `enchantedPlayerId` (informacja jawna — aura leży na stole, jej cel jest
  częścią stanu partii), `cardInfo` wystawia JEDNO pole `cursedPlayerId`,
  a z niego czerpią OBYDWA rendery (L100/3): `buildFace` (twarz
  karty/tooltip) i `buildStateOverlay` (nakładka kafla) — etykieta
  „Klątwa: Nieprzyjaciel" / „Klątwa: Ty" po `PLAYER_NAMES`. `buildFace`
  wyeksportowana jak `buildStateOverlay` (M89), żeby badge na twarzy karty dał
  się zmierzyć headless. Strażnik
  `test/zgloszenie-f-badge-klatwy-na-graczu.test.js` (5): F/1 widok niesie
  zaczarowanego gracza, F/2 badge na kaflu „Klątwa: Nieprzyjaciel", F/3 klątwa
  na sobie = „Klątwa: Ty", F/4 anty-over-fix (zwykła aura na stworze bez
  badge'a klątwy, na obu kaflach), F/5 ten sam badge na twarzy karty. RED przed
  fixem: F/1, F/2, F/3 (F/4 zielony jako baza; F/5 urodził się zielony, ale
  jego gałąź jest przypięta mutacją M3). Mutacje (L13): pole widoku cofnięte →
  4 RED; badge w `buildStateOverlay` cofnięty → 2 RED; badge w `buildFace`
  cofnięty → 1 RED (F/5); `cursedPlayerId` rozszerzone na `attachedTo`
  (over-fix: klątwa na każdej aurze) → 1 RED (F/4). Strażnik kontraktu M277
  złapał nowe pole (`cardInfo` czyta `enchantedPlayerId`, którego nie ma
  w próbce widoku) — dopisane do jawnej listy `WARUNKOWE_SPOZA_PROBKI`
  z powodem (L113), a realną obecność pola w widoku mierzy konstrukcyjnie F/1.
  Bramki: rodzina 63 plików (kafel/render/widok/badge/overlay/stół/log/aura)
  576/576, `npm test` **5129/5129**, `npm run build` 61 modułów / 3479.0 kB,
  Żywy Tester na `dist/` seed 5001 (talia tymczasowa 4× klątwa + 56 Mountain,
  usunięta po pomiarze i `dist/` przebudowany — bez tego 3 testy
  `repo-decks` słusznie protestowały przeciw talii widmu): w snapshotach pola
  bitwy „Curse of the Pierced Heart · 2 · Enchantment — Aura Curse · … ·
  Klątwa: Ty", detektory 0. Uczciwie o pokryciu: w seeds 5002–5004 bot nie
  rzucił klątwy, więc wariantu „Klątwa: Nieprzyjaciel" na żywym artefakcie
  NIE zaobserwowałem — jest przypięty testem F/2.
- **Obserwacja poza zakresem F (do decyzji właściciela, nic nie zmienione)**:
  w partii 5001 greedy-profil testera rzucił klątwę NA SIEBIE i od niej zginął
  („Curse of the Pierced Heart zadaje 1 obrażenie (Ty)" → „Przegrywasz").
  Wygląda na kolejność opcji celu w modala (pierwsza = „Ty"), nie na błąd
  reguł — ale „aura na graczu celuje wbrew oczywistemu zamiarowi" to temat na
  osobne zgłoszenie.
- **G — GOTOWE** (`90dfc48`): wycena aury na GRACZU. Nowy zbiór
  `HOSTILE_ENCHANTED_PLAYER_EFFECTS` + rozszerzony `auraIsHostile` (jedno
  miejsce decyduje o wrogości aury, także na graczu — L41), a w
  `cast_permanent` osobna gałąź po deskryptorze `aura.enchant === 'player'`:
  wroga klątwa na własnego gracza = `-curseSelfTargetPenalty` (1000, liczba
  właściciela), na przeciwnika = `+curseEnemyBase` (40); aura na graczu,
  która nie szkodzi, dostaje lustro reguły. Parametry w heuristic-params
  (klucze + wartości). Strażnik
  `test/zgloszenie-g-klątwa-cel-wrog.test.js` (3): G/1 klątwa na siebie
  = -900 w trace (param -1000 × waga rodziny „permanent" 0.9) + pochodzenie
  z parametru; G/2 ta sama klątwa na przeciwnika jest zyskiem i bot ją rzuca;
  G/3 anty-over-fix (Nature's Embrace +2/+2 na własnym stworze bez zmian).
  RED przed fixem: G/1, G/2 (oba -45). Uwaga pomiarowa: pierwszym pojazdem
  G/3 był Guildscorn Ward i był ZŁY — czysta ochrona przy braku
  wielokolorowych celów jest słusznie na minusie (M209, -36). Mutacje (L13):
  gałąź cofnięta → 2 RED; `auraIsHostile` ślepa na efekty w zaczarowanego
  gracza → 2 RED; zamienione role siebie/wroga (over-fix) → 2 RED; gałąź
  rozciągnięta na każdą aurę z celem (over-fix) → 1 RED (G/3); parametr 1000
  → 50 → 1 RED, ale DOPIERO po przypięciu -900 dosłownie — próg liczony
  z tego samego parametru był tautologią i mutacja przechodziła na zielono.
  Bramki: rodzina 98 plików 541/541, `npm test` **5132/5132**, `npm run build`
  61 modułów / 3481.6 kB, Żywy Tester na `dist/` (talia tymczasowa bota
  4× klątwa + 56 Mountain, seeds 5002–5003): „Nieprzyjaciel rzuca Curse of
  the Pierced Heart → cel: Ty", badge „Klątwa: Ty" na polu bitwy, detektory 0;
  przed fixem w tych seedach bot nie rzucał klątwy wcale.
- **Zmierzone przy G, bez zmian w kodzie**: reprodukcja właściciela z partii
  5001 to rzut CZŁOWIEKA — kreator celu wymienił „Ty | Nieprzyjaciel"
  (transkrypt: „wskaż cel (1): TyNieprzyjaciel"), a profil greedy Żywego
  Testera bierze pierwszy wiersz. Wycena już tego nie puści (G), ale
  KOLEJNOŚĆ opcji celu w kreatorze to osobna decyzja UI.
- Pozostałe (C, D) — w kolejności z planu, każde osobnym zielonym commitem.
