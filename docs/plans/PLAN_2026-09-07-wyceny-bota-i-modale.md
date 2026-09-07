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

- [ ] heuristic-bot: `scoreCommand` oznacza trafienia `default` (zmienna
      domknięcia); `chooseCommand` dopisuje do wpisu historii `unvalued`
      i liczy per typ; nowa metoda `unvaluedDecisions()` (licznik typów,
      pass_priority wyłącznie informacyjnie — 0 jest u niego legalne).
- [ ] session: mostek `__mtgDebug.botUnvalued()` (wzór M103/M252, tylko
      odczyt).
- [ ] tester run-game.mjs: zbiór na końcu partii + linia w podsumowaniu
      („NIEWYCENIONE: ..." / „brak"); detectors.mjs: detektor
      `detectUnvaluedBotChoices` (znalezisko per typ ≠ pass_priority).
- [ ] Test detektora (RED→GREEN, mutacja detektora = dowód L13).
- Kryterium: przed E2 gry pokazują realne typy; po E2 licznik = 0.

## E2. Wyceny brakujących typów (rodzina po rodzinie — L137, RED-first)

Kolejność wg wpływu; każdy krok = testy RED (bot wybiera złą/zależną od
kolejności ofertę) → implementacja → GREEN → `npm test` + build → commit+push.

- [ ] Pakiet A (obviously-wrong dzisiejsze wybory): `resolve_optional_draw`
      (draw=false z kolejności), `resolve_hand_creature` (skip z kolejności),
      `resolve_damage_target` (cel z kolejności), `resolve_modal_choice`
      cel trybu (własny pump vs wrogi — zależność od kolejności).
- [ ] Pakiet B (retarget/kopiowanie): `resolve_redirect_choice`,
      `resolve_copy_targets` (keep-original vs lepszy cel),
      `resolve_enter_as_copy` (najmocniejszy, nie kolejność),
      `resolve_amass_choice`, `resolve_epic_choice` (jak suspend: efekty
      ofensywne > done).
- [ ] Pakiet C (wartości kart i zasoby): `resolve_look_top_choice`
      (keepValue), `resolve_hand_top_choice` (−keepValue),
      `reveal_exile_grave` (znak wg właściciela strefy),
      `resolve_destroy_equipment_choice` (true tylko wrogi sprzęt),
      `resolve_land_type_choice` (potrzeby pipów ręki — analogia
      resolve_color_choice), `resolve_moonlit_choice` (kontekst handlera),
      `cast_adventure_creature` (kształt wyceny stwora).
- [ ] Pakiet D (dokumentacja jednowariantowych — komentarz w scoreCommand,
      bez wag „na wszelki wypadek" — L119): damage_assignment,
      replacement_choice, reveal_order, index_choice, modal skip.
- [ ] Mutacje kontrolne: ≥3 wybrane wyceny cofnięte → testy RED (L13/L114).
- Kryterium: detektor E1 = 0 w grach E4; bot-benchmark (10/10) nie drgnie
  bez uzasadnienia; quick `node tools/benchmark.mjs` przed/po dla opisu.

## E3. Modale wyboru — generowanie ofert

- [ ] Test enumeracji na kartach katalogu: modalne spelle (13) i triggery
      (3) — każdy tryb z legalnym celem ma ofertę; tryb bez legalnego celu
      niedostępny; skip tylko gdy zero ofert (L48); fizzl trybów celowych
      jak M87/M271 (regresja).
- [ ] Sondy brzegowe na syntetykach (L134): tryb z celem bez kandydatów,
      modalny trigger z pustą pulą → skip dostępny (brak deadlocka).
- [ ] Ewentualne znalezisko → RED test + fix u root cause, osobny commit.
- Kryterium: zero rozjazdu „tryby w rejestrze vs oferty silnika".

## E4. Żywy stół — zachowanie bota (po E1/E2, build przed pomiarem — L76)

- [ ] 4 partie, pary maksymalizujące ruch modalny i różne profile:
      alara|wiedzmin (etherwrought-page, twiddle, keep-out),
      forgotten-realms|ravnica (inspiring-bard, selesnya-charm),
      final-fantasy|worek-basni (aerith-rescue-mission, agate-assault,
      downwind-ambusher), tarkir-wur|mirrodin-wu (vandalize,
      steel-sabotage); profile: greedy, explorer, impatient
      (+`--snapshot-every`), defensive. Zawsze stderr + detektory.
- [ ] Lektura reasoning bota (trace w transkrypcie/panelu) wokół decyzji
      modalnych i walki: czy wybory sensowne/taktyczne; wnioski do planu
      i (jeśli klasa) do E2 doknięcia.
- Kryterium: wszystkie partie exit 0, „DETEKTORY: brak zgłoszeń",
  „NIEWYCENIONE: brak" (lub wyjaśnione wyjątki).

## E5. Zamknięcie sesji

- [ ] `npm test` + `npm run build` po każdym zielonym kroku; na końcu
      `npm run test:all` (pełna bramka PR) i quick benchmark.
- [ ] README „Bieżący stan" (L92), `docs/PROJECT_HISTORY.md`,
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

- (do uzupełnienia po E5)
