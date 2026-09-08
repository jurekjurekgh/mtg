# Plan sesji arena/01a07c4e — Żywy Tester: wyceny bota i modale (cz. 2)

Data: 2026-09-07. Prompt właściciela: „sesję Żywym Testerem. Zwróć szczególną
uwagę na zachowanie bota i to czy działa sensownie i taktycznie. Każde
działanie powinno być wycenione — jeśli jakieś nie są to warto to powyceniać.
Poza tym warto sprawdzić czy modale wyboru dobrze się generują."

Kontynuacja na tej samej gałęzi/PR (#105 otwarty, head 47fd265; właściciel
jeszcze nie scala — ADR 0020 A spełniony). Bez nowych kart (ADR 0029),
bez pełnego B0 (ADR 0018). Sandbox odtworzony w trakcie: gałąź przywrócona
fast-forwardem do FETCH_HEAD (drzewo identyczne bajtowo, bez force push).

## Zmierzona baza (rozpoznanie przed planem)

- Bot: `src/controllers/heuristic-bot.js` (6121 linii), centralna wycena
  `scoreCommand` (2241) z `default: return finish(0)` (5592) — wybór wtedy
  zależy od KOLEJNOŚCI OFERT (antywzorzec L41, klasa M131/M336).
- Silnik oferuje 84 typy komend; bot ma 82 case. NIEWYCENIONYCH: 20 typów,
  w tym 15 wielowariantowych (wycena realnie zmienia wybór):
  `cast_adventure_creature`, `resolve_amass_choice`, `resolve_copy_targets`,
  `resolve_damage_target`, `resolve_destroy_equipment_choice`,
  `resolve_enter_as_copy`, `resolve_epic_choice`, `resolve_hand_creature`,
  `resolve_hand_top_choice`, `resolve_look_top_choice`,
  `resolve_land_type_choice`, `resolve_moonlit_choice`,
  `resolve_optional_draw` (pierwsza oferta = draw:false — bot NIGDY nie
  dobiera), `resolve_redirect_choice`, `resolve_reveal_exile_grave`;
  oraz 5 jednowariantowych/dokumentacyjnych: `resolve_damage_assignment`
  (1 wariant), `resolve_replacement_choice` (regenerate≈shield),
  `resolve_reveal_order` (1 wariant), `resolve_index_choice` (1 wariant),
  `resolve_modal_choice` skip (tylko gdy pusto — L48).
- Dodatkowa luka WEWNĄTRZ istniejącej wyceny: `resolve_modal_choice`
  z celem (Inspiring Bard „+2/+2 do celu") — modeScore nie zależy od
  `cmd.targetId` → cel z kolejności ofert (może być wrogi stwór).
- Modale w katalogu: 13 czarów `spell.modes`, 3 triggery `trigger.modes`
  (etherwrought-page, inspiring-bard, downwind-ambusher); 13 talii je nosi
  (alara, wiedzmin, forgotten-realms, ravnica, final-fantasy, worek-basni…).
- Obserwacyjność: bot prowadzi `history`/`trace()` z pełnymi opcjami i
  wynikami; sesja captureBotReasoning (60 wpisów); mostek `__mtgDebug`
  (?tester=1) to ustanowiony kanał dla Testera (M103/M252).

## E1. Telemetria „akcja bez wyceny" (najpierw miara, potem naprawy — L27)

- [x] heuristic-bot: `scoreCommand` oznacza trafienia `default` (zmienna
      domknięcia); `chooseCommand` dopisuje do wpisu historii `unvalued`
      i liczy per typ; nowa metoda `unvaluedDecisions()` (licznik typów,
      pass_priority wyłącznie informacyjnie — 0 jest u niego legalne).
- [x] session: mostek `__mtgDebug.botUnvalued()` (wzór M103/M252, tylko
      odczyt).
- [x] tester run-game.mjs: zbiór na końcu partii + linia w podsumowaniu
      („NIEWYCENIONE: ..." / „brak"); detectors.mjs: detektor
      `detectUnvaluedBotChoices` (znalezisko per typ ≠ pass_priority).
- [x] Test detektora (RED→GREEN, mutacja detektora = dowód L13).
- Kryterium: przed E2 gry pokazują realne typy; po E2 licznik = 0.

## E2. Wyceny brakujących typów (rodzina po rodzinie — L137, RED-first)

Kolejność wg wpływu; każdy krok = testy RED (bot wybiera złą/zależną od
kolejności ofertę) → implementacja → GREEN → `npm test` + build → commit+push.

- [x] Pakiet A (obviously-wrong dzisiejsze wybory): `resolve_optional_draw`
      (draw=false z kolejności), `resolve_hand_creature` (skip z kolejności),
      `resolve_damage_target` (cel z kolejności), `resolve_modal_choice`
      cel trybu (własny pump vs wrogi — zależność od kolejności).
- [x] Pakiet B (retarget/kopiowanie): `resolve_redirect_choice`,
      `resolve_copy_targets` (keep-original vs lepszy cel),
      `resolve_enter_as_copy` (najmocniejszy, nie kolejność),
      `resolve_amass_choice`, `resolve_epic_choice` (jak suspend: efekty
      ofensywne > done).
- [x] Pakiet C (wartości kart i zasoby): `resolve_look_top_choice`
      (keepValue), `resolve_hand_top_choice` (−keepValue),
      `reveal_exile_grave` (znak wg właściciela strefy),
      `resolve_destroy_equipment_choice` (true tylko wrogi sprzęt),
      `resolve_land_type_choice` (potrzeby pipów ręki — analogia
      resolve_color_choice), `resolve_moonlit_choice` (kontekst handlera),
      `cast_adventure_creature` (kształt wyceny stwora).
- [x] Pakiet D (dokumentacja jednowariantowych — komentarz w scoreCommand,
      bez wag „na wszelki wypadek" — L119): damage_assignment,
      replacement_choice, reveal_order, index_choice, modal skip.
- [x] Mutacje kontrolne: ≥3 wybrane wyceny cofnięte → testy RED (L13/L114).
- Kryterium: detektor E1 = 0 w grach E4; bot-benchmark (10/10) nie drgnie
  bez uzasadnienia; quick `node tools/benchmark.mjs` przed/po dla opisu.

## E3. Modale wyboru — generowanie ofert

- [x] Test enumeracji na kartach katalogu: modalne spelle (13) i triggery
      (3) — każdy tryb z legalnym celem ma ofertę; tryb bez legalnego celu
      niedostępny; skip tylko gdy zero ofert (L48); fizzl trybów celowych
      jak M87/M271 (regresja).
- [x] Sondy brzegowe na syntetykach (L134): tryb z celem bez kandydatów,
      modalny trigger z pustą pulą → skip dostępny (brak deadlocka).
- [x] Ewentualne znalezisko → RED test + fix u root cause, osobny commit.
- Kryterium: zero rozjazdu „tryby w rejestrze vs oferty silnika".

## E4. Żywy stół — zachowanie bota (po E1/E2, build przed pomiarem — L76)

- [x] 4 partie, pary maksymalizujące ruch modalny i różne profile:
      alara|wiedzmin (etherwrought-page, twiddle, keep-out),
      forgotten-realms|ravnica (inspiring-bard, selesnya-charm),
      final-fantasy|worek-basni (aerith-rescue-mission, agate-assault,
      downwind-ambusher), tarkir-wur|mirrodin-wu (vandalize,
      steel-sabotage); profile: greedy, explorer, impatient
      (+`--snapshot-every`), defensive. Zawsze stderr + detektory.
- [x] Lektura reasoning bota (trace w transkrypcie/panelu) wokół decyzji
      modalnych i walki: czy wybory sensowne/taktyczne; wnioski do planu
      i (jeśli klasa) do E2 doknięcia.
- Kryterium: wszystkie partie exit 0, „DETEKTORY: brak zgłoszeń",
  „NIEWYCENIONE: brak" (lub wyjaśnione wyjątki).

## E5. Zamknięcie sesji

- [x] `npm test` + `npm run build` po każdym zielonym kroku; na końcu
      `npm run test:all` (pełna bramka PR) i quick benchmark.
- [x] README „Bieżący stan" (L92), `docs/PROJECT_HISTORY.md`,
      `docs/setup/HANDOFF_2026-09-07g.md`, plan z podsumowaniem, opis PR
      #105 kumulatywnie (gh api), instrukcja przekazania w czacie.
- Kryterium: commity wypchnięte (fetch+porównanie refs przed każdym
  pushem — ADR 0020 D), CI zielone, agent nie scala.

## Ryzyka i pułapki

- Zmiany wycen = zmiana zachowania bota: progi benchmarku-regresji mogą
  zareagować. Jeśli test drgnie — analizuję czy to poprawa taktyczna
  (wtedy udokumentować; progi zmienia tylko właściciel/jawna decyzja),
  nie dostosowuję wycen do progu w ciemno.
- `objectId` komendy to ID OBIEKTU, nie cardId; kandydatów decyzji czytam
  z handlerów, nie z intuicji (L48: oferta = walidacja).
- Wyceny generyczne po TYPACH efektów, zero nazw kart (ADR 0002); rodzina
  w jednym miejscu (L137); pusty/najsłabszy wariant jako punkt odniesienia
  (L41/L119).
- Mutacje przez kopię + `finally`, nie `git checkout` (L136); przed
  pushem fetch + HEAD..FETCH_HEAD / FETCH_HEAD..HEAD.
- Budżet lektury 99 904/100 000 — nowy wpis LESSONS tylko za nową klasę
  (kondensacja innego), nie podnosimy progu.
- Sandbox mógł znowu zostać odtworzony: dist/, node_modules, logi testera
  nie persistują — build przed testerem, `npm ci --prefix
  tools/table-tester` w razie potrzeby.

## Podsumowanie wykonania (uzupełniane na końcu sesji)

## Podsumowanie wykonania (uzupełniane na końcu sesji)

- **E1 telemetria**: `scoreCommand` liczy trafienia `default` → wpis
  `unvalued` w trace → `unvaluedDecisions()` → mostek
  `__mtgDebug.botUnvalued()` → run-game „== NIEWYCENIONE ==" oraz detektor
  `detectUnvaluedBotChoices` (pass_priority wyłącznie informacyjny).
  Test detektora RED→GREEN (L13).
- **E2 wyceny (20/20 typów z bazy pokrytych)**: pakiet A `d7427b2`
  (optional_draw, damage_target, hand_creature + wycena celu trybu
  modalnego), B `36e2ea9` (redirect+copy_targets jednym case,
  enter_as_copy, amass, epic), C `8b8ec70` (look_top, hand_top,
  reveal_exile_grave, destroy_equipment wg kontrolera SPRZĘTU przez
  `attachedTo` w widoku, land_type wg potrzeb pipów, moonlit delta P/T,
  cast_adventure_creature), D `ce01f2c` (5 jawnych `finish(0)` dla
  jednowariantowych; `default` zarezerwowany dla przyszłych typów
  silnika). Ekspozycja widoku: `pendingDestroyEquipment`,
  `pendingMoonlitChoice` (decydent-only). Mutacje kontrolne pakietu C:
  **7/7 RED**. Fixture snapshotu zregenerowana świadomie (`--write`:
  drift scoreSum +14 w 1/6 partii, decyzje 188=188, kinds równe).
- **E3 modale**: enumeracja klasowa 16 czarów modalnych + triggery
  etherwrought-page / inspiring-bard — **zero błędów silnika**;
  zpinowane w `test/modale-generowanie-ofert.test.js` (`5e8b425`,
  test-only): tryb bez celu zawsze dostępny, oferta per kandydat
  (źródło też), pusta pula trybu celowanego nie zabija trybu bezcelowego,
  wyłącznie tryby celowane + pusto → dokładnie skip.
- **E4 żywy stół (4 partie, po buildzie)**: exit 0, stderr 0 B,
  „DETEKTORY: brak zgłoszeń" i „NIEWYCENIONE: brak" we WSZYSTKICH.
  alara|wiedzmin greedy s10501 (9:−5), forgotten-realms|ravnica explorer
  s10502 (22:20, wyczerpanie biblioteki), final-fantasy|worek-basni
  impatient `--snapshot-every 3` s10503 (20:−2), tarkir-wur|mirrodin-wu
  defensive s10504 (24:−1). Taktyka bota sensowna: Chronic Flooding na
  Basilisk Gate (blokada utility-lądu), Twiddle — tryb tapnięcia →
  Plague Reaver, Agate Assault — tryb wygnania artefaktu → Warrior's
  Sword, stack aur na własnym nosicielu (Nature's Embrace + Curiosity →
  Emerald Oryx), living weapon (Strandwalker → Germ), blok dwoma
  stworami, modale (Scry z Nefarious Imp, Aerith — Winda) w UI bez
  zakłóceń; domyślny przydział obrażeń bojowych zabójczo po kolei.
- **E5 zamknięcie**: fast **4733/4733**, `test:all` **4743/4743**,
  build **59 modułów / 3385,7 kB** (+15,9 kB względem bazy), quick
  benchmark heuristic **84,8%** (570/672; vs random 96,1%; aggro 26,5%).
  README, PROJECT_HISTORY, HANDOFF g, opis PR #105 (kumulatywnie).
  Bez nowych kart, bez pełnego B0, bez nowego wpisu LESSONS (brak nowej
  klasy; quirk `addObject`/`attachedTo` żyje w kontrakcie
  attachments.js i handoffie).
## E6. Zgłoszenia właściciela z testów (redirect po E5, ten sam PR)

- [x] **A1**: bot tapuje Moonscarred Werewolf („{T}: Add {G}{G}") w pierwszym
      możliwym momencie mimo braku potrzeby many — mana wyparuje, źródło
      zostaje zatapiane. Rozpoznanie: gałąź `producesManaOnly` w
      `activate_ability` pyta tylko „czy ręka ma COKOLWIEK płatnego"
      (`hasPlayableInHand`), bez testu M128 „czy ta mana COKOLWIEK
      odblokowuje"; baza `score = 2` bije pass (0), a bez celów nie działa
      nawet straż M106. Fix generyczny (ADR 0002, L28 — ta sama reguła co
      M128 przy komponencie add_mana): bramka `unlocksSomething`
      (availableNow → availableNow + net) + kara jak M167/D; RED-first,
      mutacje kontrolne.
- [x] **A2**: panel „Rozgrywka" nie pokazuje transformacji wilkołaka BOTA
      rozstrzyganej poza oknem `botActing` (upkeep gracza) — informacja
      jest tylko w logu. Rozpoznanie: `noteBotMove` wypuszcza
      `object_transformed` tylko dla człowieka (`HUMAN_DIGEST_EVENTS`,
      M257/K4) albo w oknie stosu — a `object_transformed` NIE jest w
      `BOT_RESOLUTION_EVENTS`, więc okno nie ratuje; do tego brak wpisu w
      `BOT_MOVE_CARD_EVENTS` = brak miniatury nowej twarzy. Fix: transform
      ZAWSZE treścią panelu + miniatura (pole bitwy jawne, CR 400.2).
- [x] **B**: hover → powiększenie karty specjalnej Day/Night (i pozostałych
      specjalnych). Weryfikacja: naprawione w PR #104 („Uwaga B",
      `attachSpecialCardHover` — jedno podpięcie dla wszystkich paneli);
      sonda jsdom na HEAD potwierdza podpięcie i podgląd dla Day/Night.
      Szczelina do domknięcia: strażnik testowy („drut, nie żarówka")
      nie pinuje `renderSpeedPanel` (M313, dodany po Uwadze B) — dołożony
      do `test/uwagi-tura8-hover-kart-specjalnych.test.js`. Wniosek dla
      właściciela: testować na świeżym buildzie/pages.
- Kryterium: jak w E2 — RED-first, `npm test` + build na każdy zielony
  krok, commit+push natychmiast (ADR 0020 C), szybki benchmark na końcu.

### Podsumowanie E6 (2026-09-07, redirect po zgłoszeniach właściciela)

- **A1** `97e6ddb`: RED na scenariuszu właściciela (obcy upkeep + sorcery →
  tap wybierał się +8 za złudzenie odblokowania). Fix: `manaUnlockCandidates`
  (instant zawsze CR 307.5; reszta tylko własna główna main1/main2) we
  współużyciu M167/D + M128 (3 miejsca). Mutacje (a)/(b) → 1 RED każda.
  Poprawka aliasu kroku przywróciła M243/E2. Fixture: drift wyłącznie
  hashowy (decyzje 234=234, scoreSum równe).
- **A2** `2cee62b`: RED na obu kolejnościach passów (żywa s20603: wpis znikał
  całkiem; odwrotna: brak miniatury). Fix: `TRANSFORM_DIGEST_EVENTS`
  (bramka noteBotMove) + `object_transformed` w `BOT_MOVE_CARD_EVENTS`.
  Mutacje → 1 i 2 RED. Weryfikacja żywa (ten sam seed): panel pokazuje OBA
  transformy.
- **B** `3520d82`: hover Day/Night działa na HEAD (naprawa z PR #104; probe
  jsdom). Domknięta szczelina: strażnik pinuje też `renderSpeedPanel` (M313)
  + CSS `.speed-card` :hover/kursor. Wniosek: zgłoszenie odpowiadało stanowi
  sprzed PR #104 (stary build) — testować na świeżym artefakcie.
- Bramki po E6: fast **4740/4740**, `test:all` **4750/4750**, build
  **59 modułów / 3388,1 kB**, quick benchmark heuristic **85,0%**
  (571/672; vs random 96,1%; aggro 26,2%) — pasmo bazowe. Weryfikacja żywa:
  s20611 (gracz 20:−6), s20612 (bot 43:−1), s20603-pofix (bot 23:−1) —
  exit 0, stderr 0 B, „NIEWYCENIONE: brak", „DETEKTORY: brak zgłoszeń",
  0 aktywacji wilkołaków bez potrzeby.

## E7. Druga paczka zgłoszeń właściciela (ten sam PR, po E6)

Brzmienie właściciela (2026-09-07): **A** Chill of the Grave — efekt
„target creature nie odtapowuje się przy swoim kolejnym untap phase" działa,
ale „chyba nie nadaje tymczasowego badge'a tej kreaturze. Albo przeoczyłem.
Sprawdź to." — **B1** Glitch Ghost Surveyor: napisało „Zwiększasz prędkość
(speed 1)", ale nie pojawił się panel Speed z poprzedniego PR — „Czemu?" —
**B2** na koniec tury zdublowany komunikat „Zwiększasz prędkość (speed: 2)" ×2 —
**C** Shock 562AER w talii Kaladesh, a kolumna plan = Warhammer Fantasy —
po korektach właściciela (liczy się kolumna „Plan" z
`tools/collection-art-ids.csv`, NIE realny blok wydania; błędny wpis CSV
poprawić u źródła i przenieść kartę do właściwego decku) — **D1** Frightful
Delusion: opcje dopłacenia 1C mają zagnieżdżony HTML w opisie — **D2** bot
kontruje czar właściciela mimo że właściciel ma nietapnięty ląd i może
zapłacić {1} — „inaczej marnuje swój czar" — **E** Makeshift Mauler: bot jako
dodatkowy koszt wygnał stwora z cmentarza — ani Rozgrywka, ani log nie mówią,
że coś wygnał i jaką kartę.

- [x] **C**: plan z kolumny „Plan" kolekcji właściciela; CSV linia 563 →
      `Warhammer Fantasy`, card-data (set zostaje AER), talie z generatora
      (Shock → warhammer-ubr), README liczności, grzechotka, fixture,
      table-session seed. `adf087a`.
- [x] **B2**: podwójny push `speed_changed` — `setPlayerSpeed` sam pushuje
      („wołający nie dubluje pusha"), a `bumpSpeedIfOpponentDamaged`
      (triggers.js) robił `state.events.push(...setPlayerSpeed(...))`.
      Pin: jeden wzrost = jedno zdarzenie (pełna ścieżka combat-damage).
- [x] **E**: silnik emituje poprawne `object_moved` [koszt] (M262); luka
      w sesji: log milczał dla obu graczy (describeGameEvent → null poza
      `escape`/`bounced` — ta klasa co M103/D), a modal „Rozgrywka" widział
      koszt tylko przy rzucie BOTA (wczesna bramka `noteBotMove`).
      Przepust `additionalCost` w bramce + opis „zostaje wygnane (dodatkowy
      koszt rzucenia)" z nazwą karty (strefy jawne, CR 400.2).
- [x] **D2**: wycena kontr traktowała `counter_spell_unless_pays` jak
      `counter_spell` (Batch 44). Fix: gdy kontroler czaru-na-stosie może
      zapłacić `amount` (pula + nietapnięte LĄDY — reguła `manaAvailableNow`),
      wariant −90 (poniżej passu — trzymaj kontrę, czekaj aż przeciwnik wyda
      manę); bez zasobów pełna premia.
- [x] **A**: sonda żywa (jsdom, build właściciela ORAZ branch) — ścieżka
      KOMPLETNA: flaga → widok (M173/C) → badge „nie odtapuje się" na kaflu;
      untap step poprawnie blokowany. Zamiast zmiany UI — pin regresyjny
      silnik → widok → nakładka (klasa L1/ADR 0017). Do właściciela:
      jeśli badge realnie nie wsiada — proszę o repro/seed.
- [x] **B1**: sonda żywa — panel Speed pojawia się przy speed=1 na OBU
      buildach (M313 w main od PR #104). Zgłoszenie odpowiada stanowi
      sprzed wdrożenia (jak E6/B) — testować na świeżym pages.
- [x] **D1**: sonda żywa — NIE do odtworzenia: etykieta `commandLabel`
      niesie HTML (kontrakt M266/E), ale WSZYSTKIE kanały renderują przez
      innerHTML (panel akcji; modal — fix A2 2026-08-10; wizardy — M312),
      tester stołu czyta textContent (bez znaczników). Pin kontraktu
      M104/A2 (emulatorszy mini-DOM + komenda w kształcie silnika).
- Kryterium: jak w E6 — RED-first dla zmian kodu, `npm test` + build na
  każdy zielony krok, commit+push natychmiast (ADR 0020 C), szybki
  benchmark na końcu, `test:all` jako brama PR.

### Podsumowanie E7 (2026-09-07)

- **C** `adf087a`: CSV u źródła + card-data (`plan: 'Warhammer Fantasy'`,
  set AER) + talie z `tools/generate-plan-decks.mjs` (Shock → warhammer-ubr;
  kaladesh 23/8/15, warhammer-ubr 33/11/22) + README + grzechotka block ≤7
  (s4009 t19) + fixture regen (drift tylko para warhammer) + table-session
  seed 4→1 (hunter na dokładnym chooseHumanCommand). Fast 4742/4742.
- **B2** `785b804`: RED (2 zdarzenia) → fix (wołanie bez re-pusha) → GREEN.
  Fast 4743/4743.
- **E** `c31b9d0`: dwa RED (log: null; modal przy rzucie człowieka: brak
  wpisu) → przepust `additionalCost` + opis logu → GREEN. Fast 4745/4745.
- **A** `cf21d55`: pin pełnej ścieżki badge'a + blokada untapu (CR 510.1).
- **D2** `c55d468`: trzy testy (lądy → nie kontruje; brak many → kontruje;
  sama pula → nie kontruje) → model dopłaty w wycenie kontr. Fast 4749/4749.
- **D1** `7f14e05`: pin kanału innerHTML dla opcji dopłaty. Fast 4750/4750.
- Wnioski dla właściciela: A i B1 działają na obu buildach (badge
  „nie odtapuje się" na kafla; panel Speed przy speed 1) — jeśli objawy
  wracają, proszę o świeży pages i repro (seed/screenshot); D1 surowy
  markup istnieje tylko w etykiecie ŹRÓDŁOWEJ (kontrakt M266/E), w UI
  zawsze pipa.

## E8. Wyzwanie „wyłapywacza błędów" — 5 uproszczeń vs zasady MtG (ten sam PR)

Audyt „jak Sherlock" po całym silniku (walka, SBA, regeneracja, liczniki,
pule many, czystka, strefy, triggery, aury, goad, ward, sagi, crew, infect,
protection, speed — te rejony zaudytowane wcześniejszymi rundami M96–M361
i czyste). Znalezione pięć realnych uproszczeń vs CR, każdy fix RED-first:

- [x] **B1 — regeneracja konsumuje WSZYSTKIE tarcze** (CR 701.15b): każda
      tarcza regeneracji zastępuje JEDNO zniszczenie; dwie tarcze = dwa
      uratowania. `tryRegenerate` (state-based.js) robi `filter(id !== ...)`
      — zjada wszystkie. Fix: zdjąć dokładnie jedną instancję.
- [x] **B2 — flaga „nie odtapuje się" nie konsumuje się, gdy cel jest
      odkręcony** (Wavecrash/Chill, CR „next untap step"): `untapControlled`
      wchodzi tylko do obiektów `tapped || summoningSickness` i zjada flagę
      tylko gdy `tapped`; odkręcony cel nosi flagę wiecznie i pomija
      PÓŹNIEJSZY untap step. Dodatkowo flaga trzyma controllerId-z-momentu-
      efektu i porównuje z aktywnym graczem — po zmianie kontrolera skip
      wypada w cudzym untap stepie. Fix: flaga konsumowana na untap stepie
      OBECNEGO kontrolera, niezależnie od stanu tapped.
- [x] **B3 — niedo-przydzielone obrażenia bez trample** (CR 510.1a: stwór
      zadaje obrażenia RÓWNE mocy — całość musi być przydzielona):
      `validateDamageAssignment` przyjmuje sumę < moc, `defaultDamageAssignment`
      dla wielu blokerów gubi nadmiar (lethal-first bez dolewki do ostatniego),
      a wizard bramkuje `assignmentLegal` wyłącznie dla trample. Fix: walidacja
      `sum === amount` bez trample + domyślny przydział dolewa resztę do
      ostatniego blokera + bramka wizarda.
- [x] **B4 — trample vs bloker z pełną prewencją** (CR 702.19b: lethal liczy
      obrażenia, które ZOSTANĄ ZAPOBIEŻONE — bloker z protection od koloru
      atakującego ma lethal 0, cała moc idzie na gracza): `lethalOf` liczy
      tylko wytrzymałość/deathtouch; przy blokerze z protection obrażenia
      i tak są preventowane, więc trample błędnie się zatrzymuje. Fix:
      `lethalOf` → 0, gdy `isDamagePreventedByProtection(blocker, attacker)`.
- [x] **B5 — CR 506.4: zmiana kontrolera usuwa permanent z walki** (luka
      latentna: oba „steal" z katalogu to sorcery, więc dziś nieosiągalne
      w combacie — ale pierwszy przyszły instant/trigger z przejęciem kontroli
      cicho łamałby zasady: skradziony ATAKUJĄCY dalej zadawałby obrażenia
      staremu obrońcy). Fix: `removeFromCombat` w
      `gain_control_until_end_of_turn` + test chirurgią stanu.
- Kryterium: RED-first (test przed fixem), `npm test` + build na każdy
  zielony krok, commit+push natychmiast (ADR 0020 C); na końcu `test:all`
  + quick benchmark + update opisu PR.

### E8 — wykonanie (2026-09-08)

- **B1** `888a234`: RED (`test/e8-b1-regeneracja-tarcze.test.js`) → fix `tryRegenerate`
  (konsumpcja dokładnie 1 tarczy, `indexOf`+splice-semantyka) → GREEN. Harness:
  `test/helpers/e8-destroy-harness.js` (realna ścieżka `destroyPermanentByEffect`).
- **B2** `4bcf5ab`: RED (`test/e8-b2-flaga-nie-odtapuje-sie.test.js`) → fix
  `untapControlled` (flaga zużywana na untap stepie OBECNEGO kontrolera
  niezależnie od `tapped`; wejście pętli rozszerzone o `dontUntapNextUntapStep`;
  stara gałąź `=== playerId` usunięta) → GREEN.
- **B3** `2b944c0`: RED (`test/e8-b3-pelny-przydzial-obrazen.test.js`) → fix:
  walidacja `damage_must_be_fully_assigned` (bez trample suma = moc),
  default lethal-first + dolewka do ostatniego blokera, wizard prefill jak
  silnik + bramka pełnej sumy → GREEN. Zaktualizowane piny starego uproszczenia:
  trample-lethal, choice-request-ui (steppery/M101-B6/M150-B), m136, Sherlock 1c.
- **B4** `2e15ba6`: RED (`test/e8-b4-trample-protection.test.js`) → fix
  `lethalOf` → 0 przy pełnej prewencji protection (CR 702.16d/702.19b) → GREEN.
- **B5** `b0c02d9`: RED (`test/e8-b5-zmiana-kontroli-usuwa-z-walki.test.js`,
  chirurgia przez `applyEffect`) → fix `removeFromCombat` po przejęciu kontroli
  (CR 506.4) → GREEN.
- Gate: `npm run test:all` — patrz PR #105 (część 5: E8).
