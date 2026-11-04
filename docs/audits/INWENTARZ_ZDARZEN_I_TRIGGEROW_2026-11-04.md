# Inwentarz zdarzeń, wyzwalaczy i kolejności — 2026-11-04

## Cel i metoda

Inwentarz tylko do odczytu na potrzeby etapu 3 roadmapy `../plans/PLAN_2026-11-03-bezpieczne-kroki-zdarzen.md`. Nie zmienia produkcji i nie zamyka A110/A112/A113. Ma odpowiedzieć na pytanie: **gdzie powstaje fakt gry, gdzie powstaje wyzwalacz, a gdzie dopiero jest układany na stosie**.

Metoda: przegląd `src/engine` przez `rg`/`sed` oraz liczniki wystąpień. Liczby obejmują literalne wywołania `event('…')`; dynamiczny wybór typu w `destruction.js` jest opisany osobno.

## 1. Emiterzy opuszczenia pola bitwy

| Rodzaj | Miejsca | Uwagi |
|---|---|---|
| Jednoczesne zniszczenie / SBA | `src/engine/destruction.js:63` | Jedna pętla po ofiarach. Typ zdarzenia zależy od przyczyny i rodzaju: `creature_destroyed`, `permanent_destroyed` albo `object_moved`. `simultaneousIds` jest dodawane tylko dla grupy stworów idących do grobu. Zdarzenie niesie obiekt sprzed ruchu. |
| Poświęcenie jako koszt / aktywacja | `src/engine/abilities.js` (4), `src/engine/game-state.js` (6), `src/engine/spells.js` (2), `src/engine/resources.js:1534` | Łącznie 18 literalnych `permanent_sacrificed`. Koszty i aktywacje many są sekwencyjne, nie mają wspólnego `simultaneousIds`. Auto-Treasure w `resources.js` jest osobną aktywacją many. |
| Poświęcenie efektem / SBA Sag | `src/engine/effects.js` (4), `src/engine/state-based.js:111` | `permanent_sacrificed`; Saga jest poświęcana po skanie triggerów, żeby nie ubiec rozdziału na stosie. |
| Ręczne przeniesienia / efekty | `src/engine/effects.js` (35), `src/engine/game-state.js` (18), `src/engine/resources.js` (2), `src/engine/spells.js` (5), `src/engine/triggers.js` (1) | Łącznie 61 literalnych `object_moved`. Nie wszystkie dotyczą pola bitwy; część to biblioteka/ręka/grób/stos. |
| Wygnanie | `src/engine/abilities.js` (2), `src/engine/effects.js` (5), `src/engine/game-state.js` (2), `src/engine/resources.js` (1), `src/engine/triggers.js:1290` | Łącznie 11 literalnych `object_exiled`. Część ma `fromId` z pola bitwy, część z grobu/biblioteki. |
| Osierocona aura | `src/engine/attachments.js:395` | 1 literalny `permanent_put_into_graveyard`. Ruch idzie przez zarejestrowany choke point `mover.js`, ale zdarzenie dodatkowe nie jest tym samym typem co `object_moved`. |

Wniosek: **nie ma dziś jednego identyfikatora zdarzenia/grupy równoczesnej** wspólnego dla wszystkich emiterów. `simultaneousIds` istnieje tylko w ścieżce zniszczenia i tylko dla stworów idących do grobu.

## 2. Miejsca kolejkowania wyzwalaczy

- Centralny choke point: `queueTriggerToStack` w `src/engine/triggers.js:1160`.
- Wystąpienia nazwy: **31**, w tym 1 definicja; wywołań jest 30.
- Wywołania: `src/engine/triggers.js` (24 wystąpienia, w tym definicja) oraz `src/engine/game-state.js` (7).
- Wejście snapshotuje źródło do `sourceLki` i `printLki`, ale kontroler wpisu jest brany z przekazanego `source.controllerId`.
- Część wywołań przekazuje źródło już po zmianie strefy albo stub LKI; część żywy obiekt. To musi zostać ujednolicone przy projektowaniu partii, inaczej kolejność i „you” mogą zależeć od ścieżki.

## 3. Obecne granice grupowania i kolejności

### 3.1. Grupowe odejście

W `processTriggersScan`:

- `leftBattlefield` zbiera kontrolerów odchodzących permanentów.
- `aggregatedControllers` powoduje **jeden przebieg agregatu na kontrolera w całym skanie/komendzie**.
- `departureSources` i `departedInstanceIds` dodane w A111 przechowują ostatni znany stan odchodzących źródeł i blokują obserwowanie dawnego odejścia przez nowy obiekt tego samego permanentu.
- `simultaneousIds` nie jest kluczem grupowania; jest używane lokalnie przy współzgonach w triggerach śmierci.

Skutek potwierdzony w A110: dwie osobne aktywacje many Skarbu w jednej komendzie płatności Ward zlepiają się w jeden wyzwalacz. Jednoczesne zniszczenie wielu permanentów nadal daje jeden wyzwalacz, bo taki jest obecny kompromis.

### 3.2. Sortowanie partii

- `placeTriggerBatchInApnapOrder(state, stackStart)` sortuje wyłącznie segment stosu dodany od `stackStart`, i tylko jeśli cały segment to triggery.
- Nie daje graczowi wyboru kolejności własnych zdolności; zachowuje kolejność wykrycia wewnątrz kontrolera.
- Ward jest sortowany w osobnym segmencie od `wardStart`, po ogłoszeniu celów.

### 3.3. Jawne wybory kolejności

- `pendingTriggerOrder` istnieje, ale jest uruchamiany przez:
  - `startMadnessTriggerOrder` dla partii madness,
  - `advanceDeathTriggerBatch` dla wąskiej partii triggerów śmierci.
- `startDeathTriggerBatch` obejmuje tylko `dies`, `any_creature_dies`, `other_permanent_you_control_dies` oraz wybrane typy celów. Nie obejmuje grupowego `permanents_you_control_leave_battlefield` ani mieszanych partii z innymi wyzwalaczami.
- `pendingTriggerTargets` odracza wybór celu; po wyborze `queueTriggerToStack` może dodać wpis poza pierwotnym segmentem APNAP.

Skutek potwierdzony w A112/A113: celowany trigger śmierci i grupowy trigger odejścia nie trafiają do jednej partii wyboru kolejności; końcowe sortowanie fragmentu stosu nie wystarcza.

## 4. Automatyczne sprawdzenia stanu i załączniki

- `runStateBasedActions` jest wołane w `accepted` przed `processTriggers`.
- Tokeny poza polem bitwy są usuwane po triggerach i po przycięciu ślepych decyzji.
- `sacrificeFinishedSagas` jest wołane po `processTriggers`, a jego zdarzenia są ponownie skanowane.
- Osierocone aury idą przez `attachments.js` i `mover.js`; dodatkowy typ zdarzenia `permanent_put_into_graveyard` nie jest obecnie w liście zdarzeń grupowego odejścia. To osobny punkt do zbadania w A109, nie do cichego zmieniania przy A110.

## 5. Replay i odcisk stanu

- Replay opiera się na `state.commands` i fabryce stanu początkowego.
- `stateFingerprint` uwzględnia m.in. `madnessQueue`, `madnessBatchTriggerIds`, `pendingTriggerOrder`, `pendingDeathTriggerBatch`, `pendingTriggerTargets`, `pendingWardPay` oraz obiekty/stos.
- Każdy nowy trwały identyfikator zdarzenia, partii albo wyboru kolejności musi być:
  1. deterministyczny,
  2. widoczny w odcisku stanu, jeśli wpływa na legalne komendy,
  3. odtwarzalny z komend, bez ukrytego stanu lokalnego.

## 6. Potwierdzone luki a pozostałe RED

| Przypadek | Obserwowana luka | Obecny mechanizm, który nie wystarcza |
|---|---|---|
| A110 | osobne aktywacje many są jednym zdarzeniem odejścia | klucz grupowania = kontroler w skanie/komendzie |
| A112 | brak wspólnej kolejności dla grupowego odejścia i celowanej śmierci | wąski `startDeathTriggerBatch` + sortowanie segmentu |
| A113 | mieszany checkpoint obrażeń/śmierci wymaga całej partii | brak partii obejmującej różne typy wyzwalaczy i odroczone cele |

## 7. Pytania do decyzji architektonicznej

1. **Tożsamość zdarzenia:** czy wprowadzić jawny identyfikator grupy równoczesnej w choke poincie ruchu/zniszczenia, czy wyprowadzać go z istniejących zdarzeń? Jak objać koszty, aktywacje many i SBA?
2. **Granica partii:** kiedy partia oczekujących wyzwalaczy jest zamykana — po instrukcji, po płatności, po automatycznym sprawdzeniu stanu, przed priorytetem?
3. **Cele:** czy wybór celu pozostaje odroczony, czy partia czeka z umieszczeniem na stosie do wyboru celów? Jak nie złamać Ward i madness?
4. **Kolejność:** kiedy gracz dostaje jawny wybór kolejności własnych zdolności, a kiedy wystarcza deterministyczna kolejność wykrycia?
5. **Migracja:** jak przełożyć `pendingDeathTriggerBatch`, `madnessBatchTriggerIds` i segmenty Ward na wspólny model bez podwójnych wpisów stosu?
6. **Odcisk/replay:** jakie nowe pola muszą wejść do fingerprintu i testów odtwarzania?

Dopiero odpowiedź na te pytania powinna przyjąć postać ADR. Bez tego nie należy wdrażać „wspólnego checkpointu” jako kolejnej lokalnej łatki.
